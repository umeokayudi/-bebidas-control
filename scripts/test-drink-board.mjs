#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { buildDrinkBoard, isPourLine, padSeq } from '../src/lib/drinkBoard.js'
import { LOGIN_DOORS, loginDoorFromHash, hashForDoor, isMakeKiosk, isTillKiosk, isLiveKiosk, doorAllowsRole } from '../src/lib/barDoors.js'
import { OPS_KPI_ROWS } from '../src/lib/barOpsGlance.js'
import { booksGrandTotal, splitCostBooks } from '../src/lib/costBooks.js'
import en from '../src/locales/en.js'
import ja from '../src/locales/ja.js'

let failed = 0
function assert(name, cond, extra) {
  if (cond) console.log('  ok  ', name)
  else { failed++; console.log('  FAIL', name, extra || '') }
}

const now = new Date('2026-09-21T14:30:00.000Z') // 23:30 JST
const old = { id: 'old', data: '2026-09-21', criado_em: '2026-09-21T12:00:00.000Z', obs: 'Cast: Aya|a1', space_id: 'c1' }
const a = { id: 'a', data: '2026-09-21', criado_em: '2026-09-21T14:26:00.000Z', obs: 'Cast: Aya|a1\nno ice', space_id: 'c1' }
const b = { id: 'b', data: '2026-09-21', criado_em: '2026-09-21T14:29:00.000Z', obs: '', space_id: null }
const fee = { id: 'fee', data: '2026-09-21', criado_em: '2026-09-21T14:28:00.000Z', obs: '' }
const items = [
  { pos_venda_id: 'old', nome: 'Heineken', qtd: 1, tipo_preco: 'regular' },
  { pos_venda_id: 'a', nome: 'Asahi Super Dry', qtd: 2, tipo_preco: 'regular' },
  { pos_venda_id: 'a', nome: 'サービス料 10%', qtd: 1, tipo_preco: 'service' },
  { pos_venda_id: 'b', nome: 'Corona', qtd: 1, tipo_preco: 'regular' },
  { pos_venda_id: 'fee', nome: '指名', qtd: 1, tipo_preco: 'nominho' },
]
const spaces = [{ id: 'c1', nome: 'カウンター 3' }]

console.log('\n== Pour lines skip ticket extras ==')
assert('beer is a pour', isPourLine({ nome: 'Asahi', qtd: 2, tipo_preco: 'regular' }))
assert('service is not a pour', !isPourLine({ nome: 'サービス料 10%', qtd: 1, tipo_preco: 'service' }))
assert('指名 is not a pour', !isPourLine({ nome: '指名', qtd: 1, tipo_preco: 'nominho' }))
assert('seq pads two digits', padSeq(7) === '07' && padSeq(12) === '12')

console.log('\n== Night sequence FIFO, no touch ==')
const board = buildDrinkBoard({ tickets: [b, a, old, fee], items, spaces, now, windowMs: 8 * 60 * 1000, nightKey: '2026-09-21' })
assert('not mixed', board.mixed === false && board.kind === 'make-board')
assert('tonight counts pour tickets only', board.tonightCount === 3, String(board.tonightCount))
assert('fee-only ticket skipped', board.lastSeq === '03')
assert('pending is 8-minute window', board.pendingCount === 2)
assert('FIFO current is oldest pending (Asahi #02)', board.current?.id === 'a' && board.current.seqLabel === '02')
assert('current qty 2 Asahi', board.current.pours[0].nome === 'Asahi Super Dry' && board.current.pours[0].qtd === 2)
assert('service line stripped', board.current.pours.length === 1)
assert('space name on current', board.current.space === 'カウンター 3')
assert('CAST name on current', board.current.cast === 'Aya')
assert('next is Corona #03', board.next[0]?.id === 'b' && board.next[0].seqLabel === '03')
assert('old Heineken aged out of NOW', !board.pendingCount || board.current.id !== 'old')

const empty = buildDrinkBoard({ tickets: [old], items, spaces, now, windowMs: 8 * 60 * 1000, nightKey: '2026-09-21' })
assert('waiting when nothing in window', empty.waiting && empty.current == null && empty.lastSeq === '01')

console.log('\n== Devices stay 4 passwords ==')
assert('four login doors', LOGIN_DOORS.length === 4 && LOGIN_DOORS.every(d => d.id !== 'make' && d.id !== 'live'))
assert('make hash', loginDoorFromHash('#/make') === 'make' && hashForDoor('make') === '#/make')
assert('pour alias', loginDoorFromHash('#/pour') === 'make')
assert('caixa drinks board', isMakeKiosk('caixa', 'make') && !isTillKiosk('caixa', 'make'))
assert('caixa empty door still till', isTillKiosk('caixa', ''))
assert('staff cannot make', !isMakeKiosk('bar_staff', 'make') && !doorAllowsRole('make', 'bar_staff'))
assert('gerente can make and watch', isMakeKiosk('cliente', 'make') && isLiveKiosk('cliente', 'live'))
assert('13 KPIs stay 13', OPS_KPI_ROWS.flat().length === 13)
assert('no mixed books', booksGrandTotal(splitCostBooks({ posMonthTotal: 1, jbmMonthBill: 2, staffMonthPay: 3, rentMonth: 4 })) == null)

console.log('\n== Wiring ==')
const portal = readFileSync(new URL('../src/components/PortalCliente.jsx', import.meta.url), 'utf8')
const kiosk = readFileSync(new URL('../src/components/DrinkMakeKiosk.jsx', import.meta.url), 'utf8')
assert('portal mounts drinks kiosk', portal.includes('DrinkMakeKiosk') && portal.includes("setDoorHash('make')"))
assert('board has no bump/done buttons', !/bump|markDone|doneTicket|onPourDone/i.test(kiosk))
assert('no-touch copy', en.portal.make.noTouch.toLowerCase().includes('no touch') && ja.portal.make.noTouch.includes('タッチ不要'))
assert('make is not a fifth book in copy', /no touch/i.test(en.auth.makeBookmark))
assert('nav labels unchanged', en.nav.portalPos === 'POS' && en.nav.portalCosts === 'Bar HQ')

if (failed) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll drink-board checks passed')
