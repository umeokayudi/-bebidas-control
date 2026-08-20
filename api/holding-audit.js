import { createClient } from '@supabase/supabase-js'

const BUCKET = 'system-private'
const HOLDING_FILE = 'jbm_holding.json'
const HOLDING_KEY_FILE = 'holding_service_role_key.txt'
const CASHFLOW_FILE = 'cashflow_snapshot.json'
const HOLDING_URL = process.env.HOLDING_SUPABASE_URL || 'https://fxsakrshmldmkdmbevna.supabase.co'

async function resolveHoldingKey(sb) {
  if (process.env.HOLDING_SERVICE_ROLE_KEY) return process.env.HOLDING_SERVICE_ROLE_KEY
  try {
    const { data } = await sb.storage.from(BUCKET).download(HOLDING_KEY_FILE)
    if (data) return (await data.text()).trim()
  } catch { /* */ }
  return null
}

async function pushToJbmMaster(sb, payload) {
  const holdingKey = await resolveHoldingKey(sb)
  if (!holdingKey) return { pushed: false, reason: 'holding key not registered' }

  const holdingSb = createClient(HOLDING_URL, holdingKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: buckets } = await holdingSb.storage.listBuckets()
  if (!buckets?.some(b => b.name === BUCKET)) {
    await holdingSb.storage.createBucket(BUCKET, { public: false })
  }
  const snapshot = {
    ...payload,
    geradoEm: new Date().toISOString(),
    fonte: 'bebidas-control-holding-audit',
    destino: 'jbm-master',
  }
  const { error } = await holdingSb.storage.from(BUCKET).upload(CASHFLOW_FILE, JSON.stringify(snapshot, null, 2), {
    upsert: true,
    contentType: 'application/json',
  })
  if (error) throw error
  return { pushed: true, financeiro: snapshot.financeiro }
}

function adminClient() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function isSupplierVenda(v) {
  if (!v) return false
  const obs = (v.obs || '').toLowerCase()
  if (obs.includes('balcão') || obs.includes('balcao') || obs.includes('square') || obs.includes('pos')) return false
  if (v.cast_id) return false
  return true
}

const ATOMIC_BAR_ID = 'b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9'

