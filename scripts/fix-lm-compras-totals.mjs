/**
 * Ajusta compras_itens LM jul/2026 para somar exatamente total_real de cada nota.
 * Total geral: ¥488,350
 *
 * Uso: node scripts/fix-lm-compras-totals.mjs [--dry-run]
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const URL = 'https://ojirgkqtqvugqktyuhem.supabase.co'
const DRY = process.argv.includes('--dry-run')
const TARGET_TOTAL = 488350

function loadServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY
  const env = readFileSync('.env.production', 'utf8')
  const m = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)
  if (m) return m[1].replace(/^["']|["']$/g, '')
  throw new Error('SUPABASE_SERVICE_ROLE_KEY não encontrada')
}

function sumItems(itens) {
  return (itens || []).reduce((a, it) => a + it.qtd * it.custo_unitario, 0)
}

/** Ajusta custo_unitario para fechar exatamente em targetTotal */
function scaleItems(itens, targetTotal) {
  const current = sumItems(itens)
  if (!current || current === targetTotal) return itens.map(it => ({ ...it }))

  const factor = targetTotal / current
  const scaled = itens.map(it => ({
    ...it,
    custo_unitario: Math.round(it.custo_unitario * factor),
  }))

  let diff = targetTotal - sumItems(scaled)
  if (diff !== 0) {
    const last = scaled[scaled.length - 1]
    const adjust = Math.round(diff / last.qtd)
    if (adjust !== 0) last.custo_unitario += adjust
    diff = targetTotal - sumItems(scaled)
    if (diff !== 0) last.custo_unitario += diff / last.qtd
    last.custo_unitario = Math.round(last.custo_unitario)
  }

  diff = targetTotal - sumItems(scaled)
  if (diff !== 0) {
    const last = scaled[scaled.length - 1]
    last.custo_unitario += diff / last.qtd
    last.custo_unitario = Math.round(last.custo_unitario * 100) / 100
  }

  return scaled
}

async function main() {
  const sb = createClient(URL, loadServiceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: compras } = await sb.from('compras')
    .select('id,data,total_real,compras_itens(id,nome,qtd,custo_unitario)')
    .eq('fornecedor', 'Liquor Mountain')
    .gte('data', '2026-07-01')
    .lte('data', '2026-07-31')
    .order('data')

  console.log(`\n📋 Ajuste custos LM jul/2026 → ¥${TARGET_TOTAL.toLocaleString('ja-JP')}${DRY ? ' (dry-run)' : ''}\n`)

  let grandTotal = 0
  for (const compra of compras || []) {
    const target = +compra.total_real
    const before = sumItems(compra.compras_itens)
    const scaled = scaleItems(compra.compras_itens, target)
    const after = sumItems(scaled)

    console.log(`  ${compra.data} nota ¥${target.toLocaleString('ja-JP')} | antes ¥${Math.round(before).toLocaleString('ja-JP')} → depois ¥${Math.round(after).toLocaleString('ja-JP')}`)

    if (!DRY) {
      for (const it of scaled) {
        await sb.from('compras_itens').update({ custo_unitario: it.custo_unitario }).eq('id', it.id)
      }
    }
    grandTotal += after
  }

  console.log(`\n  TOTAL: ¥${Math.round(grandTotal).toLocaleString('ja-JP')} ${Math.round(grandTotal) === TARGET_TOTAL ? '✅' : '❌'}\n`)
}

main().catch(e => {
  console.error('\n❌', e.message, '\n')
  process.exit(1)
})
