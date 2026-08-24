/**
 * Habilita Yamazaki 12, Hakushu e Estrella no catálogo de pedidos.
 * - Yamazaki / Hakushu: preco_venda = custo + 20%
 * - Estrella: mesmo preço do Heineken 330ml
 *
 * Uso: node scripts/fix-lm-order-catalog.mjs
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { saleMarkup } from './lib/productMatch.mjs'

const URL = 'https://ojirgkqtqvugqktyuhem.supabase.co'

function loadServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY
  const env = readFileSync('.env.production', 'utf8')
  const m = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)
  if (m) return m[1].replace(/^["']|["']$/g, '')
  throw new Error('SUPABASE_SERVICE_ROLE_KEY não encontrada')
}

async function main() {
  const sb = createClient(URL, loadServiceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: produtos } = await sb.from('produtos').select('id,nome,custo,preco_venda,categoria,ativo,volume_ml')
  const byNorm = new Map(produtos.map(p => [p.nome.toLowerCase().trim(), p]))

  const heineken = byNorm.get('heineken 330ml')
  if (!heineken?.preco_venda) throw new Error('Heineken 330ml sem preco_venda')

  const yamazaki = byNorm.get('yamazaki 12 year') || byNorm.get('yamazaki nv')
  const updates = [
    {
      key: yamazaki ? yamazaki.nome.toLowerCase().trim() : 'yamazaki 12 year',
      patch: { nome: 'Yamazaki 12 Year', preco_venda: saleMarkup(yamazaki?.custo || 17600), volume_ml: 700, ativo: true },
    },
    {
      key: 'hakushu',
      patch: { preco_venda: saleMarkup(byNorm.get('hakushu')?.custo || 14300), volume_ml: 700, ativo: true },
    },
    {
      key: 'estrella damm 330ml',
      patch: { preco_venda: heineken.preco_venda, volume_ml: 330, ativo: true },
    },
    {
      key: 'suntory cocktail lemon',
      patch: { preco_venda: saleMarkup(byNorm.get('suntory cocktail lemon')?.custo || 669), ativo: true },
    },
    {
      key: 'wilkinson gin 1.8l',
      patch: { preco_venda: saleMarkup(byNorm.get('wilkinson gin 1.8l')?.custo || 2068), ativo: true },
    },
  ]

  console.log('\n🍶 Catálogo pedidos — Liquor Mountain premium\n')

  for (const u of updates) {
    const prod = byNorm.get(u.key)
    if (!prod) {
      console.log(`  ⚠ não encontrado: ${u.key}`)
      continue
    }
    await sb.from('produtos').update(u.patch).eq('id', prod.id)
    console.log(`  ✅ ${u.patch.nome || prod.nome} → venda ${u.patch.preco_venda} (custo ${prod.custo})`)
  }

  // Unificar Orange Juice (trailing space)
  const ojBad = produtos.find(p => p.nome === 'Orange Juice ')
  const ojGood = produtos.find(p => p.nome === 'Orange Juice')
  if (ojBad && ojGood && ojBad.id !== ojGood.id) {
    await sb.from('pedidos_itens').update({ produto_id: ojGood.id }).eq('produto_id', ojBad.id)
    await sb.from('produtos').update({ ativo: false }).eq('id', ojBad.id)
    console.log('  ✅ Orange Juice unificado (removido duplicado com espaço)')
  }

  console.log('')
}

main().catch(e => {
  console.error('\n❌', e.message, '\n')
  process.exit(1)
})
