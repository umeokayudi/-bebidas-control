#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { navForBarRole, isBarRole, isJbmRole, posAccessForRole, canSeeJbmSupply, defaultBarTab, costAccessForRole, primaryDockForRole, groupedNavForRole } from '../src/lib/access.js'
import { haversineMeters, isInsideGeofence, hoursBetween, calcPay, pairPunches, payrollFromPunches } from '../src/lib/timeClock.js'
import { WRITTEN_LOGINS } from '../src/lib/barLanes.js'
import { loginDoorFromHash, isTillKiosk, isClockKiosk, isLiveKiosk, doorAllowsRole, hashForDoor, LOGIN_DOORS } from '../src/lib/barDoors.js'
import { splitCostBooks, booksAreSeparate, booksGrandTotal } from '../src/lib/costBooks.js'
import { signLanePayload, verifyLaneToken } from '../api/_hash.js'

let failed = 0
function assert(name, cond, extra) {
  if (cond) console.log('  ok  ', name)
  else { failed++; console.log('  FAIL', name, extra || '') }
}

console.log('\n== Logins separados ==')
assert('admin é JBM', isJbmRole('admin') && !isBarRole('admin'))
assert('caixa é bar, não JBM', isBarRole('caixa') && !isJbmRole('caixa'))
assert('caixa não vê faturas JBM', !navForBarRole('caixa').some(n => n.id === 'faturas' || n.id === 'pedidos'))
assert('caixa só POS', navForBarRole('caixa').map(n => n.id).join() === 'pos')
assert('staff só ponto', navForBarRole('bar_staff').map(n => n.id).join() === 'ponto')
assert('dono vê POS e JBM', navForBarRole('cliente').some(n => n.id === 'pos') && navForBarRole('cliente').some(n => n.id === 'faturas'))
assert('dono vê livros de custo', navForBarRole('cliente').some(n => n.id === 'custos'))
assert('dono vê CAST e gastos avulsos', navForBarRole('cliente').some(n => n.id === 'cast') && navForBarRole('cliente').some(n => n.id === 'gastos'))
assert('dono vê CRM de hóspedes e espaços', navForBarRole('cliente').some(n => n.id === 'clientes') && navForBarRole('cliente').some(n => n.id === 'espacos'))
assert('caixa não vê CAST nem gastos', !navForBarRole('caixa').some(n => n.id === 'cast' || n.id === 'gastos'))
assert('caixa não vê CRM nem espaços', !navForBarRole('caixa').some(n => n.id === 'clientes' || n.id === 'espacos'))
assert('caixa POS cashier', posAccessForRole('caixa') === 'cashier')
assert('staff sem POS', posAccessForRole('bar_staff') === 'none')
assert('staff não vê supply JBM', !canSeeJbmSupply('bar_staff') && canSeeJbmSupply('cliente'))
assert('tab inicial caixa = pos', defaultBarTab('caixa') === 'pos')
assert('tab inicial gerente = inicio', defaultBarTab('cliente') === 'inicio')
assert('tab inicial staff = ponto', defaultBarTab('bar_staff') === 'ponto')
assert('gerente dock is Home POS Orders Clock', primaryDockForRole('cliente').map(n => n.id).join() === 'inicio,pos,pedidos,ponto')
assert('caixa has no extra dock', primaryDockForRole('caixa').length === 0)
assert('POS hash is till door', loginDoorFromHash('#/pos') === 'pos' && hashForDoor('pos') === '#/pos')
assert('clock hash is staff door', loginDoorFromHash('#/clock') === 'clock')
assert('live watch is not a 5th password door', LOGIN_DOORS.length === 4 && LOGIN_DOORS.every(d => d.id !== 'live'))
assert('live hash is gerente watch', loginDoorFromHash('#/live') === 'live' && hashForDoor('live') === '#/live')
assert('gerente can open live watch', isLiveKiosk('cliente', 'live') && doorAllowsRole('live', 'cliente') && !isLiveKiosk('caixa', 'live'))
assert('caixa is always till kiosk', isTillKiosk('caixa', ''))
assert('gerente on /#/pos is till kiosk', isTillKiosk('cliente', 'pos') && !isTillKiosk('cliente', 'gerente'))
assert('staff is clock kiosk', isClockKiosk('bar_staff') && !isClockKiosk('caixa'))
assert('staff cannot use POS door', !doorAllowsRole('pos', 'bar_staff'))
assert('POS login can use POS door', doorAllowsRole('pos', 'caixa'))
assert('gerente menu grouped with tonight first', groupedNavForRole('cliente')[0].id === 'tonight' && groupedNavForRole('cliente')[0].items.some(n => n.id === 'pedidos'))

