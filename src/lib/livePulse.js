/** This-hour floor pulse. Till vs staff on the clock — never a fifth mixed book. */

import { tokyoHour, tokyoNightKey, tokyoParts } from './tokyo.js'
import { saleOnNight } from './nightClose.js'
import { pairPunches, isLateNightHour, LATE_NIGHT_PREMIUM } from './timeClock.js'
import { booksGrandTotal } from './costBooks.js'

export const LIVE_POLL_MS = 15000
export const LIVE_PUNCH_LOOKBACK_MS = 36 * 3600 * 1000

function pad2(n) {
  return String(n).padStart(2, '0')
}

export function saleClockLabel(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = tokyoParts(d)
  return `${pad2(p.hour)}:${pad2(p.minute)}`
}

export function lastSaleOf(tickets = []) {
  const sorted = [...(tickets || [])]
    .filter(s => s?.criado_em || s?.data)
    .sort((a, b) => new Date(b.criado_em || b.data) - new Date(a.criado_em || a.data))
  return sorted[0] || null
}

export function salesThisHour(tickets = [], now = new Date()) {
  const at = now instanceof Date ? now : new Date(now)
  const hour = tokyoHour(at)
  const nightKey = tokyoNightKey(at)
  return (tickets || []).filter(s => {
    if (!saleOnNight(s, nightKey)) return false
    const ts = s.criado_em || s.data
    if (!ts) return false
    return tokyoHour(ts) === hour
  })
}

export function staffHourlyBurn(rate, hour) {
  const r = Math.max(0, +rate || 0)
  const late = isLateNightHour(hour)
  return Math.round(r * (late ? 1 + LATE_NIGHT_PREMIUM : 1))
}

export function openClockedStaff(punches = [], staffList = [], now = new Date()) {
  const at = now instanceof Date ? now : new Date(now)
  const hour = tokyoHour(at)
  const shifts = pairPunches(punches)
  const byId = Object.fromEntries((staffList || []).map(s => [s.id, s]))
  return shifts
    .filter(sh => sh.open)
    .map(sh => {
      const row = byId[sh.staff_id] || {}
      const rate = +row.salario_hora || 0
      const hourlyBurn = staffHourlyBurn(rate, hour)
      return {
        staff_id: sh.staff_id,
        nome: row.nome || '—',
        cargo: row.cargo || '',
        rate,
        hourlyBurn,
        late: isLateNightHour(hour),
        clockIn: sh.clockIn?.punched_at || null,
      }
    })
    .sort((a, b) => b.hourlyBurn - a.hourlyBurn || String(a.nome).localeCompare(String(b.nome)))
}

function pulseColor({ openCount, hourTill, hourWageBurn }) {
  if (!openCount) return 'idle'
  return hourTill >= hourWageBurn ? 'blue' : 'red'
}

