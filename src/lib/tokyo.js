/** Asia/Tokyo calendar — POS day, payroll month, 深夜 hours. Japan has no DST. */

export const TOKYO_TZ = 'Asia/Tokyo'
export const TOKYO_OFFSET_HOURS = 9

export function tokyoParts(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TOKYO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]))
  return {
    year: +parts.year,
    month: +parts.month,
    day: +parts.day,
    hour: +parts.hour,
    minute: +parts.minute,
    second: +parts.second,
  }
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

export function tokyoDateKey(date = new Date()) {
  const p = tokyoParts(date)
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`
}

export function tokyoMonthKey(date = new Date()) {
  return tokyoDateKey(date).slice(0, 7)
}

export function tokyoHour(date = new Date()) {
  return tokyoParts(date).hour
}

/** Wall-clock in Tokyo → UTC ms. Month is 1–12. */
export function tokyoWallToUtcMs(year, month, day, hour = 0, minute = 0, second = 0, ms = 0) {
  return Date.UTC(year, month - 1, day, hour - TOKYO_OFFSET_HOURS, minute, second, ms)
}

export function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Inclusive month bounds in timestamptz, using Tokyo civil days. */
export function monthRange(isoDay = tokyoDateKey()) {
  const [y, m] = String(isoDay).slice(0, 10).split('-').map(Number)
  const last = lastDayOfMonth(y, m)
  const from = new Date(tokyoWallToUtcMs(y, m, 1, 0, 0, 0, 0)).toISOString()
  const to = new Date(tokyoWallToUtcMs(y, m, last, 23, 59, 59, 999)).toISOString()
  return { from, to, monthKey: `${y}-${pad2(m)}` }
}

export function dateLocale(lang) {
  return lang === 'ja' ? 'ja-JP' : 'en-US'
}
