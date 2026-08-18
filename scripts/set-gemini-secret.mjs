#!/usr/bin/env node
/**
 * Grava GEMINI_API_KEY no bucket privado Supabase (fallback quando Vercel env falta).
 * Uso: GEMINI_API_KEY='...' SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/set-gemini-secret.mjs
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL || 'https://ojirgkqtqvugqktyuhem.supabase.co'
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const GEMINI = process.env.GEMINI_API_KEY

if (!SERVICE) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}
if (!GEMINI) {
  console.error('❌ GEMINI_API_KEY required')
  process.exit(1)
}

const sb = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
const BUCKET = 'system-private'
const FILE = 'gemini_api_key.txt'

const { data: buckets } = await sb.storage.listBuckets()
if (!buckets?.some(b => b.name === BUCKET)) {
  const { error } = await sb.storage.createBucket(BUCKET, { public: false })
  if (error) throw error
}

const { error } = await sb.storage.from(BUCKET).upload(FILE, GEMINI.trim(), {
  upsert: true,
  contentType: 'text/plain',
})
if (error) throw error

console.log('✅ GEMINI_API_KEY stored in Supabase private storage (system-private/gemini_api_key.txt)')
console.log('   Production API will use it when Vercel env GEMINI_API_KEY is missing.')
