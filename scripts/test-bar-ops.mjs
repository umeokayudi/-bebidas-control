#!/usr/bin/env node
import { placeNotifPanel, panelBoxStyle } from '../src/lib/notifPanel.js'
import { buildBarOpsGlance, opsGlanceItems, posTodayFromTickets, OPS_KPI_ROWS } from '../src/lib/barOpsGlance.js'
import { orderCastFromObs, orderDetailsFromObs, withOrderCast, orderCastIdFromObs } from '../src/lib/orderMeta.js'
import { splitCostBooks } from '../src/lib/costBooks.js'
import en from '../src/locales/en.js'
import ja from '../src/locales/ja.js'

let failed = 0
function assert(name, cond, extra) {
  if (cond) console.log('  ok  ', name)
  else { failed++; console.log('  FAIL', name, extra || '') }
}

function inView(pos, vw, vh, pad = 8) {
  const top = pos.top != null ? pos.top : vh - pos.bottom - pos.maxHeight
  const bottom = pos.top != null ? pos.top + pos.maxHeight : vh - pos.bottom
  return pos.left >= pad - 0.5
    && pos.left + pos.width <= vw - pad + 0.5
    && top >= pad - 0.5
    && bottom <= vh - pad + 0.5
}

console.log('\n== Notification panel placement (the click-design bug) ==')
const phoneHeader = placeNotifPanel({
  rect: { top: 8, bottom: 48, left: 334, right: 374 },
  placement: 'header',
  vw: 390,
  vh: 844,
})
assert('header bell opens BELOW the button', phoneHeader.top === 56 && phoneHeader.bottom == null, JSON.stringify(phoneHeader))
assert('header never uses phantom 480px above the bell', phoneHeader.top !== 8 - 480 && phoneHeader.top > 48)
assert('phone panel stays on screen', inView(phoneHeader, 390, 844), JSON.stringify(phoneHeader))
assert('phone panel is usable height', phoneHeader.maxHeight >= 160)

const oldBug = 8 - 480
assert('old sidebar math would have been off-screen', oldBug < 0)

const deskSidebar = placeNotifPanel({
  rect: { top: 760, bottom: 800, left: 16, right: 56 },
  placement: 'sidebar',
  vw: 1280,
  vh: 820,
})
assert('sidebar bell opens upward', deskSidebar.bottom === 820 - 760 + 8 && deskSidebar.top == null, JSON.stringify(deskSidebar))
assert('sidebar panel stays on screen', inView(deskSidebar, 1280, 820), JSON.stringify(deskSidebar))

const crampedHeader = placeNotifPanel({
  rect: { top: 700, bottom: 740, left: 300, right: 340 },
  placement: 'header',
  vw: 390,
  vh: 760,
})
assert('header near bottom opens above', crampedHeader.bottom != null && crampedHeader.top == null, JSON.stringify(crampedHeader))
assert('cramped header stays on screen', inView(crampedHeader, 390, 760), JSON.stringify(crampedHeader))

const style = panelBoxStyle(phoneHeader)
assert('style uses top not bottom for header', style.top === phoneHeader.top && style.bottom == null)

