#!/usr/bin/env node
/**
 * Aplica JBM_HOLDING_MODULES_SQL.sql no Supabase holding.
 * Requer HOLDING_DATABASE_URL (Settings → Database → Connection string → URI)
 *
 *   HOLDING_DATABASE_URL='postgresql://...' node scripts/apply-holding-modules.mjs
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SQL_FILE = join(__dirname, '..', 'JBM_HOLDING_MODULES_SQL.sql')
const DB_URL = process.env.HOLDING_DATABASE_URL || process.env.DATABASE_URL

if (!DB_URL) {
  console.error('❌ HOLDING_DATABASE_URL required')
  console.error('   Supabase → fxsakrshmldmkdmbevna → Settings → Database → Connection string')
  console.error('   Ou cole JBM_HOLDING_MODULES_SQL.sql no SQL Editor manualmente.')
  process.exit(1)
}

const sql = readFileSync(SQL_FILE, 'utf8')

let pg
try {
  pg = await import('pg')
} catch {
  console.error('❌ Instale pg: npm install pg')
  process.exit(1)
}

const client = new pg.default.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  await client.query(sql)
  console.log('✅ JBM Holding modules schema applied')
} finally {
  await client.end()
}
