export function fmtYen(n) {
  return '¥' + Number(n || 0).toLocaleString('ja-JP')
}

export function fmtPct(n, d) {
  if (!d) return '—'
  return Math.round((n / d) * 100) + '%'
}
