import { describe, expect, it } from 'vitest'
import {
  buildRecurrence,
  daysUntil,
  isOpen,
  isOverdue,
  nextStatus,
  sortOrders,
  summarize,
} from '../src/lib/serviceOrders'

const HOJE = '2026-03-10'

const ORDERS = [
  { id: 'o1', bar_id: 'b1', tipo: 'limpeza', titulo: 'Limpeza pesada', status: 'agendado', prioridade: 'normal', agendado_para: '2026-03-05', custo_estimado: 40000 },
  { id: 'o2', bar_id: 'b1', tipo: 'manutencao', titulo: 'Ar condicionado', status: 'aberto', prioridade: 'urgente', agendado_para: '2026-03-12', custo_estimado: 60000 },
  { id: 'o3', bar_id: 'b1', tipo: 'limpeza', titulo: 'Vidros', status: 'concluido', prioridade: 'baixa', agendado_para: '2026-03-01', custo_estimado: 8000, custo_final: 9000 },
  { id: 'o4', bar_id: 'b1', tipo: 'outro', titulo: 'Dedetização', status: 'aberto', prioridade: 'alta', agendado_para: null, custo_estimado: 15000 },
]

describe('isOpen', () => {
  it('treats open, scheduled and in-progress as open', () => {
    expect(isOpen({ status: 'aberto' })).toBe(true)
    expect(isOpen({ status: 'agendado' })).toBe(true)
    expect(isOpen({ status: 'em_andamento' })).toBe(true)
  })

  it('treats done and cancelled as closed', () => {
    expect(isOpen({ status: 'concluido' })).toBe(false)
    expect(isOpen({ status: 'cancelado' })).toBe(false)
  })
})

describe('nextStatus', () => {
  it('walks the queue forward', () => {
    expect(nextStatus('aberto')).toBe('agendado')
    expect(nextStatus('agendado')).toBe('em_andamento')
    expect(nextStatus('em_andamento')).toBe('concluido')
  })

  it('stops at a terminal status', () => {
    expect(nextStatus('concluido')).toBe('concluido')
    expect(nextStatus('cancelado')).toBe('cancelado')
  })
})

describe('isOverdue / daysUntil', () => {
  it('flags an open call scheduled in the past', () => {
    expect(isOverdue(ORDERS[0], HOJE)).toBe(true)
  })

  it('does not flag a closed call', () => {
    expect(isOverdue(ORDERS[2], HOJE)).toBe(false)
  })

  it('does not flag a call without a date', () => {
    expect(isOverdue(ORDERS[3], HOJE)).toBe(false)
  })

  it('counts the days to the scheduled date', () => {
    expect(daysUntil(ORDERS[1], new Date(`${HOJE}T09:00:00Z`))).toBe(2)
    expect(daysUntil(ORDERS[0], new Date(`${HOJE}T09:00:00Z`))).toBe(-5)
  })
})

describe('sortOrders', () => {
  const sorted = sortOrders(ORDERS, HOJE)

  it('puts overdue open calls first', () => {
    expect(sorted[0].id).toBe('o1')
  })

  it('then sorts by priority', () => {
    expect(sorted[1].id).toBe('o2')
    expect(sorted[2].id).toBe('o4')
  })

  it('pushes closed calls to the end', () => {
    expect(sorted[sorted.length - 1].id).toBe('o3')
  })
})

describe('summarize', () => {
  const summary = summarize(ORDERS, HOJE)

  it('counts open and overdue calls', () => {
    expect(summary.abertos).toBe(3)
    expect(summary.atrasados).toBe(1)
    expect(summary.urgentes).toBe(1)
  })

  it('counts what is scheduled for the next week', () => {
    expect(summary.agendadosSemana).toBe(1)
  })

  it('separates estimated cost from what was already spent', () => {
    expect(summary.custoAberto).toBe(115000)
    expect(summary.custoConcluido).toBe(9000)
  })

  it('breaks the calls down by type', () => {
    expect(summary.porTipo).toEqual({ limpeza: 2, manutencao: 1, outro: 1 })
  })
})

describe('buildRecurrence', () => {
  it('schedules the next monthly cleaning after completion', () => {
    const next = buildRecurrence(
      { ...ORDERS[0], recorrencia: 'mensal', custo_final: 42000 },
      new Date('2026-03-10T00:00:00Z')
    )
    expect(next).toMatchObject({
      titulo: 'Limpeza pesada',
      status: 'agendado',
      agendado_para: '2026-04-09',
      custo_estimado: 42000,
    })
  })

  it('schedules a weekly service seven days out', () => {
    const next = buildRecurrence({ ...ORDERS[0], recorrencia: 'semanal' }, new Date('2026-03-10T00:00:00Z'))
    expect(next.agendado_para).toBe('2026-03-17')
  })

  it('returns nothing for a one-off service', () => {
    expect(buildRecurrence({ ...ORDERS[0], recorrencia: 'nenhuma' })).toBe(null)
  })
})
