#!/usr/bin/env node
/**
 * Compara preços Miraido (Felicity) vs Liquor Mountain vs Le Vin
 * Uso: node scripts/compare-supplier-prices.mjs
 */
import { readFileSync, writeFileSync } from 'fs'
import { PURCHASES, PACK_SIZE, SUPPLIER_NAME } from './data/liquor-mountain-july-2026.js'

const SB = 'https://ojirgkqtqvugqktyuhem.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || readFileSync('.env.production', 'utf8').match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.replace(/^["']|["']$/g, '')

const TAX = 1.1
const zeikomi = n => Math.round(+n * TAX)

/** Busca Miraido — termo JP → produto esperado */
const MIRAIDO_SEARCH = [
  { produto: 'Red Bull', search: 'レッドブル 250ml', pack: 24 },
  { produto: 'Asahi Beer 330ml', search: 'アサヒ スーパードライ 330ml 24', pack: 24 },
  { produto: 'Heineken 330ml', search: 'ハイネケン 330ml 24', pack: 24 },
  { produto: 'Corona Extra 355ml', search: 'コロナ 355ml 24', pack: 24 },
  { produto: 'Guiness Beer', search: 'ギネス 330ml 24', pack: 24 },
  { produto: 'Baileys', search: 'ベイリーズ 700ml', pack: 1 },
  { produto: 'Malibu', search: 'マリブ 700ml', pack: 1 },
  { produto: 'Jägermeister', search: 'イェーガーマイスター 700ml', pack: 1 },
  { produto: 'Fireball', search: 'ファイアボール 750ml', pack: 1 },
  { produto: 'Grey Goose', search: 'グレイグース 700ml', pack: 1 },
  { produto: 'Hennessy V.S', search: 'ヘネシー VS 700ml', pack: 1 },
  { produto: 'Moet Brut', search: 'モエ ブリュット アンペリアル 750ml', pack: 1 },
  { produto: 'Moet Rosé', search: 'モエ ロゼ アンペリアル', pack: 1 },
  { produto: 'Moet NIR', search: 'モエ NIR', pack: 1 },
  { produto: 'Veuve Clicquot Brut', search: 'ヴーヴ クリコ イエロー', pack: 1 },
  { produto: 'Veuve Clicquot Rose', search: 'ヴーヴ クリコ ロゼ', pack: 1 },
  { produto: 'Dom Perignon Brut', search: 'ドン ペリニヨン 750ml', pack: 1 },
  { produto: 'Krug Brut', search: 'クリュッグ 750ml', pack: 1 },
  { produto: 'Chandon Brut', search: 'シャンドン ブリュット', pack: 1 },
  { produto: 'Cuervo 1800 Añejo', search: '1800 アネホ', pack: 1 },
  { produto: 'Yamazaki 12 Year', search: '山崎 12年', pack: 1 },
  { produto: 'Hakushu', search: '白州', pack: 1 },
  { produto: 'Nikka Black 4L', search: 'ニッカ ブラック 4L', pack: 1 },
  { produto: 'Wilkson Vodka 1800 Ml', search: 'ウィルキンソン タンカー 1800', pack: 1 },
  { produto: 'Wilkinson Gin 1.8L', search: 'ウィルキンソン ジン 1800', pack: 1 },
  { produto: 'Tonic Water', search: 'ウィルキンソン トニック 500ml 24', pack: 24 },
  { produto: 'Soda Water 500ml', search: 'ウィルキンソン ソーダ 500ml', pack: 24 },
  { produto: 'Coca Cola 700ml', search: 'コカコーラ 700ml 20', pack: 20 },
  { produto: 'Orange Juice', search: 'オレンジジュース 1L', pack: 1 },
  { produto: 'Cranberry Juice', search: 'クランベリージュース 1L', pack: 1 },
  { produto: 'Shochu 4L', search: '焼酎 4L', pack: 1 },
  { produto: 'Water 500ml', search: '天然水 500ml 24', pack: 24 },
]

function parseMiraidoPrices(html) {
  const prices = []
  const re = /(\d{1,3}(?:,\d{3})*)円\s*（税込\s*(\d{1,3}(?:,\d{3})*)円）/g
  let m
  while ((m = re.exec(html))) prices.push(+m[2].replace(/,/g, ''))
  const re2 = /税込\s*(\d{1,3}(?:,\d{3})*)円/g
  while ((m = re2.exec(html))) prices.push(+m[1].replace(/,/g, ''))
  return [...new Set(prices)].filter(p => p > 50).sort((a, b) => a - b)
}

async function searchMiraido(term) {
  const url = `https://www.miraido-onlineshop.com/search/?keyword=${encodeURIComponent(term)}`
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    const html = await r.text()
    const prices = parseMiraidoPrices(html)
    const links = [...html.matchAll(/href="(\/item\/[^"]+)"/g)].map(x => x[1]).slice(0, 3)
    return { prices, links, ok: r.ok }
  } catch (e) {
    return { prices: [], links: [], error: e.message }
  }
}

