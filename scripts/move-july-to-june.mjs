/**
 * Move compras JBM marcadas em julho para junho (correção de datas).
 * Uso: SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/move-july-to-june.mjs [bar_id] [fromMonth] [toDate]
 * Exemplo: node scripts/move-july-to-june.mjs b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9 2026-07 2026-06-14
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL || 'https://ojirgkqtqvugqktyuhem.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}

const admin = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const barId = process.argv[2] || 'b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9'
const fromMonth = process.argv[3] || '2026-07'
const targetDate = process.argv[4] || '2026-06-14'
const fromStart = `${fromMonth}-01`
const fromEnd = `${fromMonth}-31`

async function main() {
  console.log(`\n📅 Move ${fromMonth} → ${targetDate.slice(0, 7)} (bar ${barId.slice(0, 8)}…)\n`)

  const { data: vendas, error: vErr } = await admin
    .from('vendas')
    .select('id,data,total,obs')
    .eq('bar_id', barId)
    .gte('data', fromStart)
    .lte('data', fromEnd)

  if (vErr) throw new Error(vErr.message)

  const { data: pedidos, error: pErr } = await admin
    .from('pedidos')
    .select('id,data_pedido,data_entrega_prevista,total_estimado')
    .eq('bar_id', barId)
    .gte('data_pedido', fromStart)
    .lte('data_pedido', fromEnd)

  if (pErr) throw new Error(pErr.message)

  console.log(`Found: ${vendas?.length || 0} vendas, ${pedidos?.length || 0} pedidos in ${fromMonth}`)
  if (!vendas?.length && !pedidos?.length) {
    console.log('Nothing to update.')
    return
  }

  let vOk = 0
  for (const v of vendas || []) {
    const { error } = await admin.from('vendas').update({ data: targetDate }).eq('id', v.id)
    if (error) console.log('⚠️  venda', v.id, error.message)
    else {
      vOk++
      console.log(`✅ venda ${v.data} → ${targetDate}  ${v.total}  ${(v.obs || '').slice(0, 40)}`)
    }
  }

  let pOk = 0
  for (const p of pedidos || []) {
    const patch = { data_pedido: targetDate }
    if (p.data_entrega_prevista?.startsWith(fromMonth)) {
      patch.data_entrega_prevista = targetDate
    }
    const { error } = await admin.from('pedidos').update(patch).eq('id', p.id)
    if (error) console.log('⚠️  pedido', p.id, error.message)
    else {
      pOk++
      console.log(`✅ pedido ${p.data_pedido} → ${targetDate}  ${p.total_estimado}`)
    }
  }

  const targetMonth = targetDate.slice(0, 7)
  const { data: checkV } = await admin
    .from('vendas')
    .select('total,data')
    .eq('bar_id', barId)
    .gte('data', `${targetMonth}-01`)
    .lte('data', `${targetMonth}-31`)

  const { data: checkJul } = await admin
    .from('vendas')
    .select('id')
    .eq('bar_id', barId)
    .gte('data', fromStart)
    .lte('data', fromEnd)

  const mesTotal = (checkV || []).reduce((a, v) => a + (+v.total || 0), 0)
  console.log(`\n✅ Updated ${vOk} vendas, ${pOk} pedidos`)
  console.log(`   ${targetMonth} total now: ¥${mesTotal.toLocaleString('ja-JP')} (${checkV?.length} entregas)`)
  console.log(`   Remaining in ${fromMonth}: ${checkJul?.length || 0}\n`)
}

main().catch(e => {
  console.error('\n❌', e.message, '\n')
  process.exit(1)
})
