/**
 * Reposição automática do POS (Módulo 2).
 *
 * Recebe as ordens já gravadas em `pos_reorder_requests`, dispara o
 * webhook da operação central (Make.com) e — quando o bar deixa ligado —
 * cria o pedido para a JBM em `pedidos` com `origem = 'pos_auto'`.
 *
 * O pedido automático usa exatamente o mesmo formato do pedido manual do
 * portal (status 'pendente' + `pedidos_itens`), então o fluxo de
 * confirmação/entrega da JBM não muda em nada. `origem` só serve para o
 * admin saber de onde veio.
 */

import { drinksAdminClient, drinksAuthClient } from './_supabaseAdmin.js'
import { isInternalService, bearerToken } from './_requireStaff.js'
import { setCorsHeaders, handleCorsPreflight } from './_cors.js'

const WEBHOOK_TIMEOUT_MS = 8000

/**
 * Dono do bar (role 'cliente') pode disparar reposição do próprio bar;
 * staff/admin de qualquer bar; serviços internos idem.
 */
async function authorize(req, barId) {
  if (isInternalService(req)) return { actor: 'service' }

  const token = bearerToken(req)
  if (!token) return { error: 'Não autenticado', status: 401 }

  const { data: { user }, error } = await drinksAuthClient().auth.getUser(token)
  if (error || !user) return { error: 'Sessão inválida', status: 401 }

  const admin = drinksAdminClient()
  const { data: perfil } = await admin.from('perfis').select('role, bar_id').eq('id', user.id).single()
  if (!perfil) return { error: 'Perfil não encontrado', status: 403 }

  if (perfil.role === 'cliente') {
    if (!perfil.bar_id || perfil.bar_id !== barId) {
      return { error: 'Sem permissão para este bar', status: 403 }
    }
    return { actor: 'cliente', user, perfil }
  }

  return { actor: perfil.role, user, perfil }
}

async function postWebhook(url, payload) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const text = await res.text().catch(() => '')
    return { ok: res.ok, status: res.status, body: text.slice(0, 500) }
  } catch (e) {
    return { ok: false, status: 0, body: e.name === 'AbortError' ? 'timeout' : e.message }
  } finally {
    clearTimeout(timer)
  }
}

async function createJbmPedido(admin, { barId, itens, userId }) {
  const produtoIds = itens.map(i => i.produto_id).filter(Boolean)
  if (!produtoIds.length) return { skipped: 'sem produtos' }

  const { data: produtos } = await admin
    .from('produtos')
    .select('id, nome, preco_venda')
    .in('id', produtoIds)

  const precos = new Map((produtos || []).map(p => [p.id, +p.preco_venda || 0]))
  const linhas = itens
    .filter(i => i.produto_id && precos.has(i.produto_id))
    .map(i => ({
      produto_id: i.produto_id,
      qtd: Math.max(1, Math.ceil(+i.qtd_sugerida || 1)),
      preco_unitario: precos.get(i.produto_id),
    }))

  if (!linhas.length) return { skipped: 'produtos não encontrados no catálogo JBM' }

  const total = linhas.reduce((a, l) => a + l.qtd * l.preco_unitario, 0)
  const { data: pedido, error } = await admin
    .from('pedidos')
    .insert({
      bar_id: barId,
      criado_por: userId || null,
      status: 'pendente',
      origem: 'pos_auto',
      data_pedido: new Date().toISOString().slice(0, 10),
      obs: `Reposição automática do POS · ${linhas.length} item(ns)`,
      total_estimado: total,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  const { error: itensError } = await admin.from('pedidos_itens').insert(
    linhas.map(l => ({ ...l, pedido_id: pedido.id }))
  )
  if (itensError) return { pedido, error: itensError.message }

  return { pedido, total, itens: linhas.length }
}

async function notifyAdmins(admin, { barNome, itens, total }) {
  const { data: admins } = await admin.from('perfis').select('id').eq('role', 'admin')
  if (!admins?.length) return
  await admin.from('notificacoes').insert(
    admins.map(a => ({
      user_id: a.id,
      tipo: 'pedido_novo',
      titulo: `Reposição automática — ${barNome || 'bar'}`,
      mensagem: `${itens} produto(s) abaixo do mínimo · ¥${Math.round(total || 0).toLocaleString()}`,
    }))
  )
}

export default async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return
  setCorsHeaders(req, res, 'POST, OPTIONS')

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const {
      bar_id: barId,
      request_ids: requestIds = [],
      itens = [],
      webhook_url: webhookUrl,
      criar_pedido_jbm: criarPedido = true,
      payload,
    } = body

    if (!barId) return res.status(400).json({ error: 'bar_id obrigatório' })
    if (!itens.length) return res.status(400).json({ error: 'nenhum item de reposição' })

    const auth = await authorize(req, barId)
    if (auth.error) return res.status(auth.status).json({ error: auth.error })

    const admin = drinksAdminClient()
    const { data: bar } = await admin.from('bars').select('id, nome, endereco, telefone').eq('id', barId).single()

    const finalPayload = payload || {
      evento: 'pos.reposicao_automatica',
      gerado_em: new Date().toISOString(),
      bar,
      itens,
    }

    const url = webhookUrl || process.env.POS_REORDER_WEBHOOK_URL || process.env.MAKE_WEBHOOK_URL
    const webhook = url ? await postWebhook(url, finalPayload) : { ok: false, status: 0, body: 'webhook não configurado' }

    let pedidoResult = null
    if (criarPedido) {
      pedidoResult = await createJbmPedido(admin, {
        barId,
        itens,
        userId: auth.user?.id || null,
      })
      if (pedidoResult?.pedido) {
        await notifyAdmins(admin, {
          barNome: bar?.nome,
          itens: pedidoResult.itens,
          total: pedidoResult.total,
        }).catch(() => {})
      }
    }

    if (requestIds.length) {
      const status = pedidoResult?.pedido
        ? 'pedido_criado'
        : webhook.ok
          ? 'enviado'
          : 'falhou'
      await admin
        .from('pos_reorder_requests')
        .update({
          status,
          pedido_id: pedidoResult?.pedido?.id || null,
          webhook_status: url ? String(webhook.status) : 'nao_configurado',
          webhook_resposta: webhook.body || null,
          resolvido_em: status === 'falhou' ? null : new Date().toISOString(),
        })
        .in('id', requestIds)
    }

    return res.status(200).json({
      ok: true,
      webhook: { configurado: Boolean(url), ...webhook },
      pedido: pedidoResult?.pedido
        ? { id: pedidoResult.pedido.id, itens: pedidoResult.itens, total: pedidoResult.total }
        : null,
      pedido_erro: pedidoResult?.error || pedidoResult?.skipped || null,
      requests_atualizadas: requestIds.length,
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
