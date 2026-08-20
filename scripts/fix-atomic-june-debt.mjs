#!/usr/bin/env node
/**
 * Corrige dívida Atomic: maio ¥165k + jun ¥150k + jul ¥150k = ¥465k.
 * Remove vendas erradas de junho. Pedidos de junho permanecem em junho.
 *
 * Uso:
 *   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/fix-atomic-june-debt.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { fixAtomicReceivables, ATOMIC_FATURAS } from '../api/_atomicJuneFix.js'

const URL = process.env.VITE_SUPABASE_URL || 'https://ojirgkqtqvugqktyuhem.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY required')
  console.error('   https://supabase.com/dashboard/project/ojirgkqtqvugqktyuhem/settings/api')
  process.exit(1)
}

const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

function yen(n) {
  return '¥' + Math.round(n).toLocaleString('ja-JP')
}

async function main() {
  const debt = ATOMIC_FATURAS.reduce((a, f) => a + f.valor, 0)
  console.log('\n🔧 Atomic a receber →', yen(debt), '\n')
  const r = await fixAtomicReceivables(sb)
  console.log('✅ Vendas jun removidas:', r.deletedVendas, `(eram ${yen(r.oldVendasTotal)})`)
  console.log('✅ Faturas criadas:', r.faturaIds.length, '→', yen(r.debt))
  console.log('\n🔗 A receber:', yen(r.debt))
  console.log('   Pedidos de junho permanecem em junho.\n')
}

main().catch(e => {
  console.error('\n❌', e.message, '\n')
  process.exit(1)
})
