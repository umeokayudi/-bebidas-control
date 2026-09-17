import { createStaffUserClient, drinksAuthClient } from './_supabaseAdmin.js'
import { handleCorsPreflight, setCorsHeaders } from './_cors.js'

function bearerToken(req) {
  const header = req.headers.authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}

export default async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return
  setCorsHeaders(req, res)
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })

  const token = bearerToken(req)
  if (!token) return res.status(401).json({ error: 'Authentication required' })

  const { data: authData, error: authError } = await drinksAuthClient().auth.getUser(token)
  if (authError || !authData?.user) return res.status(401).json({ error: 'Invalid session' })

  const barId = req.body?.barId
  if (!barId) return res.status(400).json({ error: 'barId is required' })

  const webhookUrl = process.env.POS_RESTOCK_WEBHOOK_URL
  if (!webhookUrl) {
    return res.status(200).json({ ok: true, configured: false, sent: 0 })
  }

  const client = createStaffUserClient(token)
  const { data: alerts, error } = await client
    .from('pos_restock_alerts')
    .select('id,bar_id,produto_id,estoque_atual,estoque_minimo,quantidade_sugerida,criado_em,bars(nome),produtos(nome)')
    .eq('bar_id', barId)
    .eq('status', 'pending')
    .order('criado_em')
    .limit(20)

  if (error) return res.status(400).json({ error: error.message })

  let sent = 0
  for (const alert of alerts || []) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'pos.stock.reorder_required',
          alertId: alert.id,
          occurredAt: alert.criado_em,
          bar: { id: alert.bar_id, name: alert.bars?.nome },
          product: { id: alert.produto_id, name: alert.produtos?.nome },
          stock: {
            current: alert.estoque_atual,
            minimum: alert.estoque_minimo,
            suggestedOrderQuantity: alert.quantidade_sugerida,
          },
        }),
      })
      if (!response.ok) throw new Error(`Webhook HTTP ${response.status}`)
      await client
        .from('pos_restock_alerts')
        .update({ status: 'sent', enviado_em: new Date().toISOString(), webhook_error: null })
        .eq('id', alert.id)
      sent += 1
    } catch (webhookError) {
      await client
        .from('pos_restock_alerts')
        .update({ status: 'failed', webhook_error: webhookError.message })
        .eq('id', alert.id)
    }
  }

  return res.status(200).json({ ok: true, configured: true, sent })
}
