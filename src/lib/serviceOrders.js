/**
 * Módulo 5 — Serviços integrados (limpeza pesada e manutenção).
 * Central de chamados do bar: agendamento, fila e histórico.
 */

export const SERVICE_TIPOS = ['limpeza', 'manutencao', 'outro']

export const SERVICE_STATUS = ['aberto', 'agendado', 'em_andamento', 'concluido', 'cancelado']

export const SERVICE_PRIORIDADES = ['baixa', 'normal', 'alta', 'urgente']

export const RECORRENCIAS = ['nenhuma', 'semanal', 'quinzenal', 'mensal']

const PRIORIDADE_PESO = { urgente: 0, alta: 1, normal: 2, baixa: 3 }

const RECORRENCIA_DIAS = { semanal: 7, quinzenal: 14, mensal: 30 }

export const STATUS_ABERTOS = ['aberto', 'agendado', 'em_andamento']

export function isOpen(order) {
  return STATUS_ABERTOS.includes(order?.status || 'aberto')
}

/** Próximo status do fluxo — usado pelo botão de avançar chamado. */
export function nextStatus(status) {
  const i = SERVICE_STATUS.indexOf(status || 'aberto')
  if (i < 0) return 'agendado'
  if (status === 'concluido' || status === 'cancelado') return status
  return SERVICE_STATUS[Math.min(i + 1, SERVICE_STATUS.indexOf('concluido'))]
}

export function isOverdue(order, hoje = new Date()) {
  if (!order?.agendado_para || !isOpen(order)) return false
  const ref = typeof hoje === 'string' ? hoje : hoje.toISOString().slice(0, 10)
  return String(order.agendado_para) < ref
}

export function daysUntil(order, hoje = new Date()) {
  if (!order?.agendado_para) return null
  const ref = typeof hoje === 'string' ? new Date(hoje) : hoje
  const alvo = new Date(`${String(order.agendado_para).slice(0, 10)}T00:00:00`)
  const base = new Date(`${ref.toISOString().slice(0, 10)}T00:00:00`)
  return Math.round((alvo - base) / 86400000)
}

/** Fila de atendimento: atrasado primeiro, depois prioridade e data. */
export function sortOrders(orders, hoje = new Date()) {
  return [...(orders || [])].sort((a, b) => {
    const aOpen = isOpen(a) ? 0 : 1
    const bOpen = isOpen(b) ? 0 : 1
    if (aOpen !== bOpen) return aOpen - bOpen

    const aLate = isOverdue(a, hoje) ? 0 : 1
    const bLate = isOverdue(b, hoje) ? 0 : 1
    if (aLate !== bLate) return aLate - bLate

    const pa = PRIORIDADE_PESO[a.prioridade] ?? 2
    const pb = PRIORIDADE_PESO[b.prioridade] ?? 2
    if (pa !== pb) return pa - pb

    return String(a.agendado_para || '9999').localeCompare(String(b.agendado_para || '9999'))
  })
}

export function summarize(orders, hoje = new Date()) {
  const list = orders || []
  const abertos = list.filter(isOpen)
  const concluidos = list.filter(o => o.status === 'concluido')
  return {
    total: list.length,
    abertos: abertos.length,
    atrasados: abertos.filter(o => isOverdue(o, hoje)).length,
    urgentes: abertos.filter(o => o.prioridade === 'urgente').length,
    agendadosSemana: abertos.filter(o => {
      const d = daysUntil(o, hoje)
      return d != null && d >= 0 && d <= 7
    }).length,
    custoAberto: abertos.reduce((a, o) => a + (+o.custo_estimado || 0), 0),
    custoConcluido: concluidos.reduce((a, o) => a + (+o.custo_final || +o.custo_estimado || 0), 0),
    porTipo: SERVICE_TIPOS.reduce((acc, tipo) => {
      acc[tipo] = list.filter(o => o.tipo === tipo).length
      return acc
    }, {}),
  }
}

/**
 * Serviço recorrente concluído gera o próximo agendamento — é o que
 * transforma "limpeza pesada" em manutenção preventiva de verdade.
 */
export function buildRecurrence(order, concluidoEm = new Date()) {
  const dias = RECORRENCIA_DIAS[order?.recorrencia]
  if (!dias) return null
  const base = typeof concluidoEm === 'string' ? new Date(concluidoEm) : concluidoEm
  const proximo = new Date(base.getTime() + dias * 86400000)
  return {
    bar_id: order.bar_id,
    tipo: order.tipo,
    titulo: order.titulo,
    descricao: order.descricao,
    prioridade: order.prioridade,
    status: 'agendado',
    agendado_para: proximo.toISOString().slice(0, 10),
    recorrencia: order.recorrencia,
    fornecedor_nome: order.fornecedor_nome,
    custo_estimado: +order.custo_final || +order.custo_estimado || 0,
  }
}
