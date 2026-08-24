/** Helpers do portal do bar — faturas JBM Drinks (exclui KuriPuro/limpeza). */

export function faturaText(f) {
  return [f?.obs, f?.notes, f?.descricao, f?.client_name, f?.tipo]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/** Fatura de limpeza / KuriPuro — não deve aparecer no portal de bebidas. */
export function isKuriPuroFatura(f) {
  const text = faturaText(f)
  if (!text) return false
  if (/kuripuro|kuri\s*puro/.test(text)) return true
  if (/limpeza|cleaning|deep\s*clean/.test(text) && !/fornecimento/.test(text)) return true
  return false
}

export function filterJbmDrinksFaturas(faturas) {
  return (faturas || []).filter(f => !isKuriPuroFatura(f))
}

export function faturaValor(f) {
  return +f?.valor || +f?.total || 0
}

export function faturaPago(f) {
  return +f?.pago || 0
}

export function faturaVencimento(f) {
  return f?.data_vencimento || f?.vencimento || f?.due_date || ''
}

export function faturaEmissao(f) {
  return f?.data_emissao || f?.issue_date || f?.periodo_inicio || ''
}

export function faturaPeriodoFim(f) {
  return f?.periodo_fim || faturaVencimento(f)
}

export function faturaRemaining(f) {
  return Math.max(0, faturaValor(f) - faturaPago(f))
}

export function faturaStatusLabel(status) {
  if (status === 'pago') return 'Pago'
  if (status === 'pendente') return 'Pendente'
  return status || 'Pendente'
}
