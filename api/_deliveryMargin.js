import { ATOMIC_BAR_ID } from './_atomicJuneFix.js'

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim()
}

export function matchProduct(nome, produtos) {
  if (!nome) return null
  const n = norm(nome)
  const exact = produtos.find(p => norm(p.nome) === n)
  if (exact) return exact
  const partial = produtos.find(p => norm(p.nome).includes(n) || n.includes(norm(p.nome)))
  if (partial) return partial
  const first = n.split(/\s+/)[0]
  return produtos.find(p => norm(p.nome).includes(first)) || null
}

export function matchBar(nome, bars) {
  if (!nome) return bars[0] || null
  const n = norm(nome)
  return bars.find(b => norm(b.nome).includes(n) || n.includes(norm(b.nome))) || bars[0] || null
}

export function matchFornecedor(nome, fornecedores) {
  if (!nome) return null
  const n = norm(nome)
  return fornecedores.find(f => norm(f.nome) === n)
    || fornecedores.find(f => norm(f.nome).includes(n) || n.includes(norm(f.nome)))
    || null
}

export function calcItemMargin(qtd, precoVenda, custo) {
  const receita = (+qtd || 1) * (+precoVenda || 0)
  const custoTotal = (+qtd || 1) * (+custo || 0)
  return { receita, custo: custoTotal, lucro: receita - custoTotal }
}

/** Atualiza produtos.custo + fornecedor_precos a partir da fatura do fornecedor */
export async function updateSupplierPrices(sb, { fornecedorNome, itensCusto, produtos, fornecedores }) {
  const forn = matchFornecedor(fornecedorNome, fornecedores || [])
  const report = { produtos: 0, fornecedor_precos: 0, fornecedor: forn?.nome || fornecedorNome }

  for (const it of itensCusto || []) {
    const prod = matchProduct(it.nome, produtos || [])
    if (!prod || !it.custo_unitario) continue

    await sb.from('produtos').update({ custo: it.custo_unitario }).eq('id', prod.id)
    prod.custo = it.custo_unitario
    report.produtos++

    if (forn) {
      await sb.from('fornecedor_precos').upsert({
        fornecedor_id: forn.id,
        produto_id: prod.id,
        preco: it.custo_unitario,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'fornecedor_id,produto_id' })
      report.fornecedor_precos++
    }
  }

  return report
}

async function vendaExistsForPedido(sb, barId, pedidoId) {
  const key = pedidoId.slice(0, 8)
  const { data } = await sb.from('vendas')
    .select('id')
    .eq('bar_id', barId)
    .ilike('obs', `%${key}%`)
    .limit(1)
  return (data || []).length > 0
}

/** Sincroniza pedidos do cliente → entregue + venda com data do pedido e margem JBM */
export async function syncPedidosEntregues(sb, opts = {}) {
  const {
    barId = ATOMIC_BAR_ID,
    dateFrom,
    dateTo,
    prods = [],
    statusIn = ['pendente', 'confirmado'],
  } = opts

  let query = sb.from('pedidos')
    .select('id,bar_id,criado_por,data_pedido,total_estimado,status,pedidos_itens(produto_id,qtd,preco_unitario,produtos(nome,custo,preco_venda))')
    .eq('bar_id', barId)
    .in('status', statusIn)
    .order('data_pedido')

  if (dateFrom) query = query.gte('data_pedido', dateFrom)
  if (dateTo) query = query.lte('data_pedido', dateTo)

  const { data: pedidos, error } = await query
  if (error) throw new Error(error.message)

  const report = {
    pedidos: 0,
    vendas: 0,
    skipped: 0,
    receita: 0,
    custo: 0,
    lucro: 0,
    itens: [],
    ids: [],
  }

  for (const p of pedidos || []) {
    if (await vendaExistsForPedido(sb, p.bar_id, p.id)) {
      if (p.status !== 'entregue') {
        await sb.from('pedidos').update({ status: 'entregue' }).eq('id', p.id)
      }
      report.skipped++
      continue
    }

    await sb.from('pedidos').update({ status: 'entregue' }).eq('id', p.id)

    let receita = 0
    let custo = 0
    const marginItens = []

    for (const it of p.pedidos_itens || []) {
      const prod = it.produtos || prods.find(x => x.id === it.produto_id)
      const preco = it.preco_unitario || prod?.preco_venda || 0
      const custoUnit = prod?.custo || 0
      const m = calcItemMargin(it.qtd, preco, custoUnit)
      receita += m.receita
      custo += m.custo
      marginItens.push({
        nome: prod?.nome || '?',
        qtd: it.qtd,
        preco_venda: preco,
        custo_unitario: custoUnit,
        lucro: m.lucro,
      })
    }

    const total = receita || Number(p.total_estimado || 0)

    const { data: venda, error: vErr } = await sb.from('vendas').insert({
      data: p.data_pedido,
      bar_id: p.bar_id,
      total,
      obs: `Auto: order ${p.id.slice(0, 8)}`,
      criado_por: p.criado_por,
    }).select().single()

    if (vErr) throw new Error(`venda pedido ${p.id}: ${vErr.message}`)

    if (venda && p.pedidos_itens?.length) {
      await sb.from('vendas_itens').insert(
        p.pedidos_itens.map(it => ({
          venda_id: venda.id,
          produto_id: it.produto_id,
          qtd: it.qtd,
          preco_unitario: it.preco_unitario,
        }))
      )
    }

    report.pedidos++
    report.vendas++
    report.receita += total
    report.custo += custo
    report.lucro += total - custo
    report.itens.push(...marginItens)
    report.ids.push(p.id)
  }

  report.margemPct = report.receita > 0 ? Math.round((report.lucro / report.receita) * 100) : 0
  return report
}

/** Margem real JBM: receita (preço ao bar) − custo (compra fornecedor) */
export function marginFromVendasItens(itens) {
  let receita = 0
  let custo = 0
  for (const it of itens || []) {
    const m = calcItemMargin(it.qtd, it.preco_unitario, it.produtos?.custo)
    receita += m.receita
    custo += m.custo
  }
  return { receita, custo, lucro: receita - custo }
}
