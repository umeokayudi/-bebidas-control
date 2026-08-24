/**
 * Registra compras Costco jul/2026 para o bar Atomic.
 * Apenas transações acima de ¥3.000 (custos do cartão).
 * Itens detalhados serão preenchidos quando as notas chegarem.
 *
 * Uso: node scripts/import-costco-july.mjs [--force]
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const URL = 'https://ojirgkqtqvugqktyuhem.supabase.co'
const SUPPLIER = 'Costco'
const MIN_YEN = 3000
const FORCE = process.argv.includes('--force')

/** @type {{ date: string, total: number, ref?: string, pagamento?: string }[]} */
export const PURCHASES = [
  { date: '2026-07-08', total: 52348, ref: 'cartão 明細 100025', pagamento: 'Credit card' },
  { date: '2026-07-29', total: 15082, ref: 'コストコ ホールセール ジャパン', pagamento: 'Credit card' },
  { date: '2026-07-31', total: 29218, ref: 'Costco', pagamento: 'Credit card' },
]

function loadServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY
  const env = readFileSync('.env.production', 'utf8')
  const m = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)
  if (m) return m[1].replace(/^["']|["']$/g, '')
  throw new Error('SUPABASE_SERVICE_ROLE_KEY não encontrada')
}

async function exists(sb, date, total) {
  const { data } = await sb.from('compras')
    .select('id')
    .eq('fornecedor', SUPPLIER)
    .eq('data', date)
    .eq('total_real', total)
    .limit(1)
  return data?.length > 0
}

async function main() {
  const sb = createClient(URL, loadServiceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`\n🛒 Costco jul/2026 — custos bar Atomic (≥ ¥${MIN_YEN.toLocaleString('ja-JP')})\n`)

  let inserted = 0
  let skipped = 0

  for (const p of PURCHASES) {
    if (p.total < MIN_YEN) {
      console.log(`  ⏭ ${p.date} ¥${p.total.toLocaleString('ja-JP')} — abaixo do mínimo`)
      skipped++
      continue
    }

    if (!FORCE && await exists(sb, p.date, p.total)) {
      console.log(`  ⏭ ${p.date} ¥${p.total.toLocaleString('ja-JP')} — já existe`)
      skipped++
      continue
    }

    const obs = `Costco — compra bar Atomic jul/2026${p.ref ? ` (${p.ref})` : ''} · itens pendentes (aguardando nota)`

    const { data: compra, error } = await sb.from('compras').insert({
      data: p.date,
      fornecedor: SUPPLIER,
      pagamento: p.pagamento || 'Credit card',
      subtotal: p.total,
      desconto_pontos: 0,
      total_pago: p.total,
      total_real: p.total,
      pontos_ganhos: 0,
      status_pagamento: 'pago',
      obs,
    }).select().single()

    if (error) throw new Error(`${p.date}: ${error.message}`)

    await sb.from('compras_itens').insert({
      compra_id: compra.id,
      nome: 'Mercadorias Costco (Atomic) — detalhar',
      qtd: 1,
      custo_unitario: p.total,
    })

    console.log(`  ✅ ${p.date} ¥${p.total.toLocaleString('ja-JP')}`)
    inserted++
  }

  const total = PURCHASES.filter(p => p.total >= MIN_YEN).reduce((a, p) => a + p.total, 0)
  console.log(`\n── Resumo ──`)
  console.log(`  Inseridas: ${inserted}`)
  console.log(`  Ignoradas: ${skipped}`)
  console.log(`  Total:     ¥${total.toLocaleString('ja-JP')}`)
  console.log(`  Excluídas: ¥1.460 (29/07) + ¥1.460 (31/07) — abaixo de ¥3.000\n`)
}

main().catch(e => {
  console.error('\n❌', e.message, '\n')
  process.exit(1)
})
