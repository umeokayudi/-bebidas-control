/**
 * Sync JBM supplier prices for Atomic Bar from invoice catalog.
 * Run: node scripts/sync-atomic-prices.mjs
 */
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://ojirgkqtqvugqktyuhem.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qaXJna3F0cXZ1Z3FrdHl1aGVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NTkwNTIsImV4cCI6MjA5NjEzNTA1Mn0.nRiZHav9wAY2HRKrO66W9HhY3R5wGZHMM8UH5W4PK_M'
)

// Catalog = 税別 (pre-tax / zeibetsu) from Atomic invoices.
// preco_venda in DB = 税込 (zeikomi) = round(zeibetsu × 1.1)
const TAX_RATE = 1.1
const toZeikomi = n => Math.round(+n * TAX_RATE)

// Canonical supplier catalog — zeibetsu (sem imposto)
const CATALOG = {
  'Asahi Beer 330ml': { price: 258, category: 'Beer' },
  'Apple Juice': { price: 295, category: 'Juice' },
  'Bacardi Rum': { price: 3900, category: 'Others' },
  'Bacardi Rum 1750ml': { price: 4290, category: 'Others' },
  'Baileys': { price: 2255, category: 'Others' },
  'Blue Curaçao': { price: 2280, category: 'Others' },
  'Bols Peach': { price: 1982, category: 'Others' },
  'Bols Triple Sec': { price: 2190, category: 'Others' },
  'Bombay Sapphire 1.75L': { price: 4400, category: 'Gin' },
  'Budweiser 330ml': { price: 285, category: 'Beer' },
  'Campari': { price: 2280, category: 'Others' },
  'Chandon Brut': { price: 3000, category: 'Champagne' },
  'Chita': { price: 6600, category: 'Japanese Whisky' },
  'Chivas 12': { price: 3980, category: 'Whisky' },
  'Chivas 12 (1L)': { price: 4300, category: 'Whisky' },
  'Coca Cola 700ml': { price: 180, category: 'Soda' },
  'Corona Extra 355ml': { price: 285, category: 'Beer' },
  'Cramberry Juice': { price: 3618, category: 'Juice' },
  'Cranberry Juice': { price: 589, category: 'Juice' },
  'Cuervo 1800 Añejo': { price: 9273, category: 'Tequila' },
  'Dom Perignon Brut': { price: 24000, category: 'Champagne' },
  'Dom Perignon Rosé': { price: 38000, category: 'Champagne' },
  'Fireball': { price: 2900, category: 'Others' },
  'Ginger Ale': { price: 295, category: 'Soda' },
  'Ginger Beer': { price: 295, category: 'Soda' },
  'Grape Fruit Juice 6L': { price: 2709, category: 'Juice' },
  'Grapefruit Juice': { price: 540, category: 'Juice' },
  'Grey Goose': { price: 4800, category: 'Vodka' },
  'Guiness Beer': { price: 300, category: 'Beer' },
  'Heineken 330ml': { price: 292, category: 'Beer' },
  'Hendricks Gin': { price: 6380, category: 'Gin' },
  'Hennessy V.S': { price: 4500, category: 'Spirits' },
  'Jack Daniels 1750 ml': { price: 4982, category: 'Whisky' },
  'Jägermeister': { price: 2545, category: 'Others' },
  'Jameson 1750 ml': { price: 5164, category: 'Whisky' },
  'Jasmin Tea LM': { price: 196, category: 'Others' },
  'Jasmine Tea (caixa 6)': { price: 1178, category: 'Others' },
  'Jose Cuervo': { price: 2480, category: 'Tequila' },
  'Kahlua': { price: 2880, category: 'Others' },
  'Krug Brut': { price: 30000, category: 'Champagne' },
  'Lejay Cassis': { price: 2255, category: 'Others' },
  'Lime': { price: 1345, category: 'Others' },
  'Malibu': { price: 1527, category: 'Others' },
  'Mango Juice': { price: 580, category: 'Juice' },
  'Mango Juice (3L)': { price: 1800, category: 'Juice' },
  'Meyers Rum': { price: 2280, category: 'Others' },
  'Moet Brut': { price: 6164, category: 'Champagne' },
  'Moet NIR': { price: 9273, category: 'Champagne' },
  'Moet Rosé': { price: 6800, category: 'Champagne' },
  'Nikka Black 4L': { price: 4440, category: 'Japanese Whisky' },
  'Orange Juice': { price: 491, category: 'Juice' },
  'Peñasol Brut': { price: 700, category: 'Champagne' },
  'Pineapple Juice': { price: 589, category: 'Juice' },
  'Red Bull': { price: 193, category: 'Energy Drink' },
  'Ruinart': { price: 13480, category: 'Champagne' },
  'Sambuca': { price: 2500, category: 'Others' },
  'Shochu 4L': { price: 2891, category: 'Shochu' },
  'Smirnoff Ice 330ml': { price: 350, category: 'Beer' },
  'Soda Water 500ml': { price: 105, category: 'Water' },
  'Sparkling Water 1L': { price: 167, category: 'Water' },
  'Stella Artois': { price: 909, category: 'Beer' },
  'Suntory Lemon': { price: 786, category: 'Others' },
  'Suntory Lime': { price: 727, category: 'Others' },
  'Grenadine': { price: 880, category: 'Others' },
  'Tanqueray': { price: 2480, category: 'Gin' },
  'Tequila Patron Silver': { price: 7260, category: 'Tequila' },
  'Tequila Rose': { price: 3300, category: 'Others' },
  'The Botanist': { price: 4982, category: 'Gin' },
  'Tomato Juice': { price: 324, category: 'Juice' },
  'Tomato Juice 9 Unit': { price: 2436, category: 'Juice' },
  'Tonic Water': { price: 141, category: 'Soda' },
  'Uron Tea': { price: 196, category: 'Others' },
  'Veuve Clicquot Brut': { price: 7164, category: 'Champagne' },
  'Veuve Clicquot Rose': { price: 8164, category: 'Champagne' },
  'Water 2L (case 6)': { price: 600, category: 'Water' },
  'Water 500ml': { price: 88, category: 'Water' },
  'White Wine 5L': { price: 3300, category: 'Wine' },
  'White Wine Bottle': { price: 3300, category: 'Wine' },
  'Wilkson Vodka 1800 Ml': { price: 1800, category: 'Vodka' },
  'Yamazaki 12 Year': { price: 16000, category: 'Japanese Whisky' },
  'Beefeater': { price: 1980, category: 'Gin' },
  'Don Julio 1942': { price: 21980, category: 'Tequila' },
  'Champagne House': { price: 600, category: 'Champagne' },
  'Xarope Simples': { price: 500, category: 'Others' },
  'Coca Cola 500ml': { price: 152, category: 'Soda' },
  'Red Wine 5L': { price: 3000, category: 'Wine' },
  'Red Wine Segonzac La Foret': { price: 1800, category: 'Wine' },
  'Cranberry Juice 2.83L': { price: 1800, category: 'Juice' },
  'Cranberry Juice 5.66L': { price: 3900, category: 'Juice' },
  'Tequila Anejo 1L': { price: 4500, category: 'Tequila' },
  'Soda Case (35 units)': { price: 2691, category: 'Soda' },
  'Green Tea': { price: 1200, category: 'Others' },
}

