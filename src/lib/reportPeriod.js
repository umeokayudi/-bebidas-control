/** Verifica se um período (início/fim) sobrepõe o mês selecionado (YYYY-MM) */
export function monthOverlapsPeriod(selMonth, inicio, fim) {
  if (!selMonth) return false
  const [y, m] = selMonth.split('-').map(Number)
  const monthStart = `${selMonth}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const monthEnd = `${selMonth}-${String(lastDay).padStart(2, '0')}`
  const start = inicio || fim || monthStart
  const end = fim || inicio || monthEnd
  return start <= monthEnd && end >= monthStart
}

export function ryoshushoForMonth(ryoshusho, selMonth) {
  return (ryoshusho || []).filter(r =>
    monthOverlapsPeriod(selMonth, r.periodo_inicio, r.periodo_fim)
    || (!r.periodo_inicio && !r.periodo_fim && r.data_emissao?.startsWith(selMonth))
  )
}

/** Receita coberta por um ryoshusho no mês (proporcional se período > 1 mês) */
export function ryoshushoMonthShare(r, selMonth) {
  const total = +r.total || 0
  if (!total) return 0
  const ini = r.periodo_inicio || r.data_emissao
  const fim = r.periodo_fim || r.data_emissao || ini
  if (!ini) return total

  const [y, m] = selMonth.split('-').map(Number)
  const monthStart = new Date(y, m - 1, 1)
  const monthEnd = new Date(y, m, 0)
  const periodStart = new Date(ini + 'T12:00:00')
  const periodEnd = new Date(fim + 'T12:00:00')
  const overlapStart = new Date(Math.max(monthStart, periodStart))
  const overlapEnd = new Date(Math.min(monthEnd, periodEnd))
  if (overlapEnd < overlapStart) return 0

  const periodDays = Math.max(1, Math.round((periodEnd - periodStart) / 86400000) + 1)
  const overlapDays = Math.max(1, Math.round((overlapEnd - overlapStart) / 86400000) + 1)
  return Math.round(total * overlapDays / periodDays)
}
