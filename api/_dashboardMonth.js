import { aReceberForMonth, faturamentoForMonth } from './_faturasMonth.js'

export const JUNE_MONTH = '2026-06'
export const JULY_MONTH = '2026-07'

export function monthKey(d) {
  return String(d || '').slice(0, 7)
}

export function compraMonthKey(c) {
  const d = c?.data_compra || c?.data || c?.data_pagamento || ''
  return monthKey(d)
}

/** Nota entra no mês se qualquer data (compra, lançamento ou pagamento) cair nele */
export function compraMatchesMonth(c, selMonth) {
  if (!selMonth || !c) return false
  return [c.data_compra, c.data, c.data_pagamento].some(d => monthKey(d) === selMonth)
}

export function compraTotal(c) {
  const real = +c.total_real || 0
  if (real) return real
  const pago = +c.total_pago || 0
  if (pago) return pago
  return (c.compras_itens || []).reduce((a, it) => a + (+it.qtd || 0) * (+it.custo_unitario || 0), 0)
}

export function saleMonthKey(v) {
  return monthKey(v?.data || v?.data_venda || '')
}

export function pedidoMonthKey(p) {
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
  return (produtos || []).find(p => norm(p.nome).includes(first))?.id || null
}

function julyUnitPriceMap(compras, produtos = []) {
  const map = {}
  for (const c of compras || []) {
    if (!compraMatchesMonth(c, JULY_MONTH)) continue
    for (const it of c.compras_itens || []) {
      const custo = +it.custo_unitario || 0
      if (!custo) continue
      const pid = it.produto_id || matchProductId(it.nome, produtos)
      if (pid) map[pid] = custo
    }
  }
  return map
}

function unitCost(pid, nome, priceMap, produtos) {
  if (pid && priceMap[pid]) return priceMap[pid]
  const matched = pid || matchProductId(nome, produtos)
  if (matched && priceMap[matched]) return priceMap[matched]
  return +(produtos || []).find(p => p.id === matched || p.id === pid)?.custo || 0
}

/** Jun/2026 — faturamento da fatura; custo = pedidos × preço unit. jul/2026 (sem escala/ratio) */
function juneStats({ compras, pedidos, produtos, faturamentoFaturas, aReceber }) {
  const priceMap = julyUnitPriceMap(compras, produtos)
  let custo = 0
  let itemCount = 0

  for (const p of (pedidos || []).filter(p => pedidoMonthKey(p) === JUNE_MONTH)) {
    for (const it of p.pedidos_itens || []) {
      const qtd = +it.qtd || 0
      if (!qtd) continue
      custo += qtd * unitCost(it.produto_id, it.nome, priceMap, produtos)
      itemCount++
    }
  }

  const faturamento = faturamentoFaturas || 0
  const lucroProjetado = faturamento - custo

  return {
    receita: 0,
    faturamento,
    compras: custo,
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

function pedidosFaturamentoForMonth(pedidos, m) {
  return (pedidos || [])
    .filter(p => pedidoMonthKey(p) === m && ['entregue', 'confirmado'].includes(p.status))
    .reduce((a, p) => a + (+p.total_estimado || 0), 0)
}

/** Regra única: faturamento − notas pagas do mês (Jul e demais meses) */
export function monthDashboardStats(m, { vendas, compras, faturas, pedidos, produtos }) {
  const receita = (vendas || []).filter(v => saleMonthKey(v) === m).reduce((a, v) => a + (+v.total || 0), 0)
  const faturamentoFaturas = faturamentoForMonth(faturas, m)
  const faturamentoPedidos = pedidosFaturamentoForMonth(pedidos, m)
  const aReceber = aReceberForMonth(faturas, m)

  if (m === JUNE_MONTH) {
    return juneStats({ compras, pedidos, produtos, faturamentoFaturas, aReceber })
  }

  const comprasMes = (compras || []).filter(c => compraMatchesMonth(c, m))
  const comprasTotal = comprasMes.reduce((a, c) => a + compraTotal(c), 0)
  const faturamento = faturamentoFaturas || receita || faturamentoPedidos
  const lucroProjetado = faturamento - comprasTotal

  return {
    receita,
    faturamento,
    compras: comprasTotal,
    lucro: receita - comprasTotal,
    lucroProjetado,
    margem: faturamento > 0 ? Math.round(lucroProjetado / faturamento * 100) : 0,
    vendasCount: (vendas || []).filter(v => saleMonthKey(v) === m).length,
    comprasCount: comprasMes.length,
    aReceber,
  }
}

export function faturaMonthKeys(faturas) {
  const keys = []
  for (const f of faturas || []) {
    const start = monthKey(f.periodo_inicio || f.data_emissao)
    const end = monthKey(f.periodo_fim || f.data_vencimento || start)
    if (start) keys.push(start)
    if (end && end !== start) keys.push(end)
  }
  return keys
}
