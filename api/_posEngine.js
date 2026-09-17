/**
 * Bar POS engine — isolated from JBM beverage supply.
 *
 * POS writes: pos_vendas, pos_vendas_itens, estoque_movimentos, pos_reorder_alerts,
 *             drink_back_usages, discount_usages, vip_usages
 * POS never writes: vendas, vendas_itens, compras, faturas
 * Restock to JBM happens only via pedidos (existing order flow), never via vendas.
 */

export const POS_TABLES = {
  sales: 'pos_vendas',
  items: 'pos_vendas_itens',
  stockMoves: 'estoque_movimentos',
  reorderAlerts: 'pos_reorder_alerts',
  drinkBackAgents: 'drink_back_agents',
  drinkBackUsages: 'drink_back_usages',
  discountUsages: 'discount_usages',
  discountCodes: 'discount_codes',
  vipUsages: 'vip_usages',
}

export const JBM_SUPPLY_TABLES = ['vendas', 'vendas_itens', 'compras', 'compras_itens', 'faturas']

export const POS_FORBIDDEN_TABLES = [...JBM_SUPPLY_TABLES]

export function todayKey(now = new Date(), timeZone = 'Asia/Tokyo') {
  return tokyoDateParts(now, timeZone).date
}

function tokyoDateParts(now = new Date(), timeZone = 'Asia/Tokyo') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(now))
  const get = type => parts.find(p => p.type === type)?.value
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  }
}

/** Night-shift business date: hours before dayStartHour belong to the previous calendar day. */
export function barBusinessDate(isoOrDate, { dayStartHour = 6, timeZone = 'Asia/Tokyo' } = {}) {
  const { date, hour } = tokyoDateParts(isoOrDate, timeZone)
  if (hour >= dayStartHour) return date
  const [y, m, d] = date.split('-').map(Number)
  const prev = new Date(Date.UTC(y, m - 1, d - 1))
  return prev.toISOString().slice(0, 10)
}

export function hourInTimeZone(isoOrDate, timeZone = 'Asia/Tokyo') {
  return tokyoDateParts(isoOrDate, timeZone).hour
}

export function applyDiscount(preco, code) {
  if (!code || !preco) return { preco: +preco || 0, desconto: 0 }
  const tipo = code.tipo || 'percent'
  const valor = +code.valor || 0
  let desconto = 0
  if (tipo === 'percent') desconto = Math.round(preco * (valor / 100))
  else desconto = Math.min(preco, Math.round(valor))
  return { preco: Math.max(0, preco - desconto), desconto }
}

export function resolveItemPrice(item, priceType = 'regular', discountCode = null) {
  const lista = Number(item?.preco_lista ?? item?.preco_venda ?? item?.preco_drink ?? 0) || 0
  let preco = lista
  let tipo = 'regular'

  if (priceType === 'vip') {
    preco = Number(item.preco_vip ?? item.preco_desconto ?? Math.round(lista * 0.5)) || 0
    tipo = 'vip'
  }

  if (discountCode) {
    const applied = applyDiscount(preco, discountCode)
    return {
      preco: applied.preco,
      preco_unitario: applied.preco,
      preco_lista: lista,
      tipo_preco: 'codigo',
      desconto_valor: applied.desconto,
    }
  }

  return {
    preco,
    preco_unitario: preco,
    preco_lista: lista,
    tipo_preco: tipo,
    desconto_valor: priceType === 'vip' ? Math.max(0, lista - preco) : 0,
  }
}

export function cartTotal(cart) {
  return (cart || []).reduce((a, it) => {
    const unit = Number(it.preco_unitario ?? it.preco ?? 0) || 0
    return a + unit * (Number(it.qtd) || 1)
  }, 0)
}

export function cartSubtotal(cart) {
  return (cart || []).reduce((a, it) => {
    const lista = Number(it.preco_lista ?? it.preco_unitario ?? it.preco ?? 0) || 0
    return a + lista * (Number(it.qtd) || 1)
  }, 0)
}

