#!/usr/bin/env node
/**
 * Corrige pendências Atomic Bar: bar_pricing faltantes + fatura jun/2026
 * Uso: SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/fix-all-atomic.mjs
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL || 'https://ojirgkqtqvugqktyuhem.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}

const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const BAR_ID = 'b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9'

/** Preços POS inferidos do menu Atomic (drinks/un × ¥/drink) */
const EXPLICIT = {
  '611a81b2-6379-4205-a445-3ad334eaa344': { drinks_por_garrafa: 35, preco_drink: 1000 }, // Jameson 1750 — igual Jack
  '702fbb6e-9639-4946-8e41-9d04c0b5f907': { drinks_por_garrafa: 180, preco_drink: 1000 }, // Tomato 9×20
  'd3195f20-5d54-4537-bf53-133c5a250faf': { drinks_por_garrafa: 20, preco_drink: 1000 }, // Cramberry
  'f5cd5258-117e-4780-993e-1a152e36787c': { drinks_por_garrafa: 9, preco_drink: 3000 }, // Chandon Brut
  'a42adccc-63dc-4b78-b103-760b545664a5': { drinks_por_garrafa: 200, preco_drink: 1000 }, // GF Juice 6L
  'e9eb6d26-c1e7-4989-aac9-3846a74548df': { drinks_por_garrafa: 14, preco_drink: 1333 }, // Botanist — avg gin
  '3423222e-2efc-4524-a0c0-79478d041663': { drinks_por_garrafa: 14, preco_drink: 1000 }, // Malibu
  'fc130e7b-9dc7-4af4-9258-b174de8c7f81': { drinks_por_garrafa: 14, preco_drink: 2000 }, // Yamazaki premium
  '28f88e59-171d-4fa8-8e48-e26da2ca902e': { drinks_por_garrafa: 14, preco_drink: 1000 }, // Lejay Cassis
  '37164573-087f-429d-8a13-baee9f7b3a5a': { drinks_por_garrafa: 9, preco_drink: 3000 }, // Peñasol Brut
  'decc637c-3a1f-4376-a047-fc7e29ce86aa': { drinks_por_garrafa: 11, preco_drink: 1000 }, // Tonic 350ml
  'd5720654-a82b-4305-9c5e-777793790abd': { drinks_por_garrafa: 60, preco_drink: 2000 }, // Wilkson 1800ml
  'f3bf40f6-a5f9-4e75-a643-782f3297d871': { drinks_por_garrafa: 20, preco_drink: 1000 }, // Jasmin Tea
  '77ddb712-1cbc-4b3a-8520-cea447d54c71': { drinks_por_garrafa: 14, preco_drink: 2000 }, // Grey Goose Bottle
}

function isSupplierVenda(v) {
  if (!v) return false
  const obs = (v.obs || '').toLowerCase()
  if (obs.includes('balcão') || obs.includes('balcao') || obs.includes('square') || obs.includes('pos')) return false
  if (v.cast_id) return false
  return true
}

async function fixPricing() {
  const { data: vendas } = await sb.from('vendas').select('id').eq('bar_id', BAR_ID)
  const vendaIds = (vendas || []).map(v => v.id)
  const { data: itens } = await sb.from('vendas_itens').select('produto_id, produtos(nome)').in('venda_id', vendaIds)
  const { data: bp } = await sb.from('bar_pricing').select('produto_id,drinks_por_garrafa,preco_drink').eq('bar_id', BAR_ID)
  const bpSet = new Set((bp || []).filter(r => r.preco_drink > 0 && r.drinks_por_garrafa > 0).map(r => r.produto_id))

  const purchased = [...new Set((itens || []).map(i => i.produto_id).filter(Boolean))]
  const missing = purchased.filter(id => !bpSet.has(id))

  let upserted = 0
  for (const produto_id of missing) {
    const spec = EXPLICIT[produto_id]
    if (!spec) {
      const nome = itens.find(i => i.produto_id === produto_id)?.produtos?.nome
      console.warn('⚠️  Sem spec para:', nome, produto_id)
      continue
    }
    const { error } = await sb.from('bar_pricing').upsert(
      { bar_id: BAR_ID, produto_id, ...spec },
      { onConflict: 'bar_id,produto_id' }
    )
    if (error) console.error('FAIL', produto_id, error.message)
    else {
      const nome = itens.find(i => i.produto_id === produto_id)?.produtos?.nome
      console.log('✅ bar_pricing:', nome, spec)
      upserted++
    }
  }
  return { missing: missing.length, upserted }
}

async function fixFatura() {
  const { data: existing } = await sb.from('faturas')
    .select('id')
    .eq('bar_id', BAR_ID)
    .gte('periodo_inicio', '2026-06-01')
    .lte('periodo_fim', '2026-06-30')

  if (existing?.length) {
    console.log('ℹ️  Fatura jun/2026 já existe:', existing.length)
    return { created: false }
  }

  const { data: vendas } = await sb.from('vendas').select('total,obs,cast_id,data').eq('bar_id', BAR_ID)
  const june = (vendas || []).filter(v => v.data?.startsWith('2026-06') && isSupplierVenda(v))
  const total = june.reduce((a, v) => a + (+v.total || 0), 0)

  const { data, error } = await sb.from('faturas').insert({
    bar_id: BAR_ID,
    valor: total,
    total,
    pago: 0,
    status: 'pendente',
    data_emissao: '2026-06-01',
    data_vencimento: '2026-07-20',
    periodo_inicio: '2026-06-01',
    periodo_fim: '2026-06-30',
    obs: 'Fatura jun/2026 — gerada automaticamente (28 entregas JBM)',
  }).select().single()

  if (error) throw error
  console.log('✅ Fatura criada:', fmtYen(total), 'venc.', data.data_vencimento)
  return { created: true, total }
}

function fmtYen(n) {
  return '¥' + Math.round(n).toLocaleString('ja-JP')
}

async function main() {
  console.log('\n🔧 Fix Atomic Bar\n')
  const pricing = await fixPricing()
  console.log(`\nPricing: ${pricing.upserted}/${pricing.missing} cadastrados\n`)
  await fixFatura()
  const { count } = await sb.from('bar_pricing').select('*', { count: 'exact', head: true }).eq('bar_id', BAR_ID)
  console.log('\nTotal bar_pricing:', count)
  console.log('')
}

main().catch(e => { console.error(e); process.exit(1) })
