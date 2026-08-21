/** Data contábil da venda = data do pedido/entrega, não quando foi confirmado */
export function pedidoSaleDate(pedido) {
  return pedido?.data_pedido
    || pedido?.data_entrega_prevista
    || pedido?.criado_em?.slice(0, 10)
    || new Date().toISOString().slice(0, 10)
}

export function pedidoVendaObs(pedidoId) {
  return `Auto: order ${String(pedidoId).slice(0, 8)}`
}

export async function findVendaForPedido(supabase, pedidoId) {
  const key = String(pedidoId).slice(0, 8)
  const { data } = await supabase.from('vendas')
    .select('id, data, total, obs')
    .ilike('obs', `%${key}%`)
    .order('data', { ascending: true })
    .limit(1)
  return data?.[0] || null
}

/** Período de faturamento com base na data da venda (não hoje) */
export function billingPeriodForDate(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`)
  const day = d.getDate()
  const year = d.getFullYear()
  const month = d.getMonth()

  if (day <= 5) {
    return {
      periodStart: new Date(year, month, 1).toISOString().slice(0, 10),
      periodEnd: new Date(year, month, 5).toISOString().slice(0, 10),
      dueDate: new Date(year, month, 20).toISOString().slice(0, 10),
    }
  }
  if (day <= 20) {
    return {
      periodStart: new Date(year, month, 6).toISOString().slice(0, 10),
      periodEnd: new Date(year, month, 20).toISOString().slice(0, 10),
      dueDate: new Date(year, month + 1, 5).toISOString().slice(0, 10),
    }
  }
  return {
    periodStart: new Date(year, month, 21).toISOString().slice(0, 10),
    periodEnd: new Date(year, month + 1, 0).toISOString().slice(0, 10),
    dueDate: new Date(year, month + 1, 20).toISOString().slice(0, 10),
  }
}

export async function createVendaFromPedido(supabase, pedido) {
  const existing = await findVendaForPedido(supabase, pedido.id)
  if (existing) {
    const saleDate = pedidoSaleDate(pedido)
    if (existing.data !== saleDate) {
      await supabase.from('vendas').update({ data: saleDate }).eq('id', existing.id)
      existing.data = saleDate
    }
    return { venda: existing, created: false }
  }

  const saleDate = pedidoSaleDate(pedido)
  const { data: venda, error } = await supabase.from('vendas').insert({
    data: saleDate,
    bar_id: pedido.bar_id,
    total: pedido.total_estimado,
    obs: pedidoVendaObs(pedido.id),
    criado_por: pedido.criado_por,
  }).select().single()

  if (error) throw error

  if (venda && pedido.pedidos_itens?.length) {
    await supabase.from('vendas_itens').insert(
      pedido.pedidos_itens.map(it => ({
        venda_id: venda.id,
        produto_id: it.produto_id,
        qtd: it.qtd,
        preco_unitario: it.preco_unitario,
      }))
    )
  }

  return { venda, created: true }
}
