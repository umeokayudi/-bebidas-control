/**
 * Motor do POS do bar — preços, carrinho, baixa de estoque, reposição
 * automática e análise de faturamento por hora.
 *
 * Escreve APENAS em tabelas do bar (pos_*, estoque_*, drink back, staff) e em
 * `pedidos` (pedido de reposição para a JBM). Nunca toca em vendas / compras /
 * faturas do fornecedor — o faturamento do bar fica separado do da JBM.
 */

export const PAY_METHODS = ['Cash', 'Credit card', 'Debit card', 'PayPay', 'Transfer']
export const DEFAULT_BOTTLE_ML = 700
export const DEFAULT_DRINKS_PER_BOTTLE = 16
export const DEFAULT_CONFIG = {
  auto_pedido: true,
  webhook_url: '',
  dias_cobertura: 7,
  hora_abre: '18:00',
  hora_fecha: '02:00',
}

const API_BASE = import.meta.env.VITE_API_BASE || ''

// ── Datas ────────────────────────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0')

export function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function todayKey() {
  return localDateKey(new Date())
}

export function parseHour(hhmm, fallback) {
  const h = parseInt(String(hhmm || '').split(':')[0], 10)
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : fallback
}

/**
 * Dia de negócio do bar: vendas depois da meia-noite (antes de fechar)
 * pertencem à noite anterior.
 */
export function businessDateKey(date = new Date(), config = DEFAULT_CONFIG) {
  const abre = parseHour(config?.hora_abre, 18)
  const fecha = parseHour(config?.hora_fecha, 2)
  const d = new Date(date)
  const crossesMidnight = fecha <= abre
  if (crossesMidnight && d.getHours() < fecha) d.setDate(d.getDate() - 1)
  return localDateKey(d)
}

export function hourOf(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.getHours()
}

export function hourLabel(h) {
  return `${pad2(h)}h`
}

/** Horas de funcionamento em ordem (ex.: 18,19,...,23,0,1). */
export function openingHours(config = DEFAULT_CONFIG) {
  const abre = parseHour(config?.hora_abre, 18)
  const fecha = parseHour(config?.hora_fecha, 2)
  const hours = []
  let h = abre
  for (let i = 0; i < 24; i++) {
    hours.push(h)
    h = (h + 1) % 24
    if (h === fecha) break
  }
  return hours
}

// ── Preços / carrinho ───────────────────────────────────────────────────────
export function generateDiscountCode(prefix = 'BAR') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let suffix = ''
  for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)]
  return `${prefix}-${suffix}`
}

export function applyDiscount(preco, code) {
  if (!code || !preco) return { preco, desconto: 0 }
  const tipo = code.tipo || 'percent'
  const valor = +code.valor || 0
  let desconto = 0
  if (tipo === 'percent') desconto = Math.round(preco * (valor / 100))
  else desconto = Math.min(preco, Math.round(valor))
  return { preco: Math.max(0, preco - desconto), desconto }
}

export function resolveItemPrice(item, priceType = 'regular', discountCode = null) {
  const lista = item.preco_lista ?? item.preco_venda ?? item.preco_drink ?? 0
  let preco = lista
  let tipo = 'regular'

  if (priceType === 'vip') {
    preco = item.preco_vip ?? item.preco_desconto ?? Math.round(lista * 0.5)
    tipo = 'vip'
  }

  if (discountCode) {
    const applied = applyDiscount(preco, discountCode)
    return { preco: applied.preco, preco_unitario: applied.preco, preco_lista: lista, tipo_preco: 'codigo', desconto_valor: applied.desconto }
  }

  return { preco, preco_unitario: preco, preco_lista: lista, tipo_preco: tipo, desconto_valor: priceType === 'vip' ? lista - preco : 0 }
}

