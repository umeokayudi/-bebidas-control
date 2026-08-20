/**
 * Purchase cash-flow advisor — pay now vs pay on terms, tied to JBM resale & bar collections.
 */

export const DEFAULTS = {
  costOfCapitalPct: 12,      // annual % — credit card / opportunity cost
  cashDiscountPct: 2,        // typical cash discount at supplier
  cardFeePct: 1.8,           // card processing
  pointsValuePct: 1,         // effective value of loyalty points
  daysToSell: 21,            // avg days to sell stock through bars
  daysToCollectBar: 25,      // JBM invoice → bar payment (after delivery month)
  minCashBuffer: 500000,     // ¥ safety buffer for sustainable ops
}

const CATEGORY_DAYS = {
  Champagne: 14,
  Beer: 7,
  Juice: 10,
  Soda: 10,
  Water: 7,
  'Energy Drink': 10,
  Whisky: 28,
  'Japanese Whisky': 35,
  Vodka: 21,
  Gin: 21,
  Tequila: 21,
  Spirits: 21,
  Shochu: 21,
  Wine: 21,
  Others: 21,
}

export function parsePaymentTerms(pagamento = '') {
  const p = String(pagamento).toLowerCase()
  if (/60/.test(p)) return { mode: 'deferred', days: 60, label: 'Invoice 60 days' }
  if (/30|invoice/.test(p)) return { mode: 'deferred', days: 30, label: 'Invoice 30 days' }
  if (/transfer|bank/.test(p)) return { mode: 'deferred', days: 7, label: 'Bank transfer (~7d)' }
  if (/card|credit|debit/.test(p)) return { mode: 'immediate', days: 0, label: 'Card (immediate)' }
  if (/cash|dinheiro|à vista|avista/.test(p)) return { mode: 'immediate', days: 0, label: 'Cash (immediate)' }
  return { mode: 'immediate', days: 0, label: pagamento || 'Immediate' }
}

export function daysToSellForCategory(categoria) {
  return CATEGORY_DAYS[categoria] || DEFAULTS.daysToSell
}

function financingCost(amount, days, annualPct) {
  if (!days || !amount) return 0
  return Math.round(amount * (annualPct / 100) * (days / 365))
}

function pointsBenefit(amount, pointsPct, pointsValuePct) {
  return Math.round(amount * (pointsPct / 100) * (pointsValuePct / 100))
}

/**
 * Build pay-now vs pay-later scenarios for one purchase amount.
 */
export function buildPaymentScenarios({
  amount,
  supplierPayment = 'Cash',
  pointsPct = 0,
  settings = {},
}) {
  const s = { ...DEFAULTS, ...settings }
  const base = +amount || 0
  if (!base) return []

  const terms = parsePaymentTerms(supplierPayment)
  const deferredDays = terms.mode === 'deferred' ? terms.days : 30

  const scenarios = [
    {
      id: 'cash_now',
      label: 'Pay now — cash',
      paymentDay: 0,
      grossOut: base,
      effectiveCost: Math.round(base * (1 - s.cashDiscountPct / 100)),
      discountOrFee: -Math.round(base * s.cashDiscountPct / 100),
      pointsValue: 0,
      financingCost: 0,
      notes: `${s.cashDiscountPct}% cash discount assumed`,
    },
    {
      id: 'card_now',
      label: 'Pay now — card',
      paymentDay: 0,
      grossOut: base,
      effectiveCost: Math.round(base * (1 + s.cardFeePct / 100) - pointsBenefit(base, pointsPct, s.pointsValuePct)),
      discountOrFee: Math.round(base * s.cardFeePct / 100),
      pointsValue: pointsBenefit(base, pointsPct, s.pointsValuePct),
      financingCost: 0,
      notes: `Card fee ${s.cardFeePct}%${pointsPct ? `, ${pointsPct}% points` : ''}`,
    },
    {
      id: 'terms',
      label: `Pay on terms — ${terms.label}`,
      paymentDay: deferredDays,
      grossOut: base,
      effectiveCost: base + financingCost(base, deferredDays, s.costOfCapitalPct),
      discountOrFee: 0,
      pointsValue: pointsBenefit(base, pointsPct, s.pointsValuePct),
      financingCost: financingCost(base, deferredDays, s.costOfCapitalPct),
      notes: `Money cost ${s.costOfCapitalPct}%/yr × ${deferredDays}d`,
    },
  ]

  if (terms.mode === 'deferred') {
    scenarios.push({
      id: 'supplier_default',
      label: `Supplier default — ${supplierPayment}`,
      paymentDay: terms.days,
      grossOut: base,
      effectiveCost: base + financingCost(base, terms.days, s.costOfCapitalPct) - pointsBenefit(base, pointsPct, s.pointsValuePct),
      discountOrFee: 0,
      pointsValue: pointsBenefit(base, pointsPct, s.pointsValuePct),
      financingCost: financingCost(base, terms.days, s.costOfCapitalPct),
      notes: 'Configured supplier payment terms',
      isSupplierDefault: true,
    })
  }

  return scenarios.map(sc => ({
    ...sc,
    savingsVsWorst: 0,
    cashPressure: sc.paymentDay === 0 ? 'high' : sc.paymentDay <= 7 ? 'medium' : 'low',
  }))
}

