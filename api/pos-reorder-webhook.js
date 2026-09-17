/**
 * POS → reposição automática: dispara o webhook (Make.com / operação central)
 * com bar, SKU e quantidade sugerida, e atualiza o status dos eventos.
 *
 * POST { bar_id, evento_ids: [] }  → envia payload para o webhook do bar
 * GET  ?bar_id=                     → informa se há webhook configurado
 *
 * Auth: JWT do usuário logado. Cliente só opera no próprio bar; staff/admin em
 * qualquer bar. Só lê/escreve tabelas do POS — nada de vendas/compras JBM.
 */
import { bearerToken, isInternalService } from './_requireStaff.js'
import { createStaffUserClient, drinksAuthClient } from './_supabaseAdmin.js'
import { handleCorsPreflight, setCorsHeaders } from './_cors.js'

const WEBHOOK_TIMEOUT_MS = 8000

async function authorize(req, barId) {
  if (isInternalService(req)) return { service: true, db: null }
  const token = bearerToken(req)
  if (!token) return { error: 'Não autenticado', status: 401 }

  const { data: { user }, error } = await drinksAuthClient().auth.getUser(token)
  if (error || !user) return { error: 'Sessão inválida', status: 401 }

  const db = createStaffUserClient(token)
  const { data: perfil } = await db.from('perfis').select('role, bar_id').eq('id', user.id).single()
  if (!perfil) return { error: 'Sem permissão', status: 403 }
  if (perfil.role === 'cliente' && (!perfil.bar_id || perfil.bar_id !== barId)) {
    return { error: 'Sem permissão para este bar', status: 403 }
  }
  return { user, perfil, db, token }
}

export function resolveWebhookUrl(config) {
  const fromBar = (config?.webhook_url || '').trim()
  if (/^https?:\/\//i.test(fromBar)) return fromBar
  const fromEnv = (process.env.POS_REORDER_WEBHOOK_URL || '').trim()
  if (/^https?:\/\//i.test(fromEnv)) return fromEnv
  return ''
}

export function buildWebhookBody(bar, eventos) {
  return {
    event: 'pos.reorder',
    source: 'jbm-drinks-pos',
    sent_at: new Date().toISOString(),
    bar: { id: bar?.id, nome: bar?.nome },
    items: (eventos || []).map(e => ({
      evento_id: e.id,
      produto_id: e.produto_id,
      sku: String(e.produto_id || '').slice(0, 8).toUpperCase(),
      nome: e.produtos?.nome || e.payload?.nome || '',
      categoria: e.produtos?.categoria || e.payload?.categoria || '',
      volume_ml: e.produtos?.volume_ml || e.payload?.volume_ml || null,
      estoque_atual: +e.estoque_atual || 0,
      minimo: +e.minimo || 0,
      qtd_sugerida: +e.qtd_sugerida || 1,
      pedido_id: e.pedido_id || null,
    })),
  }
}

async function postWebhook(url, body) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), WEBHOOK_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'jbm-drinks-pos/1.0' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const text = (await res.text().catch(() => '')).slice(0, 500)
    return { ok: res.ok, status: res.status, text }
  } catch (e) {
    return { ok: false, status: 0, text: e.name === 'AbortError' ? 'timeout' : e.message }
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return
  setCorsHeaders(req, res, 'GET, POST, OPTIONS')

  try {
    const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}) : {}
    const barId = req.method === 'GET' ? req.query?.bar_id : body.bar_id
    if (!barId) return res.status(400).json({ error: 'bar_id obrigatório' })

    const auth = await authorize(req, barId)
    if (auth.error) return res.status(auth.status).json({ error: auth.error })
    const db = auth.db
    if (!db) return res.status(400).json({ error: 'Chamada de serviço exige JWT de usuário' })

    const [{ data: bar }, { data: config }] = await Promise.all([
      db.from('bars').select('id, nome').eq('id', barId).single(),
      db.from('pos_config').select('webhook_url, auto_pedido').eq('bar_id', barId).maybeSingle(),
    ])
    if (!bar) return res.status(404).json({ error: 'Bar não encontrado' })
    const url = resolveWebhookUrl(config)

    if (req.method === 'GET') {
      return res.status(200).json({ configured: !!url, source: config?.webhook_url ? 'bar' : url ? 'env' : null })
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const ids = Array.isArray(body.evento_ids) ? body.evento_ids.filter(Boolean) : []
    if (!ids.length) return res.status(400).json({ error: 'evento_ids vazio' })

    const { data: eventos, error: evErr } = await db.from('pos_reposicao_eventos')
      .select('id, produto_id, estoque_atual, minimo, qtd_sugerida, pedido_id, payload, produtos(nome, categoria, volume_ml)')
      .eq('bar_id', barId)
      .in('id', ids)
    if (evErr) return res.status(500).json({ error: evErr.message })
    if (!eventos?.length) return res.status(404).json({ error: 'Eventos não encontrados' })

    if (!url) {
      await db.from('pos_reposicao_eventos').update({ webhook_status: 'sem_webhook', webhook_resposta: 'Nenhum webhook configurado' }).in('id', ids)
      return res.status(200).json({ sent: false, reason: 'noWebhook', count: eventos.length })
    }

    const payload = buildWebhookBody(bar, eventos)
    const result = await postWebhook(url, payload)
    await db.from('pos_reposicao_eventos').update({
      webhook_status: result.ok ? 'enviado' : 'erro',
      webhook_resposta: `${result.status} ${result.text}`.trim().slice(0, 500),
    }).in('id', ids)

    return res.status(200).json({ sent: result.ok, status: result.status, count: eventos.length, response: result.text.slice(0, 200) })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
