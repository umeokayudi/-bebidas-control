export function faturaAmount(f) {
  return +f.total || +f.valor || 0
}

export function faturaBalance(f) {
  return Math.max(0, faturaAmount(f) - (+f.pago || 0))
}

export function faturaCoversMonth(f, selMonth) {
  if (!selMonth || !f) return false
  const start = (f.periodo_inicio || f.data_emissao || '').slice(0, 7)
  const end = (f.periodo_fim || f.data_vencimento || start).slice(0, 7)
  if (start === selMonth || end === selMonth) return true
  if (start && end && start <= selMonth && end >= selMonth) return true
  const obs = (f.obs || '').toLowerCase()
  if (obs.includes(selMonth) || obs.includes(selMonth.replace('-', '/'))) return true
  return false
}

export function aReceberForMonth(faturas, selMonth) {
  return (faturas || [])
    .filter(f => f.status !== 'pago' && faturaCoversMonth(f, selMonth))
    .reduce((a, f) => a + faturaBalance(f), 0)
}

/** Total faturado no mês (faturas do período, pagas ou em aberto). */
export function faturamentoForMonth(faturas, selMonth) {
  return (faturas || [])
    .filter(f => faturaCoversMonth(f, selMonth))
    .reduce((a, f) => a + faturaAmount(f), 0)
}
