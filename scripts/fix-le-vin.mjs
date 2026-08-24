#!/usr/bin/env node
/**
 * Corrige Le Vin: preços da 請求書 jul/2026, vencimento dia 10, status atrasado.
 * Uso: node scripts/fix-le-vin.mjs
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const URL = 'https://ojirgkqtqvugqktyuhem.supabase.co'
const LE_VIN_ID = 'fa471fc2-62e5-4680-b50f-e11586861f17'

/** Preços 税込 da 請求書 Le Vin jul/2026 (Grey Goose corrigido — não ¥472) */
const INVOICE_ITEMS = [
  { nome: 'Cuervo 1800 Añejo', qtd: 12, zeikomi: 7873 },
  { nome: 'Dom Perignon Brut', qtd: 1, zeikomi: 25194 },
  { nome: 'Grey Goose', qtd: 9, zeikomi: 5280 },
  { nome: 'Hennessy V.S', qtd: 24, zeikomi: 4042 },
  { nome: 'Krug Brut', qtd: 1, zeikomi: 31508 },
  { nome: 'Moet Brut', qtd: 12, zeikomi: 5774 },
  { nome: 'Moet NIR', qtd: 7, zeikomi: 8398 },
  { nome: 'Moet Rosé', qtd: 17, zeikomi: 6823 },
  { nome: 'Veuve Clicquot Brut', qtd: 18, zeikomi: 6823 },
  { nome: 'Veuve Clicquot Rose', qtd: 19, zeikomi: 7873 },
]

const DUE_DATE = '2026-08-10' // dia 10 do mês seguinte à fatura jul/2026

function loadKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY
  const env = readFileSync('.env.production', 'utf8')
  const m = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)
  if (m) return m[1].replace(/^["']|["']$/g, '')
  throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
}

function invoiceTotal() {
  return INVOICE_ITEMS.reduce((a, it) => a + it.qtd * it.zeikomi, 0)
}

async function matchProduct(sb, nome) {
  const { data } = await sb.from('produtos').select('id,nome,custo').ilike('nome', nome).eq('ativo', true).limit(5)
  if (!data?.length) return null
  return data.find(p => p.nome.toLowerCase() === nome.toLowerCase()) || data[0]
}

async function main() {
  const sb = createClient(URL, loadKey(), { auth: { autoRefreshToken: false, persistSession: false } })
  const total = invoiceTotal()
  const today = new Date().toISOString().slice(0, 10)
  const overdue = today > DUE_DATE

  console.log('\n🔧 Fix Le Vin — 請求書 jul/2026\n')
  console.log(`   Total itens: ¥${total.toLocaleString('ja-JP')}`)
  console.log(`   Vencimento: ${DUE_DATE}${overdue ? ' ⚠️ ATRASADO' : ''}\n`)

  await sb.from('fornecedores').update({
    pagamento: 'Dia 10',
    notas: 'Pagamento todo dia 10 do mês (vencimento da fatura anterior)',
  }).eq('id', LE_VIN_ID)
  console.log('✅ Fornecedor → pagamento "Dia 10"')

  const { data: compra } = await sb.from('compras').select('id').eq('fornecedor', 'Le Vin').eq('data', '2026-07-15').maybeSingle()
  if (!compra) throw new Error('Compra Le Vin jul/2026 não encontrada')

  await sb.from('compras_itens').delete().eq('compra_id', compra.id)
  await sb.from('compras_itens').insert(
    INVOICE_ITEMS.map(it => ({
      compra_id: compra.id,
      nome: it.nome,
      qtd: it.qtd,
      custo_unitario: it.zeikomi,
    }))
  )

  await sb.from('compras').update({
    pagamento: 'Dia 10',
    subtotal: total,
    total_pago: total,
    total_real: total,
    status_pagamento: 'pendente',
    data_pagamento: DUE_DATE,
    obs: `Le Vin 請求書 jul/2026 — venc. ${DUE_DATE}${overdue ? ' — ATRASADO' : ''} (¥${total.toLocaleString('ja-JP')})`,
  }).eq('id', compra.id)
  console.log(`✅ Compra jul/15 atualizada — ¥${total.toLocaleString('ja-JP')}`)

  let fpCount = 0
  for (const it of INVOICE_ITEMS) {
    const prod = await matchProduct(sb, it.nome)
    if (!prod) { console.log(`⏭  Produto não encontrado: ${it.nome}`); continue }
    await sb.from('fornecedor_precos').upsert({
      fornecedor_id: LE_VIN_ID,
      produto_id: prod.id,
      preco: it.zeikomi,
      notas: `Le Vin 請求書 jul/2026 税込`,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'fornecedor_id,produto_id' })
    fpCount++
  }
  console.log(`✅ fornecedor_precos Le Vin: ${fpCount} produtos`)
  console.log('')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
