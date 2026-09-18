/**
 * CRM de hóspedes + piso do bar (カウンター / 個室 / テーブル) + ボトルキープ.
 * Nunca grava em vendas / pedidos / faturas — só pos_vendas e tabelas bar_*.
 */

import { tokyoParts } from './tokyo.js'

export const SPACE_TYPES = [
  { id: 'counter', labelKey: 'spaces.types.counter' },
  { id: 'table', labelKey: 'spaces.types.table' },
  { id: 'vip_room', labelKey: 'spaces.types.vipRoom' },
  { id: 'standing', labelKey: 'spaces.types.standing' },
  { id: 'terrace', labelKey: 'spaces.types.terrace' },
]

export const GUEST_TAGS = [
  { id: 'regular', labelKey: 'guests.tags.regular' },
  { id: 'first', labelKey: 'guests.tags.first' },
  { id: 'vip', labelKey: 'guests.tags.vip' },
  { id: 'agency', labelKey: 'guests.tags.agency' },
  { id: 'drink_back', labelKey: 'guests.tags.drinkBack' },
  { id: 'foreign', labelKey: 'guests.tags.foreign' },
]

export const OPEN_VISIT_STATUSES = ['reserved', 'seated']

export function tokyoFloorPreset() {
  const spaces = []
  for (let i = 1; i <= 8; i++) {
    spaces.push({ nome: `カウンター ${i}`, tipo: 'counter', capacidade: 1, zona: 'counter', ordem: i })
  }
  ;['A', 'B', 'C', 'D'].forEach((letter, i) => {
    spaces.push({ nome: `テーブル ${letter}`, tipo: 'table', capacidade: 4, zona: 'table', ordem: 20 + i })
  })
  spaces.push({ nome: '個室 VIP 1', tipo: 'vip_room', capacidade: 6, zona: 'vip', ordem: 40 })
  spaces.push({ nome: '個室 VIP 2', tipo: 'vip_room', capacidade: 8, zona: 'vip', ordem: 41 })
  return spaces
}

export function isOpenVisit(visit) {
  return OPEN_VISIT_STATUSES.includes(visit?.status)
}

export function zoneLabelKey(zona) {
  if (zona === 'counter') return 'spaces.zoneCounter'
  if (zona === 'table') return 'spaces.zoneTable'
  if (zona === 'vip') return 'spaces.zoneVip'
  return null
}

export function decorateSpaces(spaces = [], visits = []) {
  const open = (visits || []).filter(isOpenVisit)
  return (spaces || [])
    .filter(s => s.ativo !== false)
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
    .map(s => {
      const visit = open.find(v => v.space_id === s.id) || null
      return {
        ...s,
        visit,
        occupied: visit?.status === 'seated',
        reserved: visit?.status === 'reserved',
      }
    })
}

export function spacesByZone(spaces = []) {
  const zones = []
  const seen = new Set()
  for (const s of spaces) {
    const z = s.zona || s.tipo || 'floor'
    if (!seen.has(z)) {
      seen.add(z)
      zones.push(z)
    }
  }
  return zones.map(zona => ({
    zona,
    spaces: spaces.filter(s => (s.zona || s.tipo || 'floor') === zona),
  }))
}

export function matchCheckoutVisit(visits = [], { spaceId, guestId } = {}) {
  const open = (visits || []).filter(isOpenVisit)
  if (spaceId) {
    const bySpace = open.find(v => v.space_id === spaceId)
    if (bySpace) return bySpace
  }
  if (guestId) {
    const byGuest = open.find(v => v.guest_id === guestId)
    if (byGuest) return byGuest
  }
  return null
}

export function visitMinutes(visit, now = Date.now()) {
  if (!visit?.inicio) return 0
  const start = new Date(visit.inicio).getTime()
  if (Number.isNaN(start)) return 0
  return Math.max(0, Math.round((now - start) / 60000))
}

export function formatVisitDuration(minutes) {
  const m = Math.max(0, Math.round(+minutes || 0))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}h ${rem}m` : `${h}h`
}

export function guestSpendFromPos(sales = [], guestId) {
  const mine = (sales || []).filter(s => s.guest_id === guestId)
  return {
    count: mine.length,
    total: mine.reduce((a, s) => a + (+s.total || 0), 0),
    last: mine[0]?.data || mine[0]?.criado_em || null,
  }
}

export function searchGuests(guests = [], q) {
  const s = String(q || '').trim().toLowerCase()
  if (!s) return guests
  return guests.filter(g =>
    [g.nome, g.telefone, g.line_id, g.email, g.preferred_host, ...(g.tags || [])]
      .filter(Boolean)
      .some(v => String(v).toLowerCase().includes(s))
  )
}

export function toggleTag(tags = [], tag) {
  const set = new Set(tags || [])
  if (set.has(tag)) set.delete(tag)
  else set.add(tag)
  return [...set]
}

export function birthdayThisMonth(guests = [], date = new Date()) {
  const month = tokyoParts(date).month
  return (guests || []).filter(g => {
    const d = String(g.aniversario || '')
    return d.length >= 7 && +d.slice(5, 7) === month
  })
}

export function birthdayToday(guests = [], date = new Date()) {
  const p = tokyoParts(date)
  const mmdd = `${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
  return (guests || []).filter(g => String(g.aniversario || '').slice(5, 10) === mmdd)
}

export function activeKeeps(keeps = [], guestId = null) {
  return (keeps || []).filter(k =>
    k.ativo !== false && (guestId == null || k.guest_id === guestId)
  )
}

export function keepExpiringSoon(keep, date = new Date(), days = 14) {
  if (!keep?.expires_on) return false
  const exp = new Date(`${keep.expires_on}T12:00:00+09:00`).getTime()
  const now = date instanceof Date ? date.getTime() : new Date(date).getTime()
  return exp - now <= days * 86400000 && exp >= now - 86400000
}

export async function checkCrmSchema(supabase) {
  const { error } = await supabase.from('bar_spaces').select('id').limit(1)
  if (!error) return { ready: true }
  try {
    const r = await fetch('/api/pos-status')
    const j = await r.json()
    if (j?.ready) return { ready: true, source: j.source }
  } catch {}
  if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
    return { ready: false, error: 'Run BAR_CRM_SPACES_SCHEMA.sql' }
  }
  return { ready: false, error: error.message }
}