export function bottleQtyFromShots(shotCount, drinksPerBottle) {
  const shots = Number(shotCount) || 0
  const per = Number(drinksPerBottle) || 0
  if (shots <= 0 || per <= 0) return 0
  return Math.round((shots / per) * 10000) / 10000
}

export function drinkBackCommission(saleTotal, agent) {
  if (!agent) return 0
  const pct = Number(agent.comissao_pct) || 0
  if (pct <= 0) return 0
  return Math.round((Number(saleTotal) || 0) * (pct / 100))
}

export function shouldReorder(currentStock, minStock) {
  const min = Number(minStock) || 0
  if (min <= 0) return false
  return (Number(currentStock) || 0) <= min
}

export function suggestedReorderQty(currentStock, minStock) {
  const min = Number(minStock) || 0
  const stock = Number(currentStock) || 0
  if (min <= 0) return 0
  return Math.max(min, min * 2 - stock)
}

export function hourBuckets() {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    total: 0,
    count: 0,
    items: 0,
    ticket: 0,
  }))
}

export function aggregateHourly(sales, { timeZone = 'Asia/Tokyo', itemCounts } = {}) {
  const buckets = hourBuckets()
  for (const sale of sales || []) {
    if (sale.status === 'aberta' || sale.status === 'cancelada') continue
    const ts = sale.criado_em || `${sale.data || todayKey()}T12:00:00+09:00`
    const hour = sale.hora != null ? Number(sale.hora) : hourInTimeZone(ts, timeZone)
    if (hour < 0 || hour > 23) continue
    const b = buckets[hour]
    b.total += Number(sale.total) || 0
    b.count += 1
    b.items += Number(itemCounts?.[sale.id]) || 0
  }
  for (const b of buckets) {
    b.ticket = b.count > 0 ? Math.round(b.total / b.count) : 0
  }
  return buckets
}

export function operatingHours({ openHour = 18, closeHour = 6 } = {}) {
  const hours = []
  if (openHour === closeHour) return Array.from({ length: 24 }, (_, h) => h)
  let h = openHour
  while (true) {
    hours.push(h)
    h = (h + 1) % 24
    if (h === closeHour) break
    if (hours.length >= 24) break
  }
  return hours
}

export function idleHours(buckets, { openHour = 18, closeHour = 6, thresholdRatio = 0.45 } = {}) {
  const ops = new Set(operatingHours({ openHour, closeHour }))
  const active = (buckets || []).filter(b => ops.has(b.hour))
  const avg = active.length ? active.reduce((a, b) => a + b.total, 0) / active.length : 0
  const threshold = avg * thresholdRatio
  return active
    .filter(b => b.total <= threshold)
    .map(b => ({
      ...b,
      idle: true,
      vsAvgPct: avg > 0 ? Math.round((b.total / avg) * 100) : 0,
    }))
}

export function idleHourSuggestions(idle, { lang = 'en' } = {}) {
  if (!idle?.length) {
    return lang === 'ja'
      ? [{ title: 'ピークが安定', body: 'アイドル帯は検出されていません。現在のオペレーションを維持してください。' }]
      : [{ title: 'Hours look busy', body: 'No idle window detected. Keep the current floor operation.' }]
  }
  const labels = idle.map(h => h.label).join(', ')
  const ja = [
    { title: 'ハッピーアワー', body: `${labels} は動きが弱いです。セットドリンクやボトル割引で客足を作ってください。` },
    { title: '予約枠', body: '空いている時間帯を予約枠として開き、グループ来店を前倒しできます。' },
    { title: 'スタッフイベント', body: 'プロモーター／ドリンクバックをこの時間に集中させると回転が上がります。' },
  ]
  const en = [
    { title: 'Happy hour', body: `${labels} is slow. Push a set drink or bottle discount to fill the floor.` },
    { title: 'Reservation window', body: 'Open those hours for group reservations so tables fill before peak.' },
    { title: 'Promoter push', body: 'Schedule drink-back / promoter presence in the idle window to lift ticket count.' },
  ]
  return lang === 'ja' ? ja : en
}

