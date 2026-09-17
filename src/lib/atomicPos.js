/** Helpers do POS Atomic — preços, descontos, códigos */

export function generateDiscountCode(prefix = 'ATOMIC') {
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
    return { preco: applied.preco, preco_lista: lista, tipo_preco: 'codigo', desconto_valor: applied.desconto }
  }

  return { preco, preco_lista: lista, tipo_preco: tipo, desconto_valor: priceType === 'vip' ? lista - preco : 0 }
}

export function validateDiscountCode(code, { drinkMenuId, produtoId } = {}) {
  if (!code) return { ok: false, error: 'Código inválido' }
  if (!code.ativo) return { ok: false, error: 'Código desativado' }
  if (code.valido_ate && code.valido_ate < new Date().toISOString().slice(0, 10)) {
    return { ok: false, error: 'Código expirado' }
  }
  if (code.max_usos != null && (code.usos_atual || 0) >= code.max_usos) {
    return { ok: false, error: 'Código esgotado' }
  }
  if (code.drink_menu_id && drinkMenuId && code.drink_menu_id !== drinkMenuId) {
    return { ok: false, error: 'Código não vale para este drink' }
  }
  if (code.produto_id && produtoId && code.produto_id !== produtoId) {
    return { ok: false, error: 'Código não vale para este produto' }
  }
  return { ok: true }
}

export async function checkPosSchema(supabase) {
  const { error } = await supabase.from('pos_vendas').select('id').limit(1)
  if (error?.code === 'PGRST205' || error?.message?.includes('does not exist')) {
    return { ready: false, error: 'Tabelas POS não criadas. Execute ATOMIC_POS_SCHEMA.sql ou /api/setup-atomic-pos' }
  }
  if (error) return { ready: false, error: error.message }

  const { error: rpcError } = await supabase.rpc('register_pos_sale', {
    p_bar_id: null,
    p_criado_por: null,
    p_metodo_pagamento: 'Cash',
    p_tipo: 'balcao',
    p_vip_member_id: null,
    p_discount_code_id: null,
    p_subtotal: 0,
    p_desconto_total: 0,
    p_total: 0,
    p_items: [],
  })
  if (rpcError?.code === 'PGRST202' || rpcError?.message?.includes('function')) {
    return { ready: false, error: 'Função register_pos_sale não criada. Execute novamente ATOMIC_POS_SCHEMA.sql' }
  }
  return { ready: true }
}

export async function fetchPosSetupStatus() {
  try {
    const res = await fetch('/api/fix-atomic-june?action=checkPos')
    return await res.json()
  } catch {
    return { ready: false }
  }
}

export function cartTotal(cart) {
  return (cart || []).reduce((a, it) => a + (it.preco_unitario || 0) * (it.qtd || 1), 0)
}

export function posSalePayload({ barId, userId, cart, paymentMethod, vipMemberId, discountCode }) {
  const items = (cart || []).map(item => ({
    drink_menu_id: item.drink_menu_id || null,
    produto_id: item.produto_id || null,
    nome: item.nome,
    qtd: +item.qtd || 1,
    preco_unitario: +item.preco_unitario || 0,
    preco_lista: +item.preco_lista || +item.preco_unitario || 0,
    tipo_preco: item.tipo_preco || 'regular',
    desconto_valor: +item.desconto_valor || 0,
  }))
  const subtotal = items.reduce((sum, item) => sum + item.preco_lista * item.qtd, 0)
  const total = items.reduce((sum, item) => sum + item.preco_unitario * item.qtd, 0)

  return {
    p_bar_id: barId,
    p_criado_por: userId || null,
    p_metodo_pagamento: paymentMethod || 'Cash',
    p_tipo: vipMemberId ? 'vip' : discountCode ? 'desconto' : 'balcao',
    p_vip_member_id: vipMemberId || null,
    p_discount_code_id: discountCode?.id || null,
    p_subtotal: subtotal,
    p_desconto_total: Math.max(0, subtotal - total),
    p_total: total,
    p_items: items,
  }
}

export function hourlySalesSummary(sales, hours = 24) {
  const rows = Array.from({ length: hours }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    total: 0,
    count: 0,
  }))

  for (const sale of sales || []) {
    if (!sale?.criado_em) continue
    const date = new Date(sale.criado_em)
    if (Number.isNaN(date.getTime())) continue
    const hour = date.getHours()
    if (!rows[hour]) continue
    rows[hour].total += +sale.total || 0
    rows[hour].count += 1
  }

  return rows
}

export function stockLevels(products, movements, rules) {
  const balances = {}
  for (const movement of movements || []) {
    const quantity = +movement.qtd || 0
    balances[movement.produto_id] = (balances[movement.produto_id] || 0)
      + (movement.tipo === 'entrada' ? quantity : -quantity)
  }
  const minimums = Object.fromEntries((rules || []).map(rule => [rule.produto_id, +rule.minimo || 0]))

  return (products || []).map(product => {
    const stock = Math.max(0, balances[product.id] || 0)
    const minimum = minimums[product.id] || 0
    return {
      ...product,
      stock,
      minimum,
      low: minimum > 0 && stock <= minimum,
    }
  })
}

export function todayKey() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
