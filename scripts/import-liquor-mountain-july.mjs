/**
 * Importa compras Liquor Mountain (jul/2026) + atualiza preços do fornecedor.
 * Preços da nota = 税抜 → sistema grava 税込 (+10%).
 * Uso: node scripts/import-liquor-mountain-july.mjs [--force]
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
import { toZeikomi, buildSupplierPriceNotas } from './lib/consumptionTax.mjs'

const URL = 'https://ojirgkqtqvugqktyuhem.supabase.co'
const FORCE = process.argv.includes('--force')

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

/** zeibetsu por unidade do catálogo */
function expandLineZeibetsu(item) {
  const pack = PACK_SIZE[item.produto] || 1
  if (item.isCase && pack > 1) {
    return {
      nome: item.produto,
      qtd: item.qtd * pack,
      zeibetsu: Math.round(item.unitPrice / pack),
    }
  }
  return { nome: item.produto, qtd: item.qtd, zeibetsu: item.unitPrice }
}

/** Histórico de preços 税抜 por produto ao longo de julho */
function buildZeibetsuHistory() {
  const history = new Map()
  for (const purchase of PURCHASES) {
    for (const item of purchase.items) {
      const line = expandLineZeibetsu(item)
      const entry = history.get(line.nome) || { first: line.zeibetsu, last: line.zeibetsu }
      if (!history.has(line.nome)) entry.first = line.zeibetsu
      entry.last = line.zeibetsu
      history.set(line.nome, entry)
    }
  }
  return history
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
      custo: toZeikomi(np.custo),
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
    notas: 'リカーマウンテン 六本木DS店 — preços 税込 (+10%)',
  }).eq('id', SUPPLIER_ID)
  if (error) throw new Error(`fornecedor: ${error.message}`)
}

async function clearExisting(sb) {
  const { data: compras } = await sb.from('compras')
    .select('id, obs')
    .eq('fornecedor', SUPPLIER_NAME)
  for (const c of compras || []) {
    await sb.from('compras').delete().eq('id', c.id)
    console.log(`  🗑 removida compra ${c.obs?.slice(0, 40) || c.id}`)
  }
  await sb.from('fornecedor_precos').delete().eq('fornecedor_id', SUPPLIER_ID)
}

async function purchaseExists(sb, slip) {
  const { data } = await sb.from('compras')
    .select('id')
    .ilike('obs', `%${slip}%`)
    .limit(1)
  return (data || []).length > 0
}

async function importPurchases(sb, produtos, zeibetsuHistory) {
  const report = { inserted: 0, skipped: 0, itens: 0, total: 0 }
  const latestPrice = new Map()

  for (const purchase of PURCHASES) {
    if (!FORCE && await purchaseExists(sb, purchase.slip)) {
      console.log(`⏭  ${purchase.date} #${purchase.slip} — já existe`)
      report.skipped++
      continue
    }

    const lines = purchase.items.map(expandLineZeibetsu)
    const subtotalZeikomi = lines.reduce((a, l) => a + l.qtd * toZeikomi(l.zeibetsu), 0)

    const { data: compra, error } = await sb.from('compras').insert({
      data: purchase.date,
      fornecedor: SUPPLIER_NAME,
      pagamento: 'Card',
      subtotal: subtotalZeikomi,
      desconto_pontos: 0,
      total_pago: purchase.total,
      total_real: purchase.total,
      pontos_ganhos: 0,
      status_pagamento: 'pago',
      obs: `Liquor Mountain 納品書 #${purchase.slip} — jul/2026 (税込)`,
    }).select().single()

    if (error) throw new Error(`compra ${purchase.slip}: ${error.message}`)

    const itensRows = lines.map(l => {
      const zeikomi = toZeikomi(l.zeibetsu)
      const hist = zeibetsuHistory.get(l.nome)
      const prod = matchProduct(l.nome, produtos)
      latestPrice.set(l.nome, {
        zeibetsu: l.zeibetsu,
        zeikomi,
        produto_id: prod?.id,
        firstZeibetsu: hist?.first,
        lastZeibetsu: hist?.last,
      })
      return {
        compra_id: compra.id,
        nome: l.nome,
        qtd: l.qtd,
        custo_unitario: zeikomi,
      }
    })

    const { error: itErr } = await sb.from('compras_itens').insert(itensRows)
    if (itErr) throw new Error(`itens ${purchase.slip}: ${itErr.message}`)

    console.log(`✅ ${purchase.date} #${purchase.slip} — ¥${purchase.total.toLocaleString('ja-JP')} (${lines.length} itens, 税込)`)
    report.inserted++
    report.itens += lines.length
    report.total += purchase.total
  }

  return { report, latestPrice }
}

async function updatePrices(sb, latestPrice, produtos) {
  let produtosUp = 0
  let fornPrecos = 0

  for (const [nome, { zeibetsu, zeikomi, produto_id, firstZeibetsu, lastZeibetsu }] of latestPrice) {
    const prod = produto_id
      ? produtos.find(p => p.id === produto_id)
      : matchProduct(nome, produtos)
    if (!prod) {
      console.log(`  ⚠ sem match: ${nome}`)
      continue
    }

    const notas = buildSupplierPriceNotas({ zeibetsu, firstZeibetsu, lastZeibetsu })

    await sb.from('produtos').update({ custo: zeikomi }).eq('id', prod.id)
    produtosUp++

    await sb.from('fornecedor_precos').upsert({
      fornecedor_id: SUPPLIER_ID,
      produto_id: prod.id,
      preco: zeikomi,
      notas,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'fornecedor_id,produto_id' })
    fornPrecos++
  }

  return { produtosUp, fornPrecos }
}

async function main() {
  const key = loadServiceKey()
  const sb = createClient(URL, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const zeibetsuHistory = buildZeibetsuHistory()

  console.log('\n🍶 Liquor Mountain — import jul/2026 (税込 +10%)\n')
  if (FORCE) {
    console.log('⚠️  --force: removendo compras/preços existentes...\n')
    await clearExisting(sb)
  }

  await ensureSupplier(sb)
  const produtos = await ensureProducts(sb)
  const { report, latestPrice } = await importPurchases(sb, produtos, zeibetsuHistory)
  const prices = await updatePrices(sb, latestPrice, produtos)

  console.log('\n── Resumo ──')
  console.log(`  Compras novas:  ${report.inserted}`)
  console.log(`  Já existiam:    ${report.skipped}`)
  console.log(`  Itens:          ${report.itens}`)
  console.log(`  Total importado: ¥${report.total.toLocaleString('ja-JP')}`)
  console.log(`  Produtos custo: ${prices.produtosUp}`)
  console.log(`  Preços fornec.: ${prices.fornPrecos}`)

  console.log('\n── Preços Liquor Mountain (税抜 → 税込) ──')
  const sorted = [...latestPrice.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [nome, { zeibetsu, zeikomi, firstZeibetsu, lastZeibetsu }] of sorted) {
    const delta = firstZeibetsu !== lastZeibetsu
      ? ` | jul ¥${firstZeibetsu}→¥${lastZeibetsu}`
      : ''
    console.log(`  ${nome.padEnd(28)} ¥${zeibetsu} → ¥${zeikomi}${delta}`)
  }
  console.log('')
}

main().catch(e => {
  console.error('\n❌', e.message, '\n')
  process.exit(1)
})
