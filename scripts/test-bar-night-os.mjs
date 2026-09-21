#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { tokyoNightKey, tokyoDateKey } from '../src/lib/tokyo.js'
import { summarizeNight, saleOnNight, nightWindow, closeVariance, pourKeep } from '../src/lib/nightClose.js'
import { packTicketObs, readTicketMeta, ticketChargeLines, effectiveServicePct } from '../src/lib/nightTicket.js'
import { withOrderCast, orderCastIdFromObs, orderDetailsFromObs } from '../src/lib/orderMeta.js'
import { arAging } from '../src/lib/barPortal.js'
import { buildGuestReceiptHtml, buildPosReceiptNumero } from '../src/lib/guestReceipt.js'
import en from '../src/locales/en.js'
import ja from '../src/locales/ja.js'

let failed = 0
function assert(name, cond, extra) {
  if (cond) console.log('  ok  ', name)
  else { failed++; console.log('  FAIL', name, extra || '') }
}

console.log('\n== Night key (締め) ==')
assert('afternoon is that calendar day', tokyoNightKey(new Date('2026-09-18T12:00:00+09:00')) === '2026-09-18')
assert('01:00 belongs to previous night', tokyoNightKey(new Date('2026-09-19T01:00:00+09:00')) === '2026-09-18')
assert('05:59 still previous night', tokyoNightKey(new Date('2026-09-19T05:59:00+09:00')) === '2026-09-18')
assert('06:00 opens the new night', tokyoNightKey(new Date('2026-09-19T06:00:00+09:00')) === '2026-09-19')
const win = nightWindow('2026-09-18')
assert('window starts 06:00 JST', win.from === new Date('2026-09-18T06:00:00+09:00').toISOString())
assert('window ends next 05:59', win.nextKey === '2026-09-19')

const nightSales = [
  { total: 2400, data: '2026-09-18', criado_em: '2026-09-18T12:00:00+09:00', metodo_pagamento: 'Cash' },
  { total: 1500, data: '2026-09-19', criado_em: '2026-09-19T01:30:00+09:00', metodo_pagamento: 'Credit card' },
  { total: 900, data: '2026-09-19', criado_em: '2026-09-19T10:00:00+09:00', metodo_pagamento: 'Cash' },
]
assert('after-midnight sale is on this night', saleOnNight(nightSales[1], '2026-09-18'))
assert('next afternoon is not this night', !saleOnNight(nightSales[2], '2026-09-18'))
const sum = summarizeNight(nightSales, '2026-09-18')
assert('night till excludes next afternoon', sum.ticketCount === 2 && sum.drinksTotal === 3900, JSON.stringify(sum))
assert('cash vs card split', sum.cashTotal === 2400 && sum.cardTotal === 1500)
assert('variance counted-expected', closeVariance(2400, 2350) === -50)

console.log('\n== CAST id + ticket extras in obs ==')
const packed = packTicketObs({
  details: 'allergy gin',
  castName: 'Yuki',
  castId: 'cast-9',
  nightKey: '2026-09-18',
  servicePct: 10,
  nominho: 2000,
  setMinutes: 60,
  setPrice: 8000,
  roomMin: 10000,
  keepId: 'keep-1',
  keepPourPct: 10,
})
assert('obs has CAST id', orderCastIdFromObs(packed) === 'cast-9')
assert('details drop meta lines', orderDetailsFromObs(packed) === 'allergy gin')
const meta = readTicketMeta(packed)
assert('reads service nominho set keep', meta.servicePct === 10 && meta.nominho === 2000 && meta.setPrice === 8000 && meta.keepPourPct === 10 && meta.keepId === 'keep-1')
assert('string CAST still works', withOrderCast('hi', 'Aya') === 'Cast: Aya\nhi')

const charges = ticketChargeLines({
  drinksTotal: 12000,
  servicePct: 10,
  nominho: 2000,
  setPrice: 8000,
  roomMin: 10000,
  spaceType: 'vip_room',
})
assert('set + nominho + 10% service', charges.lines.some(l => l.kind === 'set') && charges.lines.some(l => l.kind === 'nominho') && charges.lines.some(l => l.kind === 'service'))
assert('個室 min only if below', !charges.lines.some(l => l.kind === 'room_min') && charges.total === 12000 + 8000 + 2000 + Math.round((12000 + 8000 + 2000) * 0.1))
const roomOnly = ticketChargeLines({ drinksTotal: 1000, servicePct: 0, roomMin: 10000, spaceType: 'vip_room' })
assert('個室チャージ fills the min', roomOnly.lines.some(l => l.kind === 'room_min') && roomOnly.total === 10000)
assert('counter has no room min', ticketChargeLines({ drinksTotal: 1000, roomMin: 10000, spaceType: 'counter' }).total === 1000)
assert('walk-up service is 0', effectiveServicePct({ servicePct: 10, tableTicket: false }) === 0)
assert('CAST table gets service', effectiveServicePct({ servicePct: 10, tableTicket: true }) === 10)
assert('opening extras does not add walk-up service', effectiveServicePct({ servicePct: 10, tableTicket: false, extrasOpen: true }) === 0)

