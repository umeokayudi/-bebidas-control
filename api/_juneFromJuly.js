/** Jun/2026 — custo estimado com preços unitários das notas de Jul/2026 */

import { faturamentoForMonth } from './_faturasMonth.js'

const JUNE_MONTH = '2026-06'
const JULY_MONTH = '2026-07'

function monthKey(d) {
  return String(d || '').slice(0, 7)
}

function compraMonthKey(c) {
  const d = c?.data || c?.data_compra || c?.data_pagamento || ''
  return monthKey(d)
}

function pedidoMonthKey(p) {
  return monthKey(p?.data_pedido || p?.data_entrega_prevista || p?.criado_em || '')
}

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim()
}

function matchProductId(nome, produtos) {
  if (!nome) return null
  const n = norm(nome)
  const exact = (produtos || []).find(p => norm(p.nome) === n)
  if (exact) return exact.id
  const partial = (produtos || []).find(p => norm(p.nome).includes(n) || n.includes(norm(p.nome)))
  if (partial) return partial.id
  const first = n.split(/\s+/)[0]
  const byFirst = (produtos || []).find(p => norm(p.nome).includes(first))
  return byFirst?.id || null
}

/** Mapa produto_id → custo unitário das notas de jul/2026 */
export function julyUnitPriceMap(compras, produtos = []) {
  const map = {}
  for (const c of compras || []) {
    if (compraMonthKey(c) !== JULY_MONTH) continue
    for (const it of c.compras_itens || []) {
      const custo = +it.custo_unitario || 0
      if (!custo) continue
      let pid = it.produto_id
      if (!pid) pid = matchProductId(it.nome, produtos)
      if (pid) map[pid] = custo
    }
  }
  return map
}

function unitCostForJune(pid, nome, priceMap, produtos) {
  if (pid && priceMap[pid]) return priceMap[pid]
  const matched = pid || matchProductId(nome, produtos)
  if (matched && priceMap[matched]) return priceMap[matched]
  const cat = (produtos || []).find(p => p.id === pid || p.id === matched)
  return +cat?.custo || 0
}

/**
 * Jun/2026: faturamento da fatura/pedidos; compras = qty dos pedidos × preço unit. jul/2026.
 * Escala o custo se o faturamento (fatura) for maior que a soma dos pedidos.
 */
export function juneStatsFromJulyPrices({ compras, pedidos, produtos, faturas, faturamentoFaturas, faturamentoPedidos, aReceber }) {
  const priceMap = julyUnitPriceMap(compras, produtos)
  const junePedidos = (pedidos || []).filter(p => pedidoMonthKey(p) === JUNE_MONTH)

  let pedidosReceita = 0
  let comprasEstimadas = 0
  let itemCount = 0

  for (const p of junePedidos) {
    for (const it of p.pedidos_itens || []) {
      const qtd = +it.qtd || 0
      if (!qtd) continue
      const preco = +it.preco_unitario || 0
      pedidosReceita += preco * qtd
      const unit = unitCostForJune(it.produto_id, it.nome, priceMap, produtos)
      comprasEstimadas += qtd * unit
      itemCount++
    }
  }

  const faturamento = faturamentoFaturas || faturamentoPedidos || pedidosReceita

  if (pedidosReceita > 0 && faturamento > pedidosReceita) {
    comprasEstimadas = Math.round(comprasEstimadas * (faturamento / pedidosReceita))
  }

  if (comprasEstimadas === 0 && faturamento > 0) {
    const julyCompras = (compras || [])
      .filter(c => compraMonthKey(c) === JULY_MONTH)
      .reduce((a, c) => a + (+c.total_real || 0), 0)
    const julyFat = faturamentoForMonth(faturas, JULY_MONTH)
    if (julyFat > 0 && julyCompras > 0) {
      comprasEstimadas = Math.round(faturamento * (julyCompras / julyFat))
    }
  }

  const lucroProjetado = faturamento - comprasEstimadas
  return {
    receita: 0,
    faturamento,
    compras: comprasEstimadas,
    lucro: lucroProjetado,
    lucroProjetado,
    margem: faturamento > 0 ? Math.round(lucroProjetado / faturamento * 100) : 0,
    vendasCount: 0,
    comprasCount: itemCount,
    aReceber,
    precoBase: JULY_MONTH,
    comprasEstimadas: true,
  }
}