export function stockMovementsFromCart(cart, barPricing = {}, { barId, userId, posVendaId } = {}) {
  const byProduct = {}
  for (const it of cart || []) {
    const produtoId = it.produto_id
    if (!produtoId) continue
    const qtd = Number(it.qtd) || 1
    const pricing = barPricing[produtoId] || {}
    const drinksPer = Number(it.drinks_por_garrafa ?? pricing.drinks_por_garrafa) || 0
    const bottles = drinksPer > 0 ? bottleQtyFromShots(qtd, drinksPer) : qtd
    if (!byProduct[produtoId]) {
      byProduct[produtoId] = { produto_id: produtoId, nome: it.nome, qtd: 0 }
    }
    byProduct[produtoId].qtd += bottles
    if (it.nome) byProduct[produtoId].nome = it.nome
  }
  return Object.values(byProduct)
    .filter(row => row.qtd > 0)
    .map(row => ({
      produto_id: row.produto_id,
      bar_id: barId,
      tipo: 'saida',
      qtd: row.qtd,
      criado_por: userId || null,
      obs: posVendaId ? `POS sale ${String(posVendaId).slice(0, 8)}` : 'POS sale',
      nome: row.nome,
    }))
}

export function planReorders(moves, stockMap, regras) {
  const alerts = []
  for (const mv of moves || []) {
    const current = (Number(stockMap?.[mv.produto_id]) || 0) - (Number(mv.qtd) || 0)
    const min = Number(regras?.[mv.produto_id]) || 0
    if (!shouldReorder(current, min)) continue
    alerts.push({
      produto_id: mv.produto_id,
      nome: mv.nome,
      current_stock: Math.max(0, current),
      min_stock: min,
      suggested_qty: suggestedReorderQty(current, min),
      status: 'aberto',
    })
  }
  return alerts
}

export function planPosSale(input = {}) {
  const cart = input.cart || []
  if (!cart.length) throw new Error('Empty cart')
  if (!input.barId) throw new Error('barId required')

  const now = input.now ? new Date(input.now) : new Date()
  const timeZone = input.timeZone || 'Asia/Tokyo'
  const parts = tokyoDateParts(now, timeZone)
  const status = input.status || 'fechada'
  const subtotal = cartSubtotal(cart)
  const total = cartTotal(cart)
  const desconto = Math.max(0, subtotal - total)
  const tipo = input.tipo || (input.vipId ? 'vip' : input.discountCodeId ? 'desconto' : input.mesa ? 'conta' : 'balcao')
  const agent = input.drinkBackAgent || null
  const commission = drinkBackCommission(total, agent)

  const vendaRow = {
    bar_id: input.barId,
    data: parts.date,
    hora: parts.hour,
    subtotal,
    desconto_total: desconto,
    total,
    metodo_pagamento: status === 'aberta' ? null : (input.payMethod || 'Cash'),
    tipo,
    status,
    mesa: input.mesa || null,
    cliente_nome: input.clienteNome || null,
    vip_member_id: input.vipId || null,
    discount_code_id: input.discountCodeId || null,
    drink_back_agent_id: agent?.id || input.drinkBackAgentId || null,
    drink_back_comissao: commission,
    obs: input.obs || null,
    criado_por: input.userId || null,
    criado_em: now.toISOString(),
  }

  const itemRows = cart.map(it => ({
    drink_menu_id: it.drink_menu_id || null,
    produto_id: it.produto_id || null,
    nome: it.nome,
    qtd: Number(it.qtd) || 1,
    preco_unitario: Number(it.preco_unitario ?? it.preco) || 0,
    preco_lista: Number(it.preco_lista ?? it.preco_unitario ?? it.preco) || 0,
    tipo_preco: it.tipo_preco || 'regular',
    desconto_valor: Number(it.desconto_valor) || 0,
  }))

  const stockMoves = status === 'fechada'
    ? stockMovementsFromCart(cart, input.barPricing || {}, { barId: input.barId, userId: input.userId })
    : []
  const reorderAlerts = status === 'fechada'
    ? planReorders(stockMoves, input.stockMap || {}, input.regras || {})
    : []

  const tablesWritten = [POS_TABLES.sales, POS_TABLES.items]
  if (stockMoves.length) tablesWritten.push(POS_TABLES.stockMoves)
  if (reorderAlerts.length) tablesWritten.push(POS_TABLES.reorderAlerts)
  if (commission > 0 && (agent?.id || input.drinkBackAgentId)) tablesWritten.push(POS_TABLES.drinkBackUsages)
  if (input.discountCodeId) tablesWritten.push(POS_TABLES.discountUsages)
  if (input.vipId) tablesWritten.push(POS_TABLES.vipUsages)

  return {
    vendaRow,
    itemRows,
    stockMoves,
    reorderAlerts,
    drinkBack: commission > 0 && (agent?.id || input.drinkBackAgentId)
      ? { agent_id: agent?.id || input.drinkBackAgentId, comissao: commission, total }
      : null,
    tablesWritten,
    tablesForbidden: POS_FORBIDDEN_TABLES,
  }
}

