/** Hands-free drinks board. Night sequence from POS pours — never JBM vendas/faturas. */

import { tokyoNightKey, tokyoParts } from './tokyo.js'
import { saleOnNight } from './nightClose.js'
import { orderCastFromObs, orderDetailsFromObs } from './orderMeta.js'

export const MAKE_WINDOW_MS = 8 * 60 * 1000
export const MAKE_POLL_MS = 4000

const EXTRA_PRICE = /^(set|nominho|service|room_min)$/i
const EXTRA_NAME = /サービス|指名|セット|個室|service fee|room min|nominho/i

export function padSeq(n) {
  const v = Math.max(0, Math.round(+n || 0))
  return String(v).padStart(2, '0')
}

export function isPourLine(it) {
  if (!it) return false
  const kind = String(it.tipo_preco || it.kind || '')
  if (EXTRA_PRICE.test(kind)) return false
  const nome = String(it.nome || '').trim()
  if (!nome || EXTRA_NAME.test(nome)) return false
  return +it.qtd > 0
}

export function clockLabel(iso) {
  if (!iso) return '—'
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = tokyoParts(d)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(p.hour)}:${pad(p.minute)}`
}

function spaceName(ticket, spaces = []) {
  if (!ticket?.space_id) return ''
  const row = (spaces || []).find(s => s.id === ticket.space_id)
  return row?.nome || ''
}

function poursOf(ticketId, items = []) {
  return (items || [])
    .filter(it => it.pos_venda_id === ticketId && isPourLine(it))
    .map(it => ({
      nome: String(it.nome || '').trim(),
      qtd: Math.max(1, Math.round(+it.qtd || 1)),
    }))
}

function floorPours(order) {
  return (order?.items || [])
    .filter(isPourLine)
    .map(it => ({
      nome: String(it.nome || '').trim(),
      qtd: Math.max(1, Math.round(+it.qtd || 1)),
    }))
}

function floorOnNight(order, nightKey) {
  if (!order) return false
  if (order.night_key) return String(order.night_key) === String(nightKey)
  return saleOnNight({ data: order.data, criado_em: order.criado_em }, nightKey)
}

export function buildDrinkBoard({
  tickets = [],
  items = [],
  spaces = [],
  floorOrders = [],
  now = new Date(),
  windowMs = MAKE_WINDOW_MS,
  nightKey = tokyoNightKey(now),
} = {}) {
  const at = now instanceof Date ? now : new Date(now)
  const nights = []

  for (const sale of tickets || []) {
    if (!saleOnNight(sale, nightKey)) continue
    const pours = poursOf(sale.id, items)
    if (!pours.length) continue
    nights.push({
      id: sale.id,
      at: sale.criado_em || sale.data,
      pours,
      space: spaceName(sale, spaces),
      cast: orderCastFromObs(sale.obs),
      note: orderDetailsFromObs(sale.obs).slice(0, 80),
      source: 'till',
    })
  }

  for (const order of floorOrders || []) {
    if ((order.status || 'sent') !== 'sent') continue
    if (!floorOnNight(order, nightKey)) continue
    const pours = floorPours(order)
    if (!pours.length) continue
    nights.push({
      id: order.id,
      at: order.criado_em || order.data,
      pours,
      space: order.space_nome || spaceName(order, spaces),
      cast: String(order.cast || '').trim(),
      note: String(order.note || '').trim().slice(0, 80),
      source: 'phone',
    })
  }

  nights.sort((a, b) => new Date(a.at) - new Date(b.at))
  const sequenced = nights.map((row, i) => ({
    ...row,
    seq: i + 1,
    seqLabel: padSeq(i + 1),
    clock: clockLabel(row.at),
    pourCount: row.pours.reduce((a, p) => a + p.qtd, 0),
  }))

  const cutoff = at.getTime() - Math.max(30_000, +windowMs || MAKE_WINDOW_MS)
  const pending = sequenced.filter(t => {
    const ts = new Date(t.at).getTime()
    return ts && ts >= cutoff
  })
  const current = pending[0] || null
  const next = pending.slice(1)
  return {
    mixed: false,
    kind: 'make-board',
    nightKey,
    waiting: !current,
    current,
    next,
    pendingCount: pending.length,
    tonightCount: sequenced.length,
    lastSeq: sequenced.length ? padSeq(sequenced.length) : '00',
    clock: clockLabel(at),
  }
}