export function validateDiscountCode(code, { drinkMenuId, produtoId } = {}) {
  if (!code) return { ok: false, error: 'invalid' }
  if (!code.ativo) return { ok: false, error: 'inactive' }
  if (code.valido_ate && code.valido_ate < todayKey()) return { ok: false, error: 'expired' }
  if (code.max_usos != null && (code.usos_atual || 0) >= code.max_usos) return { ok: false, error: 'exhausted' }
  if (code.drink_menu_id && drinkMenuId && code.drink_menu_id !== drinkMenuId) return { ok: false, error: 'wrongDrink' }
  if (code.produto_id && produtoId && code.produto_id !== produtoId) return { ok: false, error: 'wrongProduct' }
  return { ok: true }
}

export function cartTotal(cart) {
  return (cart || []).reduce((a, it) => a + (+it.preco_unitario || 0) * (+it.qtd || 1), 0)
}

export function cartSubtotal(cart) {
  return (cart || []).reduce((a, it) => a + (+(it.preco_lista ?? it.preco_unitario) || 0) * (+it.qtd || 1), 0)
}

export function cartCost(cart) {
  return (cart || []).reduce((a, it) => a + (+it.custo_unitario || 0) * (+it.qtd || 1), 0)
}

// ── Comissões ───────────────────────────────────────────────────────────────
export function drinkBackCommission(agent, cart) {
  if (!agent) return 0
  const total = cartTotal(cart)
  const drinks = (cart || []).reduce((a, it) => a + (+it.qtd || 1), 0)
  const pct = +agent.comissao_pct || 0
  const fixa = +agent.comissao_fixa || 0
  return Math.round(total * (pct / 100) + fixa * drinks)
}

export function staffCommission(staff, cart) {
  if (!staff) return 0
  return Math.round(cartTotal(cart) * ((+staff.comissao_pct || 0) / 100))
}

// ── Estoque ─────────────────────────────────────────────────────────────────
export function stockMapFromMovs(movimentos) {
  const map = {}
  for (const m of movimentos || []) {
    const q = +m.qtd || 0
    map[m.produto_id] = (map[m.produto_id] || 0) + (m.tipo === 'entrada' ? q : -q)
  }
  return map
}

/** Consumo médio diário (saídas) nos últimos N dias. */
export function dailyUsage(movimentos, produtoId, days = 14, now = new Date()) {
  const since = new Date(now)
  since.setDate(since.getDate() - days)
  let out = 0
  for (const m of movimentos || []) {
    if (m.produto_id !== produtoId || m.tipo !== 'saida') continue
    if (m.criado_em && new Date(m.criado_em) < since) continue
    out += +m.qtd || 0
  }
  return out / days
}

/**
 * Converte um item do carrinho em garrafas consumidas por produto JBM.
 * shot  → qtd / drinks_por_garrafa
 * drink → cada ingrediente: ml × qtd / volume da garrafa
 */
export function bottlesForItem(item, ctx = {}) {
  const qtd = +item.qtd || 1
  const out = []
  if (item.kind === 'shot' && item.produto_id) {
    const per = +ctx.pricingByProd?.[item.produto_id]?.drinks_por_garrafa || DEFAULT_DRINKS_PER_BOTTLE
    out.push({ produto_id: item.produto_id, garrafas: qtd / per })
    return out
  }
  if (item.kind === 'drink' && item.drink_menu_id) {
    for (const ing of ctx.ingredientesByDrink?.[item.drink_menu_id] || []) {
      const volume = +ctx.produtosById?.[ing.produto_id]?.volume_ml || DEFAULT_BOTTLE_ML
      const ml = +ing.ml || 0
      if (ml <= 0) continue
      out.push({ produto_id: ing.produto_id, garrafas: (ml * qtd) / volume })
    }
  }
  return out
}

export function buildStockMovements(cart, ctx = {}) {
  const agg = {}
  for (const it of cart || []) {
    for (const b of bottlesForItem(it, ctx)) {
      agg[b.produto_id] = (agg[b.produto_id] || 0) + b.garrafas
    }
  }
  return Object.entries(agg)
    .map(([produto_id, g]) => ({ produto_id, qtd: Math.round(g * 10000) / 10000 }))
    .filter(m => m.qtd > 0)
}

