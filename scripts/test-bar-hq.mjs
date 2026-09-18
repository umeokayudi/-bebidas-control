#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { splitCostBooks, booksAreSeparate, booksGrandTotal, rentForMonth } from '../src/lib/costBooks.js'
import { localHoursPay, calcPayWithLateNight } from '../src/lib/timeClock.js'
import { buildHqChatSystem, localHqAnswer } from '../src/lib/hqChat.js'
import { costAccessForRole } from '../src/lib/access.js'
import { filterSupplierVendas } from '../api/_supplierVenda.js'
import { recentMonthKeys, shiftMonthKey, isMonthKey } from '../src/lib/tokyo.js'

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

console.log('\n== Month filters ==')
assert('month key shape', isMonthKey('2026-08') && !isMonthKey('2026-8') && !isMonthKey('aug'))
assert('shift back one month', shiftMonthKey('2026-09', -1) === '2026-08')
assert('recent months include current then previous', recentMonthKeys(4, '2026-09').join() === '2026-09,2026-08,2026-07,2026-06')

console.log('\n== Local HQ answers stay on one book ==')
const snap = {
  mes: '2026-09',
  books,
  hoursTotal: 8,
  rent: { note: 'Roppongi' },
  payroll: [{ nome: 'Floor', hours: 8, pay: 12750 }],
  pos: { salesCount: 2 },
  jbm: { totalPendente: 0, faturasAtraso: 0, estoqueBaixo: [] },
}
const posA = localHqAnswer('POS till this month?', snap)
const jbmA = localHqAnswer('JBM bill and open invoices', snap)
const wageA = localHqAnswer('Staff hours × rate', snap)
const rentA = localHqAnswer('Rent this month', snap)
assert('POS answer is till only', /POS till/.test(posA) && /2,400/.test(posA) && !/450,000/.test(posA))
assert('JBM answer is bill only', /JBM bill/.test(jbmA) && /88,000/.test(jbmA) && !/2,400/.test(jbmA))
assert('hours answer is wages only', /Hours book/.test(wageA) && /12,750/.test(wageA) && !/88,000/.test(wageA))
assert('rent answer is rent only', /Rent book/.test(rentA) && /450,000/.test(rentA) && !/2,400/.test(rentA))
assert('fallback lists four books not a sum', /not added together/.test(localHqAnswer('overview', snap)))

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
assert('HQ command CSS is present', css.includes('.hq-actions') && css.includes('.hq-ai-dock') && css.includes('.hq-filters'))
const posSrc = readFileSync(new URL('../src/lib/atomicPos.js', import.meta.url), 'utf8')
assert('POS schema checks pos-status first', posSrc.indexOf("fetch('/api/pos-status')") < posSrc.indexOf("from('pos_vendas')"))
const hqRoute = readFileSync(new URL('../api/_routeHqSync.js', import.meta.url), 'utf8')
assert('hq-sync accepts month filter', hqRoute.includes('req.query?.month') && hqRoute.includes('bodyOf(req).month'))
const dash = readFileSync(new URL('../src/components/BarCostsTab.jsx', import.meta.url), 'utf8')
const hqUi = dash.slice(dash.indexOf('export default function BarCostsTab'))
assert('HQ puts actions and filters in front', hqUi.indexOf('hq-filters') < hqUi.indexOf('<HqAiDock') && hqUi.includes('BarCommandActions'))
assert('HQ always mounts AI slot', hqUi.includes('<HqAiDock'))
const home = readFileSync(new URL('../src/components/PortalCliente.jsx', import.meta.url), 'utf8')
assert('home has command actions and AI slot', home.includes('BarCommandActions') && home.includes('HqAiDock'))

if (failed) {
  console.log(`\n${failed} falha(s)`)
  process.exit(1)
}
console.log('\nBar HQ sync + hours + rent OK.\n')
