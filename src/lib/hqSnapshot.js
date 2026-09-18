import { staffFetch } from './apiAuth'
import { getGlobalLang } from './i18n'
import { buildHqChatSystem as buildHqChatSystemBase } from './hqChat'
import { localHoursPay } from './timeClock'

export { localHoursPay }

export async function fetchHqSnapshot() {
  const r = await staffFetch('/api/bar/hq-sync')
  const j = await r.json().catch(() => ({ error: r.statusText }))
  if (!r.ok) throw new Error(j.error || 'HQ sync failed')
  return j
}

export async function saveHqRent({ amount, note, month_key }) {
  const r = await staffFetch('/api/bar/hq-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rent: { amount, note, month_key } }),
  })
  const j = await r.json().catch(() => ({ error: r.statusText }))
  if (!r.ok) throw new Error(j.error || 'Rent save failed')
  return j
}

export function buildHqChatSystem(snapshot) {
  return buildHqChatSystemBase(snapshot, getGlobalLang())
}
