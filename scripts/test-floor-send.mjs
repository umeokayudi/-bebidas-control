#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { buildDrinkBoard, isPourLine } from '../src/lib/drinkBoard.js'
import { floorOrderPayload, floorOrderReady, floorStaysOffTill, floorSlipsTonight, FLOOR_TABLE } from '../src/lib/floorOrder.js'
import { LOGIN_DOORS, loginDoorFromHash, hashForDoor, isSendKiosk, isTillKiosk, isMakeKiosk, doorAllowsRole } from '../src/lib/barDoors.js'
import { devicesForRole, OPTIONAL_DEVICES } from '../src/lib/barDevices.js'
import { OPS_KPI_ROWS } from '../src/lib/barOpsGlance.js'
import { booksGrandTotal, splitCostBooks } from '../src/lib/costBooks.js'
import { LIVE_TABLES as clientTables } from '../src/lib/barLiveClient.js'
import en from '../src/locales/en.js'
import ja from '../src/locales/ja.js'

let failed = 0
function assert(name, cond, extra) {
  if (cond) console.log('  ok  ', name)
  else { failed++; console.log('  FAIL', name, extra || '') }
}

console.log('\n== Floor phone slip never charges ==')
const payload = floorOrderPayload({
  barId: 'b1',
  nightKey: '2026-09-21',
  spaceId: 'c1',
  spaceNome: 'カウンター 3',
  cast: 'Aya',
  items: [
    { nome: 'Asahi Super Dry', qtd: 2, drink_menu_id: 'd1' },
    { nome: 'サービス料 10%', qtd: 1, tipo_preco: 'service' },
  ],
  now: new Date('2026-09-21T14:29:00.000Z'),
})
assert('table name', FLOOR_TABLE === 'bar_floor_orders')
assert('status sent', payload.status === 'sent' && payload.kind === 'floor')
assert('service stripped', payload.items.length === 1 && payload.items[0].nome === 'Asahi Super Dry' && payload.items[0].qtd === 2)
assert('ready', floorOrderReady(payload))
assert('empty cart not ready', !floorOrderReady(floorOrderPayload({ barId: 'b1', items: [] })))
assert('off till', floorStaysOffTill(payload) && !('total' in payload) && !payload.metodo_pagamento)
assert('charged-looking row fails', !floorStaysOffTill({ kind: 'floor', status: 'sent', total: 1500, metodo_pagamento: 'Cash' }))
assert('tonight filter', floorSlipsTonight([payload, { ...payload, night_key: '2026-09-20' }], '2026-09-21').length === 1)

console.log('\n== Drinks board merges phone + till FIFO ==')
const now = new Date('2026-09-21T14:30:00.000Z')
const till = { id: 't1', data: '2026-09-21', criado_em: '2026-09-21T14:26:00.000Z', obs: 'Cast: Aya|a1', space_id: 'c1' }
const phone = {
  id: 'p1',
  night_key: '2026-09-21',
  criado_em: '2026-09-21T14:28:00.000Z',
  space_nome: 'テーブル A',
  cast: 'Mika',
  note: 'no ice',
  status: 'sent',
  items: [{ nome: 'Gin Highball', qtd: 1 }],
}
const board = buildDrinkBoard({
  tickets: [till],
  items: [{ pos_venda_id: 't1', nome: 'Asahi Super Dry', qtd: 2, tipo_preco: 'regular' }],
  spaces: [{ id: 'c1', nome: 'カウンター 3' }],
  floorOrders: [phone],
  now,
  windowMs: 8 * 60 * 1000,
  nightKey: '2026-09-21',
})
assert('not mixed', board.mixed === false && board.kind === 'make-board')
assert('tonight 2 slips', board.tonightCount === 2 && board.lastSeq === '02')
assert('FIFO till first', board.current?.id === 't1' && board.current.source === 'till')
assert('phone next', board.next[0]?.id === 'p1' && board.next[0].source === 'phone' && board.next[0].pours[0].nome === 'Gin Highball')
assert('phone space/cast', board.next[0].space === 'テーブル A' && board.next[0].cast === 'Mika')
assert('pour helper still skips extras', !isPourLine({ nome: '指名', qtd: 1, tipo_preco: 'nominho' }))

console.log('\n== Optional devices, still 4 passwords ==')
assert('four login doors', LOGIN_DOORS.length === 4 && LOGIN_DOORS.every(d => d.id !== 'send' && d.id !== 'make' && d.id !== 'live'))
assert('send hash', loginDoorFromHash('#/send') === 'send' && hashForDoor('send') === '#/send')
assert('phone alias', loginDoorFromHash('#/phone') === 'send' && loginDoorFromHash('#/floor') === 'send')
assert('caixa send is not till', isSendKiosk('caixa', 'send') && !isTillKiosk('caixa', 'send'))
assert('caixa empty door still till', isTillKiosk('caixa', ''))
assert('caixa can send and make', isSendKiosk('caixa', 'send') && isMakeKiosk('caixa', 'make'))
assert('staff cannot send', !isSendKiosk('bar_staff', 'send') && !doorAllowsRole('send', 'bar_staff'))
assert('caixa kit is till+phone+board', devicesForRole('caixa').map(d => d.id).join() === 'pos,send,make')
assert('gerente kit has watch+hq', devicesForRole('cliente').map(d => d.id).join() === 'pos,send,make,live,gerente')
assert('optional devices stay 5 lanes', OPTIONAL_DEVICES.length === 5)
assert('13 KPIs stay 13', OPS_KPI_ROWS.flat().length === 13)
assert('no mixed books', booksGrandTotal(splitCostBooks({ posMonthTotal: 1, jbmMonthBill: 2, staffMonthPay: 3, rentMonth: 4 })) == null)

console.log('\n== Wiring ==')
const portal = readFileSync(new URL('../src/components/PortalCliente.jsx', import.meta.url), 'utf8')
const pad = readFileSync(new URL('../src/components/FloorSendPad.jsx', import.meta.url), 'utf8')
const kiosk = readFileSync(new URL('../src/components/DrinkMakeKiosk.jsx', import.meta.url), 'utf8')
const liveRoute = readFileSync(new URL('../api/_routeBarLive.js', import.meta.url), 'utf8')
const store = readFileSync(new URL('../api/_barLiveStore.js', import.meta.url), 'utf8')
assert('portal mounts send pad', portal.includes('FloorSendPad') && portal.includes("openLane('send')"))
assert('send pad has SEND not Charge', pad.includes('data-send-go') && !pad.includes('commitPosSale') && !pad.includes('chargeNow'))
assert('send pad writes floor table only', pad.includes("from(FLOOR_TABLE)") && !pad.includes("from('pos_vendas')") && !pad.includes("from('vendas')") && !pad.includes("from('faturas')"))
assert('drinks board reads floor orders', kiosk.includes('bar_floor_orders'))
assert('live client has floor table', clientTables.has('bar_floor_orders'))
assert('live store seeds empty floor', store.includes("'bar_floor_orders'") && store.includes("saveTable(admin, 'bar_floor_orders', [])"))
assert('caixa can write floor (not gerente-only)', !/GERENTE_WRITE = new Set\(\[[^\]]*bar_floor_orders/.test(liveRoute))
assert('send copy is not a charge', /not a charge/i.test(en.auth.sendBookmark) && /会計ではない/.test(ja.auth.sendBookmark))
assert('nav labels unchanged', en.nav.portalPos === 'POS' && en.nav.portalCosts === 'Bar HQ')
assert('send pad no bump/done on board', !/bump|markDone|doneTicket/i.test(kiosk))

if (failed) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll floor-send checks passed')
