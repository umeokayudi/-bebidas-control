import { drinksAdminClient } from './_supabaseAdmin.js'

/**
 * POST /api/pos-reorder-webhook
 * Gatilho de reposição do POS do bar (Módulo 2).
 * NÃO toca em vendas/vendas_itens (JBM fornecedor). Só lê/grava pos_*.
 *
 * Body: { bar_id, sku_nome, produto_id?, drink_menu_id?,
 *         estoque_atual, estoque_minimo, qtd_sugerida }
 */
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const { bar_id, sku_nome, produto_id = null, drink_menu_id = null } = body
  if (!bar_id || !sku_nome) return res.status(400).json({ error: 'bar_id e sku_nome são obrigatórios' })

  const estoque_atual = +body.estoque_atual || 0
  const estoque_minimo = +body.estoque_minimo || 0
  const qtd_sugerida = +body.qtd_sugerida || Math.max(1, estoque_minimo * 2 - estoque_atual)

  try {
    const sb = drinksAdminClient()
    const { data: bar } = await sb.from('bars').select('id,nome').eq('id', bar_id).single()

    const payload = {
      evento: 'pos_reposicao',
      bar_id,
      bar_nome: bar?.nome || null,
      sku_nome,
      produto_id,
      drink_menu_id,
      estoque_atual,
      estoque_minimo,
      qtd_sugerida,
      criado_em: new Date().toISOString(),
    }

    // 1) Log auditável em pos_reorder_orders (sempre, mesmo sem Make configurado)
    const { data: order, error: orderErr } = await sb.from('pos_reorder_orders').insert({
      bar_id,
      produto_id,
      drink_menu_id,
      sku_nome,
      estoque_atual,
      estoque_minimo,
      qtd_sugerida,
      status: 'pendente',
      webhook_status: 'registrado',
      webhook_payload: payload,
    }).select().single()
    if (orderErr) throw orderErr

    // 2) Disparo opcional para Make.com (se configurado). Nunca falha a ordem.
    const hookUrl = (process.env.MAKE_POS_REORDER_URL || '').trim()
    let webhook_status = 'sem_make_configurado'
    if (hookUrl && hookUrl.startsWith('http')) {
      try {
        const r = await fetch(hookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        webhook_status = r.ok ? 'enviado' : `make_http_${r.status}`
      } catch {
        webhook_status = 'make_falhou'
      }
      await sb.from('pos_reorder_orders').update({ webhook_status }).eq('id', order.id)
    } else {
      await sb.from('pos_reorder_orders').update({ webhook_status }).eq('id', order.id)
    }

    return res.status(200).json({ ok: true, order_id: order.id, webhook_status, payload })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
