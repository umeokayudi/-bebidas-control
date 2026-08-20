import { createClient } from '@supabase/supabase-js'

const BUCKET = 'system-private'
const HOLDING_FILE = 'jbm_holding.json'

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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const sb = adminClient()

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

    return res.status(200).json({
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
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
