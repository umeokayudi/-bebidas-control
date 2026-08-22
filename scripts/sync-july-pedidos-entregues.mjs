/**
 * Marca pedidos com entrega em jul/2026 como entregues + cria vendas.
 * Registra compra Le Vin (jul/15) se ainda não existir.
 * Mostra resumo de receita, custo e lucro de julho.
 *
 * Uso: node scripts/sync-july-pedidos-entregues.mjs
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { ATOMIC_BAR_ID } from '../api/_atomicJuneFix.js'
import { buildPurchaseCostIndex, unitCostAtDate, marginFromVendaItem } from '../api/_marginCost.js'

const URL = 'https://ojirgkqtqvugqktyuhem.supabase.co'
const JUL_FROM = '2026-07-01'
const JUL_TO = '2026-07-31'
const LE_VIN_PEDIDO_ID = 'a6d3161a-42cd-4a24-b70d-6caac1878d1d'

function loadServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY
  const env = readFileSync('.env.production', 'utf8')
  const m = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)
  if (m) return m[1].replace(/^["']|["']$/g, '')
  throw new Error('SUPABASE_SERVICE_ROLE_KEY não encontrada')
}

function pedidoSaleDate(p) {
  return p.data_entrega_prevista || p.data_pedido || p.criado_em?.slice(0, 10)
}

function pedidoTotal(p) {
  const fromItems = (p.pedidos_itens || []).reduce(
    (a, it) => a + (+it.preco_unitario || 0) * (+it.qtd || 0), 0
  )
  return +p.total_estimado || fromItems || 0
}

async function findVendaForPedido(sb, pedidoId) {
  const key = String(pedidoId).slice(0, 8)
  const { data } = await sb.from('vendas')
    .select('id, data, total, obs')
    .ilike('obs', `%${key}%`)
    .limit(1)
  return data?.[0] || null
}

async function ensureVenda(sb, pedido) {
  const saleDate = pedidoSaleDate(pedido)
  const total = pedidoTotal(pedido)
  const existing = await findVendaForPedido(sb, pedido.id)

  if (existing) {
    await sb.from('vendas').update({ data: saleDate, data_venda: saleDate, total }).eq('id', existing.id)
    return { venda: { ...existing, data: saleDate, total }, created: false }
  }

  const { data: venda, error } = await sb.from('vendas').insert({
    data: saleDate,
    data_venda: saleDate,
    bar_id: pedido.bar_id,
    total,
    obs: `Auto: order ${pedido.id.slice(0, 8)}`,
    criado_por: pedido.criado_por,
  }).select().single()

  if (error) throw new Error(`venda ${pedido.id.slice(0, 8)}: ${error.message}`)

  const itens = (pedido.pedidos_itens || []).filter(it => it.produto_id)
  if (itens.length) {
    await sb.from('vendas_itens').insert(
      itens.map(it => ({
        venda_id: venda.id,
        produto_id: it.produto_id,
        qtd: it.qtd,
        preco_unitario: it.preco_unitario,
      }))
    )
  }

  return { venda, created: true }
}

async function syncJulyPedidos(sb) {
  const { data: pedidos, error } = await sb
    .from('pedidos')
    .select('*, pedidos_itens(*, produtos(nome,custo,preco_venda))')
    .eq('bar_id', ATOMIC_BAR_ID)
    .gte('data_entrega_prevista', JUL_FROM)
    .lte('data_entrega_prevista', JUL_TO)
    .in('status', ['pendente', 'confirmado'])
    .order('data_entrega_prevista')

  if (error) throw error

  const report = { pedidos: 0, vendas: 0, receita: 0, ids: [] }

  for (const p of pedidos || []) {
    const saleDate = pedidoSaleDate(p)
    await sb.from('pedidos').update({
      status: 'entregue',
      data_pedido: saleDate,
      data_entrega_prevista: saleDate,
    }).eq('id', p.id)

    const { venda, created } = await ensureVenda(sb, { ...p, data_entrega_prevista: saleDate, data_pedido: saleDate })
    report.pedidos++
    if (created) report.vendas++
    report.receita += +venda.total || 0
    report.ids.push(p.id.slice(0, 8))
    console.log(`✅ ${saleDate} pedido ${p.id.slice(0, 8)} → entregue · venda ¥${(+venda.total || 0).toLocaleString('ja-JP')}`)
  }

  return report
}

async function ensureLeVinCompra(sb) {
  const { data: existing } = await sb.from('compras')
    .select('id')
    .eq('fornecedor', 'Le Vin')
    .gte('data', JUL_FROM)
    .lte('data', JUL_TO)
    .limit(1)

  if (existing?.length) {
    console.log('⏭  Compra Le Vin jul/2026 já existe')
    return null
  }

  const { data: pedido, error } = await sb
    .from('pedidos')
    .select('*, pedidos_itens(*, produtos(nome,custo))')
    .eq('id', LE_VIN_PEDIDO_ID)
    .single()

  if (error || !pedido) throw new Error('Pedido Le Vin (jul/15) não encontrado')

  const itens = (pedido.pedidos_itens || []).map(it => ({
    nome: it.produtos?.nome || '?',
    qtd: it.qtd,
    custo_unitario: it.produtos?.custo || 0,
  }))

  const subtotal = itens.reduce((a, it) => a + it.qtd * it.custo_unitario, 0)

  const { data: compra, error: cErr } = await sb.from('compras').insert({
    data: '2026-07-15',
    fornecedor: 'Le Vin',
    pagamento: 'Invoice 30d',
    subtotal,
    desconto_pontos: 0,
    total_pago: subtotal,
    total_real: subtotal,
    pontos_ganhos: 0,
    status_pagamento: 'pendente',
    obs: 'Le Vin 請求書 — jul/2026 (champagne & premium spirits, 税込 custo catálogo)',
  }).select().single()

  if (cErr) throw new Error(`compra Le Vin: ${cErr.message}`)

  await sb.from('compras_itens').insert(
    itens.map(it => ({ compra_id: compra.id, ...it }))
  )

  console.log(`✅ Le Vin compra jul/15 — ¥${subtotal.toLocaleString('ja-JP')} (${itens.length} itens)`)
  return { id: compra.id, total: subtotal }
}

async function profitReport(sb) {
  const [{ data: vendas }, { data: compras }, { data: produtos }] = await Promise.all([
    sb.from('vendas')
      .select('id,data,total,vendas_itens(produto_id,qtd,preco_unitario,produtos(nome,custo))')
      .eq('bar_id', ATOMIC_BAR_ID)
      .gte('data', JUL_FROM)
      .lte('data', JUL_TO),
    sb.from('compras')
      .select('id,data,fornecedor,total_real,compras_itens(nome,qtd,custo_unitario)')
      .gte('data', JUL_FROM)
      .lte('data', JUL_TO)
      .order('data'),
    sb.from('produtos').select('id,nome,custo'),
  ])

  const costIndex = buildPurchaseCostIndex(compras || [], produtos || [])
  let receita = 0
  let custoVendas = 0

  for (const v of vendas || []) {
    receita += +v.total || 0
    for (const it of v.vendas_itens || []) {
      const m = marginFromVendaItem(it, v.data, costIndex, produtos || [])
      custoVendas += m.custo
    }
  }

  const custoCompras = (compras || []).reduce((a, c) => a + (+c.total_real || 0), 0)
  const bySupplier = {}
  for (const c of compras || []) {
    bySupplier[c.fornecedor] = (bySupplier[c.fornecedor] || 0) + (+c.total_real || 0)
  }

  return {
    receita,
    custoVendas,
    custoCompras,
    lucro: receita - custoVendas,
    margemPct: receita > 0 ? Math.round(((receita - custoVendas) / receita) * 100) : 0,
    vendasCount: vendas?.length || 0,
    comprasCount: compras?.length || 0,
    bySupplier,
    compras: compras || [],
  }
}

async function main() {
  const key = loadServiceKey()
  const sb = createClient(URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('\n📦 Julho/2026 — entregas + lucro\n')

  const sync = await syncJulyPedidos(sb)
  await ensureLeVinCompra(sb)
  const profit = await profitReport(sb)

  console.log('\n── Pedidos sincronizados ──')
  console.log(`  Entregues: ${sync.pedidos}`)
  console.log(`  Vendas novas: ${sync.vendas}`)
  console.log(`  Receita novas entregas: ¥${sync.receita.toLocaleString('ja-JP')}`)

  console.log('\n── Compras jul/2026 (custos JBM) ──')
  for (const c of profit.compras) {
    console.log(`  ${c.data} ${c.fornecedor.padEnd(18)} ¥${(+c.total_real).toLocaleString('ja-JP')}`)
  }
  console.log(`  TOTAL COMPRAS: ¥${profit.custoCompras.toLocaleString('ja-JP')}`)
  for (const [f, v] of Object.entries(profit.bySupplier)) {
    console.log(`    · ${f}: ¥${v.toLocaleString('ja-JP')}`)
  }

  console.log('\n── Resultado jul/2026 (Atomic) ──')
  console.log(`  Vendas registradas: ${profit.vendasCount}`)
  console.log(`  Receita (vendas):   ¥${profit.receita.toLocaleString('ja-JP')}`)
  console.log(`  Custo (produtos):   ¥${profit.custoVendas.toLocaleString('ja-JP')}`)
  console.log(`  Lucro bruto:        ¥${profit.lucro.toLocaleString('ja-JP')}`)
  console.log(`  Margem:             ${profit.margemPct}%`)
  console.log('')
}

main().catch(e => {
  console.error('\n❌', e.message, '\n')
  process.exit(1)
})
