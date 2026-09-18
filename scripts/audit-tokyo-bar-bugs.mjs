#!/usr/bin/env node
/** Regression proofs — Tokyo bar bugs that were fixed. No network. */
import { monthRange, calcPay, calcPayWithLateNight, lateNightHoursBetween, payrollFromPunches, isInsideGeofence } from '../src/lib/timeClock.js'
import { tokyoDateKey } from '../src/lib/tokyo.js'
import { navForBarRole, posAccessForRole } from '../src/lib/access.js'
import { resolveItemPrice, validateDiscountCode, cartTotal, discountAppliesToItem, commitPosSale, rollbackPosSale } from '../src/lib/atomicPos.js'
import { includedTaxBreakdown } from '../src/lib/consumptionTax.js'
import { findOpenRestockPedido, RESTOCK_OBS, isRestockPedido } from '../src/lib/posSupply.js'
import { readFileSync } from 'node:fs'

let failed = 0
function assert(name, cond, extra) {
  if (cond) console.log('  ok  ', name)
  else { failed++; console.log('  FAIL', name, extra || '') }
}

console.log('\n== Tokyo calendar vs POS today ==')
const nightUtc = new Date('2026-09-17T16:30:00Z') // 01:30 JST Sep 18
assert('01:30 JST stores Tokyo day Sep 18', tokyoDateKey(nightUtc) === '2026-09-18', tokyoDateKey(nightUtc))

const range = monthRange('2026-09-17')
assert('payroll month starts Tokyo Sep 1 (UTC Aug 31 15:00)', range.from === '2026-08-31T15:00:00.000Z', range.from)
assert('payroll month ends Tokyo Sep 30 23:59:59.999', range.to === '2026-09-30T14:59:59.999Z', range.to)

console.log('\n== Discount scoped to one drink ==')
const vodkaOnly = { ativo: true, tipo: 'percent', valor: 10, drink_menu_id: 'vodka-id' }
assert('activating vodka-only code without item is still valid', validateDiscountCode(vodkaOnly).ok === true)
assert('code does not apply to gin', !discountAppliesToItem(vodkaOnly, { id: 'gin-id', kind: 'drink', preco_venda: 1000 }))
const gin = resolveItemPrice({ id: 'gin-id', kind: 'drink', preco_venda: 1000 }, 'regular', vodkaOnly)
assert('gin stays ¥1000', gin.preco === 1000 && gin.tipo_preco === 'regular', JSON.stringify(gin))
const vodka = resolveItemPrice({ id: 'vodka-id', kind: 'drink', preco_venda: 1000 }, 'regular', vodkaOnly)
assert('vodka becomes ¥900', vodka.preco === 900 && vodka.tipo_preco === 'codigo', JSON.stringify(vodka))

console.log('\n== Cart totals use listed 税込 price ==')
assert('cartTotal reads preco when preco_unitario missing', cartTotal([{ preco: 1000, qtd: 2 }]) === 2000)
assert('税込 ¥1000 is not inflated to ¥1100', includedTaxBreakdown(1000).total === 1000)
assert('内消費税 on ¥1100 is ¥100', includedTaxBreakdown(1100).tax === 100 && includedTaxBreakdown(1100).net === 1000)

console.log('\n== Roles ==')
assert('caixa never sees JBM invoices in nav', !navForBarRole('caixa').some(n => n.id === 'faturas'))
assert('staff is clock-only', navForBarRole('bar_staff').map(n => n.id).join() === 'ponto')
assert('staff has no POS', posAccessForRole('bar_staff') === 'none')

console.log('\n== 深夜割増 25% ==')
assert('plain calcPay stays hours × rate', calcPay(4, 1500) === 6000)
const lateH = lateNightHoursBetween('2026-09-17T12:00:00Z', '2026-09-17T16:00:00Z') // 21:00–01:00 JST
assert('21:00–01:00 JST has 3h late-night', lateH === 3, String(lateH))
assert('1h regular + 3h × 1.25 at ¥1200 = ¥5700', calcPayWithLateNight(4, 3, 1200) === 5700)
const nightPay = payrollFromPunches(
  [
    { staff_id: 'a', tipo: 'in', punched_at: '2026-09-17T12:00:00Z' },
    { staff_id: 'a', tipo: 'out', punched_at: '2026-09-17T16:00:00Z' },
  ],
  [{ id: 'a', nome: 'Aki', salario_hora: 1200 }]
)
assert('payrollFromPunches applies 深夜', nightPay[0].pay === 5700 && nightPay[0].lateHours === 3, JSON.stringify(nightPay[0]))

console.log('\n== Clock geofence ==')
assert('150m geofence works at same point', isInsideGeofence({ lat: 35.68, lng: 139.76, barLat: 35.68, barLng: 139.76 }).ok)

