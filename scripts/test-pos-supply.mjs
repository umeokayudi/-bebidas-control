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
  findOpenRestockPedido,
  RESTOCK_OBS,
  posStockObs,
  deliveryStockObs,
} from '../src/lib/posSupply.js'
import { pedidoVendaObs } from '../src/lib/pedidoVenda.js'
import { coalesceStockMoves, decorateStockList, deliveryNoteMoves, posPourMoves, stockFlow, stockGlance } from '../src/lib/barStock.js'

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
assert('merge escolhe o pedido Auto: restock caixa aberto', findOpenRestockPedido([
  { id: 'x', status: 'pendente', obs: 'cliente pediu extra' },
  { id: 'r', status: 'pendente', obs: RESTOCK_OBS },
])?.id === 'r')
assert('pedido restock entregue não recebe merge', !findOpenRestockPedido([{ id: 'r', status: 'entregue', obs: RESTOCK_OBS }]))

console.log('\n== Obs de estoque isoladas ==')
assert('saída POS marcada caixa', posStockObs('abc').startsWith('POS caixa'))
assert('entrada entrega marcada JBM', deliveryStockObs('xyz').startsWith('JBM delivery'))

console.log('\n== Stock counts JBM notes when movimentos are empty ==')
const notes = [{
  id: 'note-1',
  obs: 'Auto: order abcdef12',
  vendas_itens: [{ produto_id: 'asahi', qtd: 60 }, { produto_id: 'heineken', qtd: 24 }],
}]
const implied = deliveryNoteMoves(notes)
assert('implied two entradas', implied.length === 2 && implied.every(m => m.tipo === 'entrada'))
const merged = coalesceStockMoves([], implied)
const list = decorateStockList(
  [{ id: 'asahi', nome: 'Asahi' }, { id: 'heineken', nome: 'Heineken' }, { id: 'unknown', nome: 'Mystery' }],
  merged,
  { asahi: 12 }
)
assert('Asahi 60 from deliveries', list.find(p => p.id === 'asahi')?.stock === 60 && list.find(p => p.id === 'asahi')?.good)
assert('uncounted is not well-stocked', list.find(p => p.id === 'unknown')?.unknown && !list.find(p => p.id === 'unknown')?.good)
const glance = stockGlance(list)
assert('well stocked is 2 not 3', glance.wellStocked === 2 && glance.unknown === 1)
const explicit = [{ produto_id: 'asahi', tipo: 'entrada', qtd: 10 }, { produto_id: 'asahi', tipo: 'saida', qtd: 2 }]
const trustExplicit = decorateStockList([{ id: 'asahi', nome: 'Asahi' }], coalesceStockMoves(explicit, implied), {})
assert('explicit entrada wins over implied', trustExplicit[0].stock === 8)
const byName = decorateStockList(
  [{ id: 'prod-asahi', nome: 'Asahi Beer 330ml' }],
  deliveryNoteMoves([{ id: 'n2', vendas_itens: [{ qtd: 60, produtos: { nome: 'Asahi Beer 330ml' } }] }]),
  {}
)
assert('name match when produto_id missing', byName[0].stock === 60 && byName[0].hasCount)
const nameOnlyMerged = decorateStockList(
  [{ id: 'prod-asahi', nome: 'Asahi Beer 330ml' }],
  coalesceStockMoves([], deliveryNoteMoves([{ id: 'n3', vendas_itens: [{ qtd: 60, produtos: { nome: 'Asahi Beer 330ml' } }] }])),
  {}
)
assert('coalesce keeps name-only implied', nameOnlyMerged[0].stock === 60 && nameOnlyMerged[0].hasCount)
const pours = posPourMoves(
  [{ produto_id: 'asahi', qtd: 16, pos_venda_id: 'sale-1' }],
  { asahi: { drinks_por_garrafa: 16 } }
)
assert('16 shots is 1 bottle saida', pours.length === 1 && pours[0].tipo === 'saida' && pours[0].qtd === 1)
assert('no pricing means no whole-bottle eat', posPourMoves([{ produto_id: 'asahi', qtd: 3 }], {}).length === 0)
const afterPour = decorateStockList(
  [{ id: 'asahi', nome: 'Asahi' }],
  coalesceStockMoves([], implied, pours),
  {}
)
assert('cellar is deliveries minus pours', afterPour[0].stock === 59)
const flow = stockFlow(coalesceStockMoves([], implied, pours))
assert('flow keeps in/out separate', flow.delivered === 84 && flow.poured === 1)
const explicitSaida = [{ produto_id: 'asahi', tipo: 'entrada', qtd: 10 }, { produto_id: 'asahi', tipo: 'saida', qtd: 2 }]
const noDoublePour = decorateStockList([{ id: 'asahi', nome: 'Asahi' }], coalesceStockMoves(explicitSaida, implied, pours), {})
assert('explicit saida wins over implied pour', noDoublePour[0].stock === 8)

if (failed) {
  console.log(`\n${failed} teste(s) falharam`)
  process.exit(1)
}
console.log('\nTodos os testes passaram — POS e JBM continuam livros separados, ligados só pelo estoque/pedido.\n')
