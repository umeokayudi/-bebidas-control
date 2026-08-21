import { createClient } from '@supabase/supabase-js'
import { fixAtomicReceivables, revertAtomicPedidosToJune, markPedidosEntregue, ATOMIC_BAR_ID } from './_atomicJuneFix.js'

function adminClient() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada no Vercel')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Use POST',
      exemplo: { confirm: 'atomic-june-465000', action: 'fix' },
    })
  }

  const secret = process.env.FIX_ATOMIC_SECRET || 'jbm-atomic-june-2026'
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  if (body.confirm !== secret && body.confirm !== 'atomic-june-465000') {
    return res.status(403).json({ error: 'confirm inválido' })
  }

  try {
    const sb = adminClient()
    const action = body.action || 'fix'

    if (action === 'revertPedidos') {
      const revert = await revertAtomicPedidosToJune(sb)
      return res.status(200).json({ ok: true, revert })
    }

    if (action === 'markEntregue') {
      const entregue = await markPedidosEntregue(sb, {
        dateFrom: body.dateFrom || '2026-06-01',
        dateTo: body.dateTo || '2026-06-30',
        statusFrom: body.statusFrom || 'confirmado',
        barId: body.barId || ATOMIC_BAR_ID,
      })
      return res.status(200).json({ ok: true, entregue })
    }

    const result = await fixAtomicReceivables(sb)

    const { data: faturas } = await sb.from('faturas').select('valor,total,pago,status').eq('bar_id', ATOMIC_BAR_ID).neq('status', 'pago')
    const aReceber = (faturas || []).reduce((a, f) => a + Math.max(0, (+f.valor || +f.total || 0) - (+f.pago || 0)), 0)

    return res.status(200).json({ ok: true, ...result, aReceber })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