// zeibetsu — converted to zeikomi on insert
const NEW_PRODUCTS = [
  { nome: 'Beefeater', categoria: 'Gin', zeibetsu: 1980 },
  { nome: 'Don Julio 1942', categoria: 'Tequila', zeibetsu: 21980 },
  { nome: 'Red Wine 5L', categoria: 'Wine', zeibetsu: 3000 },
  { nome: 'Red Wine Segonzac La Foret', categoria: 'Wine', zeibetsu: 1800 },
  { nome: 'Cranberry Juice 2.83L', categoria: 'Juice', zeibetsu: 1800 },
  { nome: 'Cranberry Juice 5.66L', categoria: 'Juice', zeibetsu: 3900 },
  { nome: 'Tequila Anejo 1L', categoria: 'Tequila', zeibetsu: 4500 },
  { nome: 'Soda Case (35 units)', categoria: 'Soda', zeibetsu: 2691 },
  { nome: 'Green Tea', categoria: 'Others', zeibetsu: 1200 },
  { nome: 'Coca Cola 500ml', categoria: 'Soda', zeibetsu: 152 },
]

// POS / bar menu items — not supplier inventory (mixed from POS import)
const DEACTIVATE = new Set([
  '1800 Tequila', 'Asahi Super Dry', 'Heineken', 'Corona Extra', 'Kirin Ichiban',
  'Gin Tonic', 'Lemon Sour', 'Whisky Highball', 'Cassis Orange', 'Cassis Oolong', 'Moscow Mule',
  'House Whisky', 'House Tequila', 'House Rum', 'House Gin', 'House Vodka',
  'House Red Glass', 'House White Glass', 'Prosecco Glass', 'Moet Glass', 'Veuve Clicquot Glass',
  'Dom Perignon', 'Don Perignon', 'Hennessy XO', 'Hibiki 17 Bottle', 'Moet Chandon Bottle',
  'Veuve Clicquot Bottle', 'Macallan 12', 'Hibiki Harmony', 'Hendricks', 'Grey Goose Bottle',
  'Cheese Plate', 'Chocolate Plate', 'Edamame', 'Fruit Plate', 'Mixed Nuts',
  'Cola', 'Mineral Water', 'Oolong Tea',
])

