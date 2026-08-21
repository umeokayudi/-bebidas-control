export const ATOMIC_BAR_ID = 'b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9'

const MOVIDO_TAG = /\[movido de jun→jul 2026\]/gi

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

function stripMovidoTag(obs) {
  return (obs || '').replace(MOVIDO_TAG, '').trim() || null
}

/** Converte timestamp jul→jun se necessário; preserva jun original */
function toJuneTimestamp(iso) {
  if (!iso) return null
  if (iso.startsWith('2026-06')) return iso
  if (iso.startsWith('2026-07')) return iso.replace('2026-07-', '2026-06-')
  return iso
}

function toJuneDate(iso) {
  const ts = toJuneTimestamp(iso)
  return ts ? ts.slice(0, 10) : '2026-06-15'
}

/** Reverte pedidos Atomic movidos erroneamente de junho para julho */
export async function revertAtomicPedidosToJune(sb) {
  const { data: pedidos, error } = await sb
    .from('pedidos')
    .select('id,criado_em,data_pedido,data_entrega_prevista,obs,total_estimado')
    .eq('bar_id', ATOMIC_BAR_ID)
    .ilike('obs', '%movido de jun%jul%')

  if (error) throw new Error(error.message)

  const report = { reverted: 0, totalEstimado: 0, ids: [] }

  for (const p of pedidos || []) {
    const juneDate = toJuneDate(p.criado_em || p.data_pedido)
    const juneTs = toJuneTimestamp(p.criado_em) || `${juneDate}T12:00:00+00:00`

    const { error: uErr } = await sb.from('pedidos').update({
      data_pedido: juneDate,
      data_entrega_prevista: juneDate,
      criado_em: juneTs,
      obs: stripMovidoTag(p.obs),
    }).eq('id', p.id)

    if (uErr) throw new Error(`pedido ${p.id}: ${uErr.message}`)
    report.reverted++
    report.totalEstimado += Number(p.total_estimado || 0)
    report.ids.push(p.id)
  }

  return report
}

export async function fixAtomicReceivables(sb) {
  const report = { deletedVendas: 0, faturaIds: [], oldVendasTotal: 0 }

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

  // Pedidos de junho permanecem em junho — não mover para julho

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

/** Marca pedidos confirmados como entregue e cria vendas (entregas) correspondentes */
export async function markPedidosEntregue(sb, opts = {}) {
  const {
    barId = ATOMIC_BAR_ID,
    dateFrom = '2026-06-01',
    dateTo = '2026-06-30',
    statusFrom = 'confirmado',
  } = opts

  const { data: pedidos, error } = await sb
    .from('pedidos')
    .select('id,bar_id,criado_por,data_pedido,total_estimado,pedidos_itens(produto_id,qtd,preco_unitario)')
    .eq('bar_id', barId)
    .eq('status', statusFrom)
    .gte('data_pedido', dateFrom)
    .lte('data_pedido', dateTo)

  if (error) throw new Error(error.message)

  const report = { updated: 0, vendas: 0, totalEntregue: 0, ids: [] }

  for (const p of pedidos || []) {
    const { error: uErr } = await sb.from('pedidos').update({ status: 'entregue' }).eq('id', p.id)
    if (uErr) throw new Error(`pedido ${p.id}: ${uErr.message}`)

    const { data: venda, error: vErr } = await sb.from('vendas').insert({
      data: p.data_pedido,
      bar_id: p.bar_id,
      total: p.total_estimado,
      obs: `Auto: order ${p.id.slice(0, 8)}`,
      criado_por: p.criado_por,
    }).select().single()

    if (vErr) throw new Error(`venda pedido ${p.id}: ${vErr.message}`)

    if (venda && p.pedidos_itens?.length) {
      const { error: iErr } = await sb.from('vendas_itens').insert(
        p.pedidos_itens.map(it => ({
          venda_id: venda.id,
          produto_id: it.produto_id,
          qtd: it.qtd,
          preco_unitario: it.preco_unitario,
        }))
      )
      if (iErr) throw new Error(`itens pedido ${p.id}: ${iErr.message}`)
    }

    report.updated++
    report.vendas++
    report.totalEntregue += Number(p.total_estimado || 0)
    report.ids.push(p.id)
  }

  return report
}

/** @deprecated */
export async function fixAtomicJuneDebt(sb, debt = 465000) {
  return fixAtomicReceivables(sb)
}
