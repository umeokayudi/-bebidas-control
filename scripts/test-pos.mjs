import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveItemPrice,
  cartTotal,
  bottleQtyFromShots,
  drinkBackCommission,
  shouldReorder,
  suggestedReorderQty,
  aggregateHourly,
  operatingHours,
  idleHours,
  idleHourSuggestions,
  planPosSale,
  assertPosIsolation,
  completePosSale,
  createPosMemoryDb,
  barBusinessDate,
  hourInTimeZone,
  POS_FORBIDDEN_TABLES,
  POS_TABLES,
} from '../api/_posEngine.js'
import { isSupplierVenda, filterSupplierVendas } from '../api/_supplierVenda.js'

test('resolveItemPrice always sets preco_unitario', () => {
  const regular = resolveItemPrice({ preco_venda: 1200 })
  assert.equal(regular.preco_unitario, 1200)
  assert.equal(regular.tipo_preco, 'regular')

  const vip = resolveItemPrice({ preco_venda: 1200, preco_desconto: 500 }, 'vip')
  assert.equal(vip.preco_unitario, 500)
  assert.equal(vip.desconto_valor, 700)

  const code = resolveItemPrice({ preco_venda: 1000 }, 'regular', { tipo: 'percent', valor: 10 })
  assert.equal(code.preco_unitario, 900)
  assert.equal(code.tipo_preco, 'codigo')
})

test('cartTotal uses preco_unitario (bugfix for POS checkout)', () => {
  const total = cartTotal([
    { preco_unitario: 800, qtd: 2 },
    { preco: 500, qtd: 1 },
  ])
  assert.equal(total, 2100)
})

test('shot sales convert to bottle fractions for stock', () => {
  assert.equal(bottleQtyFromShots(8, 16), 0.5)
  assert.equal(bottleQtyFromShots(16, 16), 1)
  assert.equal(bottleQtyFromShots(1, 0), 0)
})

test('drink-back commission is percent of POS ticket', () => {
  assert.equal(drinkBackCommission(10000, { comissao_pct: 10 }), 1000)
  assert.equal(drinkBackCommission(10000, null), 0)
})

test('reorder triggers at or below min stock', () => {
  assert.equal(shouldReorder(2, 3), true)
  assert.equal(shouldReorder(3, 3), true)
  assert.equal(shouldReorder(4, 3), false)
  assert.equal(shouldReorder(0, 0), false)
  assert.equal(suggestedReorderQty(1, 3), 5)
})

test('Tokyo night hours belong to the previous business date before 06:00', () => {
  const late = '2026-09-18T02:30:00+09:00'
  assert.equal(hourInTimeZone(late), 2)
  assert.equal(barBusinessDate(late), '2026-09-17')
  assert.equal(barBusinessDate('2026-09-17T22:00:00+09:00'), '2026-09-17')
})

test('hourly buckets skip open tabs and compute ticket médio', () => {
  const buckets = aggregateHourly([
    { id: 'a', total: 3000, hora: 22, status: 'fechada' },
    { id: 'b', total: 1000, hora: 22, status: 'fechada' },
    { id: 'c', total: 9999, hora: 22, status: 'aberta' },
  ])
  assert.equal(buckets[22].count, 2)
  assert.equal(buckets[22].total, 4000)
  assert.equal(buckets[22].ticket, 2000)
  assert.equal(buckets[10].count, 0)
})

