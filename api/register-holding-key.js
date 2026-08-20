/**
 * Registra HOLDING_SERVICE_ROLE_KEY no storage drinks (uma vez).
 * POST { "holdingKey": "..." }
 * Valida testando upload no Supabase da holding.
 */
import { createClient } from '@supabase/supabase-js'

const HOLDING_URL = process.env.HOLDING_SUPABASE_URL || 'https://fxsakrshmldmkdmbevna.supabase.co'
const DRINKS_URL = process.env.VITE_SUPABASE_URL || 'https://ojirgkqtqvugqktyuhem.supabase.co'
const BUCKET = 'system-private'
const FILE = 'holding_service_role_key.txt'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const holdingKey = req.body?.holdingKey?.trim()
  if (!holdingKey) return res.status(400).json({ error: 'holdingKey required' })

  const drinksKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!drinksKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing on server' })

  try {
    const holdingSb = createClient(HOLDING_URL, holdingKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: buckets } = await holdingSb.storage.listBuckets()
    if (!buckets?.some(b => b.name === BUCKET)) {
      await holdingSb.storage.createBucket(BUCKET, { public: false })
    }
    const ping = JSON.stringify({ ping: true, at: new Date().toISOString() })
    const { error: pingErr } = await holdingSb.storage.from(BUCKET).upload('sync_ping.json', ping, { upsert: true, contentType: 'application/json' })
    if (pingErr) return res.status(400).json({ error: 'Chave holding inválida: ' + pingErr.message })

    const drinksSb = createClient(DRINKS_URL, drinksKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: dbuckets } = await drinksSb.storage.listBuckets()
    if (!dbuckets?.some(b => b.name === BUCKET)) {
      await drinksSb.storage.createBucket(BUCKET, { public: false })
    }
    const { error } = await drinksSb.storage.from(BUCKET).upload(FILE, holdingKey, { upsert: true, contentType: 'text/plain' })
    if (error) throw error

    return res.status(200).json({ ok: true, message: 'Holding key registered. Cron sync enabled.' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
