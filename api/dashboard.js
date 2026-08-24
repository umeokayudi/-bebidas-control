import { createClient } from '@supabase/supabase-js'
import { isSupplierVenda } from './_supplierVenda.js'
import { aReceberForMonth } from './_faturasMonth.js'

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

function monthKey(d) {
  return String(d || '').slice(0, 7)
}

function saleMonthKey(v) {
  return monthKey(v?.data || v?.data_venda || '')
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

    const [{ data: compras }, { data: vendasRaw }, { data: faturas }, { count: pedidosPendentes }] = await Promise.all([
      admin.from('compras').select('data, total_real').order('data'),
      admin.from('vendas').select('data, data_venda, total, obs, origem, cast_id').order('data'),
      admin.from('faturas').select('total, valor, pago, status, periodo_inicio, periodo_fim, data_emissao, data_vencimento, obs'),
      admin.from('pedidos').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
    ])

    const vendas = (vendasRaw || []).filter(isSupplierVenda)

    const months = [...new Set([
      ...(compras || []).map(c => monthKey(c.data)),
      ...vendas.map(saleMonthKey),
    ])].filter(Boolean).sort().reverse()

    const chart = chartMonths.map(m => {
      const receita = vendas.filter(v => saleMonthKey(v) === m).reduce((a, v) => a + (+v.total || 0), 0)
      const comprasTotal = (compras || []).filter(c => monthKey(c.data) === m).reduce((a, c) => a + (+c.total_real || 0), 0)
      return { month: m, receita, compras: comprasTotal, lucro: receita - comprasTotal }
    })

    const byMonth = {}
    for (const m of months) {
      const receita = vendas.filter(v => saleMonthKey(v) === m).reduce((a, v) => a + (+v.total || 0), 0)
      const comprasTotal = (compras || []).filter(c => monthKey(c.data) === m).reduce((a, c) => a + (+c.total_real || 0), 0)
      const lucro = receita - comprasTotal
      const aReceber = aReceberForMonth(faturas, m)
      byMonth[m] = {
        receita,
        compras: comprasTotal,
        lucro,
        margem: receita > 0 ? Math.round(lucro / receita * 100) : 0,
        vendasCount: vendas.filter(v => saleMonthKey(v) === m).length,
        comprasCount: (compras || []).filter(c => monthKey(c.data) === m).length,
        aReceber,
      }
    }

    return res.status(200).json({ months, chart, byMonth, pedidosPendentes: pedidosPendentes || 0 })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
