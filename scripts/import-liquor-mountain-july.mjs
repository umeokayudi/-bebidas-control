/**
 * Importa compras Liquor Mountain (jul/2026) + atualiza preços do fornecedor.
 * Uso: node scripts/import-liquor-mountain-july.mjs
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import {
  SUPPLIER_NAME,
  SUPPLIER_ID,
  PACK_SIZE,
  NEW_PRODUCTS,
  PURCHASES,
} from './data/liquor-mountain-july-2026.js'

const URL = 'https://ojirgkqtqvugqktyuhem.supabase.co'

function loadServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY
  try {
    const env = readFileSync('.env.production', 'utf8')
    const m = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)
    if (m) return m[1].replace(/^["']|["']$/g, '')
  } catch { /* ignore */ }
  throw new Error('SUPABASE_SERVICE_ROLE_KEY não encontrada')
}

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim()
}

function matchProduct(nome, produtos) {
  if (!nome) return null
  const n = norm(nome)
  const exact = produtos.find(p => norm(p.nome) === n)
  if (exact) return exact
  const partial = produtos.find(p => norm(p.nome).includes(n) || n.includes(norm(p.nome)))
  if (partial) return partial
  const first = n.split(/\s+/)[0]
  return produtos.find(p => norm(p.nome).includes(first)) || null
}

function expandLine(item) {
  const pack = PACK_SIZE[item.produto] || 1
  if (item.isCase && pack > 1) {
    const unitCost = Math.round(item.unitPrice / pack)
    return {
      nome: item.produto,
      qtd: item.qtd * pack,
      custo_unitario: unitCost,
      nota: `${item.qtd} cs × ¥${item.unitPrice}`,
    }
  }
  return {
    nome: item.produto,
    qtd: item.qtd,
    custo_unitario: item.unitPrice,
    nota: null,
  }
}

async function ensureProducts(sb) {
  const { data: produtos, error } = await sb.from('produtos').select('id,nome,custo,categoria,ativo')
  if (error) throw error

  const list = produtos || []
  const byName = new Map(list.map(p => [norm(p.nome), p]))

  for (const np of NEW_PRODUCTS) {
    if (byName.has(norm(np.nome))) continue
    const { data: created, error: insErr } = await sb.from('produtos').insert({
      nome: np.nome,
      categoria: np.categoria,
      custo: np.custo,
      preco_venda: 0,
      ativo: true,
    }).select().single()
    if (insErr) throw new Error(`produto ${np.nome}: ${insErr.message}`)
    list.push(created)
    byName.set(norm(np.nome), created)
    console.log(`  + produto: ${np.nome}`)
  }

  return list
}

async function ensureSupplier(sb) {
  const { error } = await sb.from('fornecedores').update({
    nome: SUPPLIER_NAME,
    telefone: '03-5770-6330',
    pagamento: 'Card',
    notas: 'リカーマウンテン 六本木DS店 — compras registradas jul/2026',
  }).eq('id', SUPPLIER_ID)
  if (error) throw new Error(`fornecedor: ${error.message}`)
}

async function purchaseExists(sb, slip) {
  const { data } = await sb.from('compras')
    .select('id')
    .ilike('obs', `%${slip}%`)
    .limit(1)
  return (data || []).length > 0
}

async function importPurchases(sb, produtos) {
  const report = { inserted: 0, skipped: 0, itens: 0, total: 0 }
  const latestPrice = new Map()

  for (const purchase of PURCHASES) {
    if (await purchaseExists(sb, purchase.slip)) {
      console.log(`⏭  ${purchase.date} #${purchase.slip} — já existe`)
      report.skipped++
      continue
    }

    const lines = purchase.items.map(expandLine)
    const subtotal = lines.reduce((a, l) => a + l.qtd * l.custo_unitario, 0)

    const { data: compra, error } = await sb.from('compras').insert({
      data: purchase.date,
      fornecedor: SUPPLIER_NAME,
      pagamento: 'Card',
      subtotal,
      desconto_pontos: 0,
      total_pago: purchase.total,
      total_real: purchase.total,
      pontos_ganhos: 0,
      status_pagamento: 'pago',
      obs: `Liquor Mountain 納品書 #${purchase.slip} — jul/2026`,
    }).select().single()

    if (error) throw new Error(`compra ${purchase.slip}: ${error.message}`)

    const itensRows = lines.map(l => {
      const prod = matchProduct(l.nome, produtos)
      latestPrice.set(l.nome, { custo: l.custo_unitario, date: purchase.date, produto_id: prod?.id })
      return {
        compra_id: compra.id,
        nome: l.nome,
        qtd: l.qtd,
        custo_unitario: l.custo_unitario,
      }
    })

    const { error: itErr } = await sb.from('compras_itens').insert(itensRows)
    if (itErr) throw new Error(`itens ${purchase.slip}: ${itErr.message}`)

    console.log(`✅ ${purchase.date} #${purchase.slip} — ¥${purchase.total.toLocaleString('ja-JP')} (${lines.length} itens)`)
    report.inserted++
    report.itens += lines.length
    report.total += purchase.total
  }

  return { report, latestPrice }
}

async function updatePrices(sb, latestPrice, produtos) {
  let produtosUp = 0
  let fornPrecos = 0

  for (const [nome, { custo, produto_id }] of latestPrice) {
    const prod = produto_id
      ? produtos.find(p => p.id === produto_id)
      : matchProduct(nome, produtos)
    if (!prod) {
      console.log(`  ⚠ sem match: ${nome}`)
      continue
    }

    await sb.from('produtos').update({ custo }).eq('id', prod.id)
    produtosUp++

    await sb.from('fornecedor_precos').upsert({
      fornecedor_id: SUPPLIER_ID,
      produto_id: prod.id,
      preco: custo,
      notas: 'Liquor Mountain jul/2026',
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'fornecedor_id,produto_id' })
    fornPrecos++
  }

  return { produtosUp, fornPrecos }
}

async function main() {
  const key = loadServiceKey()
  const sb = createClient(URL, key, { auth: { autoRefreshToken: false, persistSession: false } })

  console.log('\n🍶 Liquor Mountain — import jul/2026\n')

  await ensureSupplier(sb)
  const produtos = await ensureProducts(sb)
  const { report, latestPrice } = await importPurchases(sb, produtos)
  const prices = await updatePrices(sb, latestPrice, produtos)

  console.log('\n── Resumo ──')
  console.log(`  Compras novas:  ${report.inserted}`)
  console.log(`  Já existiam:    ${report.skipped}`)
  console.log(`  Itens:          ${report.itens}`)
  console.log(`  Total importado: ¥${report.total.toLocaleString('ja-JP')}`)
  console.log(`  Produtos custo: ${prices.produtosUp}`)
  console.log(`  Preços fornec.: ${prices.fornPrecos}`)

  console.log('\n── Preços Liquor Mountain (jul/2026) ──')
  const sorted = [...latestPrice.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [nome, { custo }] of sorted) {
    console.log(`  ${nome.padEnd(28)} ¥${custo.toLocaleString('ja-JP')}`)
  }
  console.log('')
}

main().catch(e => {
  console.error('\n❌', e.message, '\n')
  process.exit(1)
})
