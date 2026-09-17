import { describe, expect, it } from 'vitest'
import {
  coverageAlerts,
  monthlyPayroll,
  payrollSummary,
  shiftCoverage,
  shiftHours,
  staffFixedCost,
  turnoDiasNoMes,
  turnoHorasNoMes,
} from '../src/lib/barStaff'
import { buildHourlyBuckets, operatingHours } from '../src/lib/posHourly'

const STAFF = [
  { id: 's1', nome: 'Kenji', cargo: 'Bartender', tipo_pagamento: 'mensal', salario_base: 250000, comissao_pct: 2 },
  { id: 's2', nome: 'Lia', cargo: 'Garçom', tipo_pagamento: 'diaria', salario_base: 12000, comissao_pct: 0 },
  { id: 's3', nome: 'Rui', cargo: 'Segurança', tipo_pagamento: 'hora', salario_base: 1500, comissao_pct: 0 },
]

const TURNOS = [
  { id: 't1', staff_id: 's1', data: '2026-03-01', hora_inicio: 18, hora_fim: 2 },
  { id: 't2', staff_id: 's1', data: '2026-03-02', hora_inicio: 18, hora_fim: 2 },
  { id: 't3', staff_id: 's2', data: '2026-03-01', hora_inicio: 19, hora_fim: 1 },
  { id: 't4', staff_id: 's3', data: '2026-03-01', hora_inicio: 22, hora_fim: 2 },
  { id: 't5', staff_id: 's2', data: '2026-03-03', hora_inicio: 19, hora_fim: 1, status: 'falta' },
  { id: 't6', staff_id: 's1', data: '2026-02-20', hora_inicio: 18, hora_fim: 2 },
]

const VENDAS = [
  { id: 'v1', staff_id: 's1', data: '2026-03-01', total: 100000 },
  { id: 'v2', staff_id: 's1', data: '2026-03-02', total: 50000 },
  { id: 'v3', staff_id: 's2', data: '2026-03-01', total: 30000 },
  { id: 'v4', staff_id: 's1', data: '2026-02-20', total: 900000 },
  { id: 'v5', data: '2026-03-01', total: 20000 },
]

describe('shiftHours', () => {
  it('measures a normal shift', () => {
    expect(shiftHours({ hora_inicio: 18, hora_fim: 23 })).toBe(5)
  })

  it('measures a shift that crosses midnight', () => {
    expect(shiftHours({ hora_inicio: 20, hora_fim: 2 })).toBe(6)
  })

  it('treats a same-hour shift as a full day', () => {
    expect(shiftHours({ hora_inicio: 18, hora_fim: 18 })).toBe(24)
  })
})

describe('turnoHorasNoMes / turnoDiasNoMes', () => {
  it('sums only the requested month', () => {
    expect(turnoHorasNoMes(TURNOS, 's1', '2026-03')).toBe(16)
    expect(turnoDiasNoMes(TURNOS, 's1', '2026-03')).toBe(2)
  })

  it('excludes no-shows from paid hours', () => {
    expect(turnoDiasNoMes(TURNOS, 's2', '2026-03')).toBe(1)
    expect(turnoHorasNoMes(TURNOS, 's2', '2026-03')).toBe(6)
  })
})

describe('staffFixedCost', () => {
  it('pays a monthly salary regardless of shifts', () => {
    expect(staffFixedCost(STAFF[0], { horas: 0, dias: 0 })).toBe(250000)
  })

  it('pays a daily rate per scheduled day', () => {
    expect(staffFixedCost(STAFF[1], { dias: 3 })).toBe(36000)
  })

  it('pays an hourly rate per scheduled hour', () => {
    expect(staffFixedCost(STAFF[2], { horas: 4 })).toBe(6000)
  })
})

describe('monthlyPayroll', () => {
  const rows = monthlyPayroll(STAFF, TURNOS, VENDAS, { mes: '2026-03' })

  it('adds commission on sales attributed at the counter', () => {
    const kenji = rows.find(r => r.id === 's1')
    expect(kenji.vendasAtribuidas).toBe(150000)
    expect(kenji.comissao).toBe(3000)
    expect(kenji.custoTotal).toBe(253000)
  })

  it('ignores sales from other months', () => {
    expect(rows.find(r => r.id === 's1').vendasCount).toBe(2)
  })

  it('ignores sales with no attendant', () => {
    const attributed = rows.reduce((a, r) => a + r.vendasAtribuidas, 0)
    expect(attributed).toBe(180000)
  })

  it('costs a daily worker by scheduled days', () => {
    expect(rows.find(r => r.id === 's2').custoTotal).toBe(12000)
  })

  it('reports cost per hour when there are shifts', () => {
    expect(rows.find(r => r.id === 's3').custoHora).toBe(1500)
  })

  it('sorts the most expensive people first', () => {
    expect(rows[0].id).toBe('s1')
  })
})

describe('payrollSummary', () => {
  const rows = monthlyPayroll(STAFF, TURNOS, VENDAS, { mes: '2026-03' })

  it('totals cost against POS revenue', () => {
    const summary = payrollSummary(rows, 1000000)
    expect(summary.custoTotal).toBe(271000)
    expect(summary.custoPct).toBe(27)
    expect(summary.resultado).toBe(729000)
  })

  it('does not divide by zero on a month without revenue', () => {
    expect(payrollSummary(rows, 0).custoPct).toBe(0)
  })
})

describe('shiftCoverage', () => {
  const hours = operatingHours(18, 5)
  const coverage = shiftCoverage(TURNOS, hours)

  it('counts people on shift in each operating hour', () => {
    expect(coverage.find(c => c.hora === 19).staff).toBe(4)
    expect(coverage.find(c => c.hora === 23).staff).toBe(5)
  })

  it('leaves hours after everybody clocks out empty', () => {
    expect(coverage.find(c => c.hora === 3).staff).toBe(0)
  })

  it('skips no-shows', () => {
    const only = shiftCoverage([{ staff_id: 's2', hora_inicio: 19, hora_fim: 1, status: 'falta' }], hours)
    expect(only.every(c => c.staff === 0)).toBe(true)
  })
})

describe('coverageAlerts', () => {
  const hours = operatingHours(18, 5)
  const buckets = buildHourlyBuckets(
    [
      { hora: 22, total: 120000 },
      { hora: 19, total: 5000 },
    ],
    { openHour: 18, closeHour: 5 }
  )

  it('flags a busy hour with too few people', () => {
    const coverage = shiftCoverage([{ staff_id: 's1', hora_inicio: 22, hora_fim: 23 }], hours)
    const alerts = coverageAlerts(coverage, buckets, { minStaffPico: 2 })
    expect(alerts).toEqual([{ hora: 22, tipo: 'falta_staff', staff: 1, faturamento: 120000 }])
  })

  it('flags an empty hour with too many people', () => {
    const coverage = shiftCoverage(
      [
        { staff_id: 'a', hora_inicio: 20, hora_fim: 21 },
        { staff_id: 'b', hora_inicio: 20, hora_fim: 21 },
        { staff_id: 'c', hora_inicio: 20, hora_fim: 21 },
      ],
      hours
    )
    const alerts = coverageAlerts(coverage, buckets, { minStaffPico: 2 })
    expect(alerts.find(a => a.hora === 20)).toMatchObject({ tipo: 'staff_ocioso', staff: 3 })
  })

  it('stays quiet when there is no revenue to compare against', () => {
    const coverage = shiftCoverage([{ staff_id: 'a', hora_inicio: 20, hora_fim: 21 }], hours)
    expect(coverageAlerts(coverage, [], { minStaffPico: 2 })).toEqual([])
  })
})
