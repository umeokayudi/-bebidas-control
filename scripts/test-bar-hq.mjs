#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { splitCostBooks, booksAreSeparate, booksGrandTotal, rentForMonth } from '../src/lib/costBooks.js'
import { localHoursPay, calcPayWithLateNight } from '../src/lib/timeClock.js'
import { buildHqChatSystem } from '../src/lib/hqChat.js'
import { costAccessForRole } from '../src/lib/access.js'
import { filterSupplierVendas } from '../api/_supplierVenda.js'

let failed = 0
function assert(name, cond, extra) {
  if (cond) console.log('  ok  ', name)
  else { failed++; console.log('  FAIL', name, extra || '') }
}

console.log('\n== Bar HQ books stay separate ==')
const books = splitCostBooks({ posMonthTotal: 2400, jbmMonthBill: 88000, staffMonthPay: 12750, rentMonth: 450000 })
assert('four kinds', booksAreSeparate(books))
assert('no mixed total', booksGrandTotal(books) == null)
assert('rent is overhead', books.rent.kind === 'overhead' && books.rent.amount === 450000)
assert('rent of month', rentForMonth([{ kind: 'rent', month_key: '2026-09', amount: 450000 }], '2026-09') === 450000)
assert('rent other month is 0', rentForMonth([{ kind: 'rent', month_key: '2026-08', amount: 450000 }], '2026-09') === 0)

console.log('\n== Local hours × rate ==')
const local = localHoursPay({ hours: 8, lateHours: 2, rate: 1500 })
assert('late cannot exceed hours', localHoursPay({ hours: 2, lateHours: 9, rate: 1000 }).lateHours === 2)
assert('8h with 2 late @1500 = 12750', local.pay === 12750, String(local.pay))
assert('matches timeClock helper', local.pay === calcPayWithLateNight(8, 2, 1500))
assert('calc stays on wages book', local.book === 'wages')

console.log('\n== Roles ==')
assert('caixa cannot open HQ rent', !costAccessForRole('caixa').rent && !costAccessForRole('caixa').jbmBill)
assert('staff cannot open HQ rent', !costAccessForRole('bar_staff').rent && costAccessForRole('bar_staff').ownWage)
assert('gerente sees all four', costAccessForRole('gerente').rent && costAccessForRole('cliente').staffWages)

console.log('\n== JBM ledger isolation ==')
assert('POS ticket is not a JBM venda', !filterSupplierVendas([{ origem: 'pos', total: 2400, obs: 'Demo POS (not JBM)' }]).length)
assert('supplier delivery is JBM', filterSupplierVendas([{ origem: 'fornecedor', total: 88000 }]).length === 1)
const hqApi = readFileSync(new URL('../api/_hqSnapshot.js', import.meta.url), 'utf8')
assert('HQ never inserts vendas', !/\.insert\(/.test(hqApi.split('vendas')[0]) && !/\.from\('vendas'\)\.(insert|upsert|update|delete)/.test(hqApi))
assert('HQ never writes pedidos', !/\.from\('pedidos'\)\.(insert|upsert|update|delete)/.test(hqApi))
assert('HQ never writes faturas', !/\.from\('faturas'\)\.(insert|upsert|update|delete)/.test(hqApi))
assert('HQ does not select vendas.origem (column may be missing)', !/from\('vendas'\)\.select\([^)]*origem/.test(hqApi))
assert('HQ reads pedidos.total_estimado not pedidos.total', /from\('pedidos'\)\.select\([^)]*total_estimado/.test(hqApi) && !/from\('pedidos'\)\.select\([^)]*total[,)]/.test(hqApi))
const route = readFileSync(new URL('../api/bar/[fn].js', import.meta.url), 'utf8')
assert('hq-sync is wired in bar router', route.includes("fn === 'hq-sync'"))

console.log('\n== HQ AI keeps books split ==')
const sys = buildHqChatSystem({
  mes: '2026-09',
  syncedAt: '2026-09-18T00:00:00Z',
  books,
  hoursTotal: 8,
  rent: { note: 'Roppongi' },
  sources: { jbm: { ok: true, vendas: 1 }, pos: { ok: true, sales: 1, via: 'live-store' }, clock: { ok: true, punches: 2 }, rent: { ok: true } },
  payroll: [{ nome: 'Floor', hours: 8, pay: 12750 }],
  jbm: { faturasPendentes: 0, totalPendente: 0, faturasAtraso: 0, pedidosRecentes: [], estoqueBaixo: [] },
  bar: { nome: 'Atomic' },
})
assert('AI told not to mix books', /never add/i.test(sys) && /FOUR SEPARATE BOOKS/.test(sys))
assert('AI sees rent and wages', sys.includes('450,000') && sys.includes('12,750'))

if (failed) {
  console.log(`\n${failed} falha(s)`)
  process.exit(1)
}
console.log('\nBar HQ sync + hours + rent OK.\n')