function buildLmPrices() {
  const out = {}
  for (const p of PURCHASES) {
    for (const it of p.items) {
      const pack = PACK_SIZE[it.produto] || 1
      const unitZeibetsu = it.isCase ? it.unitPrice / pack : it.unitPrice
      const unitZeikomi = zeikomi(unitZeibetsu)
      if (!out[it.produto]) out[it.produto] = { zeibetsu: unitZeibetsu, zeikomi: unitZeikomi, casePack: pack }
    }
  }
  return out
}

function buildVolume() {
  const vol = {}
  for (const p of PURCHASES) {
    for (const it of p.items) {
      const pack = PACK_SIZE[it.produto] || 1
      const units = it.isCase ? it.qtd * pack : it.qtd
      vol[it.produto] = (vol[it.produto] || 0) + units
    }
  }
  return vol
}

async function fetchDb() {
  const h = { apikey: KEY, Authorization: `Bearer ${KEY}` }
  const [compras, leVin] = await Promise.all([
    fetch(`${SB}/rest/v1/compras?select=fornecedor,compras_itens(nome,qtd,custo_unitario)`, { headers: h }).then(r => r.json()),
    fetch(`${SB}/rest/v1/compras?fornecedor=eq.Le%20Vin&select=compras_itens(nome,qtd,custo_unitario)`, { headers: h }).then(r => r.json()),
  ])

  const leVinPrices = {}
  for (const c of leVin) {
    for (const it of c.compras_itens || []) {
      leVinPrices[it.nome] = +it.custo_unitario
    }
  }

  const dbVol = {}
  for (const c of compras) {
    for (const it of c.compras_itens || []) {
      dbVol[it.nome] = dbVol[it.nome] || { qtd: 0, fornecedor: c.fornecedor }
      dbVol[it.nome].qtd += +it.qtd || 0
      dbVol[it.nome].custo = +it.custo_unitario || 0
    }
  }
  return { leVinPrices, dbVol }
}

