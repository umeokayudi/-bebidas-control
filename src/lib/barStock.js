/** Bar stock from JBM delivery notes + explicit movimentos. Never writes vendas/faturas. */

export function qtyOfMove(m) {
  const n = +m?.qtd || 0
  if (!n) return 0
  return m.tipo === 'entrada' ? n : -n
}

export function deliveryNoteMoves(notes = []) {
  const out = []
  for (const v of notes || []) {
    const items = v.vendas_itens || v.itens || []
    for (const it of items) {
      const id = it.produto_id || it.produtos?.id
      const nome = it.produtos?.nome || it.nome || ''
      if ((!id && !nome) || !(+it.qtd > 0)) continue
      out.push({
        produto_id: id || null,
        nome,
        tipo: 'entrada',
        qtd: +it.qtd,
        obs: `JBM note ${String(v.id || '').slice(0, 8)}`,
        implied: true,
      })
    }
  }
  return out
}

/** If a product already has an explicit entrada, trust movimentos. Else add implied deliveries. */
export function coalesceStockMoves(explicit = [], implied = []) {
  const hasEntrada = new Set()
  for (const m of explicit || []) {
    if (m?.produto_id && m.tipo === 'entrada' && +m.qtd > 0) hasEntrada.add(m.produto_id)
  }
  const extra = (implied || []).filter(m => m?.produto_id && !hasEntrada.has(m.produto_id))
  return [...(explicit || []), ...extra]
}

export function stockMapFromMoves(moves = []) {
  const map = {}
  for (const m of moves) {
    if (!m?.produto_id) continue
    map[m.produto_id] = (map[m.produto_id] || 0) + qtyOfMove(m)
  }
  return map
}

export function decorateStockList(produtos = [], moves = [], regras = {}) {
  const map = stockMapFromMoves(moves)
  const byName = {}
  const counted = new Set()
  for (const m of moves) {
    if (m?.produto_id) counted.add(m.produto_id)
    const n = String(m?.nome || '').trim().toLowerCase()
    if (n) {
      byName[n] = (byName[n] || 0) + qtyOfMove(m)
      counted.add(`name:${n}`)
    }
  }
  return (produtos || []).map(p => {
    const nameKey = String(p.nome || '').trim().toLowerCase()
    const raw = map[p.id] != null ? map[p.id] : byName[nameKey]
    const stock = Math.max(0, Math.round((raw || 0) * 100) / 100)
    const minimo = +regras[p.id] || 0
    const hasCount = counted.has(p.id) || counted.has(`name:${nameKey}`)
    const empty = hasCount && stock === 0
    const low = hasCount && minimo > 0 && stock > 0 && stock < minimo
    const crit = hasCount && minimo > 0 && stock === 0
    const good = hasCount && stock > 0 && (minimo === 0 || stock >= minimo)
    return {
      ...p,
      stock,
      minimo,
      hasCount,
      empty,
      low,
      crit,
      good,
      unknown: !hasCount,
    }
  })
}

export function stockGlance(list = []) {
  const rows = list || []
  return {
    total: rows.length,
    needAttention: rows.filter(p => p.crit || p.low).length,
    wellStocked: rows.filter(p => p.good).length,
    unknown: rows.filter(p => p.unknown).length,
    empty: rows.filter(p => p.empty).length,
  }
}

export function lowStockFromList(list = []) {
  return (list || [])
    .filter(p => p.hasCount && p.minimo > 0 && p.stock <= p.minimo)
    .sort((a, b) => a.stock - b.stock)
    .map(p => ({ id: p.id, nome: p.nome, qtd: p.stock, minimo: p.minimo }))
}
