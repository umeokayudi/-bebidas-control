#!/usr/bin/env node
import { applyFilters, applyQuery } from '../api/_barLiveStore.js'

let failed = 0
function assert(name, cond, extra) {
  if (cond) console.log('  ok  ', name)
  else { failed++; console.log('  FAIL', name, extra || '') }
}

console.log('\n== Live store never uses JBM ledgers ==')
const storeSrc = await import('node:fs').then(fs => fs.readFileSync(new URL('../api/_barLiveStore.js', import.meta.url), 'utf8'))
assert('no vendas writes', !/from\('vendas'\)/.test(storeSrc))
assert('no pedidos writes', !/from\('pedidos'\)/.test(storeSrc))
assert('no faturas writes', !/from\('faturas'\)/.test(storeSrc))
assert('seeds POS and staff lane logins', storeSrc.includes('pos@atomic.bar') && storeSrc.includes('funcionario@atomic.bar'))
assert('HQ overhead tables exist', storeSrc.includes("'bar_overhead'") && storeSrc.includes("'bar_hq_meta'") && storeSrc.includes("'bar_sundry'"))
assert('night close live tables exist', storeSrc.includes("'pos_shifts'") && storeSrc.includes("'pos_settings'"))

console.log('\n== Query filters ==')
const rows = [
  { id: '1', bar_id: 'b', total: 10, guest_id: 'g1', drink_back_agent_id: null, criado_em: '2026-09-17T01:00:00Z' },
  { id: '2', bar_id: 'b', total: 20, guest_id: 'g2', drink_back_agent_id: 'a1', criado_em: '2026-09-18T01:00:00Z' },
  { id: '3', bar_id: 'x', total: 99, guest_id: 'g1', drink_back_agent_id: 'a1', criado_em: '2026-09-18T02:00:00Z' },
]
assert('eq bar', applyFilters(rows, [{ op: 'eq', k: 'bar_id', v: 'b' }]).length === 2)
assert('in guests', applyFilters(rows, [{ op: 'in', k: 'guest_id', v: ['g1'] }]).map(r => r.id).join() === '1,3')
assert('not is null', applyFilters(rows, [{ op: 'not', k: 'drink_back_agent_id', sub: 'is', v: null }]).every(r => r.drink_back_agent_id))

const nested = applyQuery(rows, {
  columns: 'id,total,bar_guests(nome)',
  filters: [{ op: 'eq', k: 'id', v: '1' }],
  wantSingle: true,
}, { bar_guests: [{ id: 'g1', nome: 'Kenji' }] })
assert('nested guest name', nested.data?.bar_guests?.nome === 'Kenji' && nested.data.total === 10)

const ordered = applyQuery(rows, {
  columns: 'id',
  filters: [{ op: 'eq', k: 'bar_id', v: 'b' }],
  orderBy: { k: 'criado_em', ascending: false },
})
assert('order desc', ordered.data.map(r => r.id).join() === '2,1')

if (failed) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nLive POS store keeps JBM ledgers untouched.\n')
