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

export function buildDrinkBoard({
  tickets = [],
  items = [],
  spaces = [],
  now = new Date(),
  windowMs = MAKE_WINDOW_MS,
  nightKey = tokyoNightKey(now),
} = {}) {
  const at = now instanceof Date ? now : new Date(now)
  const night = (tickets || [])
    .filter(s => saleOnNight(s, nightKey))
    .slice()
    .sort((a, b) => new Date(a.criado_em || a.data) - new Date(b.criado_em || b.data))

  const sequenced = []
  for (const sale of night) {
    const pours = poursOf(sale.id, items)
    if (!pours.length) continue
    sequenced.push({
      id: sale.id,
      seq: sequenced.length + 1,
      seqLabel: padSeq(sequenced.length + 1),
      at: sale.criado_em || sale.data,
      clock: clockLabel(sale.criado_em || sale.data),
      pours,
      pourCount: pours.reduce((a, p) => a + p.qtd, 0),
      space: spaceName(sale, spaces),
      cast: orderCastFromObs(sale.obs),
      note: orderDetailsFromObs(sale.obs).slice(0, 80),
    })
  }

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
