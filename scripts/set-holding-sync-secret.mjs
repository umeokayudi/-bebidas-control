#!/usr/bin/env node
/**
 * Grava HOLDING_SERVICE_ROLE_KEY no Supabase drinks (fallback para cron Vercel).
 * Uso: HOLDING_SERVICE_ROLE_KEY='...' SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/set-holding-sync-secret.mjs
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL || 'https://ojirgkqtqvugqktyuhem.supabase.co'
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const HOLDING = process.env.HOLDING_SERVICE_ROLE_KEY

if (!SERVICE) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY required (bebidas-control / ojirgkqtqvugqktyuhem)')
  process.exit(1)
}
if (!HOLDING) {
  console.error('❌ HOLDING_SERVICE_ROLE_KEY required (jbm-master / fxsakrshmldmkdmbevna)')
  process.exit(1)
}

const sb = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
const BUCKET = 'system-private'
const FILE = 'holding_service_role_key.txt'

const { data: buckets } = await sb.storage.listBuckets()
if (!buckets?.some(b => b.name === BUCKET)) {
  const { error } = await sb.storage.createBucket(BUCKET, { public: false })
  if (error) throw error
}

const { error } = await sb.storage.from(BUCKET).upload(FILE, HOLDING.trim(), {
  upsert: true,
  contentType: 'text/plain',
})
if (error) throw error

console.log('✅ HOLDING_SERVICE_ROLE_KEY stored in drinks Supabase (system-private/holding_service_role_key.txt)')
console.log('   Cron /api/sync-cashflow-cron will use it automatically on Vercel.')
