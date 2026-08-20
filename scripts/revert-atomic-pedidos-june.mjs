#!/usr/bin/env node
/**
 * Reverte pedidos Atomic movidos erroneamente de junho para julho.
 *
 * Uso:
 *   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/revert-atomic-pedidos-june.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { revertAtomicPedidosToJune, ATOMIC_BAR_ID } from '../api/_atomicJuneFix.js'

const URL = process.env.VITE_SUPABASE_URL || 'https://ojirgkqtqvugqktyuhem.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY required')
  console.error('   https://supabase.com/dashboard/project/ojirgkqtqvugqktyuhem/settings/api')
  process.exit(1)
}

const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

async function main() {
  console.log('\n↩️  Revertendo pedidos Atomic jun→jul...\n')
  const r = await revertAtomicPedidosToJune(sb)
  console.log('✅ Pedidos revertidos:', r.reverted)
  console.log('✅ Total estimado:', '¥' + Math.round(r.totalEstimado).toLocaleString('ja-JP'))
  console.log('   Bar:', ATOMIC_BAR_ID)
  if (r.ids.length) console.log('   IDs:', r.ids.slice(0, 5).join(', '), r.ids.length > 5 ? `...+${r.ids.length - 5}` : '')
  console.log('\n   Julho fica limpo para novos pedidos.\n')
}

main().catch(e => {
  console.error('\n❌', e.message, '\n')
  process.exit(1)
})
