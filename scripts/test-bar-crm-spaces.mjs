#!/usr/bin/env node
/** CRM + floor stay on the bar side — never JBM supply. */
import { readFileSync } from 'node:fs'
import {
  tokyoFloorPreset,
  decorateSpaces,
  spacesByZone,
  searchGuests,
  guestSpendFromPos,
  toggleTag,
  isOpenVisit,
  matchCheckoutVisit,
  visitMinutes,
  formatVisitDuration,
  birthdayThisMonth,
  birthdayToday,
  activeKeeps,
  keepExpiringSoon,
  pourKeep,
} from '../src/lib/barCrm.js'
import { navForBarRole } from '../src/lib/access.js'
import { isSupplierVenda } from './lib/supplierVenda.mjs'
import { tokyoDateKey } from '../src/lib/tokyo.js'
import { commitPosSale } from '../src/lib/atomicPos.js'

let failed = 0
function assert(name, cond, extra) {
  if (cond) console.log('  ok  ', name)
  else { failed++; console.log('  FAIL', name, extra || '') }
}

console.log('\n== Tokyo floor preset ==')
const floor = tokyoFloorPreset()
assert('8 counter + 4 tables + 2 VIP rooms', floor.length === 14, String(floor.length))
assert('has カウンター', floor.some(s => s.tipo === 'counter' && s.nome.includes('カウンター')))
assert('has 個室 VIP', floor.some(s => s.tipo === 'vip_room' && s.nome.includes('個室')))
assert('zones split', spacesByZone(floor).map(z => z.zona).join() === 'counter,table,vip')

console.log('\n== Occupancy ==')
const live = decorateSpaces(floor.map((s, i) => ({ ...s, id: String(i + 1), ativo: true })), [
  { space_id: '1', status: 'seated', guest_id: 'g1', inicio: '2026-09-17T12:00:00Z' },
  { space_id: '9', status: 'reserved' },
  { space_id: '10', status: 'done' },
])
assert('counter 1 occupied', live[0].occupied)
assert('table reserved not occupied', live.find(s => s.id === '9')?.reserved && !live.find(s => s.id === '9')?.occupied)
assert('done visit does not occupy', !live.find(s => s.id === '10')?.occupied)
assert('isOpenVisit seated', isOpenVisit({ status: 'seated' }) && !isOpenVisit({ status: 'done' }))
assert('match by space then guest', matchCheckoutVisit([{ space_id: '1', guest_id: 'g1', status: 'seated' }], { spaceId: '1' })?.guest_id === 'g1')
assert('duration format', formatVisitDuration(90) === '1h 30m' && formatVisitDuration(5) === '5m')
assert('visit minutes ~60', visitMinutes({ inicio: '2026-09-17T12:00:00Z' }, Date.parse('2026-09-17T13:00:00Z')) === 60)

console.log('\n== Guest CRM spend is POS only ==')
const spend = guestSpendFromPos([
  { guest_id: 'g1', total: 8000, data: '2026-09-17' },
  { guest_id: 'g1', total: 2000, data: '2026-09-16' },
  { guest_id: 'g2', total: 99999, data: '2026-09-17' },
], 'g1')
assert('sums only that guest POS sales', spend.count === 2 && spend.total === 10000)
assert('JBM-looking venda is still not CRM spend unless guest_id', guestSpendFromPos([{ origem: 'fornecedor', total: 50000 }], 'g1').total === 0)
assert('supplier filter still true for Auto: order', isSupplierVenda({ obs: 'Auto: order abcdef12', total: 1 }))
assert('search LINE', searchGuests([{ nome: 'Ken', line_id: 'ken88' }], 'ken88').length === 1)
assert('toggle tag', toggleTag(['regular'], 'vip').includes('vip') && !toggleTag(['vip'], 'vip').includes('vip'))

const bday = birthdayThisMonth([{ nome: 'A', aniversario: '1990-09-17' }, { nome: 'B', aniversario: '1990-01-01' }], new Date('2026-09-17T12:00:00+09:00'))
assert('birthday this Tokyo month', bday.length === 1 && bday[0].nome === 'A')
assert('birthday today Tokyo', birthdayToday([{ aniversario: '1990-09-17' }], new Date('2026-09-17T15:00:00+09:00')).length === 1)
assert('active keeps filter', activeKeeps([{ guest_id: 'g1', ativo: true }, { guest_id: 'g1', ativo: false }, { guest_id: 'g2', ativo: true }], 'g1').length === 1)
assert('keep expiring within 14d', keepExpiringSoon({ expires_on: tokyoDateKey(new Date('2026-09-24T00:00:00+09:00')) }, new Date('2026-09-17T00:00:00+09:00')))
assert('pour deducts remaining_pct', pourKeep({ remaining_pct: 70 }, 10).remaining_pct === 60)
assert('empty keep deactivates', pourKeep({ remaining_pct: 5 }, 10).ativo === false)

