import { createHash, timingSafeEqual } from 'crypto'

export function hashSecret(value) {
  return createHash('sha256').update(String(value || '')).digest('hex')
}

export function secretsMatch(plain, hashed) {
  if (!plain || !hashed) return false
  const a = Buffer.from(hashSecret(plain))
  const b = Buffer.from(String(hashed))
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function randomTabletCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}
