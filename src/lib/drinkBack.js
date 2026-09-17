/**
 * Módulo 4 — Drink back (promoters / hostesses).
 *
 * Cada venda do POS pode ser vinculada a uma agente; a comissão sai do
 * total líquido da venda do balcão. Nada disso encosta nas comissões /
 * margens do fornecimento JBM.
 */

export const DEFAULT_COMISSAO_PCT = 20

function pct(value, fallback = 0) {
  const n = +value
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

/** Percentual efetivo: o da agente vence o padrão do bar. */
export function resolveComissaoPct(agent, config = {}) {
  if (agent && agent.comissao_pct != null && +agent.comissao_pct >= 0) return pct(agent.comissao_pct)
  return pct(config.drink_back_comissao_pct, DEFAULT_COMISSAO_PCT)
}

/**
 * Comissão de uma venda. A base é o total cobrado (já com desconto),
 * porque pagar sobre preço de tabela faria o bar pagar comissão em
 * cima de desconto que ele mesmo deu.
 */
export function commissionForSale(venda, agent, config = {}) {
  const base = Math.max(0, +(venda?.total ?? 0) || 0)
  const comissaoPct = resolveComissaoPct(agent, config)
  const valor = Math.round((base * comissaoPct) / 100)
  return {
    agent_id: agent?.id || venda?.drink_back_agent_id || null,
    pos_venda_id: venda?.id || null,
    data: venda?.data || new Date().toISOString().slice(0, 10),
    base_valor: base,
    comissao_pct: comissaoPct,
    comissao_valor: valor,
  }
}

/** Totais por agente no período, com progresso da meta e ranking. */
export function aggregateAgents(agents, comissoes, options = {}) {
  const { mes = null } = options
  const porAgente = new Map()

  ;(agents || []).forEach(a => {
    porAgente.set(a.id, {
      id: a.id,
      nome: a.nome,
      regiao: a.regiao || null,
      cidade: a.cidade || null,
      ativo: a.ativo !== false,
      comissao_pct: resolveComissaoPct(a, options.config || {}),
      meta_mensal: +a.meta_mensal || 0,
      vendas: 0,
      base: 0,
      comissao: 0,
      pendente: 0,
      metaPct: 0,
    })
  })

  ;(comissoes || []).forEach(c => {
    if (mes && !String(c.data || '').startsWith(mes)) return
    const row = porAgente.get(c.agent_id)
    if (!row) return
    row.vendas += 1
    row.base += +c.base_valor || 0
    row.comissao += +c.comissao_valor || 0
    if (!c.pago) row.pendente += +c.comissao_valor || 0
  })

  const list = [...porAgente.values()].map(r => ({
    ...r,
    metaPct: r.meta_mensal > 0 ? Math.round((r.base / r.meta_mensal) * 100) : 0,
    ticketMedio: r.vendas > 0 ? Math.round(r.base / r.vendas) : 0,
  }))

  return list.sort((a, b) => b.base - a.base || a.nome.localeCompare(b.nome))
}

/** Mapa regional — onde o drink back realmente traz faturamento. */
export function regionalBreakdown(agentTotals) {
  const map = new Map()
  ;(agentTotals || []).forEach(a => {
    const key = a.regiao || 'Sem região'
    if (!map.has(key)) map.set(key, { regiao: key, agentes: 0, base: 0, comissao: 0, vendas: 0 })
    const row = map.get(key)
    row.agentes += 1
    row.base += a.base
    row.comissao += a.comissao
    row.vendas += a.vendas
  })
  return [...map.values()].sort((a, b) => b.base - a.base)
}

export function drinkBackSummary(agentTotals) {
  const list = agentTotals || []
  const base = list.reduce((a, r) => a + r.base, 0)
  const comissao = list.reduce((a, r) => a + r.comissao, 0)
  return {
    agentesAtivos: list.filter(r => r.ativo).length,
    vendas: list.reduce((a, r) => a + r.vendas, 0),
    base,
    comissao,
    pendente: list.reduce((a, r) => a + r.pendente, 0),
    custoPct: base > 0 ? Math.round((comissao / base) * 100) : 0,
    topAgente: list.find(r => r.base > 0) || null,
  }
}

export function goalStatus(agentTotal) {
  if (!agentTotal || agentTotal.meta_mensal <= 0) return 'sem_meta'
  if (agentTotal.metaPct >= 100) return 'batida'
  if (agentTotal.metaPct >= 70) return 'perto'
  return 'atrasada'
}
