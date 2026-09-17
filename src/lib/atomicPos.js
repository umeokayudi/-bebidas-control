/** Helpers do POS Atomic — preços, descontos, códigos, dashboard e estoque */

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
  if (!code) return { ok: false, errorKey: 'atomicPos.codeInvalid', error: 'Invalid code' }
  if (!code.ativo) return { ok: false, errorKey: 'atomicPos.codeDisabled', error: 'Code disabled' }
  if (code.valido_ate && code.valido_ate < new Date().toISOString().slice(0, 10)) {
    return { ok: false, errorKey: 'atomicPos.codeExpired', error: 'Code expired' }
  }
  if (code.max_usos != null && (code.usos_atual || 0) >= code.max_usos) {
    return { ok: false, errorKey: 'atomicPos.codeExhausted', error: 'Code used up' }
  }
  if (code.drink_menu_id && drinkMenuId && code.drink_menu_id !== drinkMenuId) {
    return { ok: false, errorKey: 'atomicPos.codeWrongDrink', error: 'Code not valid for this drink' }
  }
  if (code.produto_id && produtoId && code.produto_id !== produtoId) {
    return { ok: false, errorKey: 'atomicPos.codeWrongProduct', error: 'Code not valid for this product' }
  }
  return { ok: true }
}

export async function checkPosSchema(supabase) {
  const { error } = await supabase.from('pos_vendas').select('id').limit(1)
  if (!error) return { ready: true }
  if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
    return { ready: false, error: 'POS tables not created. Run ATOMIC_POS_SCHEMA.sql' }
  }
  return { ready: false, error: error.message }
}

export async function fetchPosSetupStatus(supabase) {
  return checkPosSchema(supabase)
}

export function cartTotal(cart) {
  return (cart || []).reduce((a, it) => a + (it.preco_unitario || 0) * (it.qtd || 1), 0)
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

/** Agrega vendas POS por faixa horária (0–23) para o dashboard */
export function aggregateHourlySales(sales = []) {
  const hours = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: `${String(h).padStart(2, '0')}:00`,
    count: 0,
    total: 0,
  }))
  for (const s of sales) {
    const ts = s.criado_em || s.data
    if (!ts) continue
    const h = new Date(ts).getHours()
    hours[h].count += 1
    hours[h].total += +s.total || 0
  }
  return hours
}

/** Calcula estoque atual por produto a partir dos movimentos */
export function buildStockMap(movimentos = []) {
  const map = {}
  for (const m of movimentos) {
    if (!m.produto_id) continue
    if (!map[m.produto_id]) map[m.produto_id] = 0
    map[m.produto_id] += m.tipo === 'entrada' ? +m.qtd : -+m.qtd
  }
  return map
}

/** Produtos com estoque abaixo do mínimo */
export function findLowStockProducts(produtos = [], stockMap = {}, regras = {}) {
  return produtos
    .map(p => ({
      ...p,
      stock: Math.max(0, stockMap[p.id] || 0),
      minimo: regras[p.id] || 0,
    }))
    .filter(p => p.minimo > 0 && p.stock <= p.minimo)
    .sort((a, b) => a.stock - b.stock)
}

export {
  bottlesFromShots,
  bottlesConsumedFromCart,
  pricingMapFromShots,
  suggestedReorderQty,
  buildRestockItems,
  productsAlreadyOnOpenOrders,
  isRestockPedido,
  syncPosStockAndReorder,
} from './posSupply'

/** Métricas rápidas do dia para o dashboard POS */
export function computeDayMetrics(sales = []) {
  const total = sales.reduce((a, s) => a + (+s.total || 0), 0)
  const count = sales.length
  const ticketMedio = count > 0 ? Math.round(total / count) : 0
  const hourly = aggregateHourlySales(sales)
  const peakHour = hourly.reduce((best, h) => (h.total > best.total ? h : best), hourly[0])
  return { total, count, ticketMedio, peakHour, hourly }
}
