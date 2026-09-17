#!/usr/bin/env node
import { navForBarRole, isBarRole, isJbmRole, posAccessForRole, canSeeJbmSupply, defaultBarTab } from '../src/lib/access.js'
import { haversineMeters, isInsideGeofence, hoursBetween, calcPay, pairPunches, payrollFromPunches } from '../src/lib/timeClock.js'

let failed = 0
function assert(name, cond, extra) {
  if (cond) console.log('  ok  ', name)
  else { failed++; console.log('  FAIL', name, extra || '') }
}

console.log('\n== Logins separados ==')
assert('admin é JBM', isJbmRole('admin') && !isBarRole('admin'))
assert('caixa é bar, não JBM', isBarRole('caixa') && !isJbmRole('caixa'))
assert('caixa não vê faturas JBM', !navForBarRole('caixa').some(n => n.id === 'faturas' || n.id === 'pedidos'))
assert('caixa só POS + ponto', navForBarRole('caixa').map(n => n.id).join() === 'pos,ponto')
assert('staff só ponto', navForBarRole('bar_staff').map(n => n.id).join() === 'ponto')
assert('dono vê POS e JBM', navForBarRole('cliente').some(n => n.id === 'pos') && navForBarRole('cliente').some(n => n.id === 'faturas'))
assert('dono vê CRM de hóspedes e espaços', navForBarRole('cliente').some(n => n.id === 'clientes') && navForBarRole('cliente').some(n => n.id === 'espacos'))
assert('caixa não vê CRM nem espaços', !navForBarRole('caixa').some(n => n.id === 'clientes' || n.id === 'espacos'))
assert('caixa POS cashier', posAccessForRole('caixa') === 'cashier')
assert('staff sem POS', posAccessForRole('bar_staff') === 'none')
assert('staff não vê supply JBM', !canSeeJbmSupply('bar_staff') && canSeeJbmSupply('cliente'))
assert('tab inicial caixa = pos', defaultBarTab('caixa') === 'pos')

console.log('\n== Geofence do local ==')
const here = { lat: 35.68, lng: 139.76, barLat: 35.68, barLng: 139.76, radiusM: 150 }
assert('dentro do bar', isInsideGeofence(here).ok)
const far = isInsideGeofence({ ...here, lat: 35.70 })
assert('longe bloqueia', !far.ok && far.reason === 'outside')
assert('sem GPS do bar bloqueia', !isInsideGeofence({ lat: 1, lng: 1, barLat: null, barLng: null }).ok)
assert('haversine ~0 no mesmo ponto', haversineMeters(35, 139, 35, 139) < 1)

console.log('\n== Cálculo direto horas × salário + 深夜割増 ==')
assert('2h exatas', hoursBetween('2026-09-17T18:00:00Z', '2026-09-17T20:00:00Z') === 2)
assert('pay 2h × 1500 = 3000', calcPay(2, 1500) === 3000)
const punches = [
  { staff_id: 'a', tipo: 'in', punched_at: '2026-09-17T01:00:00Z' }, // 10:00 JST
  { staff_id: 'a', tipo: 'out', punched_at: '2026-09-17T05:00:00Z' }, // 14:00 JST
]
const pay = payrollFromPunches(punches, [{ id: 'a', nome: 'Ana', salario_hora: 1200 }])
assert('4h diurnas × 1200 = 4800', pay[0].hours === 4 && pay[0].pay === 4800)
assert('par IN/OUT', pairPunches(punches).length === 1 && pairPunches(punches)[0].open === false)

if (failed) {
  console.log(`\n${failed} falha(s)`)
  process.exit(1)
}
console.log('\nAcessos isolados e ponto eletrônico com cálculo direto OK.\n')
