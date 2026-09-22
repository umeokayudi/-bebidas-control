#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { splitCostBooks, booksAreSeparate, booksGrandTotal, rentForMonth, lastRentOnOrBefore, lastKnownRent } from '../src/lib/costBooks.js'
import {
  monthKeyOf, compactYen, explainJbmGap, buildMonthSeries, invoiceOverlapsMonth,
  matchHqSearch, monthChipHint, matchInvoiceStatus, lowStockFromLedger,
} from '../src/lib/hqFilters.js'
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
assert('HQ snapshot imports monthKeyOf', hqApi.includes("from '../src/lib/hqFilters.js'") && hqApi.includes('monthKeyOf') && hqApi.includes('buildMonthSeries'))

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
const sundryA = localHqAnswer('sundry spend photo', { ...snap, sundry: { monthTotal: 1280, count: 1 } })
assert('sundry answer is not a fifth book', /Sundry register/.test(sundryA) && /1,280/.test(sundryA) && !/88,000/.test(sundryA))
const castA = localHqAnswer('CAST break-even', { ...snap, cast: { people: [{ nome: 'Aya', night: 15000, month: 23000, breakeven: 8000, status: 'covering' }] } })
assert('CAST answer is per person', /Aya/.test(castA) && /15,000/.test(castA) && /not mixed/.test(castA))

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
assert('HQ command CSS is present', css.includes('.hq-actions') && css.includes('.hq-ai-dock') && css.includes('.hq-filters'))
assert('HQ filter groups and month chips', css.includes('.hq-filter-group') && css.includes('.hq-chip-stack') && css.includes('.hq-search') && css.includes('.hq-gap'))
const posSrc = readFileSync(new URL('../src/lib/atomicPos.js', import.meta.url), 'utf8')
assert('POS schema checks pos-status first', posSrc.indexOf("fetch('/api/pos-status'") < posSrc.indexOf("from('pos_vendas')"))
const posStatus = readFileSync(new URL('../api/_routePosStatus.js', import.meta.url), 'utf8')
assert('pos-status checks pos_vendas then live-store', posStatus.includes("from('pos_vendas')") && posStatus.includes('ensureBarLiveReady') && !posStatus.includes('drink_menu'))
const hqRoute = readFileSync(new URL('../api/_routeHqSync.js', import.meta.url), 'utf8')
assert('hq-sync accepts month filter', hqRoute.includes('req.query?.month') && hqRoute.includes('bodyOf(req).month'))
const dash = readFileSync(new URL('../src/components/BarCostsTab.jsx', import.meta.url), 'utf8')
const hqUi = dash.slice(dash.indexOf('export default function BarCostsTab'))
assert('HQ puts actions and filters in front', hqUi.indexOf('hq-filters') < hqUi.indexOf('<HqAiDock') && hqUi.includes('BarCommandActions'))
assert('HQ always mounts AI slot', hqUi.includes('<HqAiDock'))
assert('HQ month chips show amounts', hqUi.includes('hq-chip-stack') && hqUi.includes('compactYen'))
assert('HQ JBM views notes/invoices/orders', hqUi.includes("setJbmView") && hqUi.includes('ordersOtherDate'))
assert('HQ copy last rent', hqUi.includes('copyLastRent') && hqUi.includes('rentCopy'))
assert('HQ empty book ignores open AR', hqUi.includes('emptyBook') && hqUi.includes('totalPendente'))
assert('HQ never queries public.estoque', !hqApi.includes("from('estoque')"))
assert('HQ stock from regras + movimentos', hqApi.includes("from('estoque_regras')") && hqApi.includes("from('estoque_movimentos')"))
assert('HQ stock also reads delivery line items', hqApi.includes('vendas_itens') && hqApi.includes('coalesceStockMoves'))
assert('HQ stock also subtracts POS pours', hqApi.includes('posPourMoves') && hqApi.includes('pos_vendas_itens'))
const home = readFileSync(new URL('../src/components/PortalCliente.jsx', import.meta.url), 'utf8')
assert('home has command actions and AI slot', home.includes('BarCommandActions') && home.includes('HqAiDock'))
assert('home window is not HQ month', home.includes('portal.home.filterWindow') && home.includes('portal.home.windowHint'))