export function localCutSuggestions({ hourTill = 0, hourWageBurn = 0, openStaff = [], color } = {}) {
  const staff = [...(openStaff || [])].sort((a, b) => b.hourlyBurn - a.hourlyBurn)
  const tone = color || pulseColor({ openCount: staff.length, hourTill, hourWageBurn })
  if (!staff.length) {
    return [{
      id: 'none',
      kind: 'none',
      names: [],
      ids: [],
      savedYen: 0,
      afterBurn: 0,
      afterColor: hourTill > 0 ? 'blue' : 'idle',
    }]
  }

  const alts = []
  if (tone === 'blue' || tone === 'idle') {
    alts.push({
      id: 'keep',
      kind: 'keep',
      names: staff.map(s => s.nome),
      ids: [],
      savedYen: 0,
      afterBurn: hourWageBurn,
      afterColor: tone,
    })
    if (staff.length > 1) {
      const cut = staff.slice(0, 1)
      const rest = staff.slice(1)
      const after = rest.reduce((a, s) => a + s.hourlyBurn, 0)
      alts.push({
        id: 'trim1',
        kind: 'optional',
        names: cut.map(s => s.nome),
        ids: cut.map(s => s.staff_id),
        savedYen: cut.reduce((a, s) => a + s.hourlyBurn, 0),
        afterBurn: after,
        afterColor: hourTill >= after ? 'blue' : 'red',
      })
    }
    return alts
  }

  let covering = false
  for (let n = 1; n <= Math.min(3, staff.length); n++) {
    const cut = staff.slice(0, n)
    const saved = cut.reduce((a, s) => a + s.hourlyBurn, 0)
    const after = Math.max(0, hourWageBurn - saved)
    const afterColor = hourTill >= after ? 'blue' : 'red'
    alts.push({
      id: `cut${n}`,
      kind: afterColor === 'blue' ? 'covers' : 'partial',
      names: cut.map(s => s.nome),
      ids: cut.map(s => s.staff_id),
      savedYen: saved,
      afterBurn: after,
      afterColor,
    })
    if (afterColor === 'blue') {
      covering = true
      break
    }
  }
  if (!covering && staff.length > 3) {
    const restOne = staff.slice(-1)
    const cut = staff.slice(0, -1)
    const saved = cut.reduce((a, s) => a + s.hourlyBurn, 0)
    const after = restOne.reduce((a, s) => a + s.hourlyBurn, 0)
    alts.push({
      id: 'skeleton',
      kind: hourTill >= after ? 'covers' : 'partial',
      names: cut.map(s => s.nome),
      ids: cut.map(s => s.staff_id),
      savedYen: saved,
      afterBurn: after,
      afterColor: hourTill >= after ? 'blue' : 'red',
    })
  }
  return alts
}

export function buildLivePulse({ tickets = [], punches = [], staff = [], now = new Date() } = {}) {
  const at = now instanceof Date ? now : new Date(now)
  const nightKey = tokyoNightKey(at)
  const hour = tokyoHour(at)
  const nightSales = (tickets || []).filter(s => saleOnNight(s, nightKey))
  const hourSales = salesThisHour(tickets, at)
  const last = lastSaleOf(nightSales.length ? nightSales : tickets)
  const tonightTill = nightSales.reduce((a, s) => a + (+s.total || 0), 0)
  const hourTill = hourSales.reduce((a, s) => a + (+s.total || 0), 0)
  const openStaff = openClockedStaff(punches, staff, at)
  const hourWageBurn = openStaff.reduce((a, s) => a + s.hourlyBurn, 0)
  const color = pulseColor({ openCount: openStaff.length, hourTill, hourWageBurn })
  const cuts = localCutSuggestions({ hourTill, hourWageBurn, openStaff, color })
  return {
    mixed: false,
    book: null,
    kind: 'hour-ops',
    nightKey,
    hour,
    hourLabel: `${pad2(hour)}:00`,
    lastSale: last
      ? {
        id: last.id || null,
        total: Math.round(+last.total || 0),
        at: last.criado_em || last.data,
        method: last.metodo_pagamento || '',
        obs: String(last.obs || '').slice(0, 80),
      }
      : null,
    tonightTill: Math.round(tonightTill),
    tonightCount: nightSales.length,
    hourTill: Math.round(hourTill),
    hourCount: hourSales.length,
    openCount: openStaff.length,
    openStaff,
    hourWageBurn,
    color,
    gap: Math.round(hourTill - hourWageBurn),
    cuts,
    booksGrandTotal: booksGrandTotal(),
  }
}