/** Quantidade sugerida de reposição: cobre N dias ou volta ao dobro do mínimo. */
export function suggestReorderQty({ stock = 0, minimo = 0, usoDiario = 0, diasCobertura = 7 }) {
  const target = Math.max(minimo * 2, usoDiario * (diasCobertura || 7))
  const qty = Math.ceil(target - stock)
  return Math.max(1, qty)
}

/**
 * Produtos que atingiram o ponto de reposição (stock <= mínimo) e ainda não
 * têm pedido aberto para a JBM.
 */
export function findReorderCandidates({ produtos, stockMap, regras, movimentos, config, produtoIds, openOrderProdIds }) {
  const only = produtoIds ? new Set(produtoIds) : null
  const skip = openOrderProdIds || new Set()
  const out = []
  for (const p of produtos || []) {
    if (only && !only.has(p.id)) continue
    const minimo = +regras?.[p.id] || 0
    if (minimo <= 0) continue
    const stock = Math.max(0, +stockMap?.[p.id] || 0)
    if (stock > minimo) continue
    if (skip.has(p.id)) continue
    const usoDiario = dailyUsage(movimentos, p.id)
    out.push({
      produto: p,
      produto_id: p.id,
      estoque_atual: Math.round(stock * 100) / 100,
      minimo,
      uso_diario: Math.round(usoDiario * 100) / 100,
      qtd_sugerida: suggestReorderQty({ stock, minimo, usoDiario, diasCobertura: config?.dias_cobertura }),
    })
  }
  return out
}

export function buildReorderPayload(bar, eventos, extra = {}) {
  return {
    event: 'pos.reorder',
    source: 'jbm-drinks-pos',
    sent_at: new Date().toISOString(),
    bar: { id: bar?.id, nome: bar?.nome },
    items: (eventos || []).map(e => ({
      produto_id: e.produto_id,
      sku: String(e.produto_id || '').slice(0, 8).toUpperCase(),
      nome: e.produto?.nome || e.nome || '',
      categoria: e.produto?.categoria || e.categoria || '',
      volume_ml: e.produto?.volume_ml || e.volume_ml || null,
      estoque_atual: e.estoque_atual,
      minimo: e.minimo,
      qtd_sugerida: e.qtd_sugerida,
      pedido_id: e.pedido_id || null,
    })),
    ...extra,
  }
}

// ── Faturamento por hora ────────────────────────────────────────────────────
export function hourlyReport(vendas, config = DEFAULT_CONFIG) {
  const hours = openingHours(config)
  const byHour = {}
  for (let h = 0; h < 24; h++) byHour[h] = { hour: h, total: 0, count: 0, custo: 0 }
  for (const v of vendas || []) {
    const h = hourOf(v.criado_em)
    if (h == null) continue
    byHour[h].total += +v.total || 0
    byHour[h].custo += +v.custo_total || 0
    byHour[h].count += 1
  }
  const total = Object.values(byHour).reduce((a, r) => a + r.total, 0)
  const count = Object.values(byHour).reduce((a, r) => a + r.count, 0)

  // Horas fora do expediente com venda também aparecem (dados reais > config)
  const extra = Object.values(byHour).filter(r => r.count > 0 && !hours.includes(r.hour)).map(r => r.hour)
  const shown = [...hours, ...extra]
  const rows = shown.map(h => {
    const r = byHour[h]
    return {
      ...r,
      label: hourLabel(h),
      ticket: r.count ? Math.round(r.total / r.count) : 0,
      pct: total ? Math.round((r.total / total) * 1000) / 10 : 0,
      margem: r.total ? Math.round(((r.total - r.custo) / r.total) * 100) : 0,
      inOpening: hours.includes(h),
    }
  })
  const opening = rows.filter(r => r.inOpening)
  const avg = opening.length ? opening.reduce((a, r) => a + r.total, 0) / opening.length : 0
  for (const r of rows) {
    r.isPeak = avg > 0 && r.total >= avg * 1.3
    r.isIdle = r.inOpening && total > 0 && r.total <= avg * 0.5
  }
  return {
    rows,
    total,
    count,
    ticket: count ? Math.round(total / count) : 0,
    avgPerHour: Math.round(avg),
    peak: rows.filter(r => r.isPeak).sort((a, b) => b.total - a.total),
    idle: rows.filter(r => r.isIdle),
  }
}

