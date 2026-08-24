#!/usr/bin/env node
/**
 * Analisa diferença entre compras pagas (notas jul/2026) e custo dos itens vendidos.
 * Uso: SUPABASE_SERVICE_ROLE_KEY=... node scripts/analyze-july-compras-vs-custo.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import {
  buildPurchaseCostIndex,
  unitCostAtDate,
  marginFromSales,
  saleDate,
  buildPedidoByVendaPrefix,
} from '../src/lib/marginCost.js'

const SB_URL = 'https://ojirgkqtqvugqktyuhem.supabase.co'
const MONTH = '2026-07'
const BAR_ATOMIC = 'b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9'

function loadServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY
  try {
    const raw = readFileSync('.env.production', 'utf8')
    const line = raw.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY='))
    if (line) return line.split('=').slice(1).join('=').replace(/^"|"$/g, '')
  } catch {}
  throw new Error('SUPABASE_SERVICE_ROLE_KEY não encontrada')
}

function monthKey(d) {
  return String(d || '').slice(0, 7)
}

function fmt(n) {
  return `¥${Math.round(n).toLocaleString('ja-JP')}`
}

function findCostSource(index, produtoId, saleDateStr, produtos) {
  const history = index[produtoId] || []
  if (!history.length) {
    const p = produtos.find(x => x.id === produtoId)
    return { date: null, custo: p?.custo || 0, source: 'catalogo' }
  }
  let cost = 0
  let date = null
  for (const h of history) {
    if (h.date <= saleDateStr) { cost = h.custo; date = h.date }
    else break
  }
  if (!cost && history.length) { cost = history[0].custo; date = history[0].date }
  return { date, custo: cost, source: date ? 'compra' : 'catalogo' }
}

async function main() {
  const sb = createClient(SB_URL, loadServiceKey(), { auth: { autoRefreshToken: false, persistSession: false } })

  const [{ data: compras }, { data: vendas }, { data: produtos }, { data: pedidos }] = await Promise.all([
    sb.from('compras').select('*, compras_itens(*)').order('data'),
    sb.from('vendas').select('*, vendas_itens(*, produtos(*))').gte('data', `${MONTH}-01`).lte('data', `${MONTH}-31`),
    sb.from('produtos').select('id,nome,custo'),
    sb.from('pedidos').select('id, pedidos_itens(*, produtos(*))'),
  ])

  const comprasJul = (compras || []).filter(c => monthKey(c.data || c.data_compra) === MONTH)
  const totalComprasJul = comprasJul.reduce((a, c) => a + (+c.total_real || 0), 0)

  const vendasAtomic = (vendas || []).filter(v => v.bar_id === BAR_ATOMIC)
  const costIndex = buildPurchaseCostIndex(compras || [], produtos || [])
  const pedidoMap = buildPedidoByVendaPrefix(pedidos || [])
  const mesMargin = marginFromSales(vendasAtomic, costIndex, produtos || [], pedidoMap)

  console.log('\n══════════════════════════════════════════════════════')
  console.log(`ANÁLISE ${MONTH} — ATOMIC BAR`)
  console.log('══════════════════════════════════════════════════════\n')
  console.log(`Compras pagas (notas jul):     ${fmt(totalComprasJul)} (${comprasJul.length} notas)`)
  console.log(`Custo itens vendidos (lucro):  ${fmt(mesMargin.custo)} (${vendasAtomic.length} vendas)`)
  console.log(`Diferença:                     ${fmt(mesMargin.custo - totalComprasJul)}`)

  // ── 1. Vendido com custo de compra ANTERIOR a julho ──
  const vendidoDeEstoqueAnterior = []
  let totalCustoEstoqueAnterior = 0
  let totalCustoJulCompras = 0
  let totalCustoCatalogo = 0

  for (const v of vendasAtomic) {
    const d = saleDate(v)
    for (const it of v.vendas_itens || []) {
      const qtd = +it.qtd || 0
      const src = findCostSource(costIndex, it.produto_id, d, produtos || [])
      const custoLinha = src.custo * qtd
      const nome = it.produtos?.nome || produtos?.find(p => p.id === it.produto_id)?.nome || '?'

      if (src.source === 'catalogo' || !src.date) {
        totalCustoCatalogo += custoLinha
        vendidoDeEstoqueAnterior.push({ nome, qtd, custoLinha, vendaData: d, compraData: 'catálogo', motivo: 'sem histórico de compra' })
      } else if (monthKey(src.date) < MONTH) {
        totalCustoEstoqueAnterior += custoLinha
        vendidoDeEstoqueAnterior.push({ nome, qtd, custoLinha, vendaData: d, compraData: src.date, motivo: 'compra anterior' })
      } else {
        totalCustoJulCompras += custoLinha
      }
    }
  }

  console.log('\n── A) Custo vendido que NÃO veio de nota de julho ──')
  console.log(`   De compras anteriores:  ${fmt(totalCustoEstoqueAnterior)}`)
  console.log(`   De catálogo (fallback): ${fmt(totalCustoCatalogo)}`)
  console.log(`   Subtotal fora da nota:  ${fmt(totalCustoEstoqueAnterior + totalCustoCatalogo)}`)

  const byProdAnterior = {}
  for (const r of vendidoDeEstoqueAnterior) {
    if (!byProdAnterior[r.nome]) byProdAnterior[r.nome] = { qtd: 0, custo: 0, compraData: r.compraData }
    byProdAnterior[r.nome].qtd += r.qtd
    byProdAnterior[r.nome].custo += r.custoLinha
  }
  const topAnterior = Object.entries(byProdAnterior).sort((a, b) => b[1].custo - a[1].custo)
  if (topAnterior.length) {
    console.log('\n   Produtos vendidos em jul com custo de compra anterior/catálogo:')
    for (const [nome, info] of topAnterior) {
      console.log(`   · ${nome}: ${info.qtd} un. → ${fmt(info.custo)} (ref: ${info.compraData})`)
    }
  }

  // ── 2. Comprado em jul mas NÃO vendido em jul ──
  const vendidoQtdPorProd = {}
  for (const v of vendasAtomic) {
    for (const it of v.vendas_itens || []) {
      const pid = it.produto_id
      vendidoQtdPorProd[pid] = (vendidoQtdPorProd[pid] || 0) + (+it.qtd || 0)
    }
  }

  const compradoNaoVendido = []
  let totalCompradoNaoVendido = 0

  for (const c of comprasJul) {
    for (const it of c.compras_itens || []) {
      const custo = +it.custo_unitario || 0
      const qtd = +it.qtd || 0
      if (!custo || !qtd) continue
      let pid = it.produto_id
      if (!pid) {
        const n = String(it.nome || '').toLowerCase()
        const p = (produtos || []).find(x => String(x.nome).toLowerCase().includes(n) || n.includes(String(x.nome).toLowerCase()))
        pid = p?.id
      }
      const vendido = pid ? (vendidoQtdPorProd[pid] || 0) : 0
      const sobra = Math.max(0, qtd - vendido)
      if (sobra > 0) {
        const valor = sobra * custo
        totalCompradoNaoVendido += valor
        compradoNaoVendido.push({
          nome: it.nome || produtos?.find(p => p.id === pid)?.nome || '?',
          qtdComprada: qtd,
          qtdVendida: vendido,
          sobra,
          valor,
          nota: c.data,
          fornecedor: c.fornecedor,
        })
      }
    }
  }

  console.log('\n── B) Comprado em jul (na nota) mas NÃO vendido em jul ──')
  console.log(`   Valor em estoque (aprox.): ${fmt(totalCompradoNaoVendido)}`)
  if (compradoNaoVendido.length) {
    compradoNaoVendido.sort((a, b) => b.valor - a.valor)
    for (const r of compradoNaoVendido) {
      console.log(`   · ${r.nome}: comprou ${r.qtdComprada}, vendeu ${r.qtdVendida}, sobra ${r.sobra} → ${fmt(r.valor)} (${r.fornecedor} ${r.nota})`)
    }
  } else {
    console.log('   (nenhum item com sobra detectado por produto)')
  }

  // ── 3. Notas jul detalhadas ──
  console.log('\n── C) Notas de compra pagas em jul/2026 ──')
  for (const c of comprasJul.sort((a, b) => (a.data || '').localeCompare(b.data || ''))) {
    console.log(`   ${c.data}  ${c.fornecedor?.padEnd(20)}  ${fmt(c.total_real)}  (${(c.compras_itens || []).length} itens)`)
  }

  // ── 4. Reconciliação ──
  const explicado = (totalCustoEstoqueAnterior + totalCustoCatalogo) - totalCompradoNaoVendido
  console.log('\n── D) Reconciliação aproximada ──')
  console.log(`   + Custo vendido de estoque anterior:  ${fmt(totalCustoEstoqueAnterior + totalCustoCatalogo)}`)
  console.log(`   − Comprado em jul ainda em estoque:    ${fmt(totalCompradoNaoVendido)}`)
  console.log(`   = Explicação líquida da diferença:     ${fmt(explicado)}`)
  console.log(`   Diferença real (custo vend − notas):   ${fmt(mesMargin.custo - totalComprasJul)}`)
  console.log('')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
