#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import {
  buildPurchaseCostIndex,
  unitCostAtDate,
  marginFromSales,
  saleDate,
  buildPedidoByVendaPrefix,
  marginFromVendaItem,
} from '../src/lib/marginCost.js'

const SB_URL = 'https://ojirgkqtqvugqktyuhem.supabase.co'
const MONTH = '2026-07'
const BAR_ATOMIC = 'b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9'

function loadServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY
  const raw = readFileSync('.env.production', 'utf8')
  const line = raw.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY='))
  return line.split('=').slice(1).join('=').replace(/^"|"$/g, '')
}

const mk = d => String(d || '').slice(0, 7)
const fmt = n => `¥${Math.round(n).toLocaleString('ja-JP')}`

async function main() {
  const sb = createClient(SB_URL, loadServiceKey(), { auth: { autoRefreshToken: false, persistSession: false } })
  const [{ data: compras }, { data: vendas }, { data: produtos }, { data: pedidos }] = await Promise.all([
    sb.from('compras').select('*, compras_itens(*)').order('data'),
    sb.from('vendas').select('*, vendas_itens(*, produtos(*))').gte('data', `${MONTH}-01`).lte('data', `${MONTH}-31`),
    sb.from('produtos').select('id,nome,custo'),
    sb.from('pedidos').select('id, pedidos_itens(*, produtos(*))'),
  ])

  const comprasJul = (compras || []).filter(c => mk(c.data) === MONTH)
  const totalComprasJul = comprasJul.reduce((a, c) => a + (+c.total_real || 0), 0)
  const vendasAtomic = (vendas || []).filter(v => v.bar_id === BAR_ATOMIC)
  const costIndex = buildPurchaseCostIndex(compras || [], produtos || [])
  const pedidoMap = buildPedidoByVendaPrefix(pedidos || [])
  const mesMargin = marginFromSales(vendasAtomic, costIndex, produtos || [], pedidoMap)

  // Map última compra por produto até data
  function lastCompraBefore(pid, date) {
    const hist = costIndex[pid] || []
    let last = null
    for (const h of hist) {
      if (h.date <= date) last = h
      else break
    }
    return last
  }

  const linhas = []
  for (const v of vendasAtomic) {
    const d = saleDate(v)
    for (const it of v.vendas_itens || []) {
      const m = marginFromVendaItem(it, d, costIndex, produtos || [])
      const last = lastCompraBefore(it.produto_id, d)
      const nome = it.produtos?.nome || produtos?.find(p => p.id === it.produto_id)?.nome || '?'
      const origem = !last ? 'catálogo (sem compra no sistema)' : mk(last.date) < MONTH ? `compra ${last.date} (antes de jul)` : `compra ${last.date} (jul)`
      linhas.push({
        nome, qtd: +it.qtd || 0, unitCost: m.unitCost, custo: m.custo, vendaData: d, origem, compraData: last?.date || null,
      })
    }
  }

  const porOrigem = {}
  for (const l of linhas) {
    const key = l.origem.startsWith('catálogo') ? 'catálogo' : l.origem.includes('antes') ? 'compra anterior' : 'compra jul'
    porOrigem[key] = (porOrigem[key] || 0) + l.custo
  }

  console.log('\n══ CUSTO VENDIDO POR ORIGEM DO CUSTO UNITÁRIO ══')
  for (const [k, v] of Object.entries(porOrigem).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(18)} ${fmt(v)}`)
  }
  console.log(`  ${'TOTAL'.padEnd(18)} ${fmt(mesMargin.custo)}`)

  const foraNota = linhas.filter(l => !l.origem.includes('(jul)'))
  console.log('\n══ ITENS VENDIDOS EM JUL C/ CUSTO FORA DAS NOTAS DE JUL ══')
  console.log(`Total: ${fmt(foraNota.reduce((a, l) => a + l.custo, 0))}\n`)
  for (const l of foraNota.sort((a, b) => b.custo - a.custo)) {
    console.log(`  ${l.vendaData}  ${l.nome}`)
    console.log(`    ${l.qtd} un. × ${fmt(l.unitCost)} = ${fmt(l.custo)}  [${l.origem}]`)
  }

  // Valor das notas jul que ficou em estoque (soma linhas compras jul)
  let totalLinhasJul = 0
  const linhasJul = []
  for (const c of comprasJul) {
    for (const it of c.compras_itens || []) {
      const v = (+it.custo_unitario || 0) * (+it.qtd || 0)
      totalLinhasJul += v
      linhasJul.push({ nome: it.nome, qtd: it.qtd, valor: v, data: c.data, fornecedor: c.fornecedor })
    }
  }

  // Custo vendido que veio de linhas jul
  const custoDeJul = porOrigem['compra jul'] || 0
  const estoqueJul = totalLinhasJul - custoDeJul  // approx: what was bought at line level but not attributed to sales

  console.log('\n══ NOTAS JUL — LINHAS vs FATURAS ══')
  console.log(`  Soma total_real (faturas):     ${fmt(totalComprasJul)}`)
  console.log(`  Soma linhas (qtd×custo_unit):  ${fmt(totalLinhasJul)}`)
  console.log(`  Diferença fatura vs linhas:    ${fmt(totalComprasJul - totalLinhasJul)}`)

  console.log('\n══ ESTOQUE COMPRADO EM JUL (não entrou no custo vendido) ══')
  console.log(`  Linhas jul − custo vendido de jul: ${fmt(totalLinhasJul - custoDeJul)}`)
  console.log(`  (= compras que pagou mas não vendeu em jul)\n`)

  const vendidoNomes = new Set(linhas.map(l => l.nome.toLowerCase()))
  const naoVendido = linhasJul.filter(l => {
    const n = String(l.nome).toLowerCase()
    // rough: line item not represented in any sale line name
    return !linhas.some(s => s.nome.toLowerCase().includes(n.split(' ')[0]) || n.includes(s.nome.toLowerCase().split(' ')[0]))
  })
  console.log('  Principais linhas de compra jul sem venda correspondente em jul:')
  for (const l of naoVendido.sort((a, b) => b.valor - a.valor).slice(0, 20)) {
    console.log(`  · ${l.data} ${l.fornecedor}: ${l.nome} — ${l.qtd} un. ${fmt(l.valor)}`)
  }

  console.log('\n══ RECONCILIAÇÃO ══')
  console.log(`  Compras pagas (faturas jul):           ${fmt(totalComprasJul)}`)
  console.log(`  + Custo vendido fora das notas jul:    ${fmt(foraNota.reduce((a, l) => a + l.custo, 0))}`)
  console.log(`  − Estoque comprado em jul (não vendido): ${fmt(totalLinhasJul - custoDeJul)}`)
  const esperado = totalComprasJul + foraNota.reduce((a, l) => a + l.custo, 0) - (totalLinhasJul - custoDeJul)
  console.log(`  = Custo vendido esperado:              ${fmt(esperado)}`)
  console.log(`  Custo vendido real:                    ${fmt(mesMargin.custo)}`)
  console.log(`  Gap restante:                          ${fmt(mesMargin.custo - esperado)}`)
  console.log('')
}

main().catch(e => { console.error(e); process.exit(1) })
