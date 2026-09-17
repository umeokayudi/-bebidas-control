import { describe, expect, it } from 'vitest'
import {
  buildHourlyBuckets,
  dayTotals,
  hourRangeLabel,
  hourlyChartData,
  hourlyTrend,
  idleHours,
  operatingHours,
  peakHours,
  saleHour,
  suggestIdlePromotions,
} from '../src/lib/posHourly'

function venda(hora, total, extra = {}) {
  return { id: `v-${hora}-${total}`, hora, total, ...extra }
}

describe('operatingHours', () => {
  it('crosses midnight for a night bar', () => {
    expect(operatingHours(18, 5)).toEqual([18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4])
  })

  it('returns the full day when open equals close', () => {
    expect(operatingHours(18, 18)).toHaveLength(24)
  })

  it('normalizes out-of-range hours', () => {
    expect(operatingHours(26, 29)).toEqual([2, 3, 4])
  })
})

describe('saleHour', () => {
  it('prefers the stored hour column', () => {
    expect(saleHour({ hora: 21, criado_em: '2026-02-01T03:00:00Z' })).toBe(21)
  })

  it('falls back to the local hour of criado_em', () => {
    const iso = new Date(2026, 1, 1, 23, 30).toISOString()
    expect(saleHour({ criado_em: iso })).toBe(23)
  })

  it('returns null without any timestamp', () => {
    expect(saleHour({})).toBe(null)
  })
})

describe('buildHourlyBuckets', () => {
  const vendas = [
    venda(19, 3000),
    venda(19, 5000),
    venda(22, 12000, { desconto_total: 1000 }),
    venda(1, 8000),
  ]

  it('aggregates revenue, count and average ticket per hour', () => {
    const buckets = buildHourlyBuckets(vendas, { openHour: 18, closeHour: 5 })
    const h19 = buckets.find(b => b.hora === 19)
    expect(h19.faturamento).toBe(8000)
    expect(h19.vendas).toBe(2)
    expect(h19.ticketMedio).toBe(4000)
  })

  it('keeps the operating order so 01:00 comes after 23:00', () => {
    const buckets = buildHourlyBuckets(vendas, { openHour: 18, closeHour: 5 })
    const horas = buckets.map(b => b.hora)
    expect(horas.indexOf(1)).toBeGreaterThan(horas.indexOf(23))
  })

  it('includes empty hours so the chart has no gaps', () => {
    const buckets = buildHourlyBuckets(vendas, { openHour: 18, closeHour: 5 })
    expect(buckets).toHaveLength(11)
    expect(buckets.find(b => b.hora === 20).faturamento).toBe(0)
  })

  it('still reports sales outside the declared operating window', () => {
    const buckets = buildHourlyBuckets([venda(12, 4000)], { openHour: 18, closeHour: 5 })
    expect(buckets.find(b => b.hora === 12).faturamento).toBe(4000)
  })

  it('counts items when the sale carries its lines', () => {
    const buckets = buildHourlyBuckets(
      [venda(20, 2000, { pos_vendas_itens: [{ qtd: 2 }, { qtd: 3 }] })],
      { openHour: 18, closeHour: 5 }
    )
    expect(buckets.find(b => b.hora === 20).itens).toBe(5)
  })

  it('ignores negative totals instead of shrinking revenue', () => {
    const buckets = buildHourlyBuckets([venda(20, -500)], { openHour: 18, closeHour: 5 })
    expect(buckets.find(b => b.hora === 20).faturamento).toBe(0)
  })
})

describe('dayTotals', () => {
  it('sums revenue, discount and average ticket', () => {
    const totals = dayTotals([venda(19, 3000, { desconto_total: 500 }), venda(20, 6000)])
    expect(totals).toMatchObject({ faturamento: 9000, desconto: 500, vendas: 2, ticketMedio: 4500 })
  })

  it('handles an empty night', () => {
    expect(dayTotals([])).toMatchObject({ faturamento: 0, vendas: 0, ticketMedio: 0 })
  })
})

describe('peakHours / idleHours', () => {
  const buckets = buildHourlyBuckets(
    [venda(19, 2000), venda(21, 30000), venda(22, 25000), venda(2, 1000)],
    { openHour: 18, closeHour: 5 }
  )

  it('ranks the busiest hours first', () => {
    expect(peakHours(buckets, 2).map(b => b.hora)).toEqual([21, 22])
  })

  it('marks hours below 40% of the active average as idle', () => {
    const idle = idleHours(buckets, { limit: 12 })
    expect(idle.map(b => b.hora)).toContain(2)
    expect(idle.map(b => b.hora)).toContain(19)
    expect(idle.map(b => b.hora)).not.toContain(21)
    expect(idle.every(b => b.faturamento < b.limite)).toBe(true)
  })

  it('ranks the emptiest hours first, so a dead hour outranks a slow one', () => {
    const idle = idleHours(buckets, { limit: 3 })
    expect(idle.every(b => b.faturamento === 0)).toBe(true)
  })

  it('uses the explicit target when the bar sets one', () => {
    const idle = idleHours(buckets, { limit: 12, metaHora: 3000 })
    expect(idle.find(b => b.hora === 19).deficit).toBe(1000)
  })
})

describe('suggestIdlePromotions', () => {
  const buckets = buildHourlyBuckets(
    [venda(19, 9000), venda(21, 30000), venda(2, 0)],
    { openHour: 18, closeHour: 5 }
  )

  it('suggests a discount for a nearly empty hour and an event for a half-full one', () => {
    const suggestions = suggestIdlePromotions(buckets, { limit: 12, metaHora: 10000 })
    const empty = suggestions.find(s => s.hora === 20)
    const half = suggestions.find(s => s.hora === 19)
    expect(empty.acao).toBe('happy_hour')
    expect(half.acao).toBe('evento')
  })

  it('reports how much each idle hour is missing', () => {
    const suggestions = suggestIdlePromotions(buckets, { limit: 12, metaHora: 10000 })
    expect(suggestions.find(s => s.hora === 19).deficit).toBe(1000)
  })
})

describe('hourlyChartData / hourlyTrend', () => {
  it('formats hours as zero-padded labels', () => {
    const data = hourlyChartData(buildHourlyBuckets([venda(2, 1000)], { openHour: 2, closeHour: 3 }))
    expect(data[0]).toMatchObject({ label: '02', value: 1000 })
  })

  it('compares today against the historical average per hour', () => {
    const today = buildHourlyBuckets([venda(21, 10000)], { openHour: 21, closeHour: 22 })
    const history = buildHourlyBuckets([venda(21, 40000)], { openHour: 21, closeHour: 22 })
    const trend = hourlyTrend(today, history, 4)
    expect(trend[0]).toMatchObject({ media: 10000, delta: 0, deltaPct: 0 })
  })
})

describe('hourRangeLabel', () => {
  it('wraps around midnight', () => {
    expect(hourRangeLabel(23)).toBe('23:00–00:00')
  })
})
