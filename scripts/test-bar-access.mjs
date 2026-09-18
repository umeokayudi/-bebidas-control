#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { navForBarRole, isBarRole, isJbmRole, posAccessForRole, canSeeJbmSupply, defaultBarTab, costAccessForRole } from '../src/lib/access.js'
import { haversineMeters, isInsideGeofence, hoursBetween, calcPay, pairPunches, payrollFromPunches } from '../src/lib/timeClock.js'
import { WRITTEN_LOGINS } from '../src/lib/barLanes.js'
import { splitCostBooks, booksAreSeparate } from '../src/lib/costBooks.js'

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
assert('dono vê CRM de hóspedes e espaços', navForBarRole('cliente').some(n => n.id === 'clientes') && navForBarRole('cliente').some(n => n.id === 'espacos'))
assert('caixa não vê CRM nem espaços', !navForBarRole('caixa').some(n => n.id === 'clientes' || n.id === 'espacos'))
assert('caixa POS cashier', posAccessForRole('caixa') === 'cashier')
assert('staff sem POS', posAccessForRole('bar_staff') === 'none')
assert('staff não vê supply JBM', !canSeeJbmSupply('bar_staff') && canSeeJbmSupply('cliente'))
assert('tab inicial caixa = pos', defaultBarTab('caixa') === 'pos')
assert('tab inicial gerente = custos', defaultBarTab('cliente') === 'custos')
assert('tab inicial staff = ponto', defaultBarTab('bar_staff') === 'ponto')

const caixaCost = costAccessForRole('caixa')
assert('caixa só vê caixa POS', caixaCost.posTill && !caixaCost.jbmBill && !caixaCost.staffWages && !caixaCost.ownWage)
const gerCost = costAccessForRole('cliente')
assert('gerente vê 3 livros', gerCost.posTill && gerCost.jbmBill && gerCost.staffWages)
const staffCost = costAccessForRole('bar_staff')
assert('funcionário só salário próprio', staffCost.ownWage && !staffCost.posTill && !staffCost.jbmBill && !staffCost.staffWages)

assert('POS login escrito', WRITTEN_LOGINS.pos.email === 'pos@atomic.bar' && WRITTEN_LOGINS.pos.password === 'PosOnly#2026')
assert('gerente login escrito', WRITTEN_LOGINS.gerente.email === 'umeokayudi@gmail.com')
assert('funcionário login escrito', WRITTEN_LOGINS.funcionario.email === 'funcionario@atomic.bar' && WRITTEN_LOGINS.funcionario.pin === '2468')
assert('emails dos 3 acessos são distintos', new Set([WRITTEN_LOGINS.pos.email, WRITTEN_LOGINS.gerente.email, WRITTEN_LOGINS.funcionario.email]).size === 3)
assert('senhas POS e funcionário diferentes', WRITTEN_LOGINS.pos.password !== WRITTEN_LOGINS.funcionario.password)

const books = splitCostBooks({ posMonthTotal: 3900, jbmMonthBill: 120000, staffMonthPay: 3000 })
assert('livros separados por tipo', booksAreSeparate(books))
assert('não soma os 3 livros', books.pos.amount === 3900 && books.jbm.amount === 120000 && books.staff.amount === 3000)
assert('POS não é JBM', books.pos.kind === 'till' && books.jbm.kind === 'bill' && books.staff.kind === 'wages')

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
const vjson = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
assert('time-clock rewrite keeps path (query preserved)', vjson.rewrites.some(r => r.source === '/api/time-clock' && !String(r.destination).includes('?')))
assert('lane-login rewrite keeps path', vjson.rewrites.some(r => r.source === '/api/lane-login' && r.destination === '/api/bar/lane-login'))


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
