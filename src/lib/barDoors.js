/** Login doors and till-tablet URLs. Never put passwords here. */

export const DOOR_PREF_KEY = 'bar_login_door'

export const LOGIN_DOORS = [
  {
    id: 'pos',
    hash: 'pos',
    titleKey: 'auth.doorPosTitle',
    hintKey: 'auth.doorPosHint',
    keep: true,
    prefillEmail: 'pos@atomic.bar',
  },
  {
    id: 'gerente',
    hash: 'hq',
    titleKey: 'auth.doorGerenteTitle',
    hintKey: 'auth.doorGerenteHint',
    keep: false,
    prefillEmail: '',
  },
  {
    id: 'clock',
    hash: 'clock',
    titleKey: 'auth.doorStaffTitle',
    hintKey: 'auth.doorStaffHint',
    keep: true,
    prefillEmail: 'funcionario@atomic.bar',
  },
  {
    id: 'jbm',
    hash: 'jbm',
    titleKey: 'auth.doorJbmTitle',
    hintKey: 'auth.doorJbmHint',
    keep: false,
    prefillEmail: '',
  },
]

export function loginDoorFromHash(hash = typeof location !== 'undefined' ? location.hash : '') {
  const h = String(hash || '').replace(/^#\/?/, '').split(/[/?#]/)[0].toLowerCase()
  if (h === 'pos' || h === 'till' || h === 'caixa') return 'pos'
  if (h === 'clock' || h === 'ponto' || h === 'staff') return 'clock'
  if (h === 'hq' || h === 'office' || h === 'gerente') return 'gerente'
  if (h === 'jbm' || h === 'supply') return 'jbm'
  if (h === 'live' || h === 'watch' || h === 'pulse') return 'live'
  if (h === 'make' || h === 'pour' || h === 'drinks') return 'make'
  return ''
}

export function hashForDoor(id) {
  if (id === 'pos') return '#/pos'
  if (id === 'clock') return '#/clock'
  if (id === 'gerente') return '#/hq'
  if (id === 'jbm') return '#/jbm'
  if (id === 'live') return '#/live'
  if (id === 'make') return '#/make'
  return '#/'
}

export function doorById(id) {
  return LOGIN_DOORS.find(d => d.id === id) || null
}

export function readDoorPref() {
  try { return localStorage.getItem(DOOR_PREF_KEY) || '' } catch { return '' }
}

export function writeDoorPref(id) {
  try {
    if (id) localStorage.setItem(DOOR_PREF_KEY, id)
    else localStorage.removeItem(DOOR_PREF_KEY)
  } catch {}
}

export function setDoorHash(id) {
  if (typeof location === 'undefined') return
  const next = hashForDoor(id)
  if (location.hash !== next) location.hash = next
}

/** POS till tablet chrome — caixa always, or owner covering the floor via /#/pos. */
export function isTillKiosk(role, door = loginDoorFromHash()) {
  if (door === 'make' || door === 'live') return false
  if (role === 'caixa') return true
  if (door === 'pos' && (role === 'cliente' || role === 'gerente')) return true
  return false
}

export function isClockKiosk(role) {
  return role === 'bar_staff'
}

/** Gerente watch tablet — last sale / live till / this-hour blue-red. Not a 5th password door. */
export function isLiveKiosk(role, door = loginDoorFromHash()) {
  return door === 'live' && (role === 'cliente' || role === 'gerente')
}

/** Drinks-make tablet — big night sequence, no touch. Same POS/Manager login, not a new password. */
export function isMakeKiosk(role, door = loginDoorFromHash()) {
  if (door !== 'make') return false
  return role === 'caixa' || role === 'cliente' || role === 'gerente'
}

export function doorAllowsRole(door, role) {
  if (!door) return true
  if (door === 'pos') return role === 'caixa' || role === 'cliente' || role === 'gerente'
  if (door === 'clock') return role === 'bar_staff'
  if (door === 'gerente') return role === 'cliente' || role === 'gerente'
  if (door === 'live') return role === 'cliente' || role === 'gerente'
  if (door === 'make') return role === 'caixa' || role === 'cliente' || role === 'gerente'
  if (door === 'jbm') return role === 'admin' || role === 'funcionario' || role === 'staff'
  return true
}
