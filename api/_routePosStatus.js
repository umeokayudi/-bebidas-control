/** Verifica se as tabelas POS estão configuradas */

import { drinksAdminClient } from './_supabaseAdmin.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET' })

  try {
    const sb = drinksAdminClient()
    const tables = ['pos_vendas', 'pos_vendas_itens', 'drink_menu', 'bar_pricing', 'vip_members', 'discount_codes', 'drink_back_agents']
    const status = {}

    for (const t of tables) {
      const { error } = await sb.from(t).select('id').limit(1)
      status[t] = error ? (error.code === 'PGRST205' ? 'missing' : 'error') : 'ok'
    }

    const ready = status.pos_vendas === 'ok' && status.pos_vendas_itens === 'ok'
    return res.status(200).json({ ready, tables: status })
  } catch (e) {
    return res.status(500).json({ ready: false, error: e.message })
  }
}
