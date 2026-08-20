export const ATOMIC_BAR_ID = 'b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9'

export async function fixAtomicJuneDebt(sb, debt = 465000) {
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
    .eq('status', 'pendente')

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
