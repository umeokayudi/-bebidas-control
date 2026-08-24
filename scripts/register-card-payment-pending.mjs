#!/usr/bin/env node
/**
 * Registra pagamento Stripe em análise (confirmado=false — não abate fatura até crédito).
 * Uso: SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/register-card-payment-pending.mjs
 */
import { createClient } from '@supabase/supabase-js'

const URL = (() => {
  const raw = process.env.VITE_SUPABASE_URL || ''
  return /^https:\/\/[a-z0-9]+\.supabase\.co/i.test(raw)
    ? raw
    : 'https://ojirgkqtqvugqktyuhem.supabase.co'
})()
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const FATURA_JUL_ID = '8a0f24ed-ee0d-4832-8b83-40f88607aa67'
const VALOR = 876910
const CREDITO = '2026-12-05'

if (!KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}

const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const { data: fat } = await sb.from('faturas').select('*').eq('id', FATURA_JUL_ID).single()
if (!fat) throw new Error('Fatura jul/2026 não encontrada')

const { data: existing } = await sb.from('fatura_pagamentos')
  .select('id,valor,confirmado,notas')
  .eq('fatura_id', FATURA_JUL_ID)
  .eq('valor', VALOR)

if (existing?.length) {
  console.log('✅ Pagamento ¥876.910 já registrado:', existing[0].id)
  process.exit(0)
}

const notas = `Stripe bloqueado — crédito previsto ${CREDITO.split('-').reverse().join('/')}`

const { data: pay, error } = await sb.from('fatura_pagamentos').insert({
  fatura_id: FATURA_JUL_ID,
  valor: VALOR,
  metodo: 'Stripe',
  data: new Date().toISOString().slice(0, 10),
  notas,
  confirmado: false,
}).select().single()

if (error) throw error

const obs = `${fat.obs || 'Julho/2026'} · Stripe ¥876.910 em análise (crédito 05/dez/2026)`
await sb.from('faturas').update({ obs }).eq('id', FATURA_JUL_ID)

console.log('✅ Pagamento em análise registrado')
console.log('   Fatura jul/2026 · ¥876.910 · Stripe · crédito 05/dez/2026')
console.log('   ID:', pay.id)
console.log('   Pago confirmado na fatura:', fmt(fat.pago), '(não alterado até confirmar)')

function fmt(n) {
  return '¥' + Number(n || 0).toLocaleString('ja-JP')
}
