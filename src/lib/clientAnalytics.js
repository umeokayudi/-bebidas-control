import { filterSupplierVendas } from '../components/utils'

export function buildPricingMap(barPricing = []) {
  const map = {}
  for (const row of barPricing) {
    map[row.produto_id] = {
      drinks_por_garrafa: +row.drinks_por_garrafa || 0,
      preco_drink: +row.preco_drink || 0,
    }
  }
  return map
}

/** POS projection — uses bar_pricing (POS drink prices). Fallback estimate when missing. */
export function projectItemRevenue(item, pricingMap) {
  const qtd = +item.qtd || 0
  const jbmUnit = +item.preco_unitario || +item.produtos?.preco_venda || 0
  const jbmTotal = jbmUnit * qtd
  if (!qtd) return { jbmTotal, posTotal: 0, margin: 0, source: 'none', drinks: 0 }

  const pr = pricingMap[item.produto_id]
  if (pr?.preco_drink > 0 && pr?.drinks_por_garrafa > 0) {
    const drinks = qtd * pr.drinks_por_garrafa
    const posTotal = drinks * pr.preco_drink
    return {
      jbmTotal,
      posTotal,
      margin: posTotal - jbmTotal,
      marginPct: posTotal > 0 ? Math.round((posTotal - jbmTotal) / posTotal * 100) : 0,
      source: 'pos',
      drinks,
      preco_drink: pr.preco_drink,
      drinks_por_garrafa: pr.drinks_por_garrafa,
    }
  }

  // Fallback: bottle/chaser estimate (~2.8× JBM cost as conservative POS bottle price)
  const bottlePos = Math.round(jbmUnit * 2.8)
  const posTotal = bottlePos * qtd
  return {
    jbmTotal,
    posTotal,
    margin: posTotal - jbmTotal,
    marginPct: posTotal > 0 ? Math.round((posTotal - jbmTotal) / posTotal * 100) : 0,
    source: 'estimate',
    drinks: qtd,
    preco_drink: bottlePos,
    drinks_por_garrafa: 1,
  }
}

export function analyzePurchases(itens, pricingMap, { monthKey } = {}) {
  const filtered = (itens || []).filter(it => {
    if (!it.vendas) return false
    if (monthKey && !it.vendas.data?.startsWith(monthKey)) return false
    return true
  })

  const byProduct = {}
  let jbmTotal = 0
  let posTotal = 0
  let posSourced = 0
  let estimated = 0

  for (const it of filtered) {
    const r = projectItemRevenue(it, pricingMap)
    jbmTotal += r.jbmTotal
    posTotal += r.posTotal
    if (r.source === 'pos') posSourced += r.jbmTotal
    if (r.source === 'estimate') estimated += r.jbmTotal

    const nome = it.produtos?.nome || '?'
    if (!byProduct[nome]) {
      byProduct[nome] = {
        nome,
        produto_id: it.produto_id,
        qtd: 0,
        jbmTotal: 0,
        posTotal: 0,
        margin: 0,
        source: r.source,
      }
    }
    const p = byProduct[nome]
    p.qtd += +it.qtd || 0
    p.jbmTotal += r.jbmTotal
    p.posTotal += r.posTotal
    p.margin += r.margin
    if (r.source === 'estimate') p.source = 'estimate'
  }

  const products = Object.values(byProduct)
    .map(p => ({
      ...p,
      marginPct: p.posTotal > 0 ? Math.round(p.margin / p.posTotal * 100) : 0,
      roiPct: p.jbmTotal > 0 ? Math.round(p.margin / p.jbmTotal * 100) : 0,
    }))
    .sort((a, b) => b.margin - a.margin)

  return {
    jbmTotal,
    posTotal,
    margin: posTotal - jbmTotal,
    marginPct: posTotal > 0 ? Math.round((posTotal - jbmTotal) / posTotal * 100) : 0,
    roiPct: jbmTotal > 0 ? Math.round((posTotal - jbmTotal) / jbmTotal * 100) : 0,
    posCoveragePct: jbmTotal > 0 ? Math.round(posSourced / jbmTotal * 100) : 0,
    estimatedSharePct: jbmTotal > 0 ? Math.round(estimated / jbmTotal * 100) : 0,
    products,
    itemCount: filtered.length,
  }
}

export function monthlyAccountSummary(vendas, faturas, monthKey) {
  const supplier = filterSupplierVendas(vendas || [])
  const mesVendas = supplier.filter(v => v.data?.startsWith(monthKey))
  const contaMes = mesVendas.reduce((a, v) => a + (+v.total || 0), 0)

  const prev = new Date(monthKey + '-01')
  prev.setMonth(prev.getMonth() - 1)
  const prevKey = prev.toISOString().slice(0, 7)
  const contaPrev = supplier
    .filter(v => v.data?.startsWith(prevKey))
    .reduce((a, v) => a + (+v.total || 0), 0)

  const growth = contaPrev > 0 ? Math.round((contaMes - contaPrev) / contaPrev * 100) : null

  const barFaturas = (faturas || []).filter(f =>
    f.data_emissao?.startsWith(monthKey) ||
    f.data_vencimento?.startsWith(monthKey) ||
    (f.periodo_inicio?.startsWith(monthKey) || f.periodo_fim?.startsWith(monthKey))
  )

  const faturaPendente = barFaturas
    .filter(f => f.status !== 'pago')
    .reduce((a, f) => a + Math.max(0, (+f.valor || +f.total || 0) - (+f.pago || 0)), 0)

  const faturaPaga = barFaturas
    .filter(f => f.status === 'pago')
    .reduce((a, f) => a + (+f.pago || +f.valor || +f.total || 0), 0)

  return {
    contaMes,
    contaPrev,
    growth,
    deliveries: mesVendas.length,
    faturaPendente,
    faturaPaga,
    faturasCount: barFaturas.length,
  }
}

export function monthlySpendSeries(vendas, months = 6) {
  const supplier = filterSupplierVendas(vendas || [])
  const labels = []
  const values = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const mk = d.toISOString().slice(0, 7)
    labels.push(mk.slice(5))
    values.push(supplier.filter(v => v.data?.startsWith(mk)).reduce((a, v) => a + (+v.total || 0), 0))
  }
  return { labels, values }
}
