/** Optional appliance kit. Same 4 logins — hashes, not extra passwords. */

export const OPTIONAL_DEVICES = [
  { id: 'pos', icon: '🧾', labelKey: 'auth.openTillTablet', hintKey: 'auth.lanePos', roles: ['caixa', 'cliente', 'gerente'] },
  { id: 'send', icon: '📱', labelKey: 'auth.openSendPhone', hintKey: 'auth.laneSend', roles: ['caixa', 'cliente', 'gerente'] },
  { id: 'make', icon: '🍹', labelKey: 'auth.openDrinksBoard', hintKey: 'auth.laneMake', roles: ['caixa', 'cliente', 'gerente'] },
  { id: 'live', icon: '📡', labelKey: 'auth.openLiveWatch', hintKey: 'auth.laneLive', roles: ['cliente', 'gerente'] },
  { id: 'gerente', icon: '🏛️', labelKey: 'auth.openHq', hintKey: 'auth.doorGerenteTitle', roles: ['cliente', 'gerente'] },
]

export function devicesForRole(role, { current = '', includeCurrent = true } = {}) {
  return OPTIONAL_DEVICES.filter(d => {
    if (!d.roles.includes(role)) return false
    if (!includeCurrent && d.id === current) return false
    return true
  })
}
