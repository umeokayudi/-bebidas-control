import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

const HOLDING_URL = process.env.HOLDING_SUPABASE_URL || 'https://fxsakrshmldmkdmbevna.supabase.co'
const HOLDING_KEY = process.env.HOLDING_SERVICE_ROLE_KEY
const DB_URL = process.env.HOLDING_DATABASE_URL
const CONFIRM = 'apply-jbm-modules-2026'

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const confirm = req.query?.confirm || req.body?.confirm
  if (confirm !== CONFIRM) {
    return res.status(400).json({
      error: `Pass confirm=${CONFIRM}`,
      hint: 'Requires HOLDING_DATABASE_URL on Vercel, or run JBM_HOLDING_MODULES_SQL.sql in Supabase SQL Editor',
    })
  }

  if (!DB_URL) {
  const sb = HOLDING_KEY ? createClient(HOLDING_URL, HOLDING_KEY, { auth: { autoRefreshToken: false, persistSession: false } }) : null
    const checks = {}
    if (sb) {
      for (const t of ['hr_presentations', 'hr_commissions', 'logistics_jobs', 'jbm_investments', 'investment_returns']) {
        const { error } = await sb.from(t).select('id').limit(1)
        checks[t] = error ? 'missing' : 'ok'
      }
    }
    return res.status(503).json({
      error: 'HOLDING_DATABASE_URL not configured',
      tables: checks,
      manual: 'Run JBM_HOLDING_MODULES_SQL.sql in https://supabase.com/dashboard/project/fxsakrshmldmkdmbevna/sql/new',
    })
  }

  try {
    const { default: pg } = await import('pg')
    const sqlPath = join(process.cwd(), 'JBM_HOLDING_MODULES_SQL.sql')
    const sql = readFileSync(sqlPath, 'utf8')
    const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
    await client.connect()
    await client.query(sql)
    await client.end()
    return res.status(200).json({ ok: true, message: 'Schema applied' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
