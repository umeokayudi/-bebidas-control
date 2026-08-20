import { createClient } from '@supabase/supabase-js'

const BAR_ID = 'b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9'
const DEFAULT_DEBT = 465000

function adminClient() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada no Vercel')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function fixAtomicJuneDebt(sb, debt = DEFAULT_DEBT) {
  const report = { debt, deletedVendas: 0, movedPedidos: 0, faturaId: null }

  const { data: vendas, error: vErr } = await sb
    .from('vendas')
    .select('id,total')
    .eq('bar_id', BAR_ID)
    .gte('data', '2026-06-01')
    .lte('data', '2026-06-30')
  if (vErr) throw new Error(vErr.message)

  const vendaIds = (vendas || []).map(v => v.id)
  const oldVendasTotal = (vendas || []).reduce((a, v) => a + (+v.total || 0), 0)

  if (vendaIds.length) {
    await sb.from('vendas_itens').delete().in('venda_id', vendaIds)
    await sb.from('vendas').delete().in('id', vendaIds)
    report.deletedVendas = vendaIds.length
  }

  const { data: pedidos } = await sb
    .from('pedidos')
    .select('id,obs')
    .eq('bar_id', BAR_ID)
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
    .eq('bar_id', BAR_ID)
    .gte('periodo_inicio', '2026-06-01')
    .lte('periodo_fim', '2026-06-30')

  const faturaPatch = {
    bar_id: BAR_ID,
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

  report.oldVendasTotal = oldVendasTotal
  return report
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Use POST',
      exemplo: { confirm: 'atomic-june-465000', debt: 465000 },
    })
  }

  const secret = process.env.FIX_ATOMIC_SECRET || 'jbm-atomic-june-2026'
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  if (body.confirm !== secret && body.confirm !== 'atomic-june-465000') {
    return res.status(403).json({ error: 'confirm inválido' })
  }

  try {
    const sb = adminClient()
    const debt = Number(body.debt || DEFAULT_DEBT)
    const result = await fixAtomicJuneDebt(sb, debt)

    const { data: faturas } = await sb.from('faturas').select('valor,total,pago,status').eq('bar_id', BAR_ID).neq('status', 'pago')
    const aReceber = (faturas || []).reduce((a, f) => a + Math.max(0, (+f.valor || +f.total || 0) - (+f.pago || 0)), 0)

    return res.status(200).json({ ok: true, ...result, aReceber })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
