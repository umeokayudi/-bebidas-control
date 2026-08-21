import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

const CONFIRM = 'atomic-pos-2026'
const TABLES = ['pos_vendas', 'vip_members', 'vip_usages', 'discount_codes']

function adminClient() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function checkTables(sb) {
  const checks = {}
  for (const t of TABLES) {
    const { error } = await sb.from(t).select('id').limit(1)
    checks[t] = error?.code === 'PGRST205' || error?.message?.includes('does not exist') ? 'missing' : (error ? 'error' : 'ok')
  }
  return checks
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const confirm = req.query?.confirm || body.confirm

  const sb = adminClient()
  const tables = await checkTables(sb)
  const allOk = Object.values(tables).every(v => v === 'ok')

  if (confirm !== CONFIRM) {
    return res.status(200).json({
      confirm: CONFIRM,
      tables,
      ready: allOk,
      manual: 'https://supabase.com/dashboard/project/ojirgkqtqvugqktyuhem/sql/new',
      hint: `POST with confirm=${CONFIRM} to apply schema (requires SUPABASE_DATABASE_URL)`,
    })
  }

  const dbUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL
  if (!dbUrl) {
    return res.status(503).json({
      error: 'SUPABASE_DATABASE_URL not configured',
      tables,
      manual: 'Run ATOMIC_POS_SCHEMA.sql in Supabase SQL Editor',
      sqlFile: 'ATOMIC_POS_SCHEMA.sql',
    })
  }

  try {
    const { default: pg } = await import('pg')
    const sql = readFileSync(join(process.cwd(), 'ATOMIC_POS_SCHEMA.sql'), 'utf8')
    const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
    await client.connect()
    await client.query(sql)
    await client.end()
    const after = await checkTables(sb)
    return res.status(200).json({ ok: true, tables: after })
  } catch (e) {
    return res.status(500).json({ error: e.message, tables })
  }
}