/**
 * Full analysis: payment timing + resale margin + collection cycle + cash position.
 */
export function analyzePurchaseCashflow({
  purchaseAmount,
  supplierPayment = 'Cash',
  deliveryDays = 1,
  pointsPct = 0,
  jbmSellPrice = 0,
  posProjectedRevenue = 0,
  qtd = 1,
  categoria = 'Others',
  cashflow = {},
  settings = {},
}) {
  const s = { ...DEFAULTS, ...settings }
  const amount = +purchaseAmount || 0
  const sellDays = daysToSellForCategory(categoria)
  const revenue = posProjectedRevenue > 0 ? posProjectedRevenue : (jbmSellPrice > 0 ? jbmSellPrice * qtd : 0)
  const margin = revenue > 0 ? revenue - amount : 0
  const marginPct = revenue > 0 ? Math.round(margin / revenue * 100) : null

  const deliveryDay = deliveryDays
  const revenueDay = deliveryDay + sellDays
  const collectDay = revenueDay + s.daysToCollectBar

  const scenarios = buildPaymentScenarios({ amount, supplierPayment, pointsPct, settings: s })
  const worst = Math.max(...scenarios.map(x => x.effectiveCost))
  scenarios.forEach(sc => { sc.savingsVsWorst = worst - sc.effectiveCost })

  const netCash = cashflow.netCash ?? 0
  const pendingOut30 = cashflow.pendingOut30 ?? 0
  const pendingIn30 = cashflow.pendingIn30 ?? 0
  const projectedCash = netCash + pendingIn30 - pendingOut30

  const ranked = [...scenarios].sort((a, b) => {
    const scoreA = a.effectiveCost - (a.paymentDay > 0 ? 500 : 0) + (projectedCash < s.minCashBuffer && a.paymentDay === 0 ? 50000 : 0)
    const scoreB = b.effectiveCost - (b.paymentDay > 0 ? 500 : 0) + (projectedCash < s.minCashBuffer && b.paymentDay === 0 ? 50000 : 0)
    return scoreA - scoreB
  })

  const best = ranked[0]
  const payNow = scenarios.find(x => x.id === 'cash_now')
  const payTerms = scenarios.find(x => x.id === 'terms' || x.id === 'supplier_default') || scenarios.find(x => x.paymentDay > 0)

  const cashNowAffordable = projectedCash - (payNow?.effectiveCost || amount) >= -s.minCashBuffer
  const recoverBeforePay = payTerms ? collectDay <= payTerms.paymentDay : false
  const workingCapitalGap = payTerms ? Math.max(0, payTerms.paymentDay - collectDay) : 0

  let verdict = 'neutral'
  let headline = ''
  let reasons = []

  if (!amount) {
    return { verdict: 'incomplete', headline: 'Enter purchase amount to analyze', scenarios: [], reasons: [] }
  }

  if (payNow && payTerms) {
    const savingNow = payTerms.effectiveCost - payNow.effectiveCost
    if (savingNow > 500 && cashNowAffordable) {
      verdict = 'pay_now'
      headline = `Pay now saves ${fmt(savingNow)} vs waiting`
      reasons.push(`Cash discount / lower effective cost beats financing ${payTerms.paymentDay}d`)
    } else if (!cashNowAffordable && payTerms.paymentDay > 0) {
      verdict = 'pay_later'
      headline = `Pay on terms — protects cash buffer`
      reasons.push(`Projected cash ¥${Math.round(projectedCash).toLocaleString()} — paying now risks tight cashflow`)
    } else if (recoverBeforePay && margin > 0) {
      verdict = 'pay_later'
      headline = `Terms OK — you collect before paying`
      reasons.push(`Bar payment ~day ${collectDay} vs supplier due day ${payTerms.paymentDay}`)
    } else if (workingCapitalGap > 0) {
      verdict = 'caution'
      headline = `Gap of ${workingCapitalGap} days — you pay before collecting`
      reasons.push(`Need ¥${fmt(amount)} working capital for ${workingCapitalGap} days`)
    } else if (savingNow <= 0) {
      verdict = 'pay_later'
      headline = `Defer payment — no benefit paying early`
      reasons.push(`Financing cost of paying early exceeds cash discount`)
    } else {
      verdict = 'pay_now'
      headline = `Pay now — lowest effective cost`
      reasons.push(`Best effective cost: ${best.label}`)
    }
  }

  if (marginPct !== null && marginPct < 30) {
    reasons.push(`Low resale margin ${marginPct}% — prioritize cash preservation`)
  }
  if (revenue > 0) {
    reasons.push(`Projected resale ¥${Math.round(revenue).toLocaleString()} → margin ¥${Math.round(margin).toLocaleString()}`)
  }

  return {
    verdict,
    headline,
    reasons,
    bestScenario: best,
    scenarios: scenarios.sort((a, b) => a.effectiveCost - b.effectiveCost),
    timeline: {
      deliveryDay,
      revenueDay,
      collectDay,
      recoverBeforePay,
      workingCapitalGap,
    },
    cashflow: {
      netCash,
      projectedCash,
      cashNowAffordable,
      minBuffer: s.minCashBuffer,
    },
    margin: { revenue, margin, marginPct },
    settings: s,
  }
}