console.log('\n== Bar ops KPIs stay on separate books ==')
const books = splitCostBooks({ posMonthTotal: 3900, jbmMonthBill: 1757044, staffMonthPay: 12750, rentMonth: 450000 })
const glance = buildBarOpsGlance({
  hq: {
    books,
    hoursTotal: 8,
    pos: { salesCount: 2, tickets: [{ data: '2026-09-18', total: 2400 }, { data: '2026-09-01', total: 1500 }] },
    jbm: {
      totalPendente: 1733694,
      faturasAtraso: 2,
      faturasPendentes: 2,
      entregasMes: 9,
      estoqueBaixo: [{ id: 1 }, { id: 2 }],
      pedidosRecentes: [{ status: 'pendente' }],
    },
    sources: { inventory: { low: 2 } },
  },
  floor: { seated: 4, reserved: 1, free: 6, birthdays: 1 },
  openOrders: 3,
  today: '2026-09-18',
})
assert('never mixed into one total', glance.mixed === false)
assert('POS tonight is only today tickets', glance.posToday === 2400)
assert('POS month is till book not JBM', glance.posMonth === 3900)
assert('JBM bill is not POS', glance.jbmBill === 1757044)
assert('open AR is invoices not till', glance.openAr === 1733694)
assert('rent stays 450000', glance.rent === 450000)
assert('wages stay 12750', glance.wages === 12750)
assert('floor + birthdays + stock + orders', glance.seated === 4 && glance.birthdays === 1 && glance.lowStock === 2 && glance.openOrders === 3)
assert('today count helper', posTodayFromTickets([{ data: '2026-09-18T20:00:00', total: 900 }, { data: '2026-09-17', total: 10 }], '2026-09-18') === 900)

const fmt = n => `¥${n}`
const items = opsGlanceItems(glance, (k, vars) => {
  const path = k.split('.').slice(2)
  let cur = en.portal.home
  for (const p of path) cur = cur?.[p]
  if (typeof cur !== 'string') return k
  return cur.replace(/\{(\w+)\}/g, (_, n) => vars?.[n] ?? '')
}, fmt)
assert('13 management KPIs', items.length === 13, String(items.length))
const rowIds = OPS_KPI_ROWS.flat()
assert('KPI rows are 6+4+3', OPS_KPI_ROWS.map(r => r.length).join() === '6,4,3')
assert('KPI rows cover every KPI once', rowIds.length === 13 && items.every(it => rowIds.includes(it.id)))
assert('every KPI has a tab', items.every(it => it.tab))
assert('warn on AR / overdue / orders / stock', items.filter(it => it.warn).map(it => it.id).join() === 'ar,pending,overdue,orders,stock')
assert('EN labels exist', !!(en.portal.home.opsTitle && en.portal.home.kpiPosToday && en.notifications.delete))
assert('JA labels exist', !!(ja.portal.home.opsTitle && ja.portal.home.kpiOverdue && ja.notifications.delete))
assert('birthday copy is explicit', /birthday/i.test(en.portal.home.birthdaysMonth))

const fallback = buildBarOpsGlance({
  books: splitCostBooks({ posMonthTotal: 3900, jbmMonthBill: 0, staffMonthPay: 0, rentMonth: 450000 }),
  invoices: [
    { status: 'pendente', valor: 465000, pago: 0, data_vencimento: '2026-07-31' },
    { status: 'pendente', valor: 1268694, pago: 0, data_vencimento: '2026-08-31' },
  ],
  today: '2026-09-18',
})
assert('without HQ, AR comes from invoices not month notes', fallback.openAr === 1733694)
assert('without HQ, overdue is 2', fallback.overdue === 2)
assert('without HQ, rent still from books', fallback.rent === 450000)
assert('without HQ, POS month from books', fallback.posMonth === 3900)

console.log('\n== Order CAST / details stay in obs ==')
assert('pack CAST + details', withOrderCast('morning delivery', 'Yuki') === 'Cast: Yuki\nmorning delivery')
assert('read CAST', orderCastFromObs('Cast: Yuki\nmorning delivery') === 'Yuki')
assert('read details without CAST line', orderDetailsFromObs('Cast: Yuki\nmorning delivery') === 'morning delivery')
assert('empty CAST is just details', withOrderCast('urgent', '') === 'urgent')
assert('CAST unique id packs name|id', withOrderCast('restock', { name: 'Yuki', id: 'cast-1' }) === 'Cast: Yuki|cast-1\nrestock')
assert('CAST unique id reads name', orderCastFromObs('Cast: Yuki|cast-1\nrestock') === 'Yuki')
assert('CAST unique id reads id', orderCastIdFromObs('Cast: Yuki|cast-1\nrestock') === 'cast-1')


if (failed) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll bar-ops / notification placement checks passed')
