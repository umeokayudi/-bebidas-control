#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { splitCostBooks, booksGrandTotal, booksAreSeparate } from '../src/lib/costBooks.js'
import {
  normalizeSundry,
  parseSundryScan,
  sundryMonthRows,
  sundryNightRows,
  sundryPayload,
  sundryReady,
  sundryStaysApart,
  sundryTotal,
} from '../src/lib/sundrySpend.js'
import {
  NIGHT_HOUR_ORDER,
  breakevenGap,
  castLane,
  goalProgress,
  hourlyByCast,
  metricsOf,
  salesForCast,
  salesForMonth,
  salesForNight,
  scoreCastPerson,
  scoreCastRoster,
  sliceNightHours,
} from '../src/lib/castScore.js'
import { navForBarRole } from '../src/lib/access.js'
import { LIVE_TABLES as clientTables } from '../src/lib/barLiveClient.js'

let failed = 0
function assert(name, cond, extra) {
  if (cond) console.log('  ok  ', name)
  else { failed++; console.log('  FAIL', name, extra || '') }
}

console.log('\n== Sundry spend stays off the four books ==')
const books = splitCostBooks({ posMonthTotal: 3900, jbmMonthBill: 120000, staffMonthPay: 3000, rentMonth: 450000 })
assert('four books still separate', booksAreSeparate(books))
assert('still no mixed total', booksGrandTotal(books) == null)
assert('sundry is not a fifth book kind', !Object.values(books).some(b => b.kind === 'sundry'))
assert('sundry stays apart', sundryStaysApart(books))

const note = normalizeSundry({
  amount: '1280',
  what: 'Costco bags',
  spent_at: '2026-09-21T13:00:00Z',
  bar_id: 'b',
}, new Date('2026-09-21T13:00:00Z'))
assert('night key from 22:00 JST', note.night_key === '2026-09-21' && note.month_key === '2026-09')
assert('need yen + what', sundryReady(note) && !sundryReady({ amount: 10, what: '' }))
assert('payload never touches vendas', !('venda_id' in sundryPayload(note)) && sundryPayload(note).kind === 'sundry')

const rows = [
  note,
  normalizeSundry({ amount: 500, what: 'taxi', spent_at: '2026-08-02T15:00:00Z' }, new Date('2026-08-02T15:00:00Z')),
]
assert('month filter', sundryMonthRows(rows, '2026-09').length === 1 && sundryTotal(sundryMonthRows(rows, '2026-09')) === 1280)
assert('night filter', sundryNightRows(rows, '2026-09-21').length === 1)
assert('scan parse', parseSundryScan({ valor: 900, what: 'flowers' }).amount === 900 && parseSundryScan({ amount: 1, item: 'tape' }).what === 'tape')

console.log('\n== CAST hourly + KPI + goal + break-even per person ==')
const aya = { id: 'aya', nome: 'Aya', comissao_pct: 10, meta_noite: 20000, meta_mes: 400000, breakeven: 8000 }
const mika = { id: 'mika', nome: 'Mika', comissao_pct: 8, meta_noite: 15000, breakeven: 5000 }
const sales = [
  { drink_back_agent_id: 'aya', data: '2026-09-21', total: 12000, metodo_pagamento: 'Cash', criado_em: '2026-09-21T12:00:00Z' }, // 21:00 JST
  { drink_back_agent_id: 'aya', data: '2026-09-21', total: 3000, metodo_pagamento: 'PayPay', criado_em: '2026-09-21T15:30:00Z' }, // 00:30 next
  { drink_back_agent_id: 'mika', data: '2026-09-21', total: 4000, metodo_pagamento: 'Credit card', criado_em: '2026-09-21T13:00:00Z' },
  { drink_back_agent_id: null, data: '2026-09-21', total: 900, metodo_pagamento: 'Cash', criado_em: '2026-09-21T11:00:00Z' },
  { drink_back_agent_id: 'aya', data: '2026-09-10', total: 8000, metodo_pagamento: 'Cash', criado_em: '2026-09-10T12:00:00Z' },
]
const night = salesForNight(sales, '2026-09-21')
assert('night uses POS data key not civil created date', night.length === 4)
assert('month includes earlier night', salesForMonth(sales, '2026-09').length === 5)
assert('Aya only', salesForCast(sales, 'aya').length === 3)