test('idle hours flag slow operating windows and suggest promotions', () => {
  const hours = operatingHours({ openHour: 18, closeHour: 6 })
  assert.deepEqual(hours.slice(0, 3), [18, 19, 20])
  assert.ok(hours.includes(23))
  assert.ok(hours.includes(0))
  assert.ok(!hours.includes(12))

  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${hour}:00`,
    total: hour === 16 || hour === 17 ? 200 : 5000,
    count: hour === 16 ? 1 : 8,
    items: 0,
    ticket: 0,
  }))
  const idle = idleHours(buckets, { openHour: 16, closeHour: 22, thresholdRatio: 0.2 })
  assert.ok(idle.some(h => h.hour === 16))
  const tips = idleHourSuggestions(idle)
  assert.ok(tips.length >= 1)
  assert.ok(tips[0].title)
})

test('planPosSale writes only POS tables — never JBM vendas', () => {
  const plan = planPosSale({
    barId: 'bar-1',
    cart: [{
      nome: 'Highball',
      qtd: 2,
      preco_unitario: 800,
      preco_lista: 800,
      produto_id: 'prod-1',
      drinks_por_garrafa: 16,
    }],
    payMethod: 'Cash',
    drinkBackAgent: { id: 'db-1', comissao_pct: 10 },
    stockMap: { 'prod-1': 1 },
    regras: { 'prod-1': 2 },
    now: '2026-09-17T21:15:00+09:00',
  })

  assert.equal(plan.vendaRow.total, 1600)
  assert.equal(plan.vendaRow.hora, 21)
  assert.equal(plan.vendaRow.drink_back_comissao, 160)
  assert.equal(plan.stockMoves[0].qtd, 0.125)
  assert.equal(plan.reorderAlerts.length, 1)
  assert.ok(plan.tablesWritten.includes(POS_TABLES.sales))
  assert.ok(plan.tablesWritten.includes(POS_TABLES.stockMoves))
  for (const t of POS_FORBIDDEN_TABLES) {
    assert.ok(!plan.tablesWritten.includes(t), `leaked ${t}`)
  }
  assert.equal(assertPosIsolation(plan), true)
})

test('completePosSale persists to pos_* and refuses JBM tables', async () => {
  const db = createPosMemoryDb()
  const result = await completePosSale(db, {
    barId: 'bar-1',
    cart: [{ nome: 'Gin tonic', qtd: 1, preco_unitario: 1200, preco_lista: 1200, produto_id: 'prod-gin', drinks_por_garrafa: 12 }],
    payMethod: 'PayPay',
    userId: 'user-1',
    stockMap: { 'prod-gin': 10 },
    regras: { 'prod-gin': 1 },
    now: '2026-09-17T23:40:00+09:00',
  })

  assert.ok(result.venda.id)
  assert.equal(db._store.pos_vendas.length, 1)
  assert.equal(db._store.pos_vendas_itens.length, 1)
  assert.equal(db._store.estoque_movimentos.length, 1)
  assert.equal(db._store.estoque_movimentos[0].tipo, 'saida')
  assert.equal(db._store.vendas, undefined)
  assert.throws(() => db.from('vendas').insert({ total: 1 }))
})

test('open tab does not deduct stock until the account is closed', () => {
  const plan = planPosSale({
    barId: 'bar-1',
    status: 'aberta',
    mesa: 'A3',
    cart: [{ nome: 'Shot', qtd: 4, preco_unitario: 500, produto_id: 'prod-1', drinks_por_garrafa: 16 }],
  })
  assert.equal(plan.vendaRow.status, 'aberta')
  assert.equal(plan.stockMoves.length, 0)
  assert.equal(plan.reorderAlerts.length, 0)
})

test('JBM filter keeps supplier deliveries and drops POS imports', () => {
  const list = [
    { id: 1, origem: 'fornecedor', obs: 'Auto: order abcdef12', total: 100 },
    { id: 2, origem: 'pos', obs: 'Balcão', total: 50 },
    { id: 3, obs: 'square import', total: 20 },
    { id: 4, cast_id: 'x', total: 10 },
    { id: 5, obs: 'Entrega Atomic', total: 80 },
  ]
  const kept = filterSupplierVendas(list)
  assert.deepEqual(kept.map(v => v.id), [1, 5])
  assert.equal(isSupplierVenda({ origem: 'balcao' }), false)
  assert.equal(isSupplierVenda({ pos_venda_id: 'abc' }), false)
})
