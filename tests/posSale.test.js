/**
 * Caminho de escrita da venda do balcão.
 *
 * O teste central aqui é o de isolamento: uma venda do POS pode mexer em
 * `pos_vendas`, `estoque_movimentos` e afins, mas nunca em `vendas`,
 * `compras`, `faturas` ou `produtos` — que são o fornecimento da JBM.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeSupabase, JBM_SUPPLY_TABLES } from './helpers/fakeSupabase'

const fake = { client: null }

vi.mock('../src/lib/supabase', () => ({
  get supabase() {
    return fake.client
  },
}))

const { businessDay, registerPosSale, runReorderCheck } = await import('../src/lib/posData')

const BAR = { id: 'bar-1', nome: 'Atomic' }

const CATALOG = {
  agents: [{ id: 'agent-1', nome: 'Yuki', comissao_pct: 25 }],
  pricingByProduto: {
    'prod-vodka': { produto_id: 'prod-vodka', drinks_por_garrafa: 16 },
    'prod-tonic': { produto_id: 'prod-tonic', drinks_por_garrafa: 4 },
  },
  recipesByDrink: {
    'drink-1': [
      { produto_id: 'prod-vodka', doses: 1 },
      { produto_id: 'prod-tonic', doses: 0.5 },
    ],
  },
}

const CONFIG = {
  hora_abertura: 18,
  hora_fechamento: 5,
  auto_reorder_enabled: false,
  reorder_multiplicador: 2,
  reorder_cooldown_horas: 24,
  criar_pedido_jbm: true,
  drink_back_comissao_pct: 20,
}

const CART = [
  { key: 'd-1', drink_menu_id: 'drink-1', produto_id: null, nome: 'Moscow Mule', qtd: 2, preco_unitario: 1200, preco_lista: 1200, tipo_preco: 'regular', custo: 300 },
  { key: 'p-1', drink_menu_id: null, produto_id: 'prod-vodka', nome: 'Vodka shot', qtd: 1, preco_unitario: 450, preco_lista: 900, tipo_preco: 'vip', desconto_valor: 450, custo: 150 },
]

function setup(overrides = {}) {
  fake.client = createFakeSupabase({
    tables: {
      pos_vendas: [],
      pos_vendas_itens: [],
      estoque_movimentos: [],
      estoque_regras: [],
      produtos_public: [],
      pos_reorder_requests: [],
      drink_back_comissoes: [],
      discount_codes: [],
      discount_usages: [],
      vip_usages: [],
      bar_pos_config: [],
      ...overrides.tables,
    },
    failOn: overrides.failOn,
  })
  return fake.client
}

beforeEach(() => {
  setup()
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, webhook: { configurado: true, ok: true }, pedido: { id: 'ped-1', itens: 1, total: 12000 } }),
  })))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('businessDay', () => {
  it('keeps a 2am sale on the previous night for a bar that opens at 18h', () => {
    expect(businessDay(new Date(2026, 2, 11, 2, 30), 18)).toBe(businessDay(new Date(2026, 2, 10, 20, 0), 18))
  })

  it('does not shift the day for a daytime venue', () => {
    const morning = new Date(2026, 2, 11, 2, 30)
    expect(businessDay(morning, 9)).toBe(morning.toISOString().slice(0, 10))
  })
})

describe('registerPosSale', () => {
  it('writes the counter revenue into pos_vendas, never into vendas', async () => {
    const client = setup()
    await registerPosSale({ bar: BAR, cart: CART, catalog: CATALOG, config: CONFIG, userId: 'user-1' })

    expect(client.inserts('pos_vendas')).toHaveLength(1)
    JBM_SUPPLY_TABLES.forEach(table => {
      expect(client.writes(table)).toEqual([])
    })
  })

  it('computes subtotal, discount and total from the cart', async () => {
    const client = setup()
    const result = await registerPosSale({ bar: BAR, cart: CART, catalog: CATALOG, config: CONFIG })

    const venda = client.inserts('pos_vendas')[0]
    expect(venda.subtotal).toBe(3300)
    expect(venda.total).toBe(2850)
    expect(venda.desconto_total).toBe(450)
    expect(result.total).toBe(2850)
  })

  it('stores the hour so the hourly report works', async () => {
    const client = setup()
    const now = new Date(2026, 2, 10, 23, 15)
    await registerPosSale({ bar: BAR, cart: CART, catalog: CATALOG, config: CONFIG, now })
    expect(client.inserts('pos_vendas')[0].hora).toBe(23)
  })

  it('writes one line per cart item', async () => {
    const client = setup()
    await registerPosSale({ bar: BAR, cart: CART, catalog: CATALOG, config: CONFIG })
    const itens = client.inserts('pos_vendas_itens')
    expect(itens).toHaveLength(2)
    expect(itens[0]).toMatchObject({ nome: 'Moscow Mule', qtd: 2, preco_unitario: 1200 })
  })

  it('moves stock through estoque_movimentos tagged as origem pos', async () => {
    const client = setup()
    const result = await registerPosSale({ bar: BAR, cart: CART, catalog: CATALOG, config: CONFIG })

    const movimentos = client.inserts('estoque_movimentos')
    expect(movimentos).toHaveLength(2)
    movimentos.forEach(m => {
      expect(m.tipo).toBe('saida')
      expect(m.origem).toBe('pos')
      expect(m.bar_id).toBe('bar-1')
    })

    const vodka = movimentos.find(m => m.produto_id === 'prod-vodka')
    // 2 Moscow Mule (1 dose each) + 1 vodka shot = 3 doses of a 16-dose bottle
    expect(vodka.qtd).toBeCloseTo(0.188, 3)
    expect(result.consumo).toHaveLength(2)
  })

  it('does not touch stock when nothing can be converted', async () => {
    const client = setup()
    await registerPosSale({
      bar: BAR,
      cart: [{ key: 'x', drink_menu_id: 'drink-sem-receita', nome: 'Custom', qtd: 1, preco_unitario: 1000, preco_lista: 1000 }],
      catalog: CATALOG,
      config: CONFIG,
    })
    expect(client.writes('estoque_movimentos')).toEqual([])
  })

  it('records the drink back commission on the charged total', async () => {
    const client = setup()
    const result = await registerPosSale({
      bar: BAR,
      cart: CART,
      catalog: CATALOG,
      config: CONFIG,
      agentId: 'agent-1',
    })

    const comissao = client.inserts('drink_back_comissoes')[0]
    expect(comissao).toMatchObject({ agent_id: 'agent-1', base_valor: 2850, comissao_pct: 25, comissao_valor: 713 })
    expect(client.inserts('pos_vendas')[0].drink_back_valor).toBe(713)
    expect(result.comissao.comissao_valor).toBe(713)
  })

  it('registers no commission when no promoter is selected', async () => {
    const client = setup()
    await registerPosSale({ bar: BAR, cart: CART, catalog: CATALOG, config: CONFIG })
    expect(client.writes('drink_back_comissoes')).toEqual([])
    expect(client.inserts('pos_vendas')[0].drink_back_valor).toBe(0)
  })

  it('increments the discount code and logs its use', async () => {
    const client = setup()
    await registerPosSale({
      bar: BAR,
      cart: CART,
      catalog: CATALOG,
      config: CONFIG,
      discountCode: { id: 'code-1', codigo: 'ATOMIC-AAA111', usos_atual: 4 },
    })
    expect(client.writes('discount_codes')[0].payload).toEqual({ usos_atual: 5 })
    expect(client.inserts('discount_usages')[0]).toMatchObject({ discount_code_id: 'code-1', valor_desconto: 450 })
  })

  it('logs one VIP usage per cart line', async () => {
    const client = setup()
    await registerPosSale({ bar: BAR, cart: CART, catalog: CATALOG, config: CONFIG, vipMemberId: 'vip-1' })
    expect(client.inserts('vip_usages')).toHaveLength(2)
    expect(client.inserts('pos_vendas')[0].tipo).toBe('vip')
  })

  it('attributes the sale to the attendant on shift', async () => {
    const client = setup()
    await registerPosSale({ bar: BAR, cart: CART, catalog: CATALOG, config: CONFIG, staffId: 'staff-9' })
    expect(client.inserts('pos_vendas')[0].staff_id).toBe('staff-9')
  })

  it('keeps the sale and reports a warning when the stock write fails', async () => {
    const client = setup({ failOn: { 'estoque_movimentos:insert': 'RLS denied' } })
    const result = await registerPosSale({ bar: BAR, cart: CART, catalog: CATALOG, config: CONFIG })
    expect(result.venda).toBeTruthy()
    expect(result.warnings.join(' ')).toMatch(/RLS denied/)
    expect(client.inserts('pos_vendas')).toHaveLength(1)
  })

  it('refuses an empty cart', async () => {
    setup()
    await expect(registerPosSale({ bar: BAR, cart: [], catalog: CATALOG, config: CONFIG })).rejects.toThrow()
  })

  it('propagates a failure to save the sale itself', async () => {
    setup({ failOn: { 'pos_vendas:insert': 'connection lost' } })
    await expect(registerPosSale({ bar: BAR, cart: CART, catalog: CATALOG, config: CONFIG })).rejects.toThrow('connection lost')
  })
})

describe('runReorderCheck', () => {
  const tables = {
    produtos_public: [
      { id: 'prod-vodka', nome: 'Vodka', categoria: 'Vodka', ativo: true, preco_venda: 2000 },
      { id: 'prod-tonic', nome: 'Tonic', categoria: 'Soda', ativo: true, preco_venda: 300 },
    ],
    estoque_movimentos: [{ produto_id: 'prod-tonic', tipo: 'entrada', qtd: 10 }],
    estoque_regras: [
      { produto_id: 'prod-vodka', minimo: 3 },
      { produto_id: 'prod-tonic', minimo: 2 },
    ],
    pos_reorder_requests: [],
  }

  it('stays quiet while the automation is off', async () => {
    const client = setup({ tables })
    const result = await runReorderCheck({ bar: BAR, config: CONFIG })
    expect(result).toBe(null)
    expect(client.writes('pos_reorder_requests')).toEqual([])
  })

  it('creates a reorder request for the product below the minimum', async () => {
    const client = setup({ tables })
    const result = await runReorderCheck({
      bar: BAR,
      config: { ...CONFIG, auto_reorder_enabled: true },
    })

    const requests = client.inserts('pos_reorder_requests')
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ produto_id: 'prod-vodka', minimo: 3, qtd_sugerida: 6, status: 'pendente' })
    expect(result.webhook.ok).toBe(true)
  })

  it('posts the reorder to the backend endpoint, not straight to pedidos', async () => {
    const client = setup({ tables })
    await runReorderCheck({ bar: BAR, config: { ...CONFIG, auto_reorder_enabled: true } })

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0][0]).toBe('/api/pos-reorder')
    expect(client.writes('pedidos')).toEqual([])
    expect(client.writes('pedidos_itens')).toEqual([])
  })

  it('can be forced from the stock screen with the automation off', async () => {
    const client = setup({ tables })
    const result = await runReorderCheck({ bar: BAR, config: CONFIG, force: true })
    expect(result.itens).toHaveLength(1)
    expect(client.inserts('pos_reorder_requests')).toHaveLength(1)
  })

  it('respects the cooldown of a product already ordered', async () => {
    const client = setup({
      tables: {
        ...tables,
        pos_reorder_requests: [{ produto_id: 'prod-vodka', status: 'enviado', criado_em: new Date().toISOString() }],
      },
    })
    const result = await runReorderCheck({ bar: BAR, config: { ...CONFIG, auto_reorder_enabled: true } })
    expect(result).toBe(null)
    expect(client.writes('pos_reorder_requests')).toEqual([])
  })

  it('only looks at the products just consumed when asked to', async () => {
    const client = setup({ tables })
    const result = await runReorderCheck({
      bar: BAR,
      config: { ...CONFIG, auto_reorder_enabled: true },
      produtoIds: ['prod-tonic'],
    })
    expect(result).toBe(null)
    expect(client.writes('pos_reorder_requests')).toEqual([])
  })

  it('never writes to the JBM supply tables', async () => {
    const client = setup({ tables })
    await runReorderCheck({ bar: BAR, config: { ...CONFIG, auto_reorder_enabled: true } })
    JBM_SUPPLY_TABLES.forEach(table => {
      expect(client.writes(table)).toEqual([])
    })
  })
})
