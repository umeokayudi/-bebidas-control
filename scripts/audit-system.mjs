#!/usr/bin/env node
/**
 * Auditoria rápida do sistema JBM Drinks (terminal)
 * Uso: SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/audit-system.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { isSupplierVenda } from './lib/supplierVenda.mjs'

const URL = process.env.VITE_SUPABASE_URL || 'https://ojirgkqtqvugqktyuhem.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}

const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

async function main() {
  console.log('\n📋 JBM Drinks — System audit\n')

  const checks = []

  const { data: bars } = await sb.from('bars').select('id,nome')
  checks.push({ name: 'Bars', ok: (bars?.length || 0) > 0, detail: `${bars?.length || 0} bars` })

  const { data: produtos } = await sb.from('produtos').select('id', { count: 'exact' }).eq('ativo', true)
  checks.push({ name: 'Active products', ok: true, detail: `${produtos?.length ?? '?'} supplier catalog` })

  const { data: perfis } = await sb.from('perfis').select('role,bar_id,email')
  const admins = (perfis || []).filter(p => p.role === 'admin').length
  const clientes = (perfis || []).filter(p => p.role === 'cliente').length
  checks.push({ name: 'Users', ok: admins > 0, detail: `${admins} admin, ${clientes} client(s)` })

  const barId = bars?.find(b => /atomic/i.test(b.nome))?.id || bars?.[0]?.id
  if (barId) {
    const { data: vendas } = await sb.from('vendas').select('total,obs,cast_id').eq('bar_id', barId)
    const supplier = (vendas || []).filter(isSupplierVenda)
    const pos = (vendas || []).length - supplier.length
    checks.push({ name: 'Supplier vs POS sales', ok: pos === 0, detail: `${supplier.length} supplier, ${pos} POS (should be 0)` })

    const { count: bpCount } = await sb.from('bar_pricing').select('*', { count: 'exact', head: true }).eq('bar_id', barId)
    checks.push({ name: 'Bar POS pricing', ok: (bpCount || 0) >= 10, detail: `${bpCount || 0} products with POS drink prices` })

    const { data: vendasIds } = await sb.from('vendas').select('id').eq('bar_id', barId)
    const ids = (vendasIds || []).map(v => v.id)
    let missingPricing = 0
    if (ids.length) {
      const { data: itens } = await sb.from('vendas_itens').select('produto_id').in('venda_id', ids)
      const { data: bp } = await sb.from('bar_pricing').select('produto_id,drinks_por_garrafa,preco_drink').eq('bar_id', barId)
      const okIds = new Set((bp || []).filter(r => r.preco_drink > 0 && r.drinks_por_garrafa > 0).map(r => r.produto_id))
      const purchased = new Set((itens || []).map(i => i.produto_id).filter(Boolean))
      missingPricing = [...purchased].filter(id => !okIds.has(id)).length
    }
    checks.push({ name: 'Purchased SKUs with POS price', ok: missingPricing === 0, detail: missingPricing ? `${missingPricing} missing` : 'all purchased SKUs priced' })

    const { count: fatCount } = await sb.from('faturas').select('*', { count: 'exact', head: true }).eq('bar_id', barId)
    checks.push({ name: 'Atomic invoices', ok: (fatCount || 0) > 0, detail: `${fatCount || 0} invoice(s)` })
  }

  try {
    const res = await fetch('https://bebidas-control.vercel.app/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }] }),
    })
    const body = await res.json()
    checks.push({
      name: 'Gemini API (production)',
      ok: !body.error,
      detail: body.error ? body.error.slice(0, 80) : 'OK',
    })
  } catch (e) {
    checks.push({ name: 'Gemini API (production)', ok: false, detail: e.message })
  }

  for (const c of checks) {
    console.log(`${c.ok ? '✅' : '❌'} ${c.name}: ${c.detail}`)
  }

  const failed = checks.filter(c => !c.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`)
  if (failed.length) {
    console.log('\nPending fixes:')
    failed.forEach(c => console.log(`  - ${c.name}`))
  }
  console.log('')
}

main().catch(e => { console.error(e); process.exit(1) })
