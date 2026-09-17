#!/usr/bin/env node
/**
 * Isolamento POS × fornecimento JBM
 * Roda: node scripts/test-pos-supply.mjs
 */
import { isSupplierVenda } from './lib/supplierVenda.mjs'
import {
  bottlesFromShots,
  bottlesConsumedFromCart,
  suggestedReorderQty,
  buildRestockItems,
  productsAlreadyOnOpenOrders,
  isRestockPedido,
  RESTOCK_OBS,
  posStockObs,
  deliveryStockObs,
} from '../src/lib/posSupply.js'
import { pedidoVendaObs } from '../src/lib/pedidoVenda.js'

let failed = 0
function assert(name, cond, extra) {
  if (cond) console.log('  ok  ', name)
  else {
    failed++
    console.log('  FAIL', name, extra || '')
  }
}

console.log('\n== Ledgers nunca se misturam ==')
assert('venda JBM Auto: order é fornecedor', isSupplierVenda({ obs: 'Auto: order abcdef12', total: 1000 }))
assert('origem fornecedor sempre conta', isSupplierVenda({ origem: 'fornecedor', obs: 'qualquer coisa' }))
assert('origem pos NÃO entra na conta JBM', !isSupplierVenda({ origem: 'pos', total: 5000 }))
assert('obs POS venda NÃO entra na conta JBM', !isSupplierVenda({ obs: 'POS venda xyz' }))
assert('obs balcão NÃO entra', !isSupplierVenda({ obs: 'venda balcão square' }))
assert('cast_id NÃO entra', !isSupplierVenda({ cast_id: 'x', total: 1 }))
assert('obs restock caixa (sem palavra pos) É fornecedor se virar venda', isSupplierVenda({ obs: pedidoVendaObs('aaaaaaaa-bbbb') }))
assert('pedidoVendaObs não contém "pos"', !/pos/i.test(pedidoVendaObs('aaaaaaaa-bbbb')))

console.log('\n== Shots viram garrafas, não destroem estoque ==')
assert('16 shots / 16 = 1 garrafa', bottlesFromShots(16, 16) === 1)
assert('1 shot / 16 = 0.0625', bottlesFromShots(1, 16) === 0.0625)
assert('sem drinks_por_garrafa = 0 (não baixa garrafa inteira)', bottlesFromShots(3, 0) === 0)
assert('drink de cardápio sem produto_id não baixa', Object.keys(bottlesConsumedFromCart(
  [{ drink_menu_id: 'd1', qtd: 2 }, { produto_id: 'vodka', qtd: 8 }],
  { vodka: { drinks_por_garrafa: 16 } }
)).length === 1)
assert('8 shots vodka = 0.5 garrafa', bottlesConsumedFromCart(
  [{ produto_id: 'vodka', qtd: 8 }],
  { vodka: { drinks_por_garrafa: 16 } }
).vodka === 0.5)

console.log('\n== Restock JBM com dedup ==')
assert('estoque 0.3 min 2 → pede 4', suggestedReorderQty(0.3, 2) === 4)
assert('acima do mínimo → 0', suggestedReorderQty(5, 2) === 0)
assert('sem regra → 0', suggestedReorderQty(0, 0) === 0)

const already = productsAlreadyOnOpenOrders([
  { status: 'pendente', pedidos_itens: [{ produto_id: 'vodka' }] },
  { status: 'entregue', pedidos_itens: [{ produto_id: 'gin' }] },
])
assert('vodka já em pedido aberto', already.has('vodka'))
assert('gin entregue não bloqueia', !already.has('gin'))

const items = buildRestockItems(
  [{ id: 'vodka', nome: 'Vodka', stock: 0, minimo: 2, preco_venda: 1800 }, { id: 'gin', nome: 'Gin', stock: 0, minimo: 1, preco_venda: 2000 }],
  already
)
assert('não duplica vodka em pedido aberto', items.every(i => i.produto_id !== 'vodka'))
assert('pede gin', items.some(i => i.produto_id === 'gin' && i.qtd >= 1))
assert('marca restock não usa a palavra pos', isRestockPedido({ obs: RESTOCK_OBS }) && !/pos/i.test(RESTOCK_OBS))

console.log('\n== Obs de estoque isoladas ==')
assert('saída POS marcada caixa', posStockObs('abc').startsWith('POS caixa'))
assert('entrada entrega marcada JBM', deliveryStockObs('xyz').startsWith('JBM delivery'))

if (failed) {
  console.log(`\n${failed} teste(s) falharam`)
  process.exit(1)
}
console.log('\nTodos os testes passaram — POS e JBM continuam livros separados, ligados só pelo estoque/pedido.\n')
