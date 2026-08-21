function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim()
}

function matchProductId(nome, produtos) {
  if (!nome) return null
  const n = norm(nome)
  const exact = produtos.find(p => norm(p.nome) === n)
  if (exact) return exact.id
  const partial = produtos.find(p => norm(p.nome).includes(n) || n.includes(norm(p.nome)))
  if (partial) return partial.id
  const first = n.split(/\s+/)[0]
  const byFirst = produtos.find(p => norm(p.nome).includes(first))
  return byFirst?.id || null
}

/** Histórico de custo unitário por produto (compras_itens) */
export function buildPurchaseCostIndex(compras, produtos = []) {
  const index = {}

  for (const compra of compras || []) {
    const date = compra.data
    if (!date) continue
    for (const it of compra.compras_itens || []) {
      const custo = +it.custo_unitario || 0
      if (!custo) continue
      let pid = it.produto_id
      if (!pid) pid = matchProductId(it.nome, produtos)
      if (!pid) continue
      if (!index[pid]) index[pid] = []
      index[pid].push({ date, custo })
    }
  }

  for (const pid of Object.keys(index)) {
    index[pid].sort((a, b) => a.date.localeCompare(b.date))
  }
  return index
}

/** Custo unitário vigente na data da venda (última compra até essa data) */
export function unitCostAtDate(index, produtoId, saleDate, fallback = 0) {
  const history = index[produtoId] || []
  if (!history.length) return +fallback || 0
  if (!saleDate) return history[history.length - 1].custo

  let cost = +fallback || 0
  for (const h of history) {
    if (h.date <= saleDate) cost = h.custo
    else break
  }
  if (!cost && history.length) cost = history[0].custo
  return cost
}

export function marginFromVendaItem(it, vendaDate, index, produtos) {
  const qtd = +it.qtd || 0
  const preco = +it.preco_unitario || 0
  const receita = preco * qtd
  const fallback = it.produtos?.custo ?? produtos?.find(p => p.id === it.produto_id)?.custo ?? 0
  const unitCost = unitCostAtDate(index, it.produto_id, vendaDate, fallback)
  const custo = unitCost * qtd
  return { receita, custo, lucro: receita - custo, unitCost }
}

export function marginFromSales(sales, index, produtos = []) {
  let receita = 0
  let custo = 0
  for (const v of sales || []) {
    let vReceita = 0
    let vCusto = 0
    for (const it of v.vendas_itens || []) {
      const m = marginFromVendaItem(it, v.data, index, produtos)
      vReceita += m.receita
      vCusto += m.custo
    }
    if (!v.vendas_itens?.length) {
      vReceita = +v.total || 0
    }
    receita += vReceita
    custo += vCusto
  }
  const lucro = receita - custo
  return {
    receita,
    custo,
    lucro,
    margemPct: receita > 0 ? Math.round((lucro / receita) * 100) : 0,
  }
}

export function marginFromPedidoItens(itens, pedidoDate, index, produtos = []) {
  let receita = 0
  let custo = 0
  for (const it of itens || []) {
    const qtd = +it.qtd || 0
    const preco = +it.preco_unitario || 0
    receita += preco * qtd
    const fallback = it.produtos?.custo ?? produtos?.find(p => p.id === it.produto_id)?.custo ?? 0
    custo += unitCostAtDate(index, it.produto_id, pedidoDate, fallback) * qtd
  }
  return { receita, custo, lucro: receita - custo }
}
