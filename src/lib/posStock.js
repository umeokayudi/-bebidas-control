/**
 * Módulo 2 — Estoque inteligente e reposição automática.
 *
 * A baixa de estoque escreve em `estoque_movimentos` (o mesmo livro que
 * o portal do bar já usa) com `origem = 'pos'`, e a reposição gera
 * `pos_reorder_requests`. As tabelas de fornecimento JBM (`compras`,
 * `vendas`, `faturas`) não são tocadas em nenhum caminho deste módulo.
 */

export const REORDER_STATUS = {
  pendente: 'pendente',
  enviado: 'enviado',
  pedidoCriado: 'pedido_criado',
  falhou: 'falhou',
  ignorado: 'ignorado',
}

/** Movimentos (entrada/saida) -> saldo por produto. */
export function buildStockMap(movimentos) {
  const map = {}
  ;(movimentos || []).forEach(m => {
    if (!m?.produto_id) return
    const qtd = +m.qtd || 0
    const sinal = m.tipo === 'entrada' ? 1 : -1
    map[m.produto_id] = (map[m.produto_id] || 0) + sinal * qtd
  })
  return map
}

export function buildMinimoMap(regras) {
  const map = {}
  ;(regras || []).forEach(r => {
    if (!r?.produto_id) return
    map[r.produto_id] = +r.minimo || 0
  })
  return map
}

/** Garrafas consumidas por 1 dose de um produto. */
export function bottlesPerDose(pricingRow) {
  const porGarrafa = +(pricingRow?.drinks_por_garrafa ?? 0) || 0
  if (porGarrafa <= 0) return 0
  return 1 / porGarrafa
}

/**
 * Converte um item vendido no POS em consumo de produtos JBM.
 *
 * - Item "shot" (produto direto): 1 drink = 1/drinks_por_garrafa garrafa.
 * - Item de cardápio: soma a receita de `drink_menu_ingredientes`.
 * - Sem preço/receita cadastrados o consumo é 0 — a venda continua
 *   valendo, só não movimenta estoque (evita saldo negativo fantasma).
 */
export function itemConsumption(item, context = {}) {
  const { pricingByProduto = {}, recipesByDrink = {} } = context
  const qtd = Math.max(0, +(item?.qtd ?? 1) || 0)
  if (qtd === 0) return []

  if (item?.produto_id) {
    const perDose = bottlesPerDose(pricingByProduto[item.produto_id])
    if (perDose <= 0) return []
    return [{ produto_id: item.produto_id, garrafas: perDose * qtd }]
  }

  const receita = recipesByDrink[item?.drink_menu_id] || []
  return receita
    .map(ing => {
      const perDose = bottlesPerDose(pricingByProduto[ing.produto_id])
      const doses = Math.max(0, +(ing.doses ?? 1) || 0)
      if (perDose <= 0 || doses === 0) return null
      return { produto_id: ing.produto_id, garrafas: perDose * doses * qtd }
    })
    .filter(Boolean)
}

/** Consumo agregado do carrinho inteiro, pronto para virar movimentos. */
export function cartConsumption(cart, context = {}) {
  const totals = new Map()
  ;(cart || []).forEach(item => {
    itemConsumption(item, context).forEach(({ produto_id, garrafas }) => {
      totals.set(produto_id, (totals.get(produto_id) || 0) + garrafas)
    })
  })
  return [...totals.entries()]
    .map(([produto_id, garrafas]) => ({ produto_id, qtd: roundQty(garrafas) }))
    .filter(row => row.qtd > 0)
}

/** Estoque em garrafas fica em 3 casas — 1 dose de garrafa de 16 = 0.063. */
export function roundQty(value) {
  return Math.round((+value || 0) * 1000) / 1000
}

export function stockStatus(stock, minimo) {
  const min = +minimo || 0
  const atual = +stock || 0
  if (min <= 0) return 'unset'
  if (atual <= 0) return 'critical'
  if (atual < min) return 'low'
  return 'ok'
}

/**
 * Quanto pedir: recompõe o estoque até `minimo * multiplicador`,
 * arredondando para garrafa inteira e sempre pedindo ao menos 1.
 */