export function assertPosIsolation(plan) {
  const written = plan?.tablesWritten || []
  const leak = written.filter(t => POS_FORBIDDEN_TABLES.includes(t))
  if (leak.length) {
    throw new Error(`POS isolation violated: attempted write to ${leak.join(', ')}`)
  }
  return true
}

/**
 * Persist a planned POS sale. `db` is a supabase-like client.
 * Never touches JBM supply tables.
 */
function stripExtendedPosColumns(row) {
  const {
    hora,
    status,
    mesa,
    cliente_nome,
    drink_back_agent_id,
    drink_back_comissao,
    ...base
  } = row
  return base
}

async function insertPosVenda(db, row) {
  let res = await db.from(POS_TABLES.sales).insert(row).select().single()
  if (res?.error && /column|schema cache|does not exist/i.test(res.error.message || '')) {
    res = await db.from(POS_TABLES.sales).insert(stripExtendedPosColumns(row)).select().single()
  }
  return res
}

function isMissingRelation(err) {
  return err && (err.code === 'PGRST205' || /does not exist|schema cache/i.test(err.message || ''))
}

async function softWrite(promise) {
  const res = await promise
  if (res?.error && !isMissingRelation(res.error)) throw new Error(res.error.message)
  return res
}

export async function completePosSale(db, input) {
  const plan = planPosSale(input)
  assertPosIsolation(plan)

  const insertVenda = await insertPosVenda(db, plan.vendaRow)
  const venda = insertVenda?.data
  const vErr = insertVenda?.error
  if (vErr || !venda?.id) throw new Error(vErr?.message || 'Failed to insert pos_vendas')

  const items = plan.itemRows.map(it => ({ ...it, pos_venda_id: venda.id }))
  const itemRes = await db.from(POS_TABLES.items).insert(items)
  if (itemRes?.error) throw new Error(itemRes.error.message)

  if (plan.stockMoves.length) {
    const moves = plan.stockMoves.map(m => ({ ...m, obs: `POS sale ${String(venda.id).slice(0, 8)}` }))
    await softWrite(db.from(POS_TABLES.stockMoves).insert(moves.map(({ nome, ...row }) => row)))
  }

  if (plan.reorderAlerts.length) {
    const alerts = plan.reorderAlerts.map(a => ({
      ...a,
      bar_id: input.barId,
      pos_venda_id: venda.id,
    }))
    await softWrite(db.from(POS_TABLES.reorderAlerts).insert(alerts))
  }

  if (plan.drinkBack) {
    await softWrite(db.from(POS_TABLES.drinkBackUsages).insert({
      bar_id: input.barId,
      drink_back_agent_id: plan.drinkBack.agent_id,
      pos_venda_id: venda.id,
      total_venda: plan.drinkBack.total,
      comissao: plan.drinkBack.comissao,
    }))
  }

  if (input.discountCodeId && input.discountCode) {
    await softWrite(db.from(POS_TABLES.discountCodes).update({
      usos_atual: (input.discountCode.usos_atual || 0) + 1,
    }).eq('id', input.discountCodeId))
    await softWrite(db.from(POS_TABLES.discountUsages).insert({
      bar_id: input.barId,
      discount_code_id: input.discountCodeId,
      pos_venda_id: venda.id,
      valor_desconto: plan.vendaRow.desconto_total,
    }))
  }

  if (input.vipId) {
    await softWrite(db.from(POS_TABLES.vipUsages).insert(
      (input.cart || []).map(it => ({
        bar_id: input.barId,
        vip_member_id: input.vipId,
        drink_menu_id: it.drink_menu_id || null,
        produto_id: it.produto_id || null,
        nome: it.nome,
        qtd: it.qtd || 1,
        preco_aplicado: it.preco_unitario ?? it.preco,
        preco_lista: it.preco_lista,
        tipo: 'vip',
        pos_venda_id: venda.id,
        criado_por: input.userId || null,
      }))
    ))
  }

  return { venda, plan, reorderAlerts: plan.reorderAlerts }
}