/** Faixas horárias (ex.: 18–21, 21–00, 00–02) para o dashboard do dono. */
export function hourBands(config = DEFAULT_CONFIG, size = 3) {
  const hours = openingHours(config)
  const bands = []
  for (let i = 0; i < hours.length; i += size) {
    const slice = hours.slice(i, i + size)
    const last = slice[slice.length - 1]
    bands.push({ hours: slice, label: `${pad2(slice[0])}–${pad2((last + 1) % 24)}h` })
  }
  return bands
}

export function bandTotals(vendas, bands) {
  return bands.map(b => {
    const set = new Set(b.hours)
    let total = 0, count = 0
    for (const v of vendas || []) {
      if (set.has(hourOf(v.criado_em))) { total += +v.total || 0; count += 1 }
    }
    return { ...b, total, count, ticket: count ? Math.round(total / count) : 0 }
  })
}

export function weekdayReport(vendas) {
  const rows = Array.from({ length: 7 }, (_, i) => ({ weekday: i, total: 0, count: 0 }))
  for (const v of vendas || []) {
    const d = new Date(v.criado_em)
    if (Number.isNaN(d.getTime())) continue
    const r = rows[d.getDay()]
    r.total += +v.total || 0
    r.count += 1
  }
  const max = Math.max(...rows.map(r => r.total), 0)
  return rows.map(r => ({ ...r, ticket: r.count ? Math.round(r.total / r.count) : 0, pct: max ? Math.round((r.total / max) * 100) : 0 }))
}

/** Sugestões de monetização para horas ociosas. */
export function idleSuggestions(report) {
  const idle = report?.idle || []
  if (!idle.length) return []
  const first = idle[0], last = idle[idle.length - 1]
  const range = idle.length > 1 ? `${first.label}–${hourLabel((last.hour + 1) % 24)}` : first.label
  const out = [
    { type: 'happyHour', range, discount: 30 },
    { type: 'event', range },
    { type: 'reservation', range },
  ]
  if (idle.length >= 2) out.push({ type: 'staffing', range })
  return out
}

// ── Persistência ────────────────────────────────────────────────────────────
export async function loadPosConfig(supabase, barId) {
  const { data } = await supabase.from('pos_config').select('*').eq('bar_id', barId).maybeSingle()
  return { ...DEFAULT_CONFIG, ...(data || {}), bar_id: barId }
}

export async function savePosConfig(supabase, barId, patch) {
  const row = { bar_id: barId, ...patch, atualizado_em: new Date().toISOString() }
  const { error } = await supabase.from('pos_config').upsert(row, { onConflict: 'bar_id' })
  if (error) throw new Error(error.message)
  return row
}

export async function checkPosSchema(supabase) {
  const { error } = await supabase.from('pos_reposicao_eventos').select('id').limit(1)
  if (!error) return { ready: true }
  if (error.code === 'PGRST205' || error.code === '42P01' || /does not exist|schema cache/i.test(error.message || '')) {
    return { ready: false, error: 'missingTables' }
  }
  return { ready: false, error: error.message }
}

/**
 * Registra a venda de balcão completa:
 * pos_vendas → itens → uso de código / VIP → baixa de estoque (estoque_movimentos).
 */