console.log('\n== Source isolation ==')
const crm = readFileSync(new URL('../src/lib/barCrm.js', import.meta.url), 'utf8')
const guestsUi = readFileSync(new URL('../src/components/BarGuestsTab.jsx', import.meta.url), 'utf8')
const spacesUi = readFileSync(new URL('../src/components/BarSpacesTab.jsx', import.meta.url), 'utf8')
const schema = readFileSync(new URL('../BAR_CRM_SPACES_SCHEMA.sql', import.meta.url), 'utf8')
const pos = readFileSync(new URL('../src/lib/atomicPos.js', import.meta.url), 'utf8')
const posUi = readFileSync(new URL('../src/components/AtomicPos.jsx', import.meta.url), 'utf8')
assert('CRM lib never writes vendas', !/from\('vendas'\)/.test(crm))
assert('guest UI writes bar_guests + reads pos_vendas only', guestsUi.includes("from('bar_guests')") && guestsUi.includes("from('pos_vendas')") && !guestsUi.includes("from('vendas')") && !guestsUi.includes("from('faturas')"))
assert('guest UI has bottle keep, never pedidos', guestsUi.includes("from('bar_bottle_keeps')") && !guestsUi.includes("from('pedidos')"))
assert('spaces UI never touches faturas/compras', !spacesUi.includes("from('faturas')") && !spacesUi.includes("from('compras')"))
assert('SQL does not create vendas/pedidos/faturas', !/create table if not exists vendas/i.test(schema) && schema.includes('pos_vendas') && schema.includes('bar_bottle_keeps'))
assert('checkout can attach guest/space on pos_vendas', pos.includes('space_id') && pos.includes('guest_id'))
assert('checkout saves CAST agent and details note', pos.includes('drink_back_agent_id') && pos.includes('vendaPayload.obs'))
assert('POS auto-links seated guest from space', posUi.includes('matchCheckoutVisit') && posUi.includes('keepChip'))
assert('POS ticket shows CAST chips', posUi.includes('pos-chip-cast') && posUi.includes('pos-cast-bar'))
assert('owner nav has guests+spaces', navForBarRole('cliente').some(n => n.id === 'clientes') && navForBarRole('cliente').some(n => n.id === 'espacos'))
const ordersUi = readFileSync(new URL('../src/components/BarOrdersTab.jsx', import.meta.url), 'utf8')
assert('JBM order UI never writes vendas', !ordersUi.includes("from('vendas')") && ordersUi.includes("from('pedidos')"))
assert('JBM order has CAST + details', ordersUi.includes('portal.orders.cast') && ordersUi.includes('withOrderCast'))
assert('caixa stays POS only', navForBarRole('caixa').map(n => n.id).join() === 'pos')

console.log('\n== Checkout still never writes JBM vendas ==')
function mockSb() {
  const ops = []
  return {
    ops,
    from(table) {
      const api = {
        insert(row) {
          ops.push(['insert', table, row])
          const inserted = { ...(Array.isArray(row) ? {} : row), id: 'pos-sale-1' }
          api._inserted = inserted
          return api
        },
        select() { return api },
        async single() { return { data: api._inserted, error: null } },
        then(resolve) { resolve({ error: null }) },
        delete() { ops.push(['delete', table]); return api },
        update(row) { ops.push(['update', table, row]); return api },
        eq() { return { catch() { return Promise.resolve({}) } } },
      }
      return api
    },
  }
}
const sb = mockSb()
const sold = await commitPosSale(sb, {
  bar: { id: 'bar-1' },
  cart: [{ nome: 'Gin', qtd: 1, preco: 1200, preco_lista: 1200 }],
  spaceId: 'sp1',
  guestId: 'g1',
  visitId: 'v1',
  agentId: 'cast-1',
  obs: 'キープ Hibiki · アレルギーなし',
})
assert('POS sale ok with guest/space', sold.ok === true)
assert('inserts pos_vendas not vendas', sb.ops.some(o => o[0] === 'insert' && o[1] === 'pos_vendas') && !sb.ops.some(o => o[1] === 'vendas'))
assert('links visit to POS sale only', sb.ops.some(o => o[0] === 'update' && o[1] === 'bar_visits'))
const posInsert = sb.ops.find(o => o[0] === 'insert' && o[1] === 'pos_vendas')
assert('ticket keeps CAST + details', posInsert?.[2]?.drink_back_agent_id === 'cast-1' && posInsert?.[2]?.obs.includes('Hibiki'))

if (failed) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nCRM + floor customized for the bar — JBM supply ledgers untouched.\n')
