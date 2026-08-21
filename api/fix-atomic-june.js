import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { fixAtomicReceivables, revertAtomicPedidosToJune, markPedidosEntregue, ATOMIC_BAR_ID } from './_atomicJuneFix.js'

const POS_TABLES = ['pos_vendas', 'vip_members', 'vip_usages', 'discount_codes']
const POS_CONFIRM = 'atomic-pos-2026'

function adminClient() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada no Vercel')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function checkPosTables(sb) {
  const checks = {}
  for (const t of POS_TABLES) {
    const { error } = await sb.from(t).select('id').limit(1)
    checks[t] = error?.code === 'PGRST205' || error?.message?.includes('does not exist') ? 'missing' : (error ? 'error' : 'ok')
  }
  return checks
}

async function setupPosSchema(sb) {
  const dbUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL
  if (!dbUrl) {
    const tables = await checkPosTables(sb)
    return { error: 'SUPABASE_DATABASE_URL not configured', tables, manual: 'Run ATOMIC_POS_SCHEMA.sql in Supabase SQL Editor' }
  }
  const { default: pg } = await import('pg')
  const sql = readFileSync(join(process.cwd(), 'ATOMIC_POS_SCHEMA.sql'), 'utf8')
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()
  await client.query(sql)
  await client.end()
  return { ok: true, tables: await checkPosTables(sb) }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const action = body.action || req.query?.action || 'fix'

  // Status POS — sem secret (somente leitura)
  if (action === 'checkPos' && (req.method === 'GET' || req.method === 'POST')) {
    try {
      const sb = adminClient()
      const tables = await checkPosTables(sb)
      const ready = Object.values(tables).every(v => v === 'ok')
      return res.status(200).json({ ready, tables, setupConfirm: POS_CONFIRM })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Use POST',
      exemplo: { confirm: 'atomic-june-465000', action: 'fix' },
    })
  }

  const secret = process.env.FIX_ATOMIC_SECRET || 'jbm-atomic-june-2026'
  if (body.confirm !== secret && body.confirm !== 'atomic-june-465000' && body.confirm !== POS_CONFIRM) {
    return res.status(403).json({ error: 'confirm inválido' })
  }

  try {
    const sb = adminClient()

    if (action === 'setupPos') {
      const result = await setupPosSchema(sb)
      if (result.error) return res.status(503).json(result)
      return res.status(200).json(result)
    }

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
