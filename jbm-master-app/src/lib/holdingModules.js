import { holdingSb } from './supabase'

export async function loadHoldingModules() {
  const [hrPlacements, hrPresentations, hrCommissions, logistics, investments, returns] = await Promise.all([
    holdingSb.from('hr_placements').select('*').order('placement_date', { ascending: false }),
    safeSelect('hr_presentations', '*', 'presentation_date', false),
    safeSelect('hr_commissions', '*', 'due_date', false),
    safeSelect('logistics_jobs', '*', 'job_date', false),
    safeSelect('jbm_investments', '*', 'invested_at', false),
    safeSelect('investment_returns', '*', 'return_date', false),
  ])

  const placements = hrPlacements.data || []
  const presentations = hrPresentations.data || []
  const commissions = hrCommissions.data || []
  const jobs = logistics.data || []
  const inv = investments.data || []
  const ret = returns.data || []

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
    const key = invRow?.person_name || '—'
    if (!roiByPerson[key]) roiByPerson[key] = { invested: 0, returned: 0, unit: invRow?.unit }
    roiByPerson[key].returned += Number(r.amount || 0)
  }

  return {
    hr: { placements, presentations, commissions, commPending: hrCommPending, placementFees: hrPlacementFees },
    logistics: { jobs, commPending: logCommPending, revenue: jobs.reduce((a, j) => a + Number(j.revenue || 0), 0) },
    investments: { inv, ret, invested, returned, roi: Object.entries(roiByPerson).map(([name, v]) => ({ name, ...v, saldo: v.returned - v.invested })) },
  }
}

async function safeSelect(table, select, orderCol, asc = true) {
  const { data, error } = await holdingSb.from(table).select(select).order(orderCol, { ascending: asc })
  if (error) return { data: [], error }
  return { data: data || [], error: null }
}
