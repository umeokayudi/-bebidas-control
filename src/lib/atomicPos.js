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
  if (!error) return { ready: true }
  if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
    return { ready: false, error: 'Tabelas POS não criadas. Execute ATOMIC_POS_SCHEMA.sql ou /api/setup-atomic-pos' }
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