function norm(s) {
  return (s || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function findCatalogKey(nome) {
  const n = norm(nome)
  if (CATALOG[nome.trim()]) return nome.trim()
  for (const key of Object.keys(CATALOG)) {
    if (norm(key) === n) return key
  }
  return null
}

async function main() {
  const { data: produtos, error } = await sb.from('produtos').select('*')
  if (error) throw error

  const byName = new Map(produtos.map(p => [norm(p.nome), p]))
  let updated = 0, deactivated = 0, inserted = 0, skipped = 0

  for (const p of produtos) {
    const name = p.nome.trim()
    if (DEACTIVATE.has(name) || DEACTIVATE.has(p.nome)) {
      if (p.ativo !== false) {
        await sb.from('produtos').update({ ativo: false }).eq('id', p.id)
        console.log('DEACTIVATE (POS/menu):', name)
        deactivated++
      }
      continue
    }

    const key = findCatalogKey(name)
    if (key) {
      const { price, category } = CATALOG[key]
      const zeikomi = toZeikomi(price)
      const patch = { preco_venda: zeikomi, ativo: true }
      if (category) patch.categoria = category
      if (p.preco_venda !== zeikomi || p.categoria !== category || p.ativo === false) {
        await sb.from('produtos').update(patch).eq('id', p.id)
        console.log(`UPDATE: ${name} → ¥${zeikomi} zeikomi (¥${price} +10%) (${category})`)
        updated++
      }
    } else if (p.preco_venda === 1000 || p.preco_venda === 2000) {
      // Likely POS drink price left on inventory row
      await sb.from('produtos').update({ ativo: false }).eq('id', p.id)
      console.log('DEACTIVATE (suspicious ¥1000/2000):', name)
      deactivated++
    } else {
      skipped++
    }
  }

  for (const np of NEW_PRODUCTS) {
    if (byName.has(norm(np.nome))) continue
    const preco_venda = toZeikomi(np.zeibetsu)
    const { error: insErr } = await sb.from('produtos').insert({
      nome: np.nome, categoria: np.categoria, preco_venda, custo: 0, ativo: true
    })
    if (insErr) console.error('INSERT FAIL:', np.nome, insErr.message)
    else { console.log('INSERT:', np.nome, '¥' + preco_venda + ' zeikomi'); inserted++ }
  }

  // Fix trailing-space duplicates
  for (const p of produtos) {
    if (p.nome !== p.nome.trim()) {
      await sb.from('produtos').update({ nome: p.nome.trim() }).eq('id', p.id)
    }
  }

  console.log('\nDone:', { updated, deactivated, inserted, skipped, total: produtos.length })
}

main().catch(e => { console.error(e); process.exit(1) })