export function buildStaffCutSystem(pulse, lang = 'en') {
  const p = pulse || {}
  const yen = n => `¥${Math.round(n || 0).toLocaleString('ja-JP')}`
  const roster = (p.openStaff || [])
    .map(s => `${s.nome} (${s.cargo || 'floor'}) rate ${yen(s.rate)}/h burn ${yen(s.hourlyBurn)}${s.late ? ' late+25%' : ''}`)
    .join('\n')
  const alts = (p.cuts || [])
    .map(c => `${c.id}: ${c.kind} send ${c.names.join(', ') || '(none)'} save ${yen(c.savedYen)} after ${yen(c.afterBurn)} → ${c.afterColor}`)
    .join('\n')
  const facts = `
THIS HOUR OPS PULSE ONLY — not a fifth cost book. Never add POS month + JBM + wages month + rent.
Night ${p.nightKey || ''} · hour ${p.hourLabel || ''} JST · color ${p.color || 'idle'}
Last sale: ${p.lastSale ? `${yen(p.lastSale.total)} at ${saleClockLabel(p.lastSale.at)} (${p.lastSale.method || '—'})` : 'none tonight'}
Tonight till: ${yen(p.tonightTill)} (${p.tonightCount || 0} tickets)
This-hour till: ${yen(p.hourTill)} (${p.hourCount || 0} tickets)
This-hour wage burn: ${yen(p.hourWageBurn)} · ${p.openCount || 0} clocked in (late-night +25% from 22:00–05:00 JST)
Gap till−burn: ${yen(p.gap)}
Staff on clock:
${roster || '(nobody punched in)'}
Local alternatives (highest burn first):
${alts || '(none)'}
Task: suggest 1–3 ways to send people home THIS HOUR so till covers wage burn. Name people. If already blue, say keep the floor. If idle, say wait for punches. Do not invent monthly P&L. Do not mix books.`

  if (lang === 'ja') {
    return `あなたはバーのフロア責任者AIです。今この時間だけを見てください。4つの帳簿は足しません。日本語で短く。
${facts}`
  }
  return `You are the floor manager AI for this hour only. Never add the four books. Answer in clear English.
${facts}`
}

export function localStaffCutAnswer(pulse, lang = 'en') {
  const p = pulse || {}
  const yen = n => `¥${Math.round(n || 0).toLocaleString('ja-JP')}`
  const ja = lang === 'ja'
  const roster = (p.openStaff || []).map(s => `${s.nome} ${yen(s.hourlyBurn)}/h`).join(', ')
  const alts = (p.cuts || [])
    .filter(c => c.kind !== 'none')
    .map(c => {
      if (c.kind === 'keep') return ja ? `このまま：${c.names.join('、')}` : `Keep: ${c.names.join(', ')}`
      return ja
        ? `帰す ${c.names.join('、')} → ${yen(c.savedYen)}/h 節約、残 ${yen(c.afterBurn)}（${c.afterColor === 'blue' ? '青' : '赤'}）`
        : `Send home ${c.names.join(', ')} → save ${yen(c.savedYen)}/h, then ${yen(c.afterBurn)} (${c.afterColor})`
    })
    .join('\n')

  if (p.color === 'idle') {
    return ja
      ? `今は打刻ゼロ。青/赤はスタッフ人数で見る。今月のPOS・JBM・給与・家賃は足さない。`
      : `Nobody is on the clock. Blue/red waits on staff volume this hour. Not POS month, not JBM, not wages month, not rent.`
  }
  if (p.color === 'blue') {
    return ja
      ? `この時間は青：レジ ${yen(p.hourTill)} が人件費 ${yen(p.hourWageBurn)} をカバー（${p.openCount}人：${roster}）。\n${alts}`
      : `BLUE this hour: till ${yen(p.hourTill)} covers staff burn ${yen(p.hourWageBurn)} (${p.openCount} on clock: ${roster}).\n${alts}`
  }
  return ja
    ? `この時間は赤：レジ ${yen(p.hourTill)} < 人件費 ${yen(p.hourWageBurn)}（${p.openCount}人：${roster}）。\n${alts || '帰す候補なし'}`
    : `RED this hour: till ${yen(p.hourTill)} is under staff burn ${yen(p.hourWageBurn)} (${p.openCount} on clock: ${roster}).\n${alts || 'No cut list.'}`
}
