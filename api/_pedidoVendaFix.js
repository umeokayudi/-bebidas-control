const PEDIDO_OBS = /^Auto: order ([a-f0-9]{8})/i

function pedidoSaleDate(p) {
  return p.data_pedido || p.data_entrega_prevista || p.criado_em?.slice(0, 10)
}

/** Corrige vendas Auto: order → data = data_pedido do pedido */
export async function fixVendaDatesFromPedidos(sb, opts = {}) {
  const { barId } = opts
  let vQuery = sb.from('vendas').select('id, bar_id, data, obs, total').ilike('obs', 'Auto: order %')
  if (barId) vQuery = vQuery.eq('bar_id', barId)
  const { data: vendas, error } = await vQuery
  if (error) throw new Error(error.message)

  const { data: pedidos } = await sb.from('pedidos').select('id, data_pedido, data_entrega_prevista, criado_em')
  const prefixMap = Object.fromEntries((pedidos || []).map(p => [p.id.slice(0, 8), p]))

  const report = { updated: 0, unchanged: 0, unmatched: 0, ids: [] }

  for (const v of vendas || []) {
    const m = (v.obs || '').match(PEDIDO_OBS)
    const prefix = m?.[1]
    const pedido = prefix ? prefixMap[prefix] : null
    if (!pedido) {
      report.unmatched++
      continue
    }
    const correctDate = pedidoSaleDate(pedido)
    if (!correctDate || v.data === correctDate) {
      report.unchanged++
      continue
    }
    const { error: uErr } = await sb.from('vendas').update({ data: correctDate }).eq('id', v.id)
    if (uErr) throw new Error(uErr.message)
    report.updated++
    report.ids.push({ vendaId: v.id, from: v.data, to: correctDate, pedidoId: pedido.id })
  }

  return report
}

/** Remove vendas duplicadas do mesmo pedido (mantém a mais antiga) */
export async function dedupePedidoVendas(sb, opts = {}) {
  const { barId, dryRun = false } = opts
  let vQuery = sb.from('vendas').select('id, bar_id, data, obs, total, criado_em').ilike('obs', 'Auto: order %')
  if (barId) vQuery = vQuery.eq('bar_id', barId)
  const { data: vendas, error } = await vQuery.order('data')
  if (error) throw new Error(error.message)

  const groups = {}
  for (const v of vendas || []) {
    const m = (v.obs || '').match(PEDIDO_OBS)
    const key = m?.[1] || v.obs
    if (!groups[key]) groups[key] = []
    groups[key].push(v)
  }

  const report = { groups: 0, removed: 0, kept: 0, removedTotal: 0, ids: [] }

  for (const [key, list] of Object.entries(groups)) {
    if (list.length <= 1) continue
    report.groups++
    list.sort((a, b) => (a.data || '').localeCompare(b.data || '') || (a.criado_em || '').localeCompare(b.criado_em || ''))
    const [keep, ...dupes] = list
    report.kept++

    for (const d of dupes) {
      report.removed++
      report.removedTotal += +d.total || 0
      report.ids.push({ removed: d.id, kept: keep.id, obs: d.obs, total: d.total })
      if (!dryRun) {
        await sb.from('vendas_itens').delete().eq('venda_id', d.id)
        await sb.from('vendas').delete().eq('id', d.id)
      }
    }
  }

  return report
}