/** In-memory / localStorage supabase-like client for POS demo. Never talks to JBM tables. */
export function createPosMemoryDb(seed = {}) {
  const store = {
    pos_vendas: [...(seed.pos_vendas || [])],
    pos_vendas_itens: [...(seed.pos_vendas_itens || [])],
    estoque_movimentos: [...(seed.estoque_movimentos || [])],
    pos_reorder_alerts: [...(seed.pos_reorder_alerts || [])],
    drink_back_agents: [...(seed.drink_back_agents || [])],
    drink_back_usages: [...(seed.drink_back_usages || [])],
    discount_codes: [...(seed.discount_codes || [])],
    discount_usages: [...(seed.discount_usages || [])],
    vip_members: [...(seed.vip_members || [])],
    vip_usages: [...(seed.vip_usages || [])],
    drink_menu: [...(seed.drink_menu || [])],
    bar_pricing: [...(seed.bar_pricing || [])],
    estoque_regras: [...(seed.estoque_regras || [])],
  }

  function matches(row, filters) {
    return filters.every(([col, val]) => row[col] === val)
  }

  function from(table) {
    if (POS_FORBIDDEN_TABLES.includes(table)) {
      throw new Error(`POS demo db refuses JBM table: ${table}`)
    }
    if (!store[table]) store[table] = []
    const filters = []
    let op = 'select'
    let payload = null
    const api = {
      select() { op = op === 'insert' ? 'insert' : 'select'; return api },
      insert(rows) { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return api },
      update(row) { op = 'update'; payload = row; return api },
      eq(col, val) { filters.push([col, val]); return api },
      order() { return api },
      limit() { return api },
      single() { return api.then(res => ({ ...res, data: Array.isArray(res.data) ? res.data[0] : res.data })) },
      then(resolve, reject) {
        try {
          if (op === 'insert') {
            const rows = payload.map(r => ({ id: r.id || `pos_${Math.random().toString(36).slice(2, 10)}`, ...r }))
            store[table].push(...rows)
            return Promise.resolve({ data: rows.length === 1 ? rows[0] : rows, error: null }).then(resolve, reject)
          }
          if (op === 'update') {
            store[table] = store[table].map(r => matches(r, filters) ? { ...r, ...payload } : r)
            return Promise.resolve({ data: store[table].filter(r => matches(r, filters)), error: null }).then(resolve, reject)
          }
          const data = store[table].filter(r => matches(r, filters))
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        } catch (e) {
          return Promise.resolve({ data: null, error: { message: e.message } }).then(resolve, reject)
        }
      },
    }
    return api
  }

  return { from, _store: store }
}