async function fixAtomicJuneDebt(sb, debt = 465000) {
  const report = { debt, deletedVendas: 0, movedPedidos: 0, faturaId: null, oldVendasTotal: 0 }

  const { data: vendas, error: vErr } = await sb
    .from('vendas')
    .select('id,total')
    .eq('bar_id', ATOMIC_BAR_ID)
    .gte('data', '2026-06-01')
    .lte('data', '2026-06-30')
  if (vErr) throw new Error(vErr.message)

  const vendaIds = (vendas || []).map(v => v.id)
  report.oldVendasTotal = (vendas || []).reduce((a, v) => a + (+v.total || 0), 0)

  if (vendaIds.length) {
    await sb.from('vendas_itens').delete().in('venda_id', vendaIds)
    await sb.from('vendas').delete().in('id', vendaIds)
    report.deletedVendas = vendaIds.length
  }

  const { data: pedidos } = await sb
    .from('pedidos')
    .select('id,obs')
    .eq('bar_id', ATOMIC_BAR_ID)
    .gte('data_pedido', '2026-06-01')
    .lte('data_pedido', '2026-06-30')

  for (const p of pedidos || []) {
    await sb.from('pedidos').update({
      data_pedido: '2026-07-01',
      data_entrega_prevista: '2026-07-01',
      status: 'pendente',
      obs: ((p.obs || '') + ' [movido de jun→jul 2026]').trim(),
    }).eq('id', p.id)
    report.movedPedidos++
  }

  const { data: faturas } = await sb
    .from('faturas')
    .select('id')
    .eq('bar_id', ATOMIC_BAR_ID)
    .gte('periodo_inicio', '2026-06-01')
    .lte('periodo_fim', '2026-06-30')

  const faturaPatch = {
    bar_id: ATOMIC_BAR_ID,
    valor: debt,
    total: debt,
    pago: 0,
    status: 'pendente',
    data_emissao: '2026-06-30',
    data_vencimento: '2026-07-31',
    periodo_inicio: '2026-06-01',
    periodo_fim: '2026-06-30',
    obs: 'Fatura jun/2026 — dívida consolidada Atomic (¥465.000)',
  }

  if (faturas?.length) {
    const { data } = await sb.from('faturas').update(faturaPatch).eq('id', faturas[0].id).select('id').single()
    report.faturaId = data?.id
    if (faturas.length > 1) {
      await sb.from('faturas').delete().in('id', faturas.slice(1).map(f => f.id))
    }
  } else {
    const { data } = await sb.from('faturas').insert(faturaPatch).select('id').single()
    report.faturaId = data?.id
  }

  return report
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const sb = adminClient()
      const holdingKey = req.body?.holdingKey?.trim()
      if (!holdingKey) return res.status(400).json({ error: 'holdingKey required' })

      const holdingSb = createClient(HOLDING_URL, holdingKey, { auth: { autoRefreshToken: false, persistSession: false } })
      const { data: buckets } = await holdingSb.storage.listBuckets()
      if (!buckets?.some(b => b.name === BUCKET)) {
        await holdingSb.storage.createBucket(BUCKET, { public: false })
      }
      const ping = JSON.stringify({ ok: true, at: new Date().toISOString() })
      const { error: pingErr } = await holdingSb.storage.from(BUCKET).upload('sync_ping.json', ping, { upsert: true, contentType: 'application/json' })
      if (pingErr) return res.status(400).json({ error: 'Chave inválida: ' + pingErr.message })

      const { data: dbuckets } = await sb.storage.listBuckets()
      if (!dbuckets?.some(b => b.name === BUCKET)) {
        await sb.storage.createBucket(BUCKET, { public: false })
      }
      const { error } = await sb.storage.from(BUCKET).upload(HOLDING_KEY_FILE, holdingKey, { upsert: true, contentType: 'text/plain' })
      if (error) throw error

      return res.status(200).json({ ok: true, message: 'Chave registrada. Use GET ?pushHolding=1 para sincronizar.' })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const sb = adminClient()

    if (req.query.fixAtomicJune === '1' && req.query.confirm === 'atomic-june-465000') {
      const debt = Number(req.query.debt || 465000)
      const fix = await fixAtomicJuneDebt(sb, debt)
      const { data: faturas } = await sb.from('faturas').select('valor,total,pago,status').eq('bar_id', ATOMIC_BAR_ID).neq('status', 'pago')
      const aReceber = (faturas || []).reduce((a, f) => a + Math.max(0, (+f.valor || +f.total || 0) - (+f.pago || 0)), 0)
      return res.status(200).json({ ok: true, fix, aReceber })
    }

    let holding = { nome: 'JBM Holding', negocios: [] }
    try {
      const { data } = await sb.storage.from(BUCKET).download(HOLDING_FILE)
      if (data) holding = JSON.parse(await data.text())
    } catch { /* default */ }

    const [bars, produtos, vendas, compras, faturas, pedidos, fornecedores, perfis, barPricing] = await Promise.all([
      sb.from('bars').select('id,nome'),
      sb.from('produtos').select('id', { count: 'exact' }).eq('ativo', true),
      sb.from('vendas').select('total,obs,cast_id,data,bar_id').order('data', { ascending: false }).limit(100),
      sb.from('compras').select('total_real,total_pago,status_pagamento,data,fornecedor,pagamento').order('data', { ascending: false }).limit(50),
      sb.from('faturas').select('valor,total,pago,status,data_vencimento,bar_id'),
      sb.from('pedidos').select('status,total_estimado').limit(30),
      sb.from('fornecedores').select('nome,pagamento,pontos_pct'),
      sb.from('perfis').select('role'),
      sb.from('bar_pricing').select('bar_id', { count: 'exact', head: true }),
    ])

    const vendasSupplier = (vendas.data || []).filter(isSupplierVenda)
    const mes = new Date().toISOString().slice(0, 7)
    const receitaMes = vendasSupplier.filter(v => v.data?.startsWith(mes)).reduce((a, v) => a + (+v.total || 0), 0)
    const custoMes = (compras.data || []).filter(c => c.data?.startsWith(mes)).reduce((a, c) => a + (+c.total_real || +c.total_pago || 0), 0)

    const faturasData = faturas.data || []
    const paidIn = faturasData.filter(f => f.status === 'pago').reduce((a, f) => a + (+f.valor || +f.total || 0), 0)
    const paidOut = (compras.data || []).filter(c => c.status_pagamento === 'pago' || !c.status_pagamento).reduce((a, c) => a + (+c.total_real || +c.total_pago || 0), 0)
    const aReceber = faturasData.filter(f => f.status !== 'pago').reduce((a, f) => a + Math.max(0, (+f.valor || +f.total || 0) - (+f.pago || 0)), 0)

    const today = new Date().toISOString().slice(0, 10)
    const faturasVencidas = faturasData.filter(f => f.status !== 'pago' && f.data_vencimento < today).length

    const checks = [
      { ok: (bars.data || []).length > 0, label: 'Bars', detail: String((bars.data || []).length) },
      { ok: (produtos.data || []).length > 0, label: 'Produtos', detail: String(produtos.data?.length ?? 0) },
      { ok: (vendas.data || []).filter(v => !isSupplierVenda(v)).length === 0, label: 'POS separado', detail: 'OK' },
      { ok: faturasData.length > 0, label: 'Faturas', detail: String(faturasData.length) },
      { ok: (barPricing.count || 0) >= 10, label: 'Preços POS', detail: String(barPricing.count || 0) },
      { ok: paidIn - paidOut > -500000, label: 'Caixa', detail: `¥${paidIn - paidOut}` },
    ]

    const payload = {
      geradoEm: new Date().toISOString(),
      holding,
      financeiro: { receitaMes, custoMes, caixaLiquido: paidIn - paidOut, aReceber, faturasVencidas },
      operacao: {
        entregas: vendasSupplier.length,
        pedidosAtivos: (pedidos.data || []).filter(p => p.status === 'pendente' || p.status === 'confirmado').length,
        fornecedores: (fornecedores.data || []).length,
      },
      checks,
      checksOk: checks.filter(c => c.ok).length,
      checksTotal: checks.length,
      geminiReady: true,
    }

    if (req.query.pushHolding === '1' || req.query.sync === '1') {
      const push = await pushToJbmMaster(sb, payload)
      return res.status(200).json({ ...payload, jbmMaster: push })
    }

    return res.status(200).json(payload)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
