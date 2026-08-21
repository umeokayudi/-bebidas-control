/**
 * Camada de dados JBM Holding — API server-side (bebidas-control) + fallback Supabase
 */
import { holdingSb } from './supabase'
import { fetchHoldingModulesRemote, postHoldingAction } from './holdingApi'

async function remoteModules() {
  try {
    return await fetchHoldingModulesRemote()
  } catch {
    return null
  }
}

function parseMeta(row) {
  if (!row?.description) return {}
  try {
    const j = JSON.parse(row.description)
    return typeof j === 'object' && j ? j : {}
  } catch {
    return { text: row.description }
  }
}

function metaRow(module, data, extra = {}) {
  return { module, ...data, ...extra }
}

// ── HR Apresentações ──────────────────────────────────────────────────────────

export async function loadPresentations() {
  const remote = await remoteModules()
  if (remote) return remote.presentations || []
  const { data } = await holdingSb.from('jbm_financeiro')
    .select('*')
    .eq('unit', 'HR')
    .eq('category', 'apresentacao')
    .order('date', { ascending: false })
  return (data || []).map(r => {
    const m = parseMeta(r)
    return {
      id: r.id,
      candidate_name: m.candidate_name || '',
      client_company: m.client_company || '',
      position: m.position || '',
      presentation_date: r.date,
      status: m.status || (r.paid ? 'aprovada' : 'agendada'),
      expected_fee: Number(m.expected_fee ?? r.amount ?? 0),
      commission_rate: Number(m.commission_rate || 0),
      notes: m.notes || m.text || '',
      created_at: r.created_at,
    }
  })
}

export async function savePresentation(form) {
  const payload = {
    unit: 'HR',
    type: 'receita',
    category: 'apresentacao',
    amount: Number(form.expected_fee) || 0,
    date: form.presentation_date,
    due_date: form.presentation_date,
    paid: form.status === 'aprovada',
    description: JSON.stringify(metaRow('hr_presentation', {
      candidate_name: form.candidate_name,
      client_company: form.client_company,
      position: form.position,
      status: form.status || 'agendada',
      expected_fee: Number(form.expected_fee) || 0,
      commission_rate: Number(form.commission_rate) || 0,
      notes: form.notes || '',
    })),
  }
  const { error } = await holdingSb.from('jbm_financeiro').insert(payload)
  if (error) throw error
}

// ── HR Colocações ─────────────────────────────────────────────────────────────

export async function loadPlacements() {
  const remote = await remoteModules()
  if (remote) return remote.placements || []
  const { data } = await holdingSb.from('hr_placements').select('*').order('placement_date', { ascending: false })
  return data || []
}

export async function savePlacement(form) {
  const { error } = await holdingSb.from('hr_placements').insert({
    candidate_name: form.candidate_name,
    client_company: form.client_company,
    position: form.position,
    placement_date: form.placement_date,
    fee: Number(form.fee) || 0,
    daily_rate: Number(form.daily_rate) || 0,
    work_days_per_month: Number(form.work_days_per_month) || 22,
    status: form.status || 'active',
    notes: form.notes || '',
  })
  if (error) throw error
}

// ── HR Comissões ──────────────────────────────────────────────────────────────

export async function loadCommissions() {
  const remote = await remoteModules()
  if (remote) return remote.commissions || []
  const { data } = await holdingSb.from('jbm_financeiro')
    .select('*')
    .eq('unit', 'HR')
    .eq('category', 'comissao')
    .order('due_date', { ascending: false })
  return (data || []).map(r => {
    const m = parseMeta(r)
    return {
      id: r.id,
      type: m.comm_type || 'colocacao',
      candidate_name: m.candidate_name || '',
      client_company: m.client_company || '',
      amount: Number(r.amount || 0),
      due_date: r.due_date,
      paid_date: r.paid ? r.date : null,
      status: r.paid ? 'pago' : (m.status || 'pendente'),
      notes: m.notes || '',
      created_at: r.created_at,
    }
  })
}

export async function saveCommission(form) {
  const { error } = await holdingSb.from('jbm_financeiro').insert({
    unit: 'HR',
    type: 'receita',
    category: 'comissao',
    amount: Number(form.amount) || 0,
    date: form.due_date || new Date().toISOString().slice(0, 10),
    due_date: form.due_date,
    paid: form.status === 'pago',
    description: JSON.stringify(metaRow('hr_commission', {
      comm_type: form.type || 'colocacao',
      candidate_name: form.candidate_name,
      client_company: form.client_company,
      status: form.status || 'pendente',
      notes: form.notes || '',
    })),
  })
  if (error) throw error
}

export async function markCommissionPaid(id) {
  const { error } = await holdingSb.from('jbm_financeiro')
    .update({ paid: true, date: new Date().toISOString().slice(0, 10) })
    .eq('id', id)
  if (error) throw error
}

// ── Logística ─────────────────────────────────────────────────────────────────

