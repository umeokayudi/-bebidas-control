import { loadAllModules } from './holdingStorage'

export async function loadHoldingModules() {
  const { presentations, placements, commissions, jobs, inv, ret } = await loadAllModules()

  const hrCommPending = commissions.filter(c => c.status === 'pendente' || c.status === 'parcial')
    .reduce((a, c) => a + Number(c.amount || 0), 0)
  const hrPlacementFees = placements.filter(p => p.status === 'active')
    .reduce((a, p) => a + Number(p.fee || 0), 0)
  const logCommPending = jobs.filter(j => j.commission_status === 'pendente')
    .reduce((a, j) => a + Number(j.commission || 0), 0)
  const invested = inv.filter(i => i.status !== 'quitado' && i.status !== 'perda')
    .reduce((a, i) => a + Number(i.amount_invested || 0), 0)
  const returned = ret.reduce((a, r) => a + Number(r.amount || 0), 0)

  const roiByPerson = {}
  for (const i of inv) {
    const key = i.person_name
    if (!roiByPerson[key]) roiByPerson[key] = { invested: 0, returned: 0, unit: i.unit }
    roiByPerson[key].invested += Number(i.amount_invested || 0)
  }
  for (const r of ret) {
    const invRow = inv.find(i => i.id === r.investment_id)
    const key = invRow?.person_name || r.jbm_investments?.person_name || '—'
    if (!roiByPerson[key]) roiByPerson[key] = { invested: 0, returned: 0, unit: invRow?.unit }
    roiByPerson[key].returned += Number(r.amount || 0)
  }

  return {
    hr: { placements, presentations, commissions, commPending: hrCommPending, placementFees: hrPlacementFees },
    logistics: { jobs, commPending: logCommPending, revenue: jobs.reduce((a, j) => a + Number(j.revenue || 0), 0) },
    investments: { inv, ret, invested, returned, roi: Object.entries(roiByPerson).map(([name, v]) => ({ name, ...v, saldo: v.returned - v.invested })) },
  }
}
