export function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim()
}

/** Nome na compra → nome canônico no catálogo */
export const COMPRA_TO_PRODUTO = {
  'jasmine tea (caixa 6)': 'Jasmine Tea (caixa 6)',
  'orange juice': 'Orange Juice',
}

export function matchProduct(nome, produtos) {
  if (!nome) return null
  const canonical = COMPRA_TO_PRODUTO[norm(nome)] || nome.trim()
  const n = norm(canonical)
  const exact = produtos.find(p => norm(p.nome) === n)
  if (exact) return exact
  const partial = produtos.find(p => norm(p.nome).includes(n) || n.includes(norm(p.nome)))
  if (partial) return partial
  const first = n.split(/\s+/)[0]
  return produtos.find(p => norm(p.nome).includes(first)) || null
}

export function saleMarkup(custo, pct = 0.2) {
  return Math.round(+custo * (1 + pct))
}
