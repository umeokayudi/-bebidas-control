/** Verifica se as tabelas POS estão configuradas */

import { drinksAdminClient } from './_supabaseAdmin.js'
import { ensureBarLiveReady } from './_barLiveStore.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET' })

  try {
    const sb = drinksAdminClient()
    const tables = ['pos_vendas', 'pos_vendas_itens', 'drink_menu', 'bar_pricing', 'vip_members', 'discount_codes', 'drink_back_agents', 'bar_spaces', 'bar_guests']
    const status = {}

    for (const t of tables) {
      const { error } = await sb.from(t).select('id').limit(1)
      status[t] = error ? (error.code === 'PGRST205' || /does not exist/i.test(error.message || '') ? 'missing' : 'error') : 'ok'
    }

    if (status.pos_vendas === 'ok' && status.pos_vendas_itens === 'ok') {
      return res.status(200).json({ ready: true, source: 'postgres', tables: status })
    }

    const live = await ensureBarLiveReady(sb)
    return res.status(200).json({ ready: true, source: 'live-store', tables: status, live })
  } catch (e) {
    return res.status(500).json({ ready: false, error: e.message })
  }
}
