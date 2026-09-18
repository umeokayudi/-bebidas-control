/** Helpers do POS e Gestão do Bar — preços, descontos, códigos, horários e métricas */

export function generateDiscountCode(prefix = 'HAPPY') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let suffix = ''
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)]
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
  if (!error) return { ready: true }
  if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
    return { ready: false, error: 'Tabelas POS não criadas. Execute BAR_PLATFORM_POS_SCHEMA.sql' }
  }
  return { ready: false, error: error.message }
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

export function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

export function extractHourFromSale(sale) {
  if (sale.hora) {
    const parts = String(sale.hora).split(':')
    const h = parseInt(parts[0], 10)
    if (!isNaN(h)) return h
  }
  if (sale.criado_em) {
    const d = new Date(sale.criado_em)
    return d.getHours()
  }
  return 20
}

export function buildHourlyBuckets(sales = []) {
  // Horários típicos de operação noturna: das 17h às 05h da manhã seguinte
  const hoursOrder = [17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5]
  const buckets = hoursOrder.map(h => ({
    hour: h,
    label: `${String(h).padStart(2, '0')}:00`,
    total: 0,
    count: 0,
    ticketMedio: 0,
  }))

  const bucketMap = {}
  buckets.forEach(b => { bucketMap[b.hour] = b })

  sales.forEach(s => {
    const h = extractHourFromSale(s)
    if (bucketMap[h]) {
      bucketMap[h].total += (+s.total || 0)
      bucketMap[h].count += 1
    }
  })

  buckets.forEach(b => {
    b.ticketMedio = b.count > 0 ? Math.round(b.total / b.count) : 0
  })

  return buckets
}

export function analyzePeakAndIdleHours(buckets) {
  const activeBuckets = buckets.filter(b => b.total > 0)
  if (activeBuckets.length === 0) {
    return {
      peakHour: null,
      idleHours: buckets.slice(0, 3),
      avgRevenuePerHour: 0,
    }
  }

  const sortedByRevenue = [...buckets].sort((a, b) => b.total - a.total)
  const peakHour = sortedByRevenue[0]?.total > 0 ? sortedByRevenue[0] : null
  const totalRev = buckets.reduce((acc, b) => acc + b.total, 0)
  const activeHoursCount = buckets.filter(b => b.count > 0).length || 1
  const avgRevenuePerHour = Math.round(totalRev / activeHoursCount)

  // Horários ociosos: menos de 35% da média de receita por hora ativa
  const idleHours = buckets.filter(b => b.total < avgRevenuePerHour * 0.35)

  return {
    peakHour,
    idleHours,
    avgRevenuePerHour,
  }
}
