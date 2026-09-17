import { describe, expect, it } from 'vitest'
import {
  aggregateAgents,
  commissionForSale,
  drinkBackSummary,
  goalStatus,
  regionalBreakdown,
  resolveComissaoPct,
} from '../src/lib/drinkBack'

const AGENTS = [
  { id: 'a1', nome: 'Yuki', regiao: 'Kanto', cidade: 'Tokyo', comissao_pct: 25, meta_mensal: 200000 },
  { id: 'a2', nome: 'Mari', regiao: 'Kansai', comissao_pct: 20, meta_mensal: 100000 },
  { id: 'a3', nome: 'Ana', regiao: 'Kanto', comissao_pct: 20, meta_mensal: 0, ativo: false },
]

const COMISSOES = [
  { id: 'c1', agent_id: 'a1', data: '2026-03-02', base_valor: 100000, comissao_valor: 25000, pago: true },
  { id: 'c2', agent_id: 'a1', data: '2026-03-08', base_valor: 120000, comissao_valor: 30000, pago: false },
  { id: 'c3', agent_id: 'a2', data: '2026-03-05', base_valor: 40000, comissao_valor: 8000, pago: false },
  { id: 'c4', agent_id: 'a1', data: '2026-02-20', base_valor: 500000, comissao_valor: 125000, pago: true },
]

describe('resolveComissaoPct', () => {
  it('prefers the promoter rate over the bar default', () => {
    expect(resolveComissaoPct({ comissao_pct: 30 }, { drink_back_comissao_pct: 20 })).toBe(30)
  })

  it('falls back to the bar default', () => {
    expect(resolveComissaoPct({ comissao_pct: null }, { drink_back_comissao_pct: 15 })).toBe(15)
  })

  it('falls back to 20% when nothing is configured', () => {
    expect(resolveComissaoPct(null, {})).toBe(20)
  })

  it('honors an explicit zero rate', () => {
    expect(resolveComissaoPct({ comissao_pct: 0 }, { drink_back_comissao_pct: 20 })).toBe(0)
  })
})

describe('commissionForSale', () => {
  it('pays on the charged total, not on the list price', () => {
    const c = commissionForSale({ id: 'v1', total: 9000, subtotal: 12000, data: '2026-03-10' }, AGENTS[0])
    expect(c).toMatchObject({ base_valor: 9000, comissao_pct: 25, comissao_valor: 2250 })
  })

  it('never pays on a negative total', () => {
    const c = commissionForSale({ total: -100 }, AGENTS[0])
    expect(c.comissao_valor).toBe(0)
  })

  it('links the commission back to the sale and the promoter', () => {
    const c = commissionForSale({ id: 'v9', total: 1000, data: '2026-03-10' }, AGENTS[1])
    expect(c).toMatchObject({ pos_venda_id: 'v9', agent_id: 'a2' })
  })
})

describe('aggregateAgents', () => {
  const totals = aggregateAgents(AGENTS, COMISSOES, { mes: '2026-03' })

  it('keeps only the requested month', () => {
    expect(totals.find(a => a.id === 'a1').base).toBe(220000)
  })

  it('ranks promoters by revenue brought in', () => {
    expect(totals.map(a => a.id)).toEqual(['a1', 'a2', 'a3'])
  })

  it('tracks unpaid commissions separately', () => {
    expect(totals.find(a => a.id === 'a1').pendente).toBe(30000)
    expect(totals.find(a => a.id === 'a2').pendente).toBe(8000)
  })

  it('computes goal progress and average ticket', () => {
    const yuki = totals.find(a => a.id === 'a1')
    expect(yuki.metaPct).toBe(110)
    expect(yuki.ticketMedio).toBe(110000)
  })

  it('lists promoters with no sales at zero instead of dropping them', () => {
    expect(totals.find(a => a.id === 'a3')).toMatchObject({ base: 0, vendas: 0, metaPct: 0 })
  })

  it('ignores commissions from unknown promoters', () => {
    const out = aggregateAgents(AGENTS, [{ agent_id: 'ghost', data: '2026-03-01', base_valor: 999, comissao_valor: 99 }], { mes: '2026-03' })
    expect(out.reduce((a, r) => a + r.base, 0)).toBe(0)
  })
})

describe('regionalBreakdown', () => {
  it('groups promoters by region', () => {
    const regions = regionalBreakdown(aggregateAgents(AGENTS, COMISSOES, { mes: '2026-03' }))
    expect(regions.find(r => r.regiao === 'Kanto')).toMatchObject({ agentes: 2, base: 220000 })
    expect(regions.find(r => r.regiao === 'Kansai')).toMatchObject({ agentes: 1, base: 40000 })
  })

  it('buckets promoters without a region', () => {
    const regions = regionalBreakdown([{ regiao: null, agentes: 1, base: 10, comissao: 1, vendas: 1 }])
    expect(regions[0].regiao).toBe('Sem região')
  })
})

describe('drinkBackSummary', () => {
  const summary = drinkBackSummary(aggregateAgents(AGENTS, COMISSOES, { mes: '2026-03' }))

  it('counts only active promoters', () => {
    expect(summary.agentesAtivos).toBe(2)
  })

  it('reports the commission cost as a share of revenue', () => {
    expect(summary.base).toBe(260000)
    expect(summary.comissao).toBe(63000)
    expect(summary.custoPct).toBe(24)
  })

  it('names the top promoter', () => {
    expect(summary.topAgente.nome).toBe('Yuki')
  })

  it('handles a month with no drink back at all', () => {
    expect(drinkBackSummary([])).toMatchObject({ base: 0, comissao: 0, custoPct: 0, topAgente: null })
  })
})

describe('goalStatus', () => {
  it('classifies goal progress', () => {
    expect(goalStatus({ meta_mensal: 100, metaPct: 120 })).toBe('batida')
    expect(goalStatus({ meta_mensal: 100, metaPct: 80 })).toBe('perto')
    expect(goalStatus({ meta_mensal: 100, metaPct: 20 })).toBe('atrasada')
    expect(goalStatus({ meta_mensal: 0, metaPct: 0 })).toBe('sem_meta')
  })
})
