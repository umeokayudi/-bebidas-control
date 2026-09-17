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
    return { ready: false, error: 'Tabelas POS não criadas. Execute ATOMIC_POS_SCHEMA.sql' }
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

/** Baixa estoque após venda POS (apenas itens com produto_id — shots) */
export async function deductStockForSale(supabase, { barId, cart, vendaId, userId }) {
  const shotItems = (cart || []).filter(it => it.produto_id)
  if (!shotItems.length) return { deducted: 0 }

  const moves = shotItems.map(it => ({
    produto_id: it.produto_id,
    bar_id: barId,
    tipo: 'saida',
    qtd: it.qtd || 1,
    criado_por: userId || null,
    obs: `POS venda ${vendaId?.slice(0, 8) || ''}`,
  }))

  const { error } = await supabase.from('estoque_movimentos').insert(moves)
  if (error) throw error
  return { deducted: moves.length }
}

/** Verifica estoque baixo e dispara webhook de reposição (se configurado) */
export async function checkReorderAfterSale(supabase, bar, produtoIds = []) {
  if (!produtoIds.length) return { alerts: [] }

  const [mR, rR, pR] = await Promise.all([
    supabase.from('estoque_movimentos').select('produto_id,tipo,qtd').eq('bar_id', bar.id),
    supabase.from('estoque_regras').select('produto_id,minimo').eq('bar_id', bar.id),
    supabase.from('produtos_public').select('id,nome,sku').in('id', produtoIds),
  ])

  const stockMap = buildStockMap(mR.data || [])
  const regras = Object.fromEntries((rR.data || []).map(r => [r.produto_id, r.minimo]))
  const alerts = findLowStockProducts(pR.data || [], stockMap, regras)

  if (!alerts.length) return { alerts: [] }

  try {
    await fetch('/api/pos-reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bar_id: bar.id,
        bar_nome: bar.nome,
        items: alerts.map(a => ({
          produto_id: a.id,
          nome: a.nome,
          sku: a.sku,
          stock_atual: a.stock,
          min_stock: a.minimo,
          qty_sugerida: Math.max(a.minimo * 2 - a.stock, a.minimo),
        })),
      }),
    })
  } catch {
    // webhook opcional — não bloqueia a venda
  }

  return { alerts }
}

/** Métricas rápidas do dia para o dashboard POS */
export function computeDayMetrics(sales = []) {
  const total = sales.reduce((a, s) => a + (+s.total || 0), 0)
  const count = sales.length
  const ticketMedio = count > 0 ? Math.round(total / count) : 0
  const hourly = aggregateHourlySales(sales)
  const peakHour = hourly.reduce((best, h) => (h.total > best.total ? h : best), hourly[0])
  return { total, count, ticketMedio, peakHour, hourly }
}
