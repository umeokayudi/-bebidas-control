/** Níveis de acesso — cada login vê só o que é dele. JBM ≠ bar ≠ caixa ≠ staff. */

export const ROLES = {
  admin: 'admin',
  funcionario: 'funcionario',
  cliente: 'cliente',
  caixa: 'caixa',
  bar_staff: 'bar_staff',
}

export const JBM_ROLES = [ROLES.admin, ROLES.funcionario]
export const BAR_ROLES = [ROLES.cliente, ROLES.caixa, ROLES.bar_staff]
export const BAR_ROLES_NEED_BAR = BAR_ROLES

export function isJbmRole(role) {
  return JBM_ROLES.includes(role) || role === 'staff'
}

export function isBarRole(role) {
  return BAR_ROLES.includes(role)
}

export function needsBarLink(role) {
  return BAR_ROLES_NEED_BAR.includes(role)
}

export function defaultBarTab(role) {
  if (role === ROLES.caixa) return 'pos'
  if (role === ROLES.bar_staff) return 'ponto'
  return 'inicio'
}

const OWNER_NAV = [
  { id: 'inicio', labelKey: 'nav.portalHome', icon: '🏠' },
  { id: 'pos', labelKey: 'nav.portalPos', icon: '🧾' },
  { id: 'ponto', labelKey: 'nav.portalClock', icon: '🕒' },
  { id: 'equipe', labelKey: 'nav.portalTeam', icon: '👥' },
  { id: 'clientes', labelKey: 'nav.portalGuests', icon: '🥂' },
  { id: 'espacos', labelKey: 'nav.portalSpaces', icon: '🪑' },
  { id: 'pedidos', labelKey: 'nav.portalOrders', icon: '🛒' },
  { id: 'entregas', labelKey: 'nav.portalDeliveries', icon: '📦' },
  { id: 'estoque', labelKey: 'nav.portalInventory', icon: '📊' },
  { id: 'precos', labelKey: 'nav.portalPrices', icon: '💰' },
  { id: 'faturas', labelKey: 'nav.portalInvoices', icon: '💳' },
  { id: 'recibos', labelKey: 'nav.portalReceipts', icon: '🧾' },
  { id: 'ia', labelKey: 'nav.portalAi', icon: '🤖' },
]

const CAIXA_NAV = [
  { id: 'pos', labelKey: 'nav.portalPos', icon: '🧾' },
  { id: 'ponto', labelKey: 'nav.portalClock', icon: '🕒' },
]

const STAFF_NAV = [
  { id: 'ponto', labelKey: 'nav.portalClock', icon: '🕒' },
]

export function navForBarRole(role) {
  if (role === ROLES.caixa) return CAIXA_NAV
  if (role === ROLES.bar_staff) return STAFF_NAV
  return OWNER_NAV
}

export function posAccessForRole(role) {
  if (role === ROLES.caixa) return 'cashier'
  if (role === ROLES.cliente) return 'owner'
  return 'none'
}

export function canManageBarTeam(role) {
  return role === ROLES.cliente
}

export function canSeeJbmSupply(role) {
  return role === ROLES.cliente || isJbmRole(role)
}
