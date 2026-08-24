/**
 * Corrige faturas Atomic: maio limpeza, jun ¥465k única, jul faturamento − LM pago.
 * Uso: node scripts/fix-atomic-faturas.mjs
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { ATOMIC_BAR_ID, ATOMIC_FATURAS } from '../api/_atomicJuneFix.js'

const URL = 'https://ojirgkqtqvugqktyuhem.supabase.co'

function loadServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY
  const env = readFileSync('.env.production', 'utf8')
  const m = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)
  if (m) return m[1].replace(/^["']|["']$/g, '')
  throw new Error('SUPABASE_SERVICE_ROLE_KEY não encontrada')
}

async function main() {
  const sb = createClient(URL, loadServiceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('\n💰 Corrigindo faturas Atomic\n')

  await sb.from('fatura_pagamentos').delete().in(
    'fatura_id',
    (await sb.from('faturas').select('id').eq('bar_id', ATOMIC_BAR_ID)).data?.map(f => f.id) || []
  )
  await sb.from('faturas').delete().eq('bar_id', ATOMIC_BAR_ID)

  for (const f of ATOMIC_FATURAS) {
    const pago = f.pago || 0
    const status = pago >= f.total ? 'pago' : pago > 0 ? 'parcial' : 'pendente'
    const { data, error } = await sb.from('faturas').insert({
      bar_id: ATOMIC_BAR_ID,
      ...f,
      status,
    }).select().single()
    if (error) throw new Error(error.message)
    const restante = f.total - pago
    console.log(`  ✅ ${f.periodo_inicio.slice(0, 7)} — total ¥${f.total.toLocaleString('ja-JP')} · pago ¥${pago.toLocaleString('ja-JP')} · restante ¥${restante.toLocaleString('ja-JP')}`)
    console.log(`     ${f.obs}`)
  }

  const totalDevido = ATOMIC_FATURAS.reduce((a, f) => a + f.total - (f.pago || 0), 0)
  console.log(`\n  TOTAL a receber do bar: ¥${totalDevido.toLocaleString('ja-JP')}\n`)
}

main().catch(e => {
  console.error('\n❌', e.message, '\n')
  process.exit(1)
})