export function suggestReorderQty(stock, minimo, multiplicador = 2) {
  const min = +minimo || 0
  if (min <= 0) return 0
  const mult = +multiplicador > 0 ? +multiplicador : 1
  const alvo = min * mult
  const falta = alvo - (+stock || 0)
  return Math.max(1, Math.ceil(falta))
}

/**
 * Produtos que atingiram o reorder point.
 * @param {{id:string,nome:string,sku?:string,stock:number,minimo:number}[]} produtos
 */
export function detectReorderNeeds(produtos, options = {}) {
  const { multiplicador = 2, incluirBaixo = true } = options
  return (produtos || [])
    .map(p => {
      const status = stockStatus(p.stock, p.minimo)
      if (status === 'unset' || status === 'ok') return null
      if (status === 'low' && !incluirBaixo) return null
      return {
        produto_id: p.id,
        sku: p.sku || p.codigo || null,
        produto_nome: p.nome,
        estoque_atual: roundQty(p.stock),
        minimo: +p.minimo || 0,
        status,
        qtd_sugerida: suggestReorderQty(p.stock, p.minimo, multiplicador),
        preco_unitario: +p.preco_venda || 0,
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'critical' ? -1 : 1
      return a.estoque_atual - b.estoque_atual
    })
}

/**
 * Remove produtos já pedidos recentemente. Sem isso, cada venda de um
 * produto zerado dispararia um pedido novo para a JBM.
 */
export function filterReorderCooldown(needs, requests, options = {}) {
  const { cooldownHoras = 24, agora = Date.now() } = options
  const janela = Math.max(0, +cooldownHoras || 0) * 3600 * 1000
  const bloqueados = new Set()

  ;(requests || []).forEach(r => {
    if (!r?.produto_id) return
    if (r.status === REORDER_STATUS.falhou || r.status === REORDER_STATUS.ignorado) return
    const criado = new Date(r.criado_em || 0).getTime()
    if (!Number.isFinite(criado)) return
    if (janela === 0 || agora - criado < janela) bloqueados.add(r.produto_id)
  })

  return (needs || []).filter(n => !bloqueados.has(n.produto_id))
}

/** Payload enviado ao Make.com / operação central. */
export function buildReorderPayload({ bar, itens, config = {}, geradoEm = new Date() } = {}) {
  const lista = (itens || []).map(i => ({
    produto_id: i.produto_id,
    sku: i.sku || null,
    produto: i.produto_nome,
    estoque_atual: i.estoque_atual,
    minimo: i.minimo,
    qtd_sugerida: i.qtd_sugerida,
    preco_unitario: i.preco_unitario || 0,
  }))
  return {
    evento: 'pos.reposicao_automatica',
    gerado_em: geradoEm instanceof Date ? geradoEm.toISOString() : String(geradoEm),
    bar: {
      id: bar?.id || null,
      nome: bar?.nome || null,
      endereco: bar?.endereco || null,
      telefone: bar?.telefone || null,
    },
    config: {
      cooldown_horas: config.reorder_cooldown_horas ?? null,
      multiplicador: config.reorder_multiplicador ?? null,
      criar_pedido_jbm: config.criar_pedido_jbm ?? null,
    },
    itens: lista,
    total_itens: lista.length,
    total_estimado: lista.reduce((a, i) => a + i.qtd_sugerida * (i.preco_unitario || 0), 0),
  }
}

/** Junta produtos + estoque + regras na lista que a tela consome. */
export function buildInventoryRows(produtos, movimentos, regras) {
  const stockMap = buildStockMap(movimentos)
  const minimoMap = buildMinimoMap(regras)
  return (produtos || []).map(p => {
    const stock = roundQty(Math.max(0, stockMap[p.id] || 0))
    const minimo = minimoMap[p.id] || 0
    return { ...p, stock, minimo, status: stockStatus(stock, minimo) }
  })
}

export function inventorySummary(rows) {
  const list = rows || []
  return {
    total: list.length,
    critical: list.filter(r => r.status === 'critical').length,
    low: list.filter(r => r.status === 'low').length,
    ok: list.filter(r => r.status === 'ok').length,
    semRegra: list.filter(r => r.status === 'unset').length,
  }
}
