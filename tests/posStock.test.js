import { describe, expect, it } from 'vitest'
import {
  bottlesPerDose,
  buildInventoryRows,
  buildReorderPayload,
  buildStockMap,
  cartConsumption,
  detectReorderNeeds,
  filterReorderCooldown,
  inventorySummary,
  itemConsumption,
  stockStatus,
  suggestReorderQty,
} from '../src/lib/posStock'

const PRICING = {
  'p-vodka': { produto_id: 'p-vodka', drinks_por_garrafa: 16, preco_drink: 900 },
  'p-tonic': { produto_id: 'p-tonic', drinks_por_garrafa: 4, preco_drink: 400 },
  'p-sem-preco': { produto_id: 'p-sem-preco', drinks_por_garrafa: 0 },
}

const RECIPES = {
  'd-moscow': [
    { produto_id: 'p-vodka', doses: 1 },
    { produto_id: 'p-tonic', doses: 0.5 },
  ],
}

describe('buildStockMap', () => {
  it('nets entries against exits', () => {
    const map = buildStockMap([
      { produto_id: 'a', tipo: 'entrada', qtd: 12 },
      { produto_id: 'a', tipo: 'saida', qtd: 3 },
      { produto_id: 'b', tipo: 'entrada', qtd: 5 },
    ])
    expect(map).toEqual({ a: 9, b: 5 })
  })

  it('ignores rows without a product', () => {
    expect(buildStockMap([{ tipo: 'entrada', qtd: 4 }])).toEqual({})
  })
})

describe('bottlesPerDose', () => {
  it('converts drinks per bottle into a bottle fraction', () => {
    expect(bottlesPerDose({ drinks_por_garrafa: 16 })).toBeCloseTo(0.0625)
  })

  it('returns zero when the bar never set the shot price', () => {
    expect(bottlesPerDose({ drinks_por_garrafa: 0 })).toBe(0)
    expect(bottlesPerDose(undefined)).toBe(0)
  })
})

describe('itemConsumption', () => {
  const context = { pricingByProduto: PRICING, recipesByDrink: RECIPES }

  it('consumes a bottle fraction per shot sold', () => {
    const rows = itemConsumption({ produto_id: 'p-vodka', qtd: 2 }, context)
    expect(rows).toEqual([{ produto_id: 'p-vodka', garrafas: 0.125 }])
  })

  it('expands a menu drink through its recipe', () => {
    const rows = itemConsumption({ drink_menu_id: 'd-moscow', qtd: 1 }, context)
    expect(rows).toEqual([
      { produto_id: 'p-vodka', garrafas: 0.0625 },
      { produto_id: 'p-tonic', garrafas: 0.125 },
    ])
  })

  it('consumes nothing when the drink has no recipe', () => {
    expect(itemConsumption({ drink_menu_id: 'd-sem-receita', qtd: 3 }, context)).toEqual([])
  })

  it('consumes nothing when the product has no shot price', () => {
    expect(itemConsumption({ produto_id: 'p-sem-preco', qtd: 3 }, context)).toEqual([])
  })

  it('consumes nothing for a zero quantity line', () => {
    expect(itemConsumption({ produto_id: 'p-vodka', qtd: 0 }, context)).toEqual([])
  })
})

describe('cartConsumption', () => {
  it('merges the same product coming from different lines', () => {
    const rows = cartConsumption(
      [
        { produto_id: 'p-vodka', qtd: 1 },
        { drink_menu_id: 'd-moscow', qtd: 2 },
      ],
      { pricingByProduto: PRICING, recipesByDrink: RECIPES }
    )
    const vodka = rows.find(r => r.produto_id === 'p-vodka')
    expect(vodka.qtd).toBeCloseTo(0.188, 3)
    expect(rows.find(r => r.produto_id === 'p-tonic').qtd).toBeCloseTo(0.25)
  })

  it('returns an empty list when nothing can be converted', () => {
    expect(cartConsumption([{ drink_menu_id: 'x', qtd: 1 }], {})).toEqual([])
  })
})

describe('stockStatus', () => {
  it('classifies against the reorder point', () => {
    expect(stockStatus(0, 3)).toBe('critical')
    expect(stockStatus(2, 3)).toBe('low')
    expect(stockStatus(3, 3)).toBe('ok')
  })

  it('stays silent when the bar set no minimum', () => {
    expect(stockStatus(0, 0)).toBe('unset')
  })
})

describe('suggestReorderQty', () => {
  it('refills up to minimum times the multiplier', () => {
    expect(suggestReorderQty(1, 4, 2)).toBe(7)
  })

  it('always orders at least one bottle', () => {
    expect(suggestReorderQty(10, 4, 2)).toBe(1)
  })

  it('orders nothing for a product without a rule', () => {
    expect(suggestReorderQty(0, 0, 2)).toBe(0)
  })

  it('rounds fractional stock up to a whole bottle', () => {
    expect(suggestReorderQty(0.5, 2, 1)).toBe(2)
  })
})