const caixaCost = costAccessForRole('caixa')
assert('caixa só vê caixa POS', caixaCost.posTill && !caixaCost.jbmBill && !caixaCost.staffWages && !caixaCost.ownWage)
const gerCost = costAccessForRole('cliente')
assert('gerente vê 4 livros', gerCost.posTill && gerCost.jbmBill && gerCost.staffWages && gerCost.rent)
const staffCost = costAccessForRole('bar_staff')
assert('funcionário só salário próprio', staffCost.ownWage && !staffCost.posTill && !staffCost.jbmBill && !staffCost.staffWages)
assert('caixa não vê aluguel', !caixaCost.rent)
assert('funcionário não vê aluguel', !staffCost.rent)

assert('POS login escrito', WRITTEN_LOGINS.pos.email === 'pos@atomic.bar' && WRITTEN_LOGINS.pos.password === 'PosOnly#2026')
assert('gerente login escrito', WRITTEN_LOGINS.gerente.email === 'umeokayudi@gmail.com')
assert('funcionário login escrito', WRITTEN_LOGINS.funcionario.email === 'funcionario@atomic.bar' && WRITTEN_LOGINS.funcionario.pin === '2468')
assert('emails dos 3 acessos são distintos', new Set([WRITTEN_LOGINS.pos.email, WRITTEN_LOGINS.gerente.email, WRITTEN_LOGINS.funcionario.email]).size === 3)
assert('senhas POS e funcionário diferentes', WRITTEN_LOGINS.pos.password !== WRITTEN_LOGINS.funcionario.password)

const books = splitCostBooks({ posMonthTotal: 3900, jbmMonthBill: 120000, staffMonthPay: 3000, rentMonth: 450000 })
assert('livros separados por tipo', booksAreSeparate(books))
assert('não soma os 4 livros', books.pos.amount === 3900 && books.jbm.amount === 120000 && books.staff.amount === 3000 && books.rent.amount === 450000)
assert('POS não é JBM nem aluguel', books.pos.kind === 'till' && books.jbm.kind === 'bill' && books.staff.kind === 'wages' && books.rent.kind === 'overhead')
assert('HQ não devolve total misturado', booksGrandTotal(books) == null)
const signed = signLanePayload({ id: 'x', email: 'pos@atomic.bar', role: 'caixa', bar_id: 'b', exp: Date.now() + 60_000 })
assert('token de pista assinado verifica', verifyLaneToken(signed)?.email === 'pos@atomic.bar')
assert('token de pista adulterado cai', !verifyLaneToken(signed.replace(/\.[^.]+$/, '.aaa')))

function listFns(dir, prefix = '') {
  const out = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name.startsWith('_')) continue
    const rel = prefix ? `${prefix}/${name.name}` : name.name
    if (name.isDirectory()) out.push(...listFns(join(dir, name.name), rel))
    else if (name.name.endsWith('.js')) out.push(rel)
  }
  return out
}
const fns = listFns(fileURLToPath(new URL('../api', import.meta.url)))
assert('Vercel Hobby: no máximo 12 funções', fns.length <= 12, String(fns.length) + ' ' + fns.join(','))
assert('hq-sync vive no mesmo /api/bar/[fn]', fns.includes('bar/[fn].js') && !fns.includes('hq-sync.js'))
const vjson = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
assert('time-clock rewrite keeps path (query preserved)', vjson.rewrites.some(r => r.source === '/api/time-clock' && !String(r.destination).includes('?')))
assert('lane-login rewrite keeps path', vjson.rewrites.some(r => r.source === '/api/lane-login' && r.destination === '/api/bar/lane-login'))
const authUi = readFileSync(new URL('../src/components/Auth.jsx', import.meta.url), 'utf8')
assert('login tem portas de tablet e email/senha', authUi.includes('login-door') && authUi.includes('type="email"') && authUi.includes('type="password"') && !authUi.includes('DoorCard') && !authUi.includes('WRITTEN_LOGINS'))
assert('login não imprime senhas na tela', !authUi.includes('PosOnly#2026') && !authUi.includes('Funcionario#2026') && !authUi.includes('JbmVer#2026'))
assert('POS tablet URL is /#/pos', authUi.includes('#/pos') || readFileSync(new URL('../src/lib/barDoors.js', import.meta.url), 'utf8').includes("#/pos"))
assert('caixa portal is a till kiosk shell', readFileSync(new URL('../src/components/PortalCliente.jsx', import.meta.url), 'utf8').includes('is-till-kiosk'))
const hqUi = readFileSync(new URL('../src/components/BarCostsTab.jsx', import.meta.url), 'utf8')
assert('HQ tablet não imprime senhas', !hqUi.includes('PosOnly#2026') && !hqUi.includes('Funcionario#2026') && !hqUi.includes('WRITTEN_LOGINS'))


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