function fmt(n) {
  return '¥' + Math.round(n).toLocaleString('ja-JP')
}

export function buildAIAdvisorPrompt(analysis, context = {}) {
  return {
    system: `You are JBM Drinks' purchase & cash-flow advisor for a beverage supplier in Japan.
Explain in clear Portuguese (Brazil) whether to pay immediately or on supplier terms.
Focus on: cost of money, time to sell to bars, time to collect from bars (faturas), and sustainable cash buffer.
Be direct: 2-3 short paragraphs + bullet recommendation. No markdown headers.`,
    messages: [{
      role: 'user',
      content: `Analyze this purchase decision:

Supplier: ${context.supplierName || '?'}
Product: ${context.productName || '?'} (${context.categoria || '?'})
Purchase amount: ¥${context.purchaseAmount || 0}
Supplier payment terms: ${context.supplierPayment || '?'}
Delivery days: ${context.deliveryDays ?? 1}
Points %: ${context.pointsPct ?? 0}

Resale to bar: ¥${analysis.margin?.revenue || 0} (margin ${analysis.margin?.marginPct ?? '?'}%)
Timeline: deliver day ${analysis.timeline.deliveryDay}, revenue day ${analysis.timeline.revenueDay}, collect from bar day ${analysis.timeline.collectDay}

Cash position: net ¥${analysis.cashflow.netCash}, projected 30d ¥${analysis.cashflow.projectedCash}
Can afford pay-now: ${analysis.cashflow.cashNowAffordable}
Recover before supplier due: ${analysis.timeline.recoverBeforePay}
Working capital gap: ${analysis.timeline.workingCapitalGap} days

Scenarios (effective cost):
${analysis.scenarios.map(s => `- ${s.label}: ¥${s.effectiveCost} (pay day ${s.paymentDay})`).join('\n')}

System verdict: ${analysis.verdict} — ${analysis.headline}
Reasons: ${analysis.reasons.join('; ')}

Should JBM pay now or on terms for a SUSTAINABLE operation?`,
    }],
  }
}

export async function loadCashflowSnapshot(supabase) {
  const today = new Date().toISOString().slice(0, 10)
  const in30 = new Date(); in30.setDate(in30.getDate() + 30)
  const end30 = in30.toISOString().slice(0, 10)

  const [fR, cR] = await Promise.all([
    supabase.from('faturas').select('valor,total,pago,status,data_vencimento'),
    supabase.from('compras').select('total_pago,total_real,status_pagamento,data,data_pagamento'),
  ])

  const faturas = fR.data || []
  const compras = cR.data || []

  const paidIn = faturas.filter(f => f.status === 'pago').reduce((a, f) => a + (+f.valor || +f.total || 0), 0)
  const paidOut = compras
    .filter(c => c.status_pagamento === 'pago' || !c.status_pagamento)
    .reduce((a, c) => a + (+c.total_real || +c.total_pago || 0), 0)

  const pendingIn30 = faturas
    .filter(f => f.status !== 'pago' && f.data_vencimento >= today && f.data_vencimento <= end30)
    .reduce((a, f) => a + Math.max(0, (+f.valor || +f.total || 0) - (+f.pago || 0)), 0)

  const pendingOut30 = compras
    .filter(c => c.status_pagamento === 'pendente')
    .filter(c => {
      const d = c.data_pagamento || c.data
      return d >= today && d <= end30
    })
    .reduce((a, c) => a + (+c.total_pago || +c.total_real || 0), 0)

  return {
    netCash: paidIn - paidOut,
    pendingIn30,
    pendingOut30,
    paidIn,
    paidOut,
  }
}
