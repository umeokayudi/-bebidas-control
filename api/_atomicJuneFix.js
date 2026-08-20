export const ATOMIC_BAR_ID = 'b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9'

/** Faturas Atomic: maio ¥165k + jun ¥150k + jul ¥150k = ¥465k */
export const ATOMIC_FATURAS = [
  {
    valor: 165000,
    total: 165000,
    data_emissao: '2026-05-31',
    data_vencimento: '2026-06-30',
    periodo_inicio: '2026-05-01',
    periodo_fim: '2026-05-31',
    obs: 'Maio/2026 — fornecimento ¥150.000 + equipamentos limpeza ¥15.000',
  },
  {
    valor: 150000,
    total: 150000,
    data_emissao: '2026-06-30',
    data_vencimento: '2026-07-31',
    periodo_inicio: '2026-06-01',
    periodo_fim: '2026-06-30',
    obs: 'Junho/2026 — fornecimento Atomic',
  },
  {
    valor: 150000,
    total: 150000,
    data_emissao: '2026-07-31',
    data_vencimento: '2026-08-31',
    periodo_inicio: '2026-07-01',
    periodo_fim: '2026-07-31',
    obs: 'Julho/2026 — fornecimento Atomic',
  },
]

export async function fixAtomicReceivables(sb) {
  const report = { deletedVendas: 0, movedPedidos: 0, faturaIds: [], oldVendasTotal: 0 }

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

  await sb.from('faturas').delete().eq('bar_id', ATOMIC_BAR_ID).eq('status', 'pendente')

  for (const f of ATOMIC_FATURAS) {
    const { data, error } = await sb.from('faturas').insert({
      bar_id: ATOMIC_BAR_ID,
      pago: 0,
      status: 'pendente',
      ...f,
    }).select('id').single()
    if (error) throw new Error(error.message)
    report.faturaIds.push(data.id)
  }

  report.debt = ATOMIC_FATURAS.reduce((a, f) => a + f.valor, 0)
  return report
}

/** @deprecated */
export async function fixAtomicJuneDebt(sb, debt = 465000) {
  return fixAtomicReceivables(sb)
}