export async function registerPosSale(supabase, params) {
  const {
    bar, user, cart, payMethod = 'Cash', vipId = null, activeCode = null,
    staff = null, agent = null, mesa = '', obs = '', config = DEFAULT_CONFIG, ctx = {},
  } = params
  if (!cart?.length) throw new Error('emptyCart')

  const subtotal = cartSubtotal(cart)
  const total = cartTotal(cart)
  const desconto = Math.max(0, subtotal - total)
  const custo = cartCost(cart)
  const tipo = vipId ? 'vip' : activeCode ? 'desconto' : 'balcao'
  const comissaoDb = drinkBackCommission(agent, cart)
  const comissaoStaff = staffCommission(staff, cart)
  const now = new Date()

  const { data: venda, error } = await supabase.from('pos_vendas').insert({
    bar_id: bar.id,
    data: businessDateKey(now, config),
    subtotal,
    desconto_total: desconto,
    total,
    custo_total: custo,
    metodo_pagamento: payMethod,
    tipo,
    vip_member_id: vipId || null,
    discount_code_id: activeCode?.id || null,
    staff_id: staff?.id || null,
    drink_back_agent_id: agent?.id || null,
    comissao_drink_back: comissaoDb,
    comissao_staff: comissaoStaff,
    mesa: mesa || null,
    obs: obs || null,
    criado_por: user?.id || null,
    criado_em: now.toISOString(),
  }).select().single()
  if (error) throw new Error(error.message)

  const { error: itErr } = await supabase.from('pos_vendas_itens').insert(
    cart.map(it => ({
      pos_venda_id: venda.id,
      drink_menu_id: it.drink_menu_id || null,
      produto_id: it.produto_id || null,
      nome: it.nome,
      qtd: it.qtd,
      preco_unitario: it.preco_unitario,
      preco_lista: it.preco_lista ?? it.preco_unitario,
      custo_unitario: it.custo_unitario || 0,
      tipo_preco: it.tipo_preco || 'regular',
      desconto_valor: it.desconto_valor || 0,
    }))
  )
  if (itErr) throw new Error(itErr.message)

  if (activeCode) {
    await supabase.from('discount_codes').update({ usos_atual: (activeCode.usos_atual || 0) + 1 }).eq('id', activeCode.id)
    await supabase.from('discount_usages').insert({
      bar_id: bar.id, discount_code_id: activeCode.id, pos_venda_id: venda.id, valor_desconto: desconto,
    })
  }

  if (vipId) {
    await supabase.from('vip_usages').insert(cart.map(it => ({
      bar_id: bar.id,
      vip_member_id: vipId,
      drink_menu_id: it.drink_menu_id || null,
      produto_id: it.produto_id || null,
      nome: it.nome,
      qtd: it.qtd,
      preco_aplicado: it.preco_unitario,
      preco_lista: it.preco_lista ?? it.preco_unitario,
      tipo: 'vip',
      pos_venda_id: venda.id,
      criado_por: user?.id || null,
    })))
  }

  const movimentos = buildStockMovements(cart, ctx)
  if (movimentos.length) {
    const { error: mvErr } = await supabase.from('estoque_movimentos').insert(movimentos.map(m => ({
      bar_id: bar.id,
      produto_id: m.produto_id,
      tipo: 'saida',
      qtd: m.qtd,
      obs: `POS sale ${String(venda.id).slice(0, 8)}`,
      origem: 'pos',
      pos_venda_id: venda.id,
      criado_por: user?.id || null,
    })))
    if (mvErr) console.warn('estoque_movimentos:', mvErr.message)
  }

  return { venda, movimentos, comissaoDb, comissaoStaff }
}

/** Produto IDs com pedido JBM ainda aberto (pendente/confirmado) para o bar. */
export async function loadOpenOrderProductIds(supabase, barId) {
  const { data } = await supabase.from('pedidos')
    .select('id, status, pedidos_itens(produto_id)')
    .eq('bar_id', barId)
    .in('status', ['pendente', 'confirmado'])
  const set = new Set()
  for (const p of data || []) for (const it of p.pedidos_itens || []) if (it.produto_id) set.add(it.produto_id)
  return set
}

/**
 * Gatilho pós-venda: verifica estoque ≤ mínimo, cria pedido JBM (se ativo),
 * registra evento de reposição e dispara webhook (Make.com / operação central).
 */