export async function loadLogisticsJobs() {
  const remote = await remoteModules()
  if (remote) return remote.jobs || []
  const { data } = await holdingSb.from('jbm_financeiro')
    .select('*')
    .eq('unit', 'Logistica')
    .eq('category', 'frete')
    .order('date', { ascending: false })
  return (data || []).map(r => {
    const m = parseMeta(r)
    return {
      id: r.id,
      reference: m.reference || '',
      client_name: m.client_name || '',
      route_description: m.route_description || '',
      job_date: r.date,
      revenue: Number(m.revenue ?? r.amount ?? 0),
      cost: Number(m.cost || 0),
      commission: Number(m.commission || 0),
      commission_status: m.commission_status || (r.paid ? 'pago' : 'pendente'),
      status: m.status || 'ativo',
      notes: m.notes || '',
      created_at: r.created_at,
    }
  })
}

export async function saveLogisticsJob(form) {
  const revenue = Number(form.revenue) || 0
  const { error } = await holdingSb.from('jbm_financeiro').insert({
    unit: 'Logistica',
    type: 'receita',
    category: 'frete',
    amount: revenue,
    date: form.job_date,
    due_date: form.job_date,
    paid: form.commission_status === 'pago',
    description: JSON.stringify(metaRow('logistics', {
      reference: form.reference,
      client_name: form.client_name,
      route_description: form.route_description,
      revenue,
      cost: Number(form.cost) || 0,
      commission: Number(form.commission) || 0,
      commission_status: form.commission_status || 'pendente',
      status: form.status || 'ativo',
      notes: form.notes || '',
    })),
  })
  if (error) throw error
}

export async function markLogisticsCommPaid(id) {
  const { data } = await holdingSb.from('jbm_financeiro').select('description').eq('id', id).single()
  const m = parseMeta(data)
  m.commission_status = 'pago'
  const { error } = await holdingSb.from('jbm_financeiro')
    .update({ paid: true, description: JSON.stringify({ module: 'logistics', ...m }) })
    .eq('id', id)
  if (error) throw error
}

// ── Investimentos ─────────────────────────────────────────────────────────────

export async function loadInvestments() {
  const remote = await remoteModules()
  if (remote) return { inv: remote.inv || [], ret: remote.ret || [] }
  const { data } = await holdingSb.from('jbm_financeiro')
    .select('*')
    .eq('unit', 'Investimentos')
    .in('category', ['investimento', 'retorno'])
    .order('date', { ascending: false })
  const inv = []
  const ret = []
  for (const r of data || []) {
    const m = parseMeta(r)
    if (r.category === 'investimento') {
      inv.push({
        id: r.id,
        person_name: m.person_name || '',
        person_ref: m.person_ref || '',
        unit: m.person_unit || 'HR',
        investment_type: m.investment_type || 'formacao',
        amount_invested: Number(r.amount || 0),
        invested_at: r.date,
        expected_return_date: m.expected_return_date || null,
        expected_return_amount: Number(m.expected_return_amount || 0),
        status: m.status || 'ativo',
        notes: m.notes || '',
        created_at: r.created_at,
      })
    } else {
      ret.push({
        id: r.id,
        investment_id: m.investment_id,
        amount: Number(r.amount || 0),
        return_date: r.date,
        source: m.source || 'trabalho',
        notes: m.notes || '',
        jbm_investments: { person_name: m.person_name, unit: m.person_unit },
        created_at: r.created_at,
      })
    }
  }
  return { inv, ret }
}

export async function saveInvestment(form) {
  try {
    await postHoldingAction('saveInvestment', form)
    return
  } catch { /* fallback */ }
  const { error } = await holdingSb.from('jbm_financeiro').insert({
    unit: 'Investimentos',
    type: 'despesa',
    category: 'investimento',
    amount: Number(form.amount_invested) || 0,
    date: form.invested_at,
    due_date: form.expected_return_date || null,
    paid: false,
    description: JSON.stringify(metaRow('investment', {
      person_name: form.person_name,
      person_ref: form.person_ref || '',
      person_unit: form.unit || 'HR',
      investment_type: form.investment_type || 'formacao',
      expected_return_date: form.expected_return_date,
      expected_return_amount: Number(form.expected_return_amount) || 0,
      status: 'ativo',
      notes: form.notes || '',
    })),
  })
  if (error) throw error
}

export async function saveInvestmentReturn(form, personMeta = {}) {
  try {
    await postHoldingAction('saveInvestmentReturn', form, personMeta)
    return
  } catch { /* fallback */ }
  const { error } = await holdingSb.from('jbm_financeiro').insert({
    unit: 'Investimentos',
    type: 'receita',
    category: 'retorno',
    amount: Number(form.amount) || 0,
    date: form.return_date,
    paid: true,
    description: JSON.stringify(metaRow('investment_return', {
      investment_id: form.investment_id,
      source: form.source || 'trabalho',
      person_name: personMeta.person_name,
      person_unit: personMeta.unit,
      notes: form.notes || '',
    })),
  })
  if (error) throw error
}

// ── Agregador ─────────────────────────────────────────────────────────────────

export async function loadAllModules() {
  const [presentations, placements, commissions, jobs, { inv, ret }] = await Promise.all([
    loadPresentations(),
    loadPlacements(),
    loadCommissions(),
    loadLogisticsJobs(),
    loadInvestments(),
  ])
  return { presentations, placements, commissions, jobs, inv, ret }
}
