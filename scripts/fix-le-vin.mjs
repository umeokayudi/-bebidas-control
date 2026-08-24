#!/usr/bin/env node
/**
 * Corrige Le Vin com base na 請求書 #971 (PDF jul/2026).
 * Le Vin cobra 税込 — 単価 da fatura já inclui 10% consumo.
 * Uso: node scripts/fix-le-vin.mjs
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import invoice from './data/le-vin-invoice-971.json' with { type: 'json' }

const URL = 'https://ojirgkqtqvugqktyuhem.supabase.co'
const LE_VIN_ID = 'fa471fc2-62e5-4680-b50f-e11586861f17'
const TAX = 1.1

function loadKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY
  const env = readFileSync('.env.production', 'utf8')
  const m = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)
  if (m) return m[1].replace(/^["']|["']$/g, '')
  throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
}

function toZeibetsu(zeikomi) {
  return Math.round(+zeikomi / TAX)
}

async function matchProduct(sb, nome) {
  const { data } = await sb.from('produtos').select('id,nome,custo').ilike('nome', nome).eq('ativo', true).limit(5)
  if (!data?.length) return null
  return data.find(p => p.nome.toLowerCase() === nome.toLowerCase()) || data[0]
}

async function main() {
  const sb = createClient(URL, loadKey(), { auth: { autoRefreshToken: false, persistSession: false } })
  const today = new Date().toISOString().slice(0, 10)
  const overdue = today > invoice.vencimento

  const lines = invoice.produtos.map(p => ({
    ...p,
    zeibetsu: toZeibetsu(p.zeikomi),
    subtotal: p.qtd * p.zeikomi,
  }))
  const sumItens = lines.reduce((a, l) => a + l.subtotal, 0)

  console.log('\n🔧 Fix Le Vin — 請求書 #971 (税込)\n')
  console.log(`   Total fatura: ¥${invoice.total_zeikomi.toLocaleString('ja-JP')} 税込`)
  console.log(`   Soma itens:   ¥${sumItens.toLocaleString('ja-JP')}`)
  console.log(`   Vencimento: ${invoice.vencimento}${overdue ? ' ⚠️ ATRASADO' : ''}\n`)

  await sb.from('fornecedores').update({
    pagamento: 'Dia 10',
    notas: 'Pagamento todo dia 10 do mês. Preços Le Vin são 税込.',
  }).eq('id', LE_VIN_ID)

  const { data: compra } = await sb.from('compras').select('id').eq('fornecedor', 'Le Vin').eq('data', '2026-07-15').maybeSingle()
  if (!compra) throw new Error('Compra Le Vin jul/2026 não encontrada')

  await sb.from('compras_itens').delete().eq('compra_id', compra.id)
  await sb.from('compras_itens').insert(
    lines.map(l => ({
      compra_id: compra.id,
      nome: l.nome,
      qtd: l.qtd,
      custo_unitario: l.zeikomi,
    }))
  )

  await sb.from('compras').update({
    pagamento: 'Dia 10',
    subtotal: invoice.total_zeikomi,
    total_pago: invoice.total_zeikomi,
    total_real: invoice.total_zeikomi,
    status_pagamento: 'pendente',
    data_pagamento: invoice.vencimento,
    obs: `Le Vin 請求書 #${invoice.numero} — venc. ${invoice.vencimento}${overdue ? ' — ATRASADO' : ''} (¥${invoice.total_zeikomi.toLocaleString('ja-JP')} 税込)`,
  }).eq('id', compra.id)

  console.log('✅ Compra jul/2026 atualizada\n')
  console.log('Produto | Qtd | 税込/un | 税抜 ref.')
  console.log('---|---|---|---')

  let fpCount = 0
  for (const l of lines) {
    console.log(`${l.nome} | ${l.qtd} | ¥${l.zeikomi.toLocaleString('ja-JP')} | ¥${l.zeibetsu.toLocaleString('ja-JP')}`)
    const prod = await matchProduct(sb, l.nome)
    if (prod) {
      await sb.from('produtos').update({ custo: l.zeibetsu }).eq('id', prod.id)
      await sb.from('fornecedor_precos').upsert({
        fornecedor_id: LE_VIN_ID,
        produto_id: prod.id,
        preco: l.zeikomi,
        notas: `Le Vin #971 税込¥${l.zeikomi}`,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'fornecedor_id,produto_id' })
      fpCount++
    }
  }
  console.log(`\n✅ fornecedor_precos: ${fpCount} produtos (税込)\n`)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