console.log('\n== Live-shaped HQ filters (Atomic Jul/Aug/Sep 2026) ==')
assert('monthKeyOf note date', monthKeyOf('2026-07-14') === '2026-07' && monthKeyOf('2026-08-22T12:00:00+09:00') === '2026-08')
assert('compact millions', compactYen(1757044) === '¥1.8M' && compactYen(3900) === '¥3,900')
const vendasLive = [
  { data: '2026-07-14', data_venda: '2026-07-14', total: 1757044, obs: 'Auto: order' },
  { data: '2026-06-20', data_venda: '2026-06-20', total: 2565926, obs: 'Costco' },
]
const pedidosLive = Array.from({ length: 9 }, (_, i) => ({
  criado_em: '2026-08-22T03:00:00.000Z',
  total_estimado: i === 0 ? 1757044 : 0,
  obs: 'Rebuild jul/2026',
}))
const posLive = [
  { data: '2026-09-10', total: 2400, obs: 'Demo POS' },
  { data: '2026-09-12', total: 1500, obs: 'Guest' },
]
const series = buildMonthSeries({
  keys: ['2026-09', '2026-08', '2026-07', '2026-06'],
  vendas: vendasLive,
  posRows: posLive,
  pedidos: pedidosLive,
  rentRows: [{ kind: 'rent', month_key: '2026-09', amount: 450000 }],
})
const byKey = Object.fromEntries(series.map(m => [m.key, m]))
assert('Sep chip POS ¥3900 rent 450k JBM 0', byKey['2026-09'].pos === 3900 && byKey['2026-09'].jbm === 0 && byKey['2026-09'].rent === 450000)
assert('Aug chip JBM 0 with 9 orders', byKey['2026-08'].jbm === 0 && byKey['2026-08'].pedidos === 9 && byKey['2026-08'].pedidosTotal === 1757044)
assert('Jul chip JBM ¥1,757,044', byKey['2026-07'].jbm === 1757044 && byKey['2026-07'].jbmCount === 1)
assert('Jun chip JBM ¥2,565,926', byKey['2026-06'].jbm === 2565926)
assert('Aug chip hint is orders not bill', monthChipHint(byKey['2026-08']).kind === 'orders')
assert('Jul chip hint is JBM bill', monthChipHint(byKey['2026-07']).kind === 'jbm' && monthChipHint(byKey['2026-07']).amount === 1757044)
assert('Sep chip hint is POS till', monthChipHint(byKey['2026-09']).kind === 'pos')
const augGap = explainJbmGap({ noteCount: 0, noteAmount: 0, orderCount: 9, orderAmount: 1757044, monthKey: '2026-08' })
assert('August gap is orders-other-date', augGap.kind === 'orders-other-date' && augGap.orderCount === 9)
assert('July gap is notes', explainJbmGap({ noteCount: 9, noteAmount: 1757044, orderCount: 0, monthKey: '2026-07' }).kind === 'notes')
const julInv = { status: 'parcial', periodo_inicio: '2026-07-01', periodo_fim: '2026-07-31', data_vencimento: '2026-08-31' }
const junInv = { status: 'pendente', periodo_inicio: '2026-06-01', periodo_fim: '2026-06-30', data_vencimento: '2026-07-31' }
assert('Jul invoice overlaps Jul and Aug due date', invoiceOverlapsMonth(julInv, '2026-07') && invoiceOverlapsMonth(julInv, '2026-08') && !invoiceOverlapsMonth(julInv, '2026-09'))
assert('Jun invoice does not overlap Aug', invoiceOverlapsMonth(junInv, '2026-06') && !invoiceOverlapsMonth(junInv, '2026-08'))
assert('pending filter keeps both open invoices', matchInvoiceStatus(julInv, 'pending') && matchInvoiceStatus(junInv, 'pending'))
assert('month filter Sep drops both', !matchInvoiceStatus(julInv, 'month', '2026-09') && !matchInvoiceStatus(junInv, 'month', '2026-09'))
assert('search hits rebuild obs', matchHqSearch({ obs: 'Rebuild jul/2026', status: 'entregue' }, 'rebuild'))
assert('search misses unrelated', !matchHqSearch({ obs: 'Costco jun' }, 'pos'))
const rentRows = [{ kind: 'rent', month_key: '2026-09', amount: 450000, note: 'Roppongi' }]
assert('Aug can copy Sep rent as template', lastKnownRent(rentRows, '2026-08')?.month_key === '2026-09' && lastRentOnOrBefore(rentRows, '2026-08') == null)
assert('Oct copies Sep as prior month', lastKnownRent(rentRows, '2026-10')?.amount === 450000)
const low = lowStockFromLedger({
  regras: [{ produto_id: 'gin', minimo: 2 }],
  movimentos: [{ produto_id: 'gin', tipo: 'entrada', qtd: 4 }, { produto_id: 'gin', tipo: 'saida', qtd: 3 }],
  produtos: [{ id: 'gin', nome: 'Gin' }],
})
assert('stock from movimentos not public.estoque', low.length === 1 && low[0].qtd === 1 && low[0].nome === 'Gin')
const jbmGapA = localHqAnswer('JBM bill and open invoices', {
  mes: '2026-08',
  books: splitCostBooks({ posMonthTotal: 0, jbmMonthBill: 0, staffMonthPay: 0, rentMonth: 0 }),
  jbm: { totalPendente: 1733694, faturasAtraso: 2, gap: augGap, estoqueBaixo: [] },
})
assert('AI explains Aug orders vs July notes', /dated another month/.test(jbmGapA) && /¥0/.test(jbmGapA) && /1,733,694/.test(jbmGapA))

if (failed) {
  console.log(`\n${failed} falha(s)`)
  process.exit(1)
}
console.log('\nBar HQ sync + hours + rent OK.\n')
