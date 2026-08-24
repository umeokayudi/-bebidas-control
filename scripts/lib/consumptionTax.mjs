export const CONSUMPTION_TAX_RATE = 0.1

export function toZeikomi(zeibetsu) {
  return Math.round(+zeibetsu * (1 + CONSUMPTION_TAX_RATE))
}

export function fromZeikomi(zeikomi) {
  return Math.round(+zeikomi / (1 + CONSUMPTION_TAX_RATE))
}

export function priceChangePct(oldPrice, newPrice) {
  const old = +oldPrice || 0
  const newP = +newPrice || 0
  if (!old || !newP) return null
  return Math.round(((newP - old) / old) * 100)
}

export function buildSupplierPriceNotas({ zeibetsu, firstZeibetsu, lastZeibetsu }) {
  const parts = [`税抜 ¥${Math.round(zeibetsu).toLocaleString('ja-JP')}`]
  if (firstZeibetsu != null && lastZeibetsu != null && firstZeibetsu !== lastZeibetsu) {
    const pct = priceChangePct(firstZeibetsu, lastZeibetsu)
    parts.push(`jul ¥${Math.round(firstZeibetsu).toLocaleString('ja-JP')}→¥${Math.round(lastZeibetsu).toLocaleString('ja-JP')} (${pct > 0 ? '+' : ''}${pct}%)`)
  }
  return parts.join(' | ')
}
