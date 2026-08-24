/** Rótulo de status para pagamentos de fatura (confirmado vs em análise). */
export function pagamentoStatus(p) {
  if (p?.confirmado) return { label: 'Confirmado', tone: 'green' }
  if (/cart/i.test(p?.metodo || '')) return { label: 'Em análise', tone: 'amber' }
  return { label: 'Aguardando confirmação', tone: 'amber' }
}

export function pagamentosPendentes(pagamentos, faturaId) {
  return (pagamentos || []).filter(p => p.fatura_id === faturaId && !p.confirmado)
}

export function totalPagamentosPendentes(pagamentos, faturaId) {
  return pagamentosPendentes(pagamentos, faturaId).reduce((a, p) => a + (+p.valor || 0), 0)
}
