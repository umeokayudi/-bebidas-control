import { createClient } from '@supabase/supabase-js'
import { isSupplierVenda } from './_supplierVenda.js'
import {
  monthDashboardStats,
  faturaMonthKeys,
  compraMonthKey,
  saleMonthKey,
  pedidoMonthKey,
} from './_dashboardMonth.js'

function adminClient() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function requireStaff(req, admin) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return { error: 'Não autenticado', status: 401 }
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return { error: 'Sessão inválida', status: 401 }
  const { data: perfil } = await admin.from('perfis').select('role').eq('id', user.id).single()
  if (!perfil || perfil.role === 'cliente') return { error: 'Sem permissão', status: 403 }
  return { user, perfil }
}

function lastMonths(n = 6) {
  const out = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push(d.toISOString().slice(0, 7))
  }
  return out
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const admin = adminClient()
    const auth = await requireStaff(req, admin)
    if (auth.error) return res.status(auth.status).json({ error: auth.error })

    const chartMonths = lastMonths(6)

    const [{ data: compras, error: comprasErr }, { data: vendasRaw }, { data: faturas }, { data: pedidos }, { count: pedidosPendentes }] = await Promise.all([
      admin.from('compras').select('data, data_compra, data_pagamento, total_real, total_pago, compras_itens(nome, qtd, custo_unitario)').order('data'),
      admin.from('vendas').select('data, data_venda, total, obs, origem, cast_id').order('data'),
      admin.from('faturas').select('total, valor, pago, status, periodo_inicio, periodo_fim, data_emissao, data_vencimento, obs'),
      admin.from('pedidos').select('data_pedido, data_entrega_prevista, criado_em, total_estimado, status'),
      admin.from('pedidos').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
    ])

    if (comprasErr) throw new Error('compras: ' + comprasErr.message)

    const vendas = (vendasRaw || []).filter(isSupplierVenda)
    const ctx = { vendas, compras, faturas, pedidos }

    const months = [...new Set([
      ...(compras || []).map(compraMonthKey),
      ...(compras || []).flatMap(c => [c.data, c.data_compra, c.data_pagamento].map(d => String(d || '').slice(0, 7))),
      ...vendas.map(saleMonthKey),
      ...(pedidos || []).map(pedidoMonthKey),
      ...faturaMonthKeys(faturas),
    ])].filter(Boolean).sort().reverse()

    const chart = chartMonths.map(m => {
      const s = monthDashboardStats(m, ctx)
      return { month: m, receita: s.receita, faturamento: s.faturamento, compras: s.compras, lucro: s.lucroProjetado }
    })

    const byMonth = {}
    for (const m of [...new Set([...months, ...chartMonths])]) {
      byMonth[m] = monthDashboardStats(m, ctx)
    }

    return res.status(200).json({ months, chart, byMonth, pedidosPendentes: pedidosPendentes || 0 })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