describe('detectReorderNeeds', () => {
  const produtos = [
    { id: 'a', nome: 'Vodka', stock: 0, minimo: 3, preco_venda: 2000 },
    { id: 'b', nome: 'Tonic', stock: 2, minimo: 4, preco_venda: 300 },
    { id: 'c', nome: 'Gin', stock: 9, minimo: 2, preco_venda: 2500 },
    { id: 'd', nome: 'Water', stock: 0, minimo: 0, preco_venda: 100 },
  ]

  it('returns only products at or below the reorder point', () => {
    const needs = detectReorderNeeds(produtos, { multiplicador: 2 })
    expect(needs.map(n => n.produto_id)).toEqual(['a', 'b'])
  })

  it('puts out-of-stock products first', () => {
    const needs = detectReorderNeeds(produtos, { multiplicador: 2 })
    expect(needs[0].status).toBe('critical')
  })

  it('can restrict the trigger to fully empty products', () => {
    const needs = detectReorderNeeds(produtos, { multiplicador: 2, incluirBaixo: false })
    expect(needs.map(n => n.produto_id)).toEqual(['a'])
  })

  it('suggests a quantity that clears the minimum', () => {
    const vodka = detectReorderNeeds(produtos, { multiplicador: 2 })[0]
    expect(vodka.qtd_sugerida).toBe(6)
  })
})

describe('filterReorderCooldown', () => {
  const needs = [{ produto_id: 'a' }, { produto_id: 'b' }]
  const agora = new Date('2026-03-10T12:00:00Z').getTime()

  it('blocks a product ordered inside the window', () => {
    const requests = [{ produto_id: 'a', status: 'enviado', criado_em: '2026-03-10T06:00:00Z' }]
    const out = filterReorderCooldown(needs, requests, { cooldownHoras: 24, agora })
    expect(out.map(n => n.produto_id)).toEqual(['b'])
  })

  it('releases a product once the window expires', () => {
    const requests = [{ produto_id: 'a', status: 'enviado', criado_em: '2026-03-08T06:00:00Z' }]
    const out = filterReorderCooldown(needs, requests, { cooldownHoras: 24, agora })
    expect(out.map(n => n.produto_id)).toEqual(['a', 'b'])
  })

  it('retries immediately when the previous attempt failed', () => {
    const requests = [{ produto_id: 'a', status: 'falhou', criado_em: '2026-03-10T11:00:00Z' }]
    const out = filterReorderCooldown(needs, requests, { cooldownHoras: 24, agora })
    expect(out.map(n => n.produto_id)).toEqual(['a', 'b'])
  })

  it('blocks forever while cooldown is zero and an order exists', () => {
    const requests = [{ produto_id: 'a', status: 'pedido_criado', criado_em: '2020-01-01T00:00:00Z' }]
    const out = filterReorderCooldown(needs, requests, { cooldownHoras: 0, agora })
    expect(out.map(n => n.produto_id)).toEqual(['b'])
  })
})

describe('buildReorderPayload', () => {
  const payload = buildReorderPayload({
    bar: { id: 'bar-1', nome: 'Atomic', endereco: 'Tokyo' },
    itens: [{ produto_id: 'a', sku: 'SKU-A', produto_nome: 'Vodka', estoque_atual: 0, minimo: 3, qtd_sugerida: 6, preco_unitario: 2000 }],
    config: { reorder_cooldown_horas: 24, reorder_multiplicador: 2, criar_pedido_jbm: true },
    geradoEm: new Date('2026-03-10T12:00:00Z'),
  })

  it('carries the bar identity so the central operation knows where to deliver', () => {
    expect(payload.bar).toMatchObject({ id: 'bar-1', nome: 'Atomic' })
  })

  it('names the event and totals the order', () => {
    expect(payload.evento).toBe('pos.reposicao_automatica')
    expect(payload.total_itens).toBe(1)
    expect(payload.total_estimado).toBe(12000)
  })

  it('includes the sku so the supplier can match the product', () => {
    expect(payload.itens[0]).toMatchObject({ sku: 'SKU-A', qtd_sugerida: 6 })
  })
})

describe('buildInventoryRows / inventorySummary', () => {
  const produtos = [
    { id: 'a', nome: 'Vodka', categoria: 'Vodka' },
    { id: 'b', nome: 'Tonic', categoria: 'Soda' },
    { id: 'c', nome: 'Gin', categoria: 'Gin' },
  ]
  const movimentos = [
    { produto_id: 'a', tipo: 'entrada', qtd: 6 },
    { produto_id: 'a', tipo: 'saida', qtd: 6 },
    { produto_id: 'b', tipo: 'entrada', qtd: 2 },
  ]
  const regras = [{ produto_id: 'a', minimo: 3 }, { produto_id: 'b', minimo: 4 }]

  it('joins stock and rules into one row per product', () => {
    const rows = buildInventoryRows(produtos, movimentos, regras)
    expect(rows.find(r => r.id === 'a')).toMatchObject({ stock: 0, minimo: 3, status: 'critical' })
    expect(rows.find(r => r.id === 'b')).toMatchObject({ stock: 2, minimo: 4, status: 'low' })
    expect(rows.find(r => r.id === 'c')).toMatchObject({ stock: 0, minimo: 0, status: 'unset' })
  })

  it('never shows negative stock', () => {
    const rows = buildInventoryRows(produtos, [{ produto_id: 'a', tipo: 'saida', qtd: 5 }], regras)
    expect(rows.find(r => r.id === 'a').stock).toBe(0)
  })

  it('summarizes the shelf by status', () => {
    const summary = inventorySummary(buildInventoryRows(produtos, movimentos, regras))
    expect(summary).toMatchObject({ total: 3, critical: 1, low: 1, ok: 0, semRegra: 1 })
  })
})
