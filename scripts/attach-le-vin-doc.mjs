#!/usr/bin/env node
/**
 * Anexa JSON da 請求書 Le Vin #971 ao registro de compra e cria bucket cobrancas.
 * Uso: node scripts/attach-le-vin-doc.mjs
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import invoice from './data/le-vin-invoice-971.json' with { type: 'json' }

const URL = 'https://ojirgkqtqvugqktyuhem.supabase.co'
const BUCKET = 'cobrancas'

function loadKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY
  const env = readFileSync('.env.production', 'utf8')
  const m = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)
  if (m) return m[1].replace(/^["']|["']$/g, '')
  throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
}

async function ensureBucket(sb) {
  const { data: buckets } = await sb.storage.listBuckets()
  if (!buckets?.some(b => b.name === BUCKET)) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: true })
    if (error) throw error
    console.log(`✅ Bucket "${BUCKET}" criado (público para links de doc)`)
  }
}

async function main() {
  const sb = createClient(URL, loadKey(), { auth: { autoRefreshToken: false, persistSession: false } })
  await ensureBucket(sb)

  const { data: compra } = await sb.from('compras').select('id,foto_url').eq('fornecedor', 'Le Vin').eq('data', '2026-07-15').maybeSingle()
  if (!compra) throw new Error('Compra Le Vin jul/2026 não encontrada')

  const path = `${compra.id}/le-vin-seikyu-971.json`
  const body = JSON.stringify({ ...invoice, anexado_em: new Date().toISOString() }, null, 2)
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, body, {
    upsert: true,
    contentType: 'application/json',
  })
  if (upErr) throw upErr

  const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(path)
  const publicUrl = urlData.publicUrl

  await sb.from('compras').update({ foto_url: publicUrl }).eq('id', compra.id)

  console.log('\n📎 Le Vin 請求書 #971 anexada')
  console.log(`   Compra: ${compra.id}`)
  console.log(`   URL: ${publicUrl}`)
  if (compra.foto_url && compra.foto_url !== publicUrl) {
    console.log(`   (substituiu doc anterior)`)
  }
  console.log('')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
