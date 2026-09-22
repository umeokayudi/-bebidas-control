#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import en from '../src/locales/en.js'
import ja from '../src/locales/ja.js'

let failed = 0
function assert(name, cond, extra) {
  if (cond) console.log('  ok  ', name)
  else { failed++; console.log('  FAIL', name, extra || '') }
}

function flatten(obj, prefix = '') {
  const out = []
  for (const [k, v] of Object.entries(obj || {})) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flatten(v, path))
    else out.push(path)
  }
  return out
}

console.log('\n== Language: English default, Japanese optional ==')
assert('en and ja are the only UI langs', Object.keys({ en, ja }).join() === 'en,ja')
assert('home glance is English', en.portal.home.payJbm === 'Pay JBM' && en.portal.home.barSold === 'Bar sold' && en.portal.home.youKeep === 'You keep')
assert('three cost books are separate labels', en.portal.costs.posTill === 'POS till' && en.portal.costs.jbmBill === 'JBM bill' && en.portal.costs.staffWages === 'Staff wages')
assert('rent is a fourth book', en.portal.costs.rent === 'Rent' && en.nav.portalCosts === 'Bar HQ')
assert('HQ command copy', en.portal.hq.actionsTitle === 'Run the bar' && en.portal.hq.aiSlot === 'AI slot' && en.portal.hq.filterSpecify === 'Specify')
assert('ops KPI strip keys', !!(en.portal.home.opsTitle && en.portal.home.kpiPosToday && ja.portal.home.kpiOverdue && en.notifications.delete))
assert('birthday attention is explicit', /birthday/i.test(en.portal.home.birthdaysMonth))
assert('HQ filter copy names three JBM clocks', en.portal.hq.viewNotes.includes('dated') && en.portal.hq.viewOrders.includes('saved') && en.portal.hq.openAr.includes('all months'))
assert('home window is not HQ month', en.portal.home.filterWindow.includes('window') && en.portal.home.windowHint.includes('calendar month'))
assert('written login doors exist as copy keys', !!(en.auth.doorPosTitle && en.auth.doorGerenteTitle && en.auth.doorStaffTitle))
const authSrc = readFileSync(new URL('../src/components/Auth.jsx', import.meta.url), 'utf8')
assert('login page does not print door passwords', !authSrc.includes('PosOnly#2026') && !authSrc.includes('DoorCard'))
assert('login page has tablet doors', authSrc.includes('login-door') && authSrc.includes('pickDevice'))
assert('Japanese is optional copy', en.shell.langJaOptional.toLowerCase().includes('optional'))
assert('default hint mentions English', /english/i.test(en.shell.languageHint))
assert('POS hero is English', en.atomicPos.todayAtCounter === 'Today at the counter')
assert('till verbs are English', en.atomicPos.chargeNow === 'Charge {amount}' && en.portal.home.goPos === 'Sell drinks')
assert('JA till verbs exist', ja.atomicPos.payCash === '現金' && ja.portal.home.goHq === 'バー本部')
assert('home tile hints exist', en.portal.home.goPosHint.includes('Till') && ja.portal.home.goPosHint.includes('レジ'))
assert('floor/guest load errors exist', en.spaces.loadError.includes('floor') && ja.guests.loadError.includes('ゲスト'))
assert('sundry and CAST keys exist', !!(en.sundry?.title && ja.sundry?.title && en.cast?.breakeven && ja.nav.portalCast))
assert('sundry is not a fifth book in copy', /not added|never added|not POS/i.test(en.sundry.hint))
assert('live pulse keys exist', !!(en.portal.live?.title && ja.portal.live?.title && en.auth.openLiveWatch && ja.auth.laneLive))
assert('live pulse is not a fifth book in copy', /not a fifth book/i.test(en.portal.live.hint))
assert('four password doors only', !!(en.auth.doorPosTitle && en.auth.doorGerenteTitle && en.auth.doorStaffTitle && en.auth.doorJbmTitle && en.auth.devicesHint))

console.log('\n== Locale key parity (en vs ja) ==')
const enKeys = flatten(en)
const jaKeys = new Set(flatten(ja))
const missingInJa = enKeys.filter(k => !jaKeys.has(k))
assert('ja has every en key', missingInJa.length === 0, missingInJa.slice(0, 12).join(', '))

console.log('\n== Easy dashboard labels ==')
assert('no Portuguese on home cards', !/[ãáàéêíóôõúç]/i.test([
  en.portal.home.payJbm, en.portal.home.barSold, en.portal.home.youKeep, en.atomicPos.todayAtCounter,
].join(' ')))
assert('admin dash uses plain English', en.dashboard.billing === 'Billed to bars' && en.dashboard.receivable === 'Still to collect')
assert('discount errors exist in both langs', !!(en.atomicPos.codeInvalid && ja.atomicPos.codeInvalid && en.atomicPos.codeDisabled))
const posSrc = readFileSync(new URL('../src/lib/atomicPos.js', import.meta.url), 'utf8')
assert('discount errors use i18n keys', posSrc.includes("errorKey: 'atomicPos.codeInvalid'") && !posSrc.includes('Código inválido'))
assert('discount is scoped per item', posSrc.includes('discountAppliesToItem'))
assert('guest CRM keys exist in both langs', !!(en.guests?.title && ja.guests?.title && en.spaces?.title && ja.spaces?.types?.vipRoom))

if (failed) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll i18n / dashboard checks passed')
