#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import {
  buildLivePulse,
  localCutSuggestions,
  localStaffCutAnswer,
  buildStaffCutSystem,
  lastSaleOf,
  salesThisHour,
  staffHourlyBurn,
  openClockedStaff,
} from '../src/lib/livePulse.js'
import { booksGrandTotal, splitCostBooks } from '../src/lib/costBooks.js'
import { LOGIN_DOORS, loginDoorFromHash, hashForDoor, isLiveKiosk, isTillKiosk, doorAllowsRole } from '../src/lib/barDoors.js'
import { OPS_KPI_ROWS } from '../src/lib/barOpsGlance.js'
import { LATE_NIGHT_PREMIUM } from '../src/lib/timeClock.js'
import en from '../src/locales/en.js'
import ja from '../src/locales/ja.js'

let failed = 0
function assert(name, cond, extra) {
  if (cond) console.log('  ok  ', name)
  else { failed++; console.log('  FAIL', name, extra || '') }
}

const nowLate = new Date('2026-09-21T14:30:00.000Z') // 23:30 JST
const nowDay = new Date('2026-09-21T05:00:00.000Z') // 14:00 JST
const ken = { id: 'ken', nome: 'Ken', cargo: 'bar', salario_hora: 1600 }
const yuki = { id: 'yuki', nome: 'Yuki', cargo: 'floor', salario_hora: 1200 }
const punches = [
  { staff_id: 'ken', tipo: 'in', punched_at: '2026-09-21T09:00:00.000Z' },
  { staff_id: 'yuki', tipo: 'in', punched_at: '2026-09-21T10:00:00.000Z' },
]
const hourSale = { id: 's1', total: 2000, data: '2026-09-21', criado_em: '2026-09-21T14:10:00.000Z', metodo_pagamento: 'Cash' }
const earlierSale = { id: 's0', total: 3900, data: '2026-09-21', criado_em: '2026-09-21T12:00:00.000Z', metodo_pagamento: 'Card' }

console.log('\n== This-hour pulse is not a fifth book ==')
const red = buildLivePulse({ tickets: [earlierSale, hourSale], punches, staff: [ken, yuki], now: nowLate })
assert('mixed false', red.mixed === false)
assert('no book id', red.book == null)
assert('kind is hour-ops', red.kind === 'hour-ops')
assert('grand total still null', red.booksGrandTotal == null && booksGrandTotal(splitCostBooks({ posMonthTotal: 1, jbmMonthBill: 2, staffMonthPay: 3, rentMonth: 4 })) == null)
assert('hour is 23 JST', red.hour === 23 && red.hourLabel === '23:00')
assert('tonight includes earlier ticket', red.tonightTill === 5900 && red.tonightCount === 2)
assert('this hour only the 23:00 sale', red.hourTill === 2000 && red.hourCount === 1)
assert('last sale is the newest', red.lastSale?.id === 's1' && red.lastSale.total === 2000)
assert('late premium on burn', staffHourlyBurn(1600, 23) === Math.round(1600 * (1 + LATE_NIGHT_PREMIUM)))
assert('two open staff', red.openCount === 2)
assert('hour wage burn 2000+1500', red.hourWageBurn === 3500, String(red.hourWageBurn))
assert('RED when burn > till', red.color === 'red' && red.gap === 2000 - 3500)

console.log('\n== Blue / idle ==')
const one = buildLivePulse({
  tickets: [hourSale],
  punches: [punches[0]],
  staff: [ken],
  now: nowLate,
})
assert('BLUE when till covers one late staff', one.color === 'blue' && one.hourWageBurn === 2000 && one.hourTill === 2000)
const idle = buildLivePulse({ tickets: [hourSale], punches: [], staff: [ken], now: nowLate })
assert('IDLE with no one punched in', idle.color === 'idle' && idle.openCount === 0)
const day = buildLivePulse({
  tickets: [{ id: 'd', total: 1800, data: '2026-09-21', criado_em: '2026-09-21T05:10:00.000Z' }],
  punches: [{ staff_id: 'ken', tipo: 'in', punched_at: '2026-09-21T04:00:00.000Z' }],
  staff: [ken],
  now: nowDay,
})
assert('daytime burn has no +25%', day.hour === 14 && day.hourWageBurn === 1600 && day.color === 'blue')

