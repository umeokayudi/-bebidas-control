/** Supplier vs POS — single source of truth for APIs and scripts.
 *  JBM beverage supply = vendas with origem fornecedor / auto pedido.
 *  Bar POS must never appear here (origem pos, Square, balcão, cast).
 */
export function isSupplierVenda(v) {
  if (!v) return false
  const origem = String(v.origem || '').toLowerCase()
  if (origem === 'pos' || origem === 'balcao' || origem === 'balcão' || origem === 'square') return false
  const obs = (v.obs || '').toLowerCase()
  if (obs.includes('balcão') || obs.includes('balcao') || obs.includes('square') || obs.includes('pos')) return false
  if (v.cast_id) return false
  if (v.pos_venda_id) return false
  return true
}

export function filterSupplierVendas(list) {
  return (list || []).filter(isSupplierVenda)
}
