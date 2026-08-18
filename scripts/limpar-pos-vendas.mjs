/**
 * Remove vendas importadas do POS (Balcão/Square) do sistema fornecedor.
 * Uso: SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/limpar-pos-vendas.mjs
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL || 'https://ojirgkqtqvugqktyuhem.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KEY) { console.error('❌ Falta SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const admin = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

function isPos(v) {
  if (v.origem === 'pos') return true
  const obs = (v.obs || '').toLowerCase()
  return obs.includes('balcão') || obs.includes('balcao') || obs.includes('square') || obs.includes('pos') || !!v.cast_id
}

async function main() {
  const { data: vendas } = await admin.from('vendas').select('id,obs,origem,cast_id,total,data')
  const pos = (vendas || []).filter(isPos)
  console.log('POS encontradas:', pos.length)
  for (const v of pos) {
    await admin.from('vendas_itens').delete().eq('venda_id', v.id)
    await admin.from('vendas').delete().eq('id', v.id)
    console.log(' 🗑', v.data, '¥' + v.total, v.obs || v.origem)
  }
  // Marcar restantes como fornecedor
  await admin.from('vendas').update({ origem: 'fornecedor' }).is('origem', null)
  console.log('✅ Sistema fornecedor limpo')
}

main().catch(e => { console.error(e); process.exit(1) })
