/**
 * Camada de dados do POS do bar.
 *
 * ISOLAMENTO JBM (não estragar o fornecimento de bebida):
 *   * Faturamento do balcão -> `pos_vendas` / `pos_vendas_itens`.
 *     Nunca `vendas` / `vendas_itens`, que são as entregas da JBM e
 *     alimentam margem, faturas e relatórios do fornecedor.
 *   * Consumo do bar -> `estoque_movimentos` com `origem = 'pos'`.
 *   * Reposição -> `pos_reorder_requests` (+ `pedidos` com
 *     `origem = 'pos_auto'`, que é justamente o pedido do bar para a
 *     JBM, criado só quando o dono liga a automação).
 *   * `compras`, `faturas` e `produtos` são somente leitura aqui.
 */

import { supabase } from './supabase'
import { isSupplierProduct } from '../components/utils'
import {
  buildInventoryRows,
  buildReorderPayload,
  cartConsumption,
  detectReorderNeeds,
  filterReorderCooldown,
  REORDER_STATUS,
} from './posStock'
import { commissionForSale } from './drinkBack'

export const POS_TABLES = [
  'pos_vendas',
  'pos_vendas_itens',
  'bar_pos_config',
  'bar_staff',
  'bar_staff_turnos',
  'drink_back_agents',
  'drink_back_comissoes',
  'drink_menu_ingredientes',
  'pos_reorder_requests',
  'service_orders',
]

export const DEFAULT_POS_CONFIG = {
  hora_abertura: 18,
  hora_fechamento: 5,
  meta_faturamento_hora: 0,
  auto_reorder_enabled: false,
  reorder_webhook_url: '',
  reorder_cooldown_horas: 24,
  reorder_multiplicador: 2,
  criar_pedido_jbm: true,
  drink_back_comissao_pct: 20,
}

function missingTable(error) {
  if (!error) return false
  return error.code === 'PGRST205' || error.code === '42P01' || /does not exist/i.test(error.message || '')
}

/** Roda uma query tolerando tabela ainda não criada (setup pendente). */
async function safe(query, fallback = []) {
  const { data, error } = await query
  if (error) {
    if (missingTable(error)) return { data: fallback, missing: true }
    return { data: fallback, error }
  }
  return { data: data ?? fallback }
}

export function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

export function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7)
}

/** Data operacional: antes das 6h a venda pertence à noite anterior. */
export function businessDay(date = new Date(), openHour = 18) {
  const d = new Date(date)
  if (openHour > 12 && d.getHours() < 6) d.setDate(d.getDate() - 1)
  return todayKey(d)
}

export async function checkPosPlatform() {
  const { error } = await supabase.from('bar_pos_config').select('bar_id').limit(1)
  if (!error) return { ready: true }
  if (missingTable(error)) {
    return { ready: false, reason: 'schema', error: 'Rode BAR_POS_SCHEMA.sql no Supabase.' }
  }
  return { ready: false, reason: 'error', error: error.message }
}

export async function loadPosConfig(barId) {
  const { data, error } = await supabase.from('bar_pos_config').select('*').eq('bar_id', barId).maybeSingle()
  if (error && !missingTable(error)) throw error
  return { ...DEFAULT_POS_CONFIG, ...(data || {}), bar_id: barId }
}

