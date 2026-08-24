import { fixAtomicReceivables, revertAtomicPedidosToJune } from './_atomicJuneFix.js'
import { isSupplierVenda } from './_supplierVenda.js'
import { requireStaff, requireStaffOrTrustedOrigin } from './_requireStaff.js'
import { drinksAdminClient } from './_supabaseAdmin.js'

const BUCKET = 'system-private'
const FILE = 'cashflow_snapshot.json'

const ALLOWED_ORIGINS = [
  'https://jbm-master.vercel.app',
  'https://bebidas-control.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]

async function buildLiveSnapshot(sb) {
  const today = new Date().toISOString().slice(0, 10)
  const mes = today.slice(0, 7)
  const in30 = new Date()
  in30.setDate(in30.getDate() + 30)
  const end30 = in30.toISOString().slice(0, 10)

  const [barsR, vendasR, comprasR, faturasR] = await Promise.all([
    sb.from('bars').select('id,nome'),
    sb.from('vendas').select('bar_id,data,total,obs,cast_id').order('data', { ascending: false }).limit(100),
    sb.from('compras').select('data,total_real,total_pago,status_pagamento,data_pagamento,fornecedor,pagamento').order('data', { ascending: false }),
    sb.from('faturas').select('bar_id,valor,total,pago,status,data_vencimento').order('data_vencimento', { ascending: false }),
  ])

  const bars = barsR.data || []
  const vendas = (vendasR.data || []).filter(isSupplierVenda)
  const compras = comprasR.data || []
  const faturas = faturasR.data || []

  const receitaMes = vendas.filter(v => v.data?.startsWith(mes)).reduce((a, v) => a + (+v.total || 0), 0)
  const custoMes = compras.filter(c => String(c.data || '').slice(0, 7) === mes).reduce((a, c) => a + (+c.total_real || +c.total_pago || 0), 0)

  const paidIn = faturas.filter(f => f.status === 'pago').reduce((a, f) => a + (+f.valor || +f.total || 0), 0)
  const paidOut = compras.filter(c => c.status_pagamento === 'pago' || !c.status_pagamento).reduce((a, c) => a + (+c.total_real || +c.total_pago || 0), 0)

  const faturasPendentes = faturas.filter(f => f.status !== 'pago')
  const aReceber = faturasPendentes.reduce((a, f) => a + Math.max(0, (+f.valor || +f.total || 0) - (+f.pago || 0)), 0)
  const faturasVencidas = faturasPendentes.filter(f => f.data_vencimento && f.data_vencimento < today)

  const comprasPendentes = compras.filter(c => c.status_pagamento === 'pendente')
  const aPagar = comprasPendentes.reduce((a, c) => a + (+c.total_pago || +c.total_real || 0), 0)

  const pendingIn30 = faturasPendentes
    .filter(f => f.data_vencimento >= today && f.data_vencimento <= end30)
    .reduce((a, f) => a + Math.max(0, (+f.valor || +f.total || 0) - (+f.pago || 0)), 0)

  const pendingOut30 = comprasPendentes
    .filter(c => {
      const d = c.data_pagamento || c.data
      return d >= today && d <= end30
    })
    .reduce((a, c) => a + (+c.total_pago || +c.total_real || 0), 0)

  const caixaLiquido = paidIn - paidOut

  return {
    geradoEm: new Date().toISOString(),
    fonte: 'bebidas-control-live',
    financeiro: {
      receitaMes,
      custoMes,
      lucroMes: receitaMes - custoMes,
      caixaLiquido,
      projetado30d: caixaLiquido + pendingIn30 - pendingOut30,
      aReceber,
      aPagar,
      faturasVencidas: faturasVencidas.length,
      entradas30d: pendingIn30,
      saidas30d: pendingOut30,
    },
    recentes: {
      vendas: vendas.slice(0, 5).map(v => ({ data: v.data, total: v.total, bar: bars.find(b => b.id === v.bar_id)?.nome })),
      compras: compras.slice(0, 5).map(c => ({ data: c.data, fornecedor: c.fornecedor, total: c.total_real || c.total_pago })),
      faturas: faturas.slice(0, 5).map(f => ({
        status: f.status,
        valor: f.valor || f.total,
        vencimento: f.data_vencimento,
        bar: bars.find(b => b.id === f.bar_id)?.nome,
      })),
    },
  }
}

export default async function handler(req, res) {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const sb = drinksAdminClient()

    if (req.query.revertPedidosJune === '1' || req.query.fixAtomicJune === '1') {
      const auth = await requireStaff(req, sb)
      if (auth.error) return res.status(auth.status).json({ error: auth.error })
    } else {
      const auth = await requireStaffOrTrustedOrigin(req, sb)
      if (auth.error) return res.status(auth.status).json({ error: auth.error })
    }

    if (req.query.revertPedidosJune === '1' && req.query.confirm === 'atomic-june-465000') {
      const revert = await revertAtomicPedidosToJune(sb)
      return res.status(200).json({ ok: true, revert })
    }

    if (req.query.fixAtomicJune === '1' && req.query.confirm === 'atomic-june-465000') {
      const debt = Number(req.query.debt || 465000)
      const fix = await fixAtomicReceivables(sb)
      const { data: faturas } = await sb.from('faturas').select('valor,total,pago,status').eq('bar_id', 'b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9').neq('status', 'pago')
      const aReceber = (faturas || []).reduce((a, f) => a + Math.max(0, (+f.valor || +f.total || 0) - (+f.pago || 0)), 0)
      return res.status(200).json({ ok: true, fix, aReceber })
    }

    try {
      const { data } = await sb.storage.from(BUCKET).download(FILE)
      if (data) {
        const cached = JSON.parse(await data.text())
        const ageMs = Date.now() - new Date(cached.geradoEm).getTime()
        if (ageMs < 30 * 60 * 1000) {
          return res.status(200).json({ ...cached, cached: true, idadeMinutos: Math.round(ageMs / 60000) })
        }
      }
    } catch { /* compute live */ }

    const live = await buildLiveSnapshot(sb)
    return res.status(200).json({ ...live, cached: false })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
