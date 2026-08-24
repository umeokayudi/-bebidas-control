/**
 * Finaliza jul/2026: Costco cash, Amazon ¥2k, pedido 31/07 → venda.
 * Uso: node scripts/finalize-july-2026.mjs
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { ATOMIC_BAR_ID } from '../api/_atomicJuneFix.js'

const URL = 'https://ojirgkqtqvugqktyuhem.supabase.co'
const PEDIDO_31 = 'fab78350-386f-4600-9123-0375f2358a87'
const AMAZON_TOTAL = 2000

function loadServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY
  const env = readFileSync('.env.production', 'utf8')
  const m = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)
  if (m) return m[1].replace(/^["']|["']$/g, '')
  throw new Error('SUPABASE_SERVICE_ROLE_KEY não encontrada')
}

async function ensureAmazon(sb) {
  const { data: existing } = await sb.from('fornecedores').select('id').ilike('nome', 'amazon').limit(1)
  if (existing?.length) return existing[0].id
  const { data, error } = await sb.from('fornecedores').insert({
    nome: 'Amazon',
    pagamento: 'Cash',
    ativo: true,
    notas: 'Compras online — bar Atomic',
  }).select('id').single()
  if (error) throw error
  return data.id
}

async function main() {
  const sb = createClient(URL, loadServiceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('\n📦 Finalizando jul/2026\n')

  // 1. Costco → Cash
  const { data: costco } = await sb.from('compras')
    .select('id,data,total_real')
    .eq('fornecedor', 'Costco')
    .gte('data', '2026-07-01')
    .lte('data', '2026-07-31')

  for (const c of costco || []) {
    await sb.from('compras').update({
      pagamento: 'Cash',
      status_pagamento: 'pago',
      data_pagamento: c.data,
      obs: `Costco — bar Atomic jul/2026 (pago em dinheiro)`,
    }).eq('id', c.id)
    console.log(`  ✅ Costco ${c.data} ¥${(+c.total_real).toLocaleString('ja-JP')} → Cash`)
  }

  // 2. Amazon ¥2.000
  const { data: amzExists } = await sb.from('compras')
    .select('id')
    .eq('fornecedor', 'Amazon')
    .eq('data', '2026-07-31')
    .eq('total_real', AMAZON_TOTAL)
    .limit(1)

  if (!amzExists?.length) {
    await ensureAmazon(sb)
    const { data: compra, error } = await sb.from('compras').insert({
      data: '2026-07-31',
      fornecedor: 'Amazon',
      pagamento: 'Cash',
      subtotal: AMAZON_TOTAL,
      total_pago: AMAZON_TOTAL,
      total_real: AMAZON_TOTAL,
      desconto_pontos: 0,
      pontos_ganhos: 0,
      status_pagamento: 'pago',
      data_pagamento: '2026-07-31',
      obs: 'Amazon — bar Atomic jul/2026 (pago em dinheiro) · detalhar com nota',
    }).select().single()
    if (error) throw error
    await sb.from('compras_itens').insert({
      compra_id: compra.id,
      nome: 'Amazon (Atomic) — detalhar',
      qtd: 1,
      custo_unitario: AMAZON_TOTAL,
    })
    console.log(`  ✅ Amazon 31/07 ¥${AMAZON_TOTAL.toLocaleString('ja-JP')} → Cash`)
  } else {
    console.log('  ⏭ Amazon 31/07 já existe')
  }

  // 3. Pedido 31/07 → entregue + venda
  const { data: pedido, error: pErr } = await sb.from('pedidos')
    .select('*, pedidos_itens(*)')
    .eq('id', PEDIDO_31)
    .single()
  if (pErr || !pedido) throw new Error('Pedido 31/07 não encontrado')

  const total = (pedido.pedidos_itens || []).reduce((a, it) => a + it.qtd * it.preco_unitario, 0)
  const saleDate = '2026-07-31'

  await sb.from('pedidos').update({
    status: 'entregue',
    data_pedido: saleDate,
    data_entrega_prevista: saleDate,
    total_estimado: total,
    obs: 'Costco jul/2026 — entrega bar Atomic',
  }).eq('id', PEDIDO_31)

  const key = PEDIDO_31.slice(0, 8)
  const { data: existingVenda } = await sb.from('vendas')
    .select('id')
    .ilike('obs', `%${key}%`)
    .limit(1)

  let vendaId
  if (existingVenda?.length) {
    vendaId = existingVenda[0].id
    await sb.from('vendas').update({ data: saleDate, data_venda: saleDate, total }).eq('id', vendaId)
    await sb.from('vendas_itens').delete().eq('venda_id', vendaId)
  } else {
    const { data: venda, error: vErr } = await sb.from('vendas').insert({
      data: saleDate,
      data_venda: saleDate,
      bar_id: ATOMIC_BAR_ID,
      total,
      obs: `Auto: order ${key}`,
      criado_por: pedido.criado_por,
    }).select().single()
    if (vErr) throw vErr
    vendaId = venda.id
  }

  await sb.from('vendas_itens').insert(
    (pedido.pedidos_itens || []).map(it => ({
      venda_id: vendaId,
      produto_id: it.produto_id,
      qtd: it.qtd,
      preco_unitario: it.preco_unitario,
    }))
  )

  console.log(`  ✅ Pedido 31/07 → entregue · venda ¥${total.toLocaleString('ja-JP')}`)

  // 4. Resumo
  const { data: vendas } = await sb.from('vendas')
    .select('data,total')
    .eq('bar_id', ATOMIC_BAR_ID)
    .gte('data', '2026-07-01')
    .lte('data', '2026-07-31')
    .order('data')

  const fat = (vendas || []).reduce((a, v) => a + (+v.total || 0), 0)
  const { data: compras } = await sb.from('compras')
    .select('fornecedor,total_real')
    .gte('data', '2026-07-01')
    .lte('data', '2026-07-31')

  const byF = {}
  for (const c of compras || []) {
    byF[c.fornecedor] = (byF[c.fornecedor] || 0) + (+c.total_real || 0)
  }

  console.log('\n══ RESUMO JULHO/2026 ══')
  console.log(`Vendas: ${vendas?.length} · Faturamento ¥${fat.toLocaleString('ja-JP')}`)
  for (const [f, v] of Object.entries(byF).sort()) {
    console.log(`  ${f}: ¥${v.toLocaleString('ja-JP')}`)
  }
  console.log(`  TOTAL compras: ¥${Object.values(byF).reduce((a, b) => a + b, 0).toLocaleString('ja-JP')}`)
  console.log('')
}

main().catch(e => {
  console.error('\n❌', e.message, '\n')
  process.exit(1)
})