async function main() {
  const lm = buildLmPrices()
  const lmVol = buildVolume()
  const { leVinPrices, dbVol } = await fetchDb()

  console.log('🔍 Buscando preços Miraido (Felicity)...\n')
  const miraido = {}
  for (const item of MIRAIDO_SEARCH) {
    const res = await searchMiraido(item.search)
    const best = res.prices[0] || null
    const perUnit = best && item.pack > 1 ? Math.round(best / item.pack) : best
    miraido[item.produto] = { search: item.search, casePrice: best, unitZeikomi: perUnit, pack: item.pack, allPrices: res.prices.slice(0, 5), link: res.links[0] }
    process.stdout.write(best ? '✓' : '·')
    await new Promise(r => setTimeout(r, 400))
  }
  console.log('\n')

  const products = [...new Set([
    ...Object.keys(lm),
    ...Object.keys(leVinPrices),
    ...MIRAIDO_SEARCH.map(x => x.produto),
  ])].sort()

  const rows = []
  for (const nome of products) {
    const qtd = dbVol[nome]?.qtd || lmVol[nome] || 0
    const lmP = lm[nome]
    const lvP = leVinPrices[nome]
    const mi = miraido[nome]
    rows.push({
      produto: nome,
      volumeJul: qtd,
      liquorMountain: lmP ? { zeibetsu: Math.round(lmP.zeibetsu), zeikomi: lmP.zeikomi, pack: lmP.casePack } : null,
      leVin: lvP ? { zeikomi: lvP } : null,
      miraido: mi?.unitZeikomi ? { zeikomi: mi.unitZeikomi, caseZeikomi: mi.casePrice, pack: mi.pack } : null,
    })
  }

  rows.sort((a, b) => (b.volumeJul || 0) - (a.volumeJul || 0))

  const report = { geradoEm: new Date().toISOString(), fornecedores: { miraido: 'Felicity (miraido-onlineshop.com)', liquorMountain: SUPPLIER_NAME, leVin: 'Le Vin' }, produtos: rows }
  writeFileSync('scripts/data/supplier-price-comparison.json', JSON.stringify(report, null, 2))

  // Markdown summary
  let md = '# Comparativo de fornecedores — Atomic Bar (jul/2026)\n\n'
  md += '| Produto | Vol. | LM 税込/un | Le Vin 税込 | Miraido 税込/un | Melhor | Δ vs pior |\n'
  md += '|---|---:|---:|---:|---:|---|---:|\n'

  let savingsLm = 0
  let savingsMi = 0

  for (const r of rows.filter(x => x.volumeJul > 0 || x.leVin || x.liquorMountain)) {
    const prices = []
    if (r.liquorMountain?.zeikomi) prices.push({ s: 'LM', p: r.liquorMountain.zeikomi })
    if (r.leVin?.zeikomi) prices.push({ s: 'LV', p: r.leVin.zeikomi })
    if (r.miraido?.zeikomi) prices.push({ s: 'MI', p: r.miraido.zeikomi })
    if (!prices.length) continue

    prices.sort((a, b) => a.p - b.p)
    const best = prices[0]
    const worst = prices[prices.length - 1]
    const delta = worst.p - best.p
    const volSaving = delta * (r.volumeJul || 1)

    if (best.s === 'LM') savingsLm += volSaving
    if (best.s === 'MI') savingsMi += volSaving

    const fmt = n => n != null ? `¥${n.toLocaleString('ja-JP')}` : '—'
    md += `| ${r.produto} | ${r.volumeJul || '—'} | ${fmt(r.liquorMountain?.zeikomi)} | ${fmt(r.leVin?.zeikomi)} | ${fmt(r.miraido?.zeikomi)} | **${best.s}** | ${delta ? fmt(delta) : '—'} |\n`
  }

  md += `\n## Resumo\n\n`
  md += `- **Liquor Mountain**: mixers, cervejas, destilados volume — melhor para alta rotatividade\n`
  md += `- **Le Vin**: champagne & premium — catálogo exclusivo, preços negociados por invoice\n`
  md += `- **Miraido/Felicity**: alternativa online para premium + alguns mixers; comparar item a item\n`
  md += `- Economia potencial jul/2026 se comprasse tudo no menor preço: LM ~¥${Math.round(savingsLm).toLocaleString('ja-JP')} vs Miraido ~¥${Math.round(savingsMi).toLocaleString('ja-JP')}\n`

  writeFileSync('scripts/data/supplier-price-comparison.md', md)
  console.log(md)
  console.log('\n📁 Salvo: scripts/data/supplier-price-comparison.json + .md')
}

main().catch(e => { console.error(e); process.exit(1) })
