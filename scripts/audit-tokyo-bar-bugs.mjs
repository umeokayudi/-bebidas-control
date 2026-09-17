#!/usr/bin/env node
/** Proofs for Tokyo bar-owner audit — no network. */
import { monthRange, calcPay, isInsideGeofence } from '../src/lib/timeClock.js'
import { navForBarRole, posAccessForRole } from '../src/lib/access.js'
import { readFileSync } from 'node:fs'

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10)
}
function applyDiscount(preco, code) {
  if (!code || !preco) return { preco, desconto: 0 }
  const valor = +code.valor || 0
  const desconto = code.tipo === 'percent' ? Math.round(preco * (valor / 100)) : Math.min(preco, Math.round(valor))
  return { preco: Math.max(0, preco - desconto), desconto }
}
function resolveItemPrice(item, priceType = 'regular', discountCode = null) {
  const lista = item.preco_venda || 0
  if (discountCode) {
    const applied = applyDiscount(lista, discountCode)
    return { preco: applied.preco, tipo_preco: 'codigo' }
  }
  return { preco: lista, tipo_preco: priceType }
}
function validateDiscountCode(code, { drinkMenuId } = {}) {
  if (code.drink_menu_id && drinkMenuId && code.drink_menu_id !== drinkMenuId) return { ok: false }
  return { ok: true }
}

let failed = 0
function assert(name, cond, extra) {
  if (cond) console.log('  FIND', name)
  else { failed++; console.log('  MISS', name, extra || '') }
}

console.log('\n== Tokyo calendar vs POS "today" ==')
const utcKey = todayKey()
const tokyoKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
console.log('  now UTC date used by POS:', utcKey)
console.log('  now Asia/Tokyo date:', tokyoKey)

const nightUtc = new Date('2026-09-17T16:30:00Z') // 01:30 JST Sep 18
const posWouldStore = nightUtc.toISOString().slice(0, 10)
const tokyoThatMoment = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(nightUtc)
assert('night sale 01:30 JST stores UTC day (wrong for Tokyo)', posWouldStore === '2026-09-17' && tokyoThatMoment === '2026-09-18', `${posWouldStore} vs ${tokyoThatMoment}`)

const range = monthRange('2026-09-17')
assert('payroll monthRange ends at UTC 23:59 not Tokyo 23:59', range.to.endsWith('T23:59:59.999Z'))

console.log('\n== Discount scoped to one drink applies to whole cart ==')
const vodkaOnly = { ativo: true, tipo: 'percent', valor: 10, drink_menu_id: 'vodka-id' }
assert('validate without item context accepts vodka-only code', validateDiscountCode(vodkaOnly).ok === true)
const gin = resolveItemPrice({ id: 'gin-id', preco_venda: 1000 }, 'regular', vodkaOnly)
assert('10% vodka code also discounts gin at ¥1000 → ¥900', gin.preco === 900 && gin.tipo_preco === 'codigo')

console.log('\n== Roles ==')
assert('caixa never sees JBM invoices in nav', !navForBarRole('caixa').some(n => n.id === 'faturas'))
assert('staff is clock-only', navForBarRole('bar_staff').map(n => n.id).join() === 'ponto')
assert('staff has no POS', posAccessForRole('bar_staff') === 'none')

console.log('\n== Payroll law gap ==')
assert('pay is hours × rate only (no 深夜割増 25%)', calcPay(4, 1500) === 6000)

console.log('\n== Clock geofence ==')
assert('150m geofence works at same point', isInsideGeofence({ lat: 35.68, lng: 139.76, barLat: 35.68, barLng: 139.76 }).ok)

console.log('\n== Schema / checkout source ==')
const posLib = readFileSync(new URL('../src/lib/atomicPos.js', import.meta.url), 'utf8')
assert('POS todayKey uses UTC ISO date', posLib.includes("return new Date().toISOString().slice(0, 10)"))
const rls = readFileSync(new URL('../ATOMIC_POS_SCHEMA.sql', import.meta.url), 'utf8')
assert('POS RLS is any authenticated user', rls.includes("auth.role() = 'authenticated'"))
const posUi = readFileSync(new URL('../src/components/AtomicPos.jsx', import.meta.url), 'utf8')
assert('stock fail still shows sale registered', posUi.includes("alert(t('atomicPos.saleRegistered'") && posUi.includes('POS stock update:'))
const clockUi = readFileSync(new URL('../src/components/TimeClock.jsx', import.meta.url), 'utf8')
assert('staff punch button skips PIN length check', clockUi.includes('(!staffIdLocked && pin.length < 4)'))
const apiClock = readFileSync(new URL('../api/time-clock.js', import.meta.url), 'utf8')
assert('API allows selfPunch without PIN', apiClock.includes('if (!pinOk && !selfPunch)'))
const inv = readFileSync(new URL('../src/components/PortalCliente.jsx', import.meta.url), 'utf8')
assert('inventory stock uses last 500 movements', inv.includes('.limit(500)'))
const reorder = readFileSync(new URL('../api/pos-reorder.js', import.meta.url), 'utf8')
assert('pos-reorder webhook has no auth', !reorder.includes('requireStaff') && !reorder.includes('Authorization'))

if (failed) {
  console.log(`\n${failed} proof(s) did not match — re-check`)
  process.exit(1)
}
console.log('\nAll audit proofs matched (these are real bugs / gaps).')