export async function runAutoReorder(supabase, { bar, user, config = DEFAULT_CONFIG, produtoIds = null, posVendaId = null, force = false }) {
  const [pR, mR, rR, openIds] = await Promise.all([
    supabase.from('produtos_public').select('id, nome, categoria, preco_venda, volume_ml, ativo').eq('ativo', true),
    supabase.from('estoque_movimentos').select('produto_id, tipo, qtd, criado_em').eq('bar_id', bar.id).limit(2000),
    supabase.from('estoque_regras').select('produto_id, minimo').eq('bar_id', bar.id),
    loadOpenOrderProductIds(supabase, bar.id),
  ])
  const produtos = pR.data || []
  const movimentos = mR.data || []
  const regras = {}
  for (const r of rR.data || []) regras[r.produto_id] = +r.minimo || 0

  const candidates = findReorderCandidates({
    produtos, movimentos, regras, config, produtoIds,
    stockMap: stockMapFromMovs(movimentos),
    openOrderProdIds: force ? new Set() : openIds,
  })
  if (!candidates.length) return { candidates: [], pedido: null, eventos: [], webhook: null }

  let pedido = null
  if (config.auto_pedido) {
    const total = candidates.reduce((a, c) => a + (+c.produto.preco_venda || 0) * c.qtd_sugerida, 0)
    const { data: ped, error } = await supabase.from('pedidos').insert({
      bar_id: bar.id,
      criado_por: user?.id || null,
      status: 'pendente',
      data_pedido: todayKey(),
      obs: `Auto: order · reorder point · ${candidates.length} item(s)`,
      total_estimado: total,
    }).select().single()
    if (error) throw new Error(`pedido: ${error.message}`)
    pedido = ped
    const { error: iErr } = await supabase.from('pedidos_itens').insert(candidates.map(c => ({
      pedido_id: ped.id,
      produto_id: c.produto_id,
      qtd: c.qtd_sugerida,
      preco_unitario: +c.produto.preco_venda || 0,
    })))
    if (iErr) throw new Error(`pedidos_itens: ${iErr.message}`)

    const { data: admins } = await supabase.from('perfis').select('id').eq('role', 'admin')
    if (admins?.length) {
      await supabase.from('notificacoes').insert(admins.map(a => ({
        user_id: a.id,
        tipo: 'pedido_novo',
        titulo: `Auto reorder · ${bar.nome}`,
        mensagem: candidates.map(c => `${c.produto.nome} ×${c.qtd_sugerida}`).join(', '),
        link: 'pedidos',
      })))
    }
  }

  const { data: eventos, error: evErr } = await supabase.from('pos_reposicao_eventos').insert(candidates.map(c => ({
    bar_id: bar.id,
    produto_id: c.produto_id,
    pos_venda_id: posVendaId,
    pedido_id: pedido?.id || null,
    estoque_atual: c.estoque_atual,
    minimo: c.minimo,
    qtd_sugerida: c.qtd_sugerida,
    webhook_status: 'pendente',
    payload: buildReorderPayload(bar, [{ ...c, pedido_id: pedido?.id || null }]).items[0],
  }))).select()
  if (evErr) console.warn('pos_reposicao_eventos:', evErr.message)

  let webhook = null
  try {
    webhook = await dispatchReorderWebhook(supabase, { barId: bar.id, eventoIds: (eventos || []).map(e => e.id) })
  } catch (e) {
    webhook = { sent: false, error: e.message }
  }

  return { candidates, pedido, eventos: eventos || [], webhook }
}

/** Chama a API serverless que dispara o webhook (Make.com) e atualiza o status dos eventos. */
export async function dispatchReorderWebhook(supabase, { barId, eventoIds }) {
  if (!eventoIds?.length) return { sent: false, reason: 'noEvents' }
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${API_BASE}/api/pos-reorder-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ bar_id: barId, evento_ids: eventoIds }),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { json = { error: text.slice(0, 200) } }
  if (!res.ok) return { sent: false, status: res.status, ...json }
  return json
}