console.log('\n== Restock merge does not mix ledgers ==')
const open = findOpenRestockPedido([
  { id: '1', status: 'pendente', obs: RESTOCK_OBS, pedidos_itens: [{ produto_id: 'vodka' }] },
  { id: '2', status: 'pendente', obs: 'manual order' },
])
assert('finds open restock pedido', open?.id === '1')
assert('restock marker is not a POS venda', isRestockPedido({ obs: RESTOCK_OBS }) && !/pos/i.test(RESTOCK_OBS))

console.log('\n== Source / schema ==')
const posLib = readFileSync(new URL('../src/lib/atomicPos.js', import.meta.url), 'utf8')
assert('POS todayKey is Tokyo', posLib.includes('tokyoDateKey') && !posLib.includes("return new Date().toISOString().slice(0, 10)"))
assert('checkout rolls back pos_vendas on stock fail', posLib.includes('rollbackPosSale') && posLib.includes('saleStockFailed'))
const rls = readFileSync(new URL('../ATOMIC_POS_SCHEMA.sql', import.meta.url), 'utf8')
assert('POS RLS is bar-scoped, not any authenticated', rls.includes('pos_can_access_bar') && !rls.includes("auth.role() = 'authenticated'"))
const posUi = readFileSync(new URL('../src/components/AtomicPos.jsx', import.meta.url), 'utf8')
assert('stock fail no longer claims sale registered', posUi.includes('commitPosSale') && !posUi.includes('POS stock update:'))
assert('VIP requires a member', posUi.includes('vipMemberRequired') && posUi.includes("priceType === 'vip' && !vipId"))
const clockUi = readFileSync(new URL('../src/components/TimeClock.jsx', import.meta.url), 'utf8')
assert('Confirm always requires PIN length', clockUi.includes('pin.length < 4') && !clockUi.includes('(!staffIdLocked && pin.length < 4)'))
const apiClock = readFileSync(new URL('../api/_routeTimeClock.js', import.meta.url), 'utf8')
assert('API requires PIN even for selfPunch', apiClock.includes('if (!pinOk)') && !apiClock.includes('if (!pinOk && !selfPunch)'))
const inv = readFileSync(new URL('../src/components/PortalCliente.jsx', import.meta.url), 'utf8')
assert('inventory stock no longer caps at 500', !inv.includes('.limit(500)') && inv.includes('fetchAllStockMovements'))
assert('home POS month uses Tokyo calendar', inv.includes('tokyoMonthKey') && inv.includes('birthdayThisMonth'))
assert('orders/inventory/pricing use i18n keys', inv.includes("t('portal.orders.title')") && inv.includes("t('portal.inventory.outOfStock") && inv.includes("t('portal.pricing.title')"))
const reorder = readFileSync(new URL('../api/_routePosReorder.js', import.meta.url), 'utf8')
assert('pos-reorder requires auth', reorder.includes('requireBarAccount') && reorder.includes('requireStaff'))
const supply = readFileSync(new URL('../src/lib/posSupply.js', import.meta.url), 'utf8')
assert('restock scans all SKU rules and can merge open pedido', supply.includes('estoque_regras') && supply.includes('appendItemsToRestockPedido'))
assert('POS stock path never inserts into vendas', !/from\('vendas'\)/.test(supply))
const configs = readFileSync(new URL('../src/components/Configs.jsx', import.meta.url), 'utf8')
assert('admin delivery merges fatura like checklist path', configs.includes('mergeOrInsertPeriodFatura'))
assert('JBM delivery notifications are i18n', configs.includes('configs.notifDeliveredTitle'))

console.log('\n== Atomic checkout rollback (no vendas) ==')
function mockSb() {
  const ops = []
  return {
    ops,
    from(table) {
      const api = {
        insert(row) {
          ops.push(['insert', table])
          const inserted = { ...(Array.isArray(row) ? {} : row), id: 'pos-sale-1' }
          api._inserted = inserted
          return api
        },
        select() { return api },
        async single() { return { data: api._inserted, error: null } },
        then(resolve) { resolve({ error: null }) },
        delete() { ops.push(['delete', table]); return api },
        update() { return api },
        eq() { return Promise.resolve({}) },
      }
      return api
    },
  }
}
const sb = mockSb()
const rolled = await commitPosSale(sb, {
  bar: { id: 'bar-1', nome: 'Atomic' },
  cart: [{ nome: 'Gin', qtd: 1, preco: 1000, preco_lista: 1000 }],
  syncStock: async () => { throw new Error('stock down') },
})
assert('stock fail does not keep the POS sale', rolled.ok === false && rolled.errorKey === 'atomicPos.saleStockFailed')
assert('rollback deletes pos_vendas', sb.ops.some(o => o[0] === 'delete' && o[1] === 'pos_vendas'))
assert('rollback never writes vendas', !sb.ops.some(o => o[1] === 'vendas'))
assert('rollback helper exported', typeof rollbackPosSale === 'function')

if (failed) {
  console.log(`\n${failed} proof(s) failed`)
  process.exit(1)
}
console.log('\nAll Tokyo bar fixes hold — JBM supply ledgers untouched.')
