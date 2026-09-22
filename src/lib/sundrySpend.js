/** Random / sundry spend. Never POS till, never JBM vendas/faturas, never wages, never rent. */

import { tokyoMonthKey, tokyoNightKey, tokyoDateKey } from './tokyo.js'

export const SUNDRY_KIND = 'sundry'

export function yenAmount(value) {
  const n = Math.round(+value || 0)
  return n > 0 ? n : 0
}

export function normalizeSundry(row = {}, now = new Date()) {
  const spent = row.spent_at || row.criado_em || now.toISOString()
  const when = new Date(spent)
  const ok = !Number.isNaN(when.getTime()) ? when : now
  const amount = yenAmount(row.amount ?? row.valor)
  const what = String(row.what || row.note || row.descricao || '').trim()
  return {
    id: row.id || null,
    bar_id: row.bar_id || null,
    kind: SUNDRY_KIND,
    amount,
    what,
    note: String(row.note || '').trim(),
    photo_url: row.photo_url || null,
    spent_at: ok.toISOString(),
    night_key: row.night_key || tokyoNightKey(ok),
    month_key: row.month_key || tokyoMonthKey(ok),
    day_key: row.day_key || tokyoDateKey(ok),
    criado_em: row.criado_em || ok.toISOString(),
    criado_por: row.criado_por || null,
  }
}

export function sundryPayload(input, now = new Date()) {
  const row = normalizeSundry(input, now)
  return {
    bar_id: row.bar_id,
    kind: SUNDRY_KIND,
    amount: row.amount,
    what: row.what,
    note: row.note,
    photo_url: row.photo_url,
    spent_at: row.spent_at,
    night_key: row.night_key,
    month_key: row.month_key,
  }
}

export function sundryReady(row) {
  return yenAmount(row?.amount) > 0 && String(row?.what || '').trim().length > 0
}

export function sundryMonthRows(rows = [], monthKey) {
  const mes = String(monthKey || tokyoMonthKey())
  return (rows || []).filter(r => String(r.month_key || r.spent_at || '').startsWith(mes) && r.kind !== 'rent')
}

export function sundryNightRows(rows = [], nightKey) {
  const key = String(nightKey || tokyoNightKey())
  return (rows || []).filter(r => String(r.night_key || '') === key)
}

export function sundryTotal(rows = []) {
  return (rows || []).reduce((a, r) => a + yenAmount(r.amount), 0)
}

export function parseSundryScan(parsed = {}) {
  const amount = yenAmount(parsed.amount ?? parsed.valor ?? parsed.total)
  const what = String(parsed.what || parsed.item || parsed.items || parsed.descricao || parsed.note || '').trim()
  const date = String(parsed.date || parsed.data || '').slice(0, 10)
  return { amount, what, date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '' }
}

/** Guard: sundry must never become a fifth mixed book. */
export function sundryStaysApart(books) {
  return (
    books?.pos?.kind === 'till'
    && books?.jbm?.kind === 'bill'
    && books?.staff?.kind === 'wages'
    && books?.rent?.kind === 'overhead'
    && books.pos.amount !== books.jbm.amount + books.staff.amount + books.rent.amount
  )
}
