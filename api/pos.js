/**
 * Bar POS API — status + reorder webhook.
 * Never writes to JBM supply tables (vendas / compras / faturas).
 */
import { drinksAdminClient } from './_supabaseAdmin.js'
import { POS_FORBIDDEN_TABLES } from './_posEngine.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query?.action || (typeof req.body === 'object' && req.body?.action) || 'status'

  try {
    if (action === 'status') {
      const sb = drinksAdminClient()
      const { error } = await sb.from('pos_vendas').select('id').limit(1)
      if (error) {
        const missing = error.code === 'PGRST205' || error.message?.includes('does not exist')
        return res.status(200).json({
          ready: false,
          isolated: true,
          jbmTablesBlocked: POS_FORBIDDEN_TABLES,
          error: missing ? 'POS tables missing — run ATOMIC_POS_SCHEMA.sql' : error.message,
        })
      }
      return res.status(200).json({ ready: true, isolated: true, jbmTablesBlocked: POS_FORBIDDEN_TABLES })
    }

    if (action === 'reorderWebhook') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' })
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const payload = {
        source: 'bar-pos',
        kind: 'reorder_alert',
        bar_id: body.bar_id,
        bar_nome: body.bar_nome,
        produto_id: body.produto_id,
        sku: body.sku,
        nome: body.nome,
        current_stock: body.current_stock,
        min_stock: body.min_stock,
        suggested_qty: body.suggested_qty,
        note: 'POS stock hit reorder point. Restock via JBM pedidos — do not write vendas.',
      }

      const url = process.env.POS_REORDER_WEBHOOK_URL || process.env.MAKE_WEBHOOK_URL || ''
      if (!url) {
        return res.status(200).json({ ok: true, webhook: 'skipped', reason: 'no webhook url', payload })
      }

      const sent = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return res.status(200).json({ ok: sent.ok, webhook: sent.ok ? 'sent' : 'failed', status: sent.status })
    }

    return res.status(400).json({ error: 'action inválida', actions: ['status', 'reorderWebhook'] })
  } catch (e) {
    const missingKey = /SUPABASE_SERVICE_ROLE_KEY/.test(e.message || '')
    if (action === 'status' && missingKey) {
      return res.status(200).json({ ready: false, isolated: true, error: 'admin key not configured' })
    }
    return res.status(500).json({ error: e.message })
  }
}
