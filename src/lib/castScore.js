/** CAST / drink-back scoreboard. One person, one set of numbers. Never mix the four books. */

import { tokyoHour, tokyoMonthKey, tokyoNightKey } from './tokyo.js'
import { aggregateHourlySales } from './atomicPos.js'

/** Nightlife display order: 18:00 → 05:00. */
export const NIGHT_HOUR_ORDER = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5]

export function payBucket(method) {
  const m = String(method || 'Cash')
  if (/paypay|ペイペイ/i.test(m)) return 'paypay'
  if (/card|credit|debit|visa|クレジット/i.test(m)) return 'card'
  if (/cash|現金/i.test(m)) return 'cash'
  return 'other'
}

export function salesForNight(sales = [], nightKey) {
  const key = String(nightKey || tokyoNightKey())
  return (sales || []).filter(s => String(s.data || '').slice(0, 10) === key)
}

export function salesForMonth(sales = [], monthKey) {
  const mes = String(monthKey || tokyoMonthKey())
  return (sales || []).filter(s => String(s.data || '').slice(0, 7) === mes)
}

export function salesForCast(sales = [], agentId) {
  if (!agentId) return (sales || []).filter(s => !s.drink_back_agent_id)
  return (sales || []).filter(s => s.drink_back_agent_id === agentId)
}

export function sliceNightHours(hourly = []) {
  const byHour = Object.fromEntries((hourly || []).map(h => [h.hour, h]))
  return NIGHT_HOUR_ORDER.map(hour => byHour[hour] || {
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    count: 0,
    total: 0,
  })
}

export function segmentPayMix(sales = []) {
  const mix = { cash: 0, card: 0, paypay: 0, other: 0 }
  for (const s of sales || []) {
    mix[payBucket(s.metodo_pagamento)] += +s.total || 0
  }
  return mix
}

export function metricsOf(sales = []) {
  const total = (sales || []).reduce((a, s) => a + (+s.total || 0), 0)
  const count = (sales || []).length
  const ticketMedio = count > 0 ? Math.round(total / count) : 0
  const hourly = aggregateHourlySales(sales)
  const nightHours = sliceNightHours(hourly)
  const peakHour = nightHours.reduce((best, h) => (h.total > best.total ? h : best), nightHours[0])
  return {
    total: Math.round(total),
    count,
    ticketMedio,
    hourly,
    nightHours,
    peakHour,
    pay: segmentPayMix(sales),
  }
}

export function goalOf(agent = {}, stored = {}) {
  const g = stored || {}
  return {
    night: Math.round(+agent.meta_noite || +g.night || 0),
    month: Math.round(+agent.meta_mes || +g.month || 0),
    breakeven: Math.round(+agent.breakeven || +g.breakeven || 0),
  }
}

export function goalProgress(actual, goal) {
  const g = Math.round(+goal || 0)
  const a = Math.round(+actual || 0)
  if (g <= 0) return { pct: 0, gap: 0, has: false }
  return { pct: Math.min(999, Math.round((a / g) * 100)), gap: a - g, has: true }
}

export function breakevenGap(actual, breakeven) {
  const be = Math.round(+breakeven || 0)
  const a = Math.round(+actual || 0)
  if (be <= 0) return { gap: 0, has: false, covered: true }
  return { gap: a - be, has: true, covered: a >= be }
}

export function castLane({ nightTotal, monthTotal, goal }) {
  const be = breakevenGap(nightTotal, goal.breakeven)
  const night = goalProgress(nightTotal, goal.night)
  const month = goalProgress(monthTotal, goal.month)
  let status = 'open'
  if (be.has && !be.covered) status = 'below_be'
  else if (night.has && night.gap >= 0) status = 'hit_goal'
  else if (be.has && be.covered) status = 'covering'
  else if (night.has) status = 'to_goal'
  return { be, night, month, status }
}

export function commissionOf(total, pct) {
  return Math.round((+total || 0) * (+pct || 0) / 100)
}

export function scoreCastPerson(agent, sales = [], {
  nightKey = tokyoNightKey(),
  monthKey = tokyoMonthKey(),
  goals = {},
} = {}) {
  const id = agent?.id
  const mine = salesForCast(sales, id)
  const nightSales = salesForNight(mine, nightKey)
  const monthSales = salesForMonth(mine, monthKey)
  const night = metricsOf(nightSales)
  const month = metricsOf(monthSales)
  const goal = goalOf(agent, goals[id])
  const lane = castLane({ nightTotal: night.total, monthTotal: month.total, goal })
  const pct = +agent?.comissao_pct || 0
  return {
    id,
    nome: agent?.nome || 'CAST',
    ativo: agent?.ativo !== false,
    comissao_pct: pct,
    goal,
    night: {
      ...night,
      commission: commissionOf(night.total, pct),
    },
    month: {
      ...month,
      commission: commissionOf(month.total, pct),
    },
    lane,
  }
}

export function scoreCastRoster(agents = [], sales = [], opts = {}) {
  const people = (agents || [])
    .map(a => scoreCastPerson(a, sales, opts))
    .sort((a, b) => b.month.total - a.month.total || b.night.total - a.night.total || a.nome.localeCompare(b.nome))
  const tagged = (sales || []).filter(s => s.drink_back_agent_id)
  const floor = (sales || []).filter(s => !s.drink_back_agent_id)
  const nightKey = opts.nightKey || tokyoNightKey()
  const monthKey = opts.monthKey || tokyoMonthKey()
  return {
    nightKey,
    monthKey,
    people,
    floor: {
      night: metricsOf(salesForNight(floor, nightKey)),
      month: metricsOf(salesForMonth(floor, monthKey)),
    },
    all: {
      night: metricsOf(salesForNight(sales, nightKey)),
      month: metricsOf(salesForMonth(sales, monthKey)),
      taggedNight: metricsOf(salesForNight(tagged, nightKey)),
      taggedMonth: metricsOf(salesForMonth(tagged, monthKey)),
    },
  }
}

export function hourlyByCast(agents = [], sales = []) {
  const out = { all: sliceNightHours(aggregateHourlySales(sales)) }
  for (const a of agents || []) {
    out[a.id] = sliceNightHours(aggregateHourlySales(salesForCast(sales, a.id)))
  }
  out.floor = sliceNightHours(aggregateHourlySales(salesForCast(sales, null)))
  return out
}

export function tokyoHourOf(ts) {
  return tokyoHour(ts)
}