console.log('\n== Keep pour + guest receipt is POS not JBM ==')
assert('pour 10 from 70', pourKeep({ remaining_pct: 70, ativo: true }, 10).remaining_pct === 60)
const html = buildGuestReceiptHtml({
  barNome: 'Atomic Bar',
  sale: { id: 'sale-1', total: 3300, data: tokyoDateKey() },
  items: [{ nome: 'Gin Highball', qtd: 2, preco_unitario: 1200 }, { nome: 'サービス料 10%', qtd: 1, preco: 240 }],
  guestNome: 'Kenji',
  castNome: 'Yuki',
  payMethod: 'Cash',
})
assert('guest receipt is 領収書', html.includes('領　収　書'))
assert('guest receipt is not JBM invoice', !html.includes('JBM Drinks') && html.includes('JBM請求ではありません') && html.includes('Atomic Bar'))
assert('POS number not RY-', buildPosReceiptNumero({ id: 'abc' }).startsWith('POS-') && !buildPosReceiptNumero({ id: 'abc' }).startsWith('RY-'))

console.log('\n== AR war room stays on JBM invoices ==')
const aging = arAging([
  { status: 'pendente', valor: 100000, pago: 0, data_vencimento: '2026-09-30' },
  { status: 'pendente', valor: 465000, pago: 0, data_vencimento: '2026-08-31' },
  { status: 'pendente', valor: 1268694, pago: 0, data_vencimento: '2026-06-01' },
  { status: 'pago', valor: 10, pago: 10, data_vencimento: '2026-01-01' },
], '2026-09-18')
assert('current not overdue', aging.current === 100000)
assert('1-30 bucket has August', aging.d30 === 465000)
assert('90+ has June', aging.d90 === 1268694)
assert('paid invoices ignored', aging.overdue.length === 2)
assert('open AR is invoices not till', aging.total === 100000 + 465000 + 1268694)

console.log('\n== One POS path: live-db for live tables ==')
const liveClient = readFileSync(new URL('../src/lib/barLiveClient.js', import.meta.url), 'utf8')
assert('client always posts live-db (no postgres shortcut)', liveClient.includes("/api/bar/live-db") && !liveClient.includes("source === 'postgres' && !lane"))
assert('live-db fetch times out instead of hanging', liveClient.includes('AbortSignal.timeout'))
assert('client has pos_shifts', liveClient.includes("'pos_shifts'"))
const posUi = readFileSync(new URL('../src/components/AtomicPos.jsx', import.meta.url), 'utf8')
assert('POS packs CAST id into obs', posUi.includes('packTicketObs') && posUi.includes('castId: agentId'))
assert('POS night close exists', posUi.includes('NightCloseBar') && posUi.includes('pos_shifts'))
assert('POS guest receipt exists', posUi.includes('printGuestReceipt'))
assert('POS never writes vendas', !posUi.includes("from('vendas')"))
assert('checkout is drinks-first', posUi.includes("t('atomicPos.stepDrinks')") && posUi.indexOf('stepDrinks') < posUi.indexOf('stepCharge'))
assert('CAST bar sits above drinks', posUi.includes('pos-cast-bar') && posUi.indexOf('pos-cast-bar') < posUi.indexOf('stepDrinks'))
assert('walk-up skips auto service', posUi.includes('effectiveServicePct') && posUi.includes('tableTicket') && !posUi.includes('extrasOpen: showExtras'))
assert('qty minus can remove', posUi.includes('function bumpCart'))
assert('pay methods are buttons', posUi.includes('pos-pay-methods') && posUi.includes('chargeNow') && posUi.includes('PAY_METHODS'))
assert('no leftover pay select', !posUi.includes("['Cash', 'Credit card', 'Debit card', 'PayPay', 'Transfer']"))
assert('sale errors are inline not alert', posUi.includes('setSaleErr') && !posUi.includes("alert(t('atomicPos.saleRegistered"))
assert('night-keyed till load', posUi.includes(".gte('data', nightKey)") && posUi.includes('summarizeNight') && posUi.includes('tillTonight'))
const costsUi = readFileSync(new URL('../src/components/BarCostsTab.jsx', import.meta.url), 'utf8')
assert('Home action tiles use verbs', costsUi.includes("portal.home.goPos") && costsUi.includes("portal.home.goHq") && costsUi.includes('hintKey'))
assert('nav labels stay short', en.nav.portalPos === 'POS' && en.nav.portalCosts === 'Bar HQ')
assert('charge copy is a verb', en.atomicPos.chargeNow.includes('Charge') && ja.atomicPos.payCash === '現金')
const hqUi = readFileSync(new URL('../src/components/BarCostsTab.jsx', import.meta.url), 'utf8')
assert('HQ UI has no demo passwords', !hqUi.includes('PosOnly#2026') && !hqUi.includes('password'))
const home = readFileSync(new URL('../src/components/PortalCliente.jsx', import.meta.url), 'utf8')
assert('Home prefers HQ POS snapshot', home.includes('hqPos') && home.includes('snap.pos.till'))
assert('AR war room on invoices tab', home.includes('arAging') && home.includes('warTitle'))
const orders = readFileSync(new URL('../src/components/BarOrdersTab.jsx', import.meta.url), 'utf8')
assert('JBM order CAST uses id', orders.includes('castId') && orders.includes("withOrderCast(obs, { name: castName, id: castId })"))
const commit = readFileSync(new URL('../src/lib/atomicPos.js', import.meta.url), 'utf8')
assert('keep pour updates bottle keep only', commit.includes('keepPour') && commit.includes('bar_bottle_keeps') && !commit.includes("from('vendas')"))

if (failed) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nNight OS: one POS path, 締め, CAST id, AR, ticket extras OK\n')