const ayaNight = scoreCastPerson(aya, sales, { nightKey: '2026-09-21', monthKey: '2026-09' })
assert('Aya tonight ¥15,000', ayaNight.night.total === 15000 && ayaNight.night.count === 2)
assert('Aya month ¥23,000', ayaNight.month.total === 23000)
assert('Aya commission 10% of night', ayaNight.night.commission === 1500)
assert('Aya hour 21 has ¥12,000', ayaNight.night.nightHours.find(h => h.hour === 21)?.total === 12000)
assert('Aya hour 0 has ¥3,000', ayaNight.night.nightHours.find(h => h.hour === 0)?.total === 3000)
assert('night hours are 18→05', NIGHT_HOUR_ORDER.join() === '18,19,20,21,22,23,0,1,2,3,4,5' && ayaNight.night.nightHours.length === 12)
assert('Aya pay mix cash+paypay', ayaNight.night.pay.cash === 12000 && ayaNight.night.pay.paypay === 3000)
assert('Aya covers B/E but misses night goal', ayaNight.lane.status === 'covering' && ayaNight.lane.be.covered && ayaNight.lane.night.pct === 75)

const mikaNight = scoreCastPerson(mika, sales, { nightKey: '2026-09-21', monthKey: '2026-09' })
assert('Mika below break-even', mikaNight.lane.status === 'below_be' && mikaNight.night.total === 4000)
assert('Mika card segment', mikaNight.night.pay.card === 4000)

const board = scoreCastRoster([aya, mika], sales, { nightKey: '2026-09-21', monthKey: '2026-09' })
assert('people sorted by month desc', board.people[0].id === 'aya' && board.people[1].id === 'mika')
assert('floor walk-up stays untagged', board.floor.night.total === 900)
assert('till tonight is all tickets', board.all.night.total === 19900)
assert('tagged tonight excludes floor', board.all.taggedNight.total === 19000)
const hours = hourlyByCast([aya], night)
assert('hourly by CAST segments Aya vs floor', hours.aya.find(h => h.hour === 21).total === 12000 && hours.floor.find(h => h.hour === 20).total === 900)
assert('goal progress 50%', goalProgress(100, 200).pct === 50 && goalProgress(100, 0).has === false)
assert('BE gap', breakevenGap(9000, 8000).covered && breakevenGap(100, 8000).gap === -7900)
assert('hit goal lane', castLane({ nightTotal: 20000, monthTotal: 20000, goal: { night: 20000, month: 0, breakeven: 8000 } }).status === 'hit_goal')

console.log('\n== Wiring stays isolated ==')
const gerNav = navForBarRole('cliente').map(n => n.id)
assert('gerente has CAST and sundry tabs', gerNav.includes('cast') && gerNav.includes('gastos'))
assert('caixa still POS only', navForBarRole('caixa').map(n => n.id).join() === 'pos')
assert('staff still clock only', navForBarRole('bar_staff').map(n => n.id).join() === 'ponto')
assert('live client has bar_sundry', clientTables.has('bar_sundry'))
assert('live client has floor orders', clientTables.has('bar_floor_orders'))
const store = readFileSync(new URL('../api/_barLiveStore.js', import.meta.url), 'utf8')
assert('live store seeds bar_sundry', store.includes("'bar_sundry'"))
assert('sundry seed is empty not JBM', store.includes("saveTable(admin, 'bar_sundry', [])"))
const liveRoute = readFileSync(new URL('../api/_routeBarLive.js', import.meta.url), 'utf8')
assert('only gerente writes sundry', liveRoute.includes("'bar_sundry'") && /GERENTE_WRITE = new Set\(\[[^\]]*bar_sundry/.test(liveRoute))
const hq = readFileSync(new URL('../api/_hqSnapshot.js', import.meta.url), 'utf8')
assert('HQ reads sundry and CAST', hq.includes('bar_sundry') && hq.includes('drink_back_agents') && hq.includes('scoreCastRoster'))
const booksCall = hq.match(/const books = splitCostBooks\(\{[\s\S]*?\}\)/)?.[0] || ''
assert('HQ does not insert sundry into books', booksCall.includes('rentMonth') && !booksCall.includes('sundry'))
assert('sundry UI never writes vendas', !readFileSync(new URL('../src/components/BarSundryTab.jsx', import.meta.url), 'utf8').includes("from('vendas')"))
assert('CAST UI never writes faturas', !readFileSync(new URL('../src/components/CastScoreTab.jsx', import.meta.url), 'utf8').includes("from('faturas')"))
const pos = readFileSync(new URL('../src/components/AtomicPos.jsx', import.meta.url), 'utf8')
assert('POS dashboard uses nightlife CAST not civil todayKey', pos.includes('scoreCastRoster') && !pos.includes("eq('data', todayKey())"))
assert('POS hourly is 18-05', pos.includes('nightHours') || pos.includes('hourlyNight'))
const glance = readFileSync(new URL('../src/lib/barOpsGlance.js', import.meta.url), 'utf8')
assert('home KPI rows stay 6+4+3', glance.includes("['posToday', 'posMonth', 'jbm', 'ar', 'pending', 'overdue']"))

if (failed) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nSundry + CAST scoreboard checks passed')
