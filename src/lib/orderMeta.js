/** CAST / notes on JBM pedidos.obs — never touches vendas columns. */

const CAST_RE = /^Cast:\s*(.+)$/im

export function orderCastFromObs(obs) {
  const m = String(obs || '').match(CAST_RE)
  return m ? m[1].trim() : ''
}

export function orderDetailsFromObs(obs) {
  return String(obs || '').replace(CAST_RE, '').replace(/^\s+|\s+$/g, '')
}

export function withOrderCast(details, cast) {
  const body = String(details || '').replace(CAST_RE, '').trim()
  const c = String(cast || '').trim()
  if (c && body) return `Cast: ${c}\n${body}`
  if (c) return `Cast: ${c}`
  return body
}

export function orderMeta(obs) {
  return {
    cast: orderCastFromObs(obs),
    details: orderDetailsFromObs(obs),
  }
}