console.log('\n== Staff-cut alternatives ==')
assert('red first cut is highest burn Ken', red.cuts[0].names[0] === 'Ken' && red.cuts[0].kind === 'covers')
assert('cutting Ken goes blue', red.cuts[0].afterColor === 'blue' && red.cuts[0].afterBurn === 1500)
const keep = localCutSuggestions({ hourTill: 5000, hourWageBurn: 3500, openStaff: red.openStaff, color: 'blue' })
assert('blue suggests keep', keep[0].kind === 'keep')
const none = localCutSuggestions({ hourTill: 0, hourWageBurn: 0, openStaff: [], color: 'idle' })
assert('idle has none', none[0].kind === 'none')
assert('idle cut is not a red send-home', none.every(c => c.kind === 'none' || c.kind === 'keep'))
const localEn = localStaffCutAnswer(red, 'en')
const localJa = localStaffCutAnswer(red, 'ja')
assert('local English says RED', /RED this hour/i.test(localEn) && /Ken/.test(localEn))
assert('local Japanese says 赤', /赤/.test(localJa) && /Ken/.test(localJa))
const sys = buildStaffCutSystem(red, 'en')
assert('Gemini prompt forbids mixed books', /never add/i.test(sys) && /not a fifth cost book/i.test(sys))
assert('Gemini prompt has this-hour numbers', sys.includes('2,000') && sys.includes('3,500'))

console.log('\n== Devices: 4 password doors + live watch hash ==')
assert('four login doors', LOGIN_DOORS.length === 4 && LOGIN_DOORS.every(d => d.id !== 'live' && d.id !== 'send'))
assert('live hash', loginDoorFromHash('#/live') === 'live' && hashForDoor('live') === '#/live')
assert('watch alias', loginDoorFromHash('#/watch') === 'live')
assert('gerente live kiosk', isLiveKiosk('cliente', 'live') && isLiveKiosk('gerente', 'live'))
assert('caixa cannot watch', !isLiveKiosk('caixa', 'live') && !doorAllowsRole('live', 'caixa') && !doorAllowsRole('live', 'bar_staff'))
assert('till kiosk unchanged', isTillKiosk('caixa', '') && isTillKiosk('cliente', 'pos') && !isTillKiosk('cliente', 'live'))
assert('13 Home KPIs stay 13', OPS_KPI_ROWS.flat().length === 13 && OPS_KPI_ROWS.map(r => r.length).join() === '6,4,3')

console.log('\n== Wiring ==')
const portal = readFileSync(new URL('../src/components/PortalCliente.jsx', import.meta.url), 'utf8')
const band = readFileSync(new URL('../src/components/LivePulseBand.jsx', import.meta.url), 'utf8')
const dock = readFileSync(new URL('../src/components/HqAiDock.jsx', import.meta.url), 'utf8')
const auth = readFileSync(new URL('../src/components/Auth.jsx', import.meta.url), 'utf8')
assert('Home mounts live pulse band', portal.includes('<LivePulseBand') && portal.includes('LiveWatchKiosk'))
assert('live kiosk is not a login door card', !auth.includes("id: 'live'") && auth.includes('auth.devicesHint'))
assert('Gemini staff-cut uses existing /api/chat', band.includes('callGeminiChat') && dock.includes("callGeminiChat"))
assert('nav labels unchanged', en.nav.portalPos === 'POS' && en.nav.portalCosts === 'Bar HQ')
assert('live copy is not a fifth book', /not a fifth book/i.test(en.portal.live.hint) && /5つ目/.test(ja.portal.live.hint))
assert('lastSale helper newest first', lastSaleOf([earlierSale, hourSale]).id === 's1')
assert('salesThisHour filters hour', salesThisHour([earlierSale, hourSale], nowLate).length === 1)
assert('openClockedStaff skips closed', openClockedStaff(
  [...punches, { staff_id: 'ken', tipo: 'out', punched_at: '2026-09-21T11:00:00.000Z' }],
  [ken, yuki],
  nowLate,
).map(s => s.staff_id).join() === 'yuki')

if (failed) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll live-pulse checks passed')
