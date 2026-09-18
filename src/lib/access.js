/** Access + cost books. POS till ≠ JBM invoice ≠ staff wages. */

export const ROLES = {
  admin: 'admin',
  funcionario: 'funcionario',
  cliente: 'cliente',
  gerente: 'gerente',
  caixa: 'caixa',
  bar_staff: 'bar_staff',
}

export const JBM_ROLES = [ROLES.admin, ROLES.funcionario]
export const BAR_ROLES = [ROLES.cliente, ROLES.gerente, ROLES.caixa, ROLES.bar_staff]
export const BAR_ROLES_NEED_BAR = BAR_ROLES

export function isJbmRole(role) {
  return JBM_ROLES.includes(role) || role === 'staff'
}

export function isGerente(role) {
  return role === ROLES.cliente || role === ROLES.gerente
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
  return 'custos'
}

const GERENTE_NAV = [
  { id: 'custos', labelKey: 'nav.portalCosts', icon: '📒' },
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
]

const STAFF_NAV = [
  { id: 'ponto', labelKey: 'nav.portalClock', icon: '🕒' },
]

export function navForBarRole(role) {
  if (role === ROLES.caixa) return CAIXA_NAV
  if (role === ROLES.bar_staff) return STAFF_NAV
  return GERENTE_NAV
}

export function posAccessForRole(role) {
  if (role === ROLES.caixa) return 'cashier'
  if (isGerente(role)) return 'owner'
  return 'none'
}

export function canManageBarTeam(role) {
  return isGerente(role)
}

export function canSeeJbmSupply(role) {
  return isGerente(role) || isJbmRole(role)
}

export function canSeeDrinkCost(role) {
  return isGerente(role)
}

export function canSeePayrollAll(role) {
  return isGerente(role)
}

export function costAccessForRole(role) {
  if (role === ROLES.caixa) {
    return { posTill: true, jbmBill: false, staffWages: false, drinkCost: false, ownWage: false }
  }
  if (role === ROLES.bar_staff) {
    return { posTill: false, jbmBill: false, staffWages: false, drinkCost: false, ownWage: true }
  }
  if (isGerente(role)) {
    return { posTill: true, jbmBill: true, staffWages: true, drinkCost: true, ownWage: true }
  }
  return { posTill: false, jbmBill: isJbmRole(role), staffWages: false, drinkCost: isJbmRole(role), ownWage: false }
}
