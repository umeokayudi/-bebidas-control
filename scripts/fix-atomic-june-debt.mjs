#!/usr/bin/env node
/**
 * Corrige dívida Atomic jun/2026 → ¥465.000 e limpa vendas erradas de junho.
 * Pedidos de junho voltam para julho (pendente) para você relançar.
 *
 * Uso:
 *   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/fix-atomic-june-debt.mjs
 *   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/fix-atomic-june-debt.mjs 500000
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL || 'https://ojirgkqtqvugqktyuhem.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BAR_ID = 'b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9'
const JUNE_DEBT = Number(process.argv[2] || process.env.ATOMIC_JUNE_DEBT || 465000)

if (!KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY required')
  console.error('   https://supabase.com/dashboard/project/ojirgkqtqvugqktyuhem/settings/api')
  process.exit(1)
}

const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

function yen(n) {
  return '¥' + Math.round(n).toLocaleString('ja-JP')
}

export async function fixAtomicJuneDebt(debt = JUNE_DEBT) {
  const report = { debt, deletedVendas: 0, movedPedidos: 0, faturaId: null }

  const { data: vendas, error: vErr } = await sb
    .from('vendas')
    .select('id,total,data,obs')
    .eq('bar_id', BAR_ID)
    .gte('data', '2026-06-01')
    .lte('data', '2026-06-30')

  if (vErr) throw new Error(vErr.message)

  const vendaIds = (vendas || []).map(v => v.id)
  const oldVendasTotal = (vendas || []).reduce((a, v) => a + (+v.total || 0), 0)

  if (vendaIds.length) {
    const { error: viErr } = await sb.from('vendas_itens').delete().in('venda_id', vendaIds)
    if (viErr) throw new Error('vendas_itens: ' + viErr.message)

    const { error: delErr } = await sb.from('vendas').delete().in('id', vendaIds)
    if (delErr) throw new Error('vendas: ' + delErr.message)
    report.deletedVendas = vendaIds.length
  }

  const { data: pedidos, error: pErr } = await sb
    .from('pedidos')
    .select('id,data_pedido,status')
    .eq('bar_id', BAR_ID)
    .gte('data_pedido', '2026-06-01')
    .lte('data_pedido', '2026-06-30')

  if (pErr) throw new Error(pErr.message)

  for (const p of pedidos || []) {
    const { error } = await sb.from('pedidos').update({
      data_pedido: '2026-07-01',
      data_entrega_prevista: '2026-07-01',
      status: 'pendente',
      obs: ((p.obs || '') + ' [movido de jun→jul 2026]').trim(),
    }).eq('id', p.id)
    if (error) throw new Error('pedido ' + p.id + ': ' + error.message)
    report.movedPedidos++
  }

  const { data: faturas } = await sb
    .from('faturas')
    .select('id,valor,total,pago,status,periodo_inicio,periodo_fim')
    .eq('bar_id', BAR_ID)
    .gte('periodo_inicio', '2026-06-01')
    .lte('periodo_fim', '2026-06-30')

  const faturaPatch = {
    bar_id: BAR_ID,
    valor: debt,
    total: debt,
    pago: 0,
    status: 'pendente',
    data_emissao: '2026-06-30',
    data_vencimento: '2026-07-31',
    periodo_inicio: '2026-06-01',
    periodo_fim: '2026-06-30',
    obs: 'Fatura jun/2026 — dívida consolidada Atomic (¥465.000)',
  }

  if (faturas?.length) {
    const { data, error } = await sb.from('faturas').update(faturaPatch).eq('id', faturas[0].id).select('id').single()
    if (error) throw new Error('fatura update: ' + error.message)
    report.faturaId = data.id
    if (faturas.length > 1) {
      const extra = faturas.slice(1).map(f => f.id)
      await sb.from('faturas').delete().in('id', extra)
    }
  } else {
    const { data, error } = await sb.from('faturas').insert(faturaPatch).select('id').single()
    if (error) throw new Error('fatura insert: ' + error.message)
    report.faturaId = data.id
  }

  report.oldVendasTotal = oldVendasTotal
  return report
}

async function main() {
  console.log('\n🔧 Atomic jun/2026 → dívida', yen(JUNE_DEBT), '\n')
  const r = await fixAtomicJuneDebt(JUNE_DEBT)
  console.log('✅ Vendas jun removidas:', r.deletedVendas, `(eram ${yen(r.oldVendasTotal)})`)
  console.log('✅ Pedidos movidos jun→jul:', r.movedPedidos)
  console.log('✅ Fatura jun/2026:', yen(JUNE_DEBT), 'id', r.faturaId)
  console.log('\n🔗 A receber agora deve ser', yen(JUNE_DEBT))
  console.log('   Julho está limpo para você lançar as novas vendas.\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => {
    console.error('\n❌', e.message, '\n')
    process.exit(1)
  })
}
