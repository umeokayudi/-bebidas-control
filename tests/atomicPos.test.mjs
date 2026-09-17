import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  hourlySalesSummary,
  posSalePayload,
  stockLevels,
  validateDiscountCode,
} from '../src/lib/atomicPos.js'

test('builds a normalized, internally consistent POS sale payload', () => {
  const payload = posSalePayload({
    barId: 'bar-1',
    userId: 'user-1',
    paymentMethod: 'Cash',
    discountCode: { id: 'discount-1' },
    cart: [
      {
        produto_id: 'product-1',
        nome: 'Whisky shot',
        qtd: 2,
        preco_unitario: 800,
        preco_lista: 1000,
        tipo_preco: 'codigo',
        desconto_valor: 200,
      },
    ],
  })

  assert.equal(payload.p_subtotal, 2000)
  assert.equal(payload.p_total, 1600)
  assert.equal(payload.p_desconto_total, 400)
  assert.equal(payload.p_tipo, 'desconto')
  assert.deepEqual(payload.p_items[0], {
    drink_menu_id: null,
    produto_id: 'product-1',
    nome: 'Whisky shot',
    qtd: 2,
    preco_unitario: 800,
    preco_lista: 1000,
    tipo_preco: 'codigo',
    desconto_valor: 200,
  })
})

test('aggregates revenue and sale count by local hour', () => {
  const sales = [
    { total: 1200, criado_em: '2026-09-17T20:15:00' },
    { total: 800, criado_em: '2026-09-17T20:45:00' },
    { total: 500, criado_em: '2026-09-17T21:00:00' },
  ]

  const summary = hourlySalesSummary(sales)
  assert.deepEqual(summary[20], { hour: 20, label: '20:00', total: 2000, count: 2 })
  assert.deepEqual(summary[21], { hour: 21, label: '21:00', total: 500, count: 1 })
})

test('derives low stock without mutating supplier product records', () => {
  const products = [{ id: 'p1', nome: 'Gin' }, { id: 'p2', nome: 'Vodka' }]
  const levels = stockLevels(
    products,
    [
      { produto_id: 'p1', tipo: 'entrada', qtd: 4 },
      { produto_id: 'p1', tipo: 'saida', qtd: 3 },
      { produto_id: 'p2', tipo: 'entrada', qtd: 8 },
    ],
    [{ produto_id: 'p1', minimo: 2 }, { produto_id: 'p2', minimo: 2 }],
  )

  assert.equal(levels[0].stock, 1)
  assert.equal(levels[0].low, true)
  assert.equal(levels[1].stock, 8)
  assert.equal(levels[1].low, false)
  assert.equal(products[0].stock, undefined)
})

test('rejects exhausted and product-restricted discount codes', () => {
  assert.equal(validateDiscountCode({ ativo: true, max_usos: 2, usos_atual: 2 }).ok, false)
  assert.equal(
    validateDiscountCode(
      { ativo: true, produto_id: 'allowed' },
      { produtoId: 'different' },
    ).ok,
    false,
  )
})

test('keeps POS persistence isolated from JBM supply tables', async () => {
  const sql = await readFile(new URL('../ATOMIC_POS_SCHEMA.sql', import.meta.url), 'utf8')
  const functionSql = sql.slice(sql.indexOf('create or replace function register_pos_sale'))

  assert.match(functionSql, /insert into pos_vendas/)
  assert.match(functionSql, /insert into pos_vendas_itens/)
  assert.doesNotMatch(functionSql, /\b(insert into|update|delete from)\s+(vendas|vendas_itens|pedidos|pedidos_itens|faturas)\b/i)
})
