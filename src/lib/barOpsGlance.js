/** Bar-ops KPIs for HQ and Home. Never add the four books into one number. */

import { tokyoDateKey } from './tokyo.js'

export function posTodayFromTickets(tickets = [], today = tokyoDateKey()) {
  return (tickets || [])
    .filter(s => String(s.data || '').slice(0, 10) === today)
    .reduce((a, s) => a + (+s.total || 0), 0)
}

export function posTodayCount(tickets = [], today = tokyoDateKey()) {
  return (tickets || []).filter(s => String(s.data || '').slice(0, 10) === today).length
}

export function buildBarOpsGlance({
  hq = null,
  floor = null,
  openOrders = 0,
  posTickets = null,
  posMonthFallback = null,
  account = null,
  today = tokyoDateKey(),
} = {}) {
  const books = hq?.books || {}
  const jbm = hq?.jbm || {}
  const tickets = posTickets || hq?.pos?.tickets || []
  const posToday = posTodayFromTickets(tickets, today)
  const tonightCount = posTodayCount(tickets, today)
  const monthKey = String(today || '').slice(0, 7)
  const monthTicketCount = hq?.pos?.salesCount
    || tickets.filter(s => String(s.data || '').startsWith(monthKey)).length
    || 0
  return {
    mixed: false,
    posToday,
    tonightCount,
    posMonth: Math.round(+books.pos?.amount || posMonthFallback || 0),
    posTickets: monthTicketCount,
    jbmBill: Math.round(+books.jbm?.amount || account?.contaMes || 0),
    jbmNotes: jbm.entregasMes || account?.deliveries || 0,
    openAr: Math.round(+jbm.totalPendente || account?.faturaPendente || 0),
    overdue: jbm.faturasAtraso || 0,
    pendingInvoices: jbm.faturasPendentes || 0,
    openOrders: +openOrders || 0,
    seated: floor?.seated || 0,
    reserved: floor?.reserved || 0,
    free: floor?.free || 0,
    birthdays: floor?.birthdays || 0,
    hours: hq?.hoursTotal || 0,
    wages: Math.round(+books.staff?.amount || 0),
    rent: Math.round(+books.rent?.amount || 0),
    lowStock: (jbm.estoqueBaixo || []).length || hq?.sources?.inventory?.low || 0,
  }
}

export function opsGlanceItems(g, t, fmtYen) {
  const floorText = t('portal.home.seatedFree', {
    seated: g.seated,
    reserved: g.reserved,
    free: g.free,
  })
  return [
    {
      id: 'posToday',
      tab: 'pos',
      kicker: t('portal.home.kpiPosToday'),
      value: fmtYen(g.posToday),
      hint: t('portal.home.kpiTickets', { count: g.tonightCount }),
    },
    {
      id: 'posMonth',
      tab: 'pos',
      kicker: t('portal.home.kpiPosMonth'),
      value: fmtYen(g.posMonth),
      hint: t('portal.home.kpiTickets', { count: g.posTickets }),
    },
    {
      id: 'jbm',
      tab: 'faturas',
      kicker: t('portal.home.kpiJbm'),
      value: fmtYen(g.jbmBill),
      hint: t('portal.home.kpiNotes', { count: g.jbmNotes }),
    },
    { id: 'ar', tab: 'faturas', kicker: t('portal.home.kpiAr'), value: fmtYen(g.openAr), warn: g.openAr > 0 },
    { id: 'pending', tab: 'faturas', kicker: t('portal.home.kpiPending'), value: String(g.pendingInvoices), warn: g.pendingInvoices > 0 },
    { id: 'overdue', tab: 'faturas', kicker: t('portal.home.kpiOverdue'), value: String(g.overdue), warn: g.overdue > 0 },
    { id: 'orders', tab: 'pedidos', kicker: t('portal.home.kpiOrders'), value: String(g.openOrders), warn: g.openOrders > 0 },
    { id: 'floor', tab: 'espacos', kicker: t('portal.home.kpiFloor'), value: `${g.seated}`, hint: floorText },
    { id: 'hours', tab: 'ponto', kicker: t('portal.home.kpiHours'), value: `${g.hours}h` },
    { id: 'wages', tab: 'ponto', kicker: t('portal.home.kpiWages'), value: fmtYen(g.wages) },
    { id: 'rent', tab: 'custos', kicker: t('portal.home.kpiRent'), value: fmtYen(g.rent) },
    { id: 'stock', tab: 'estoque', kicker: t('portal.home.kpiStock'), value: String(g.lowStock), warn: g.lowStock > 0 },
    { id: 'birthdays', tab: 'clientes', kicker: t('portal.home.kpiBirthdays'), value: String(g.birthdays) },
  ]
}