export async function savePosConfig(barId, patch) {
  const payload = { ...patch, bar_id: barId, atualizado_em: new Date().toISOString() }
  const { data, error } = await supabase
    .from('bar_pos_config')
    .upsert(payload, { onConflict: 'bar_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

/** Catálogo vendável: drinks do cardápio + shots de produto JBM. */
export async function loadPosCatalog(barId) {
  const [drinksR, pricingR, recipesR, vipR, codesR, staffR, agentsR] = await Promise.all([
    safe(supabase.from('drink_menu').select('*').eq('bar_id', barId).order('categoria').order('nome')),
    safe(supabase.from('bar_pricing').select('*, produtos(nome,categoria,preco_venda)').eq('bar_id', barId)),
    safe(supabase.from('drink_menu_ingredientes').select('*')),
    safe(supabase.from('vip_members').select('*').eq('bar_id', barId).eq('ativo', true).order('nome')),
    safe(supabase.from('discount_codes').select('*').eq('bar_id', barId).eq('ativo', true)),
    safe(supabase.from('bar_staff').select('*').eq('bar_id', barId).eq('ativo', true).order('nome')),
    safe(supabase.from('drink_back_agents').select('*').eq('bar_id', barId).eq('ativo', true).order('nome')),
  ])

  const drinks = drinksR.data
  const drinkIds = new Set(drinks.map(d => d.id))
  const recipesByDrink = {}
  recipesR.data.forEach(ing => {
    if (!drinkIds.has(ing.drink_menu_id)) return
    if (!recipesByDrink[ing.drink_menu_id]) recipesByDrink[ing.drink_menu_id] = []
    recipesByDrink[ing.drink_menu_id].push(ing)
  })

  const pricingByProduto = {}
  pricingR.data.forEach(p => { pricingByProduto[p.produto_id] = p })

  return {
    drinks,
    shots: pricingR.data,
    pricingByProduto,
    recipesByDrink,
    vipMembers: vipR.data,
    discountCodes: codesR.data,
    staff: staffR.data,
    agents: agentsR.data,
    setupPending: Boolean(drinksR.missing || staffR.missing),
  }
}

/** Vendas do POS entre duas datas (inclusive), com itens. */
export async function loadPosSales(barId, { from, to } = {}) {
  const inicio = from || todayKey()
  const fim = to || inicio
  const { data } = await safe(
    supabase
      .from('pos_vendas')
      .select('*, pos_vendas_itens(*)')
      .eq('bar_id', barId)
      .gte('data', inicio)
      .lte('data', fim)
      .order('criado_em', { ascending: false })
  )
  return data
}

export async function loadInventory(barId) {
  const [prodR, movR, regrasR] = await Promise.all([
    safe(supabase.from('produtos_public').select('*').eq('ativo', true).order('categoria').order('nome')),
    safe(supabase.from('estoque_movimentos').select('*').eq('bar_id', barId).order('criado_em', { ascending: false }).limit(2000)),
    safe(supabase.from('estoque_regras').select('*').eq('bar_id', barId)),
  ])
  const produtos = prodR.data.filter(isSupplierProduct)
  return {
    produtos,
    movimentos: movR.data,
    regras: regrasR.data,
    rows: buildInventoryRows(produtos, movR.data, regrasR.data),
  }
}

export async function loadReorderRequests(barId, limit = 60) {
  const { data } = await safe(
    supabase
      .from('pos_reorder_requests')
      .select('*')
      .eq('bar_id', barId)
      .order('criado_em', { ascending: false })
      .limit(limit)
  )
  return data
}

/**
 * Registra uma venda do balcão.
 *
 * Ordem importa: a venda é gravada primeiro e tudo o que vem depois
 * (estoque, comissão, reposição) é best-effort — uma falha de rede na
 * reposição não pode desfazer o dinheiro que já entrou no caixa.
 */
export async function registerPosSale({
  bar,
  cart,
  catalog,
  config = DEFAULT_POS_CONFIG,
  payMethod = 'Cash',
  vipMemberId = null,
  staffId = null,
  agentId = null,
  discountCode = null,
  obs = null,
  userId = null,
  now = new Date(),
}) {
  if (!bar?.id) throw new Error('Bar não identificado')
  if (!cart?.length) throw new Error('Carrinho vazio')

  const subtotal = cart.reduce((a, it) => a + (+it.preco_lista || +it.preco_unitario || 0) * (+it.qtd || 1), 0)
  const total = cart.reduce((a, it) => a + (+it.preco_unitario || 0) * (+it.qtd || 1), 0)
  const desconto = Math.max(0, subtotal - total)
  const agent = (catalog?.agents || []).find(a => a.id === agentId) || null
  const comissao = agent ? commissionForSale({ total, data: businessDay(now, config.hora_abertura) }, agent, config) : null

  const tipo = vipMemberId ? 'vip' : discountCode ? 'desconto' : agentId ? 'drink_back' : 'balcao'

  const { data: venda, error } = await supabase
    .from('pos_vendas')
    .insert({
      bar_id: bar.id,
      data: businessDay(now, config.hora_abertura),
      hora: now.getHours(),
      subtotal,
      desconto_total: desconto,
      total,
      metodo_pagamento: payMethod,
      tipo,
      vip_member_id: vipMemberId || null,
      discount_code_id: discountCode?.id || null,
      staff_id: staffId || null,
      drink_back_agent_id: agentId || null,
      drink_back_valor: comissao?.comissao_valor || 0,
      obs,
      criado_por: userId,
    })
    .select()
    .single()

  if (error) throw error

  const result = { venda, total, desconto, warnings: [], consumo: [], reorder: null, comissao: null }

  const { error: itensError } = await supabase.from('pos_vendas_itens').insert(
    cart.map(it => ({
      pos_venda_id: venda.id,
      drink_menu_id: it.drink_menu_id || null,
      produto_id: it.produto_id || null,
      nome: it.nome,
      qtd: +it.qtd || 1,
      preco_unitario: +it.preco_unitario || 0,
      preco_lista: +it.preco_lista || null,
      tipo_preco: it.tipo_preco || 'regular',
      desconto_valor: +it.desconto_valor || 0,
      custo_estimado: +it.custo || 0,
    }))
  )
  if (itensError) result.warnings.push(`Itens: ${itensError.message}`)

  if (discountCode?.id) {
    const [{ error: codeError }, { error: usageError }] = await Promise.all([
      supabase.from('discount_codes')
        .update({ usos_atual: (+discountCode.usos_atual || 0) + 1 })
        .eq('id', discountCode.id),
      supabase.from('discount_usages').insert({
        bar_id: bar.id,
        discount_code_id: discountCode.id,
        pos_venda_id: venda.id,
        valor_desconto: desconto,
      }),
    ])
    if (codeError || usageError) result.warnings.push('Código de desconto não registrado')
  }

  if (vipMemberId) {
    const { error: vipError } = await supabase.from('vip_usages').insert(
      cart.map(it => ({
        bar_id: bar.id,
        vip_member_id: vipMemberId,
        drink_menu_id: it.drink_menu_id || null,
        produto_id: it.produto_id || null,
        nome: it.nome,
        qtd: +it.qtd || 1,
        preco_aplicado: +it.preco_unitario || 0,
        preco_lista: +it.preco_lista || null,
        tipo: 'vip',
        pos_venda_id: venda.id,
        criado_por: userId,
      }))
    )
    if (vipError) result.warnings.push('Uso VIP não registrado')
  }

  if (comissao) {
    const { error: comError } = await supabase.from('drink_back_comissoes').insert({
      bar_id: bar.id,
      agent_id: agent.id,
      pos_venda_id: venda.id,
      data: comissao.data,
      base_valor: comissao.base_valor,
      comissao_pct: comissao.comissao_pct,
      comissao_valor: comissao.comissao_valor,
    })
    if (comError) result.warnings.push('Comissão drink back não registrada')
    else result.comissao = comissao
  }

  // Baixa de estoque em tempo real (Módulo 2)
  const consumo = cartConsumption(cart, {
    pricingByProduto: catalog?.pricingByProduto || {},
    recipesByDrink: catalog?.recipesByDrink || {},
  })
  result.consumo = consumo

  if (consumo.length) {
    const { error: movError } = await supabase.from('estoque_movimentos').insert(
      consumo.map(c => ({
        bar_id: bar.id,
        produto_id: c.produto_id,
        tipo: 'saida',
        qtd: c.qtd,
        obs: `POS · venda ${venda.id.slice(0, 8)}`,
        origem: 'pos',
        pos_venda_id: venda.id,
        criado_por: userId,
      }))
    )
    if (movError) result.warnings.push(`Estoque: ${movError.message}`)
  }

  return result
}

/**
 * Verifica reorder points depois da venda e dispara a reposição.
 * Retorna null quando a automação está desligada ou nada atingiu o mínimo.
 */
export async function runReorderCheck({ bar, config = DEFAULT_POS_CONFIG, produtoIds = null, force = false }) {
  if (!force && !config.auto_reorder_enabled) return null

  const [{ rows }, requests] = await Promise.all([
    loadInventory(bar.id),
    loadReorderRequests(bar.id, 120),
  ])

  const alvo = produtoIds?.length ? rows.filter(r => produtoIds.includes(r.id)) : rows
  const needs = detectReorderNeeds(alvo, { multiplicador: config.reorder_multiplicador })
  const pendentes = filterReorderCooldown(needs, requests, {
    cooldownHoras: config.reorder_cooldown_horas,
  })

  if (!pendentes.length) return null

  const payload = buildReorderPayload({ bar, itens: pendentes, config })
  return dispatchReorder({ bar, itens: pendentes, payload, config })
}

/**
 * Grava as ordens e chama o webhook pelo backend.
 *
 * As requests entram como 'pendente' antes do webhook: se o disparo
 * falhar, o dono do bar ainda vê a reposição na tela e pode reenviar.
 */
export async function dispatchReorder({ bar, itens, payload, config = DEFAULT_POS_CONFIG }) {
  const { data: inserted, error } = await supabase
    .from('pos_reorder_requests')
    .insert(itens.map(i => ({
      bar_id: bar.id,
      produto_id: i.produto_id,
      sku: i.sku,
      produto_nome: i.produto_nome,
      estoque_atual: i.estoque_atual,
      minimo: i.minimo,
      qtd_sugerida: i.qtd_sugerida,
      status: REORDER_STATUS.pendente,
      payload,
    })))
    .select()

  if (error) return { error: error.message, itens }

  const requestIds = (inserted || []).map(r => r.id)
  let webhook = null
  try {
    const { data: session } = await supabase.auth.getSession()
    const res = await fetch('/api/pos-reorder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.session?.access_token ? { Authorization: `Bearer ${session.session.access_token}` } : {}),
      },
      body: JSON.stringify({
        bar_id: bar.id,
        request_ids: requestIds,
        itens,
        webhook_url: config.reorder_webhook_url || null,
        criar_pedido_jbm: config.criar_pedido_jbm !== false,
        payload,
      }),
    })
    webhook = await res.json().catch(() => ({ ok: res.ok }))
  } catch (e) {
    webhook = { ok: false, error: e.message }
  }

  return { itens, requests: inserted || [], webhook }
}

export async function resendReorder({ bar, request, config = DEFAULT_POS_CONFIG }) {
  const itens = [{
    produto_id: request.produto_id,
    sku: request.sku,
    produto_nome: request.produto_nome,
    estoque_atual: request.estoque_atual,
    minimo: request.minimo,
    qtd_sugerida: request.qtd_sugerida,
  }]
  const payload = buildReorderPayload({ bar, itens, config })
  return dispatchReorder({ bar, itens, payload, config })
}

export async function ignoreReorder(requestId) {
  const { error } = await supabase
    .from('pos_reorder_requests')
    .update({ status: REORDER_STATUS.ignorado, resolvido_em: new Date().toISOString() })
    .eq('id', requestId)
  if (error) throw error
}

// ── Staff ────────────────────────────────────────────────────────
export async function loadStaff(barId, mes = monthKey()) {
  const [staffR, turnosR] = await Promise.all([
    safe(supabase.from('bar_staff').select('*').eq('bar_id', barId).order('nome')),
    safe(supabase.from('bar_staff_turnos').select('*').eq('bar_id', barId).gte('data', `${mes}-01`).order('data', { ascending: false })),
  ])
  return { staff: staffR.data, turnos: turnosR.data }
}

export async function saveStaff(barId, member) {
  const payload = {
    bar_id: barId,
    nome: member.nome,
    cargo: member.cargo || 'Bartender',
    tipo_pagamento: member.tipo_pagamento || 'mensal',
    salario_base: +member.salario_base || 0,
    comissao_pct: +member.comissao_pct || 0,
    telefone: member.telefone || null,
    ativo: member.ativo !== false,
    notas: member.notas || null,
  }
  const query = member.id
    ? supabase.from('bar_staff').update(payload).eq('id', member.id)
    : supabase.from('bar_staff').insert(payload)
  const { error } = await query
  if (error) throw error
}

export async function saveTurno(barId, turno) {
  const payload = {
    bar_id: barId,
    staff_id: turno.staff_id,
    data: turno.data,
    hora_inicio: +turno.hora_inicio,
    hora_fim: +turno.hora_fim,
    status: turno.status || 'escalado',
    obs: turno.obs || null,
  }
  const query = turno.id
    ? supabase.from('bar_staff_turnos').update(payload).eq('id', turno.id)
    : supabase.from('bar_staff_turnos').insert(payload)
  const { error } = await query
  if (error) throw error
}

export async function deleteTurno(id) {
  const { error } = await supabase.from('bar_staff_turnos').delete().eq('id', id)
  if (error) throw error
}

// ── Drink back ───────────────────────────────────────────────────
export async function loadDrinkBack(barId, mes = monthKey()) {
  const [agentsR, comR] = await Promise.all([
    safe(supabase.from('drink_back_agents').select('*').eq('bar_id', barId).order('nome')),
    safe(supabase.from('drink_back_comissoes').select('*').eq('bar_id', barId).gte('data', `${mes}-01`).order('data', { ascending: false })),
  ])
  return { agents: agentsR.data, comissoes: comR.data }
}

export async function saveAgent(barId, agent) {
  const payload = {
    bar_id: barId,
    nome: agent.nome,
    codigo: agent.codigo || null,
    regiao: agent.regiao || null,
    cidade: agent.cidade || null,
    telefone: agent.telefone || null,
    comissao_pct: +agent.comissao_pct || 0,
    meta_mensal: +agent.meta_mensal || 0,
    ativo: agent.ativo !== false,
    notas: agent.notas || null,
  }
  const query = agent.id
    ? supabase.from('drink_back_agents').update(payload).eq('id', agent.id)
    : supabase.from('drink_back_agents').insert(payload)
  const { error } = await query
  if (error) throw error
}

export async function payCommissions(ids) {
  if (!ids?.length) return
  const { error } = await supabase
    .from('drink_back_comissoes')
    .update({ pago: true, pago_em: new Date().toISOString() })
    .in('id', ids)
  if (error) throw error
}

// ── Serviços ─────────────────────────────────────────────────────
export async function loadServiceOrders(barId) {
  const { data } = await safe(
    supabase.from('service_orders').select('*').eq('bar_id', barId).order('criado_em', { ascending: false }).limit(200)
  )
  return data
}

export async function saveServiceOrder(barId, order, userId = null) {
  const payload = {
    bar_id: barId,
    tipo: order.tipo || 'limpeza',
    titulo: order.titulo,
    descricao: order.descricao || null,
    prioridade: order.prioridade || 'normal',
    status: order.status || 'aberto',
    agendado_para: order.agendado_para || null,
    recorrencia: order.recorrencia || 'nenhuma',
    fornecedor_nome: order.fornecedor_nome || null,
    custo_estimado: +order.custo_estimado || 0,
    custo_final: +order.custo_final || 0,
  }
  if (order.id) {
    const { error } = await supabase.from('service_orders').update(payload).eq('id', order.id)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('service_orders').insert({ ...payload, criado_por: userId })
  if (error) throw error
}

export async function updateServiceStatus(order, status, extra = {}) {
  const patch = { status, ...extra }
  if (status === 'concluido') patch.concluido_em = new Date().toISOString()
  const { error } = await supabase.from('service_orders').update(patch).eq('id', order.id)
  if (error) throw error
}

export async function createRecurrence(next) {
  if (!next) return
  const { error } = await supabase.from('service_orders').insert(next)
  if (error) throw error
}

// ── Receitas do cardápio ─────────────────────────────────────────
export async function saveRecipe(drinkMenuId, ingredientes) {
  await supabase.from('drink_menu_ingredientes').delete().eq('drink_menu_id', drinkMenuId)
  const rows = (ingredientes || [])
    .filter(i => i.produto_id && +i.doses > 0)
    .map(i => ({ drink_menu_id: drinkMenuId, produto_id: i.produto_id, doses: +i.doses }))
  if (!rows.length) return
  const { error } = await supabase.from('drink_menu_ingredientes').insert(rows)
  if (error) throw error
}
