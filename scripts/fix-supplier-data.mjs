#!/usr/bin/env node
/**
 * Corrige dados conhecidos: Grey Goose Le Vin, preços LM, preços Felicity/Miraido.
 * Uso: node scripts/fix-supplier-data.mjs
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { PURCHASES, PACK_SIZE, SUPPLIER_ID as LM_ID } from './data/liquor-mountain-july-2026.js'
import { toZeikomi } from './lib/consumptionTax.mjs'

const URL = 'https://ojirgkqtqvugqktyuhem.supabase.co'
const FELICITY_ID = '75aae5fb-9058-4be0-a7b9-2af098def50a'
const GREY_GOOSE_ZEIBETSU = 4800
const GREY_GOOSE_ZEIKOMI = toZeikomi(GREY_GOOSE_ZEIBETSU)

const MIRaido_PRICES = [
  { nome: 'Red Bull', zeikomi: 169, notas: 'Miraido case 24 ¥4,061' },
  { nome: 'Baileys', zeikomi: 1738, notas: 'Miraido 700ml' },
  { nome: 'Malibu', zeikomi: 1199, notas: 'Miraido 700ml' },
  { nome: 'Jägermeister', zeikomi: 1480, notas: 'Miraido 700ml' },
  { nome: 'Fireball', zeikomi: 1830, notas: 'Miraido 750ml' },
  { nome: 'Chandon Brut', zeikomi: 2398, notas: 'Miraido NV 750ml' },
  { nome: 'Hennessy V.S', zeikomi: 3718, notas: 'Miraido 700ml' },
  { nome: 'Grey Goose', zeikomi: 4530, notas: 'Miraido 700ml 正規' },
  { nome: 'Moet Brut', zeikomi: 6248, notas: 'Miraido Brut Imperial' },
  { nome: 'Veuve Clicquot Brut', zeikomi: 6390, notas: 'Miraido Yellow Label' },
  { nome: 'Veuve Clicquot Rose', zeikomi: 7873, notas: 'Miraido Rose est.' },
  { nome: 'Dom Perignon Brut', zeikomi: 25400, notas: 'Miraido 2012 並行' },
  { nome: 'Yamazaki 12 Year', zeikomi: 23210, notas: 'Miraido 700ml' },
]

function loadKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY
  const env = readFileSync('.env.production', 'utf8')
  const m = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)
  if (m) return m[1].replace(/^["']|["']$/g, '')
  throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
}

function buildLmLatest() {
  const out = new Map()
  for (const p of PURCHASES) {
    for (const it of p.items) {
      const pack = PACK_SIZE[it.produto] || 1
      const zeibetsu = it.isCase ? Math.round(it.unitPrice / pack) : it.unitPrice
      out.set(it.produto, { zeibetsu, zeikomi: toZeikomi(zeibetsu) })
    }
  }
  return out
}

async function matchProduct(sb, nome) {
  const { data } = await sb.from('produtos').select('id,nome').ilike('nome', nome).eq('ativo', true).limit(3)
  if (!data?.length) return null
  const exact = data.find(p => p.nome.toLowerCase() === nome.toLowerCase())
  return exact || data[0]
}

async function upsertFornecedorPreco(sb, fornecedorId, produtoId, zeikomi, notas) {
  await sb.from('fornecedor_precos').upsert({
    fornecedor_id: fornecedorId,
    produto_id: produtoId,
    preco: zeikomi,
    notas,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'fornecedor_id,produto_id' })
}

async function main() {
  const sb = createClient(URL, loadKey(), { auth: { autoRefreshToken: false, persistSession: false } })
  console.log('\n🔧 Fix supplier data\n')

  // Grey Goose Le Vin compra
  const { data: ggItems } = await sb.from('compras_itens').select('id, nome, qtd, custo_unitario, compras!inner(fornecedor)').eq('nome', 'Grey Goose').eq('compras.fornecedor', 'Le Vin')
  let ggFixed = 0
  for (const it of ggItems || []) {
    if (+it.custo_unitario < 1000) {
      await sb.from('compras_itens').update({ custo_unitario: GREY_GOOSE_ZEIKOMI }).eq('id', it.id)
      ggFixed++
    }
  }
  if (ggFixed) {
    const { data: prod } = await sb.from('produtos').select('id').ilike('nome', 'Grey Goose').maybeSingle()
    if (prod) await sb.from('produtos').update({ custo: GREY_GOOSE_ZEIBETSU }).eq('id', prod.id)
    console.log(`✅ Grey Goose Le Vin: ${ggFixed} item(ns) → ¥${GREY_GOOSE_ZEIKOMI}`)
  }

  // LM fornecedor_precos
  const lm = buildLmLatest()
  let lmCount = 0
  for (const [nome, { zeibetsu, zeikomi }] of lm) {
    const prod = await matchProduct(sb, nome)
    if (!prod) continue
    await upsertFornecedorPreco(sb, LM_ID, prod.id, zeikomi, `LM jul/2026 税抜¥${zeibetsu}`)
    await sb.from('produtos').update({ custo: zeibetsu }).eq('id', prod.id)
    lmCount++
  }
  console.log(`✅ Liquor Mountain preços: ${lmCount}`)

  // Felicity / Miraido
  let felCount = 0
  for (const row of MIRaido_PRICES) {
    const prod = await matchProduct(sb, row.nome)
    if (!prod) { console.log(`⏭  Felicity: produto não encontrado — ${row.nome}`); continue }
    await upsertFornecedorPreco(sb, FELICITY_ID, prod.id, row.zeikomi, row.notas)
    felCount++
  }
  console.log(`✅ Felicity/Miraido preços: ${felCount}`)
  console.log('')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
