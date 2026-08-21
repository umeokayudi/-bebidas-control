const API = import.meta.env.VITE_HOLDING_API || 'https://bebidas-control.vercel.app/api/holding-modules'

let cache = null
let cacheAt = 0

export function invalidateHoldingCache() {
  cache = null
  cacheAt = 0
}

export async function fetchHoldingModulesRemote() {
  const now = Date.now()
  if (cache && now - cacheAt < 30_000) return cache

  const res = await fetch(API, { cache: 'no-store' })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || res.statusText)

  cache = data
  cacheAt = now
  return data
}

export async function postHoldingAction(action, form, personMeta) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, form, personMeta }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || res.statusText)
  invalidateHoldingCache()
  return data
}
