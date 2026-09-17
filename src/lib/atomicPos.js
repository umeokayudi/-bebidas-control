/** Helpers do POS Atomic — preços, descontos, códigos + engine isolado da JBM */

export {
  applyDiscount,
  resolveItemPrice,
  cartTotal,
  todayKey,
} from './posEngine'

export function generateDiscountCode(prefix = 'ATOMIC') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let suffix = ''
  for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)]
  return `${prefix}-${suffix}`
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
  if (supabase) return checkPosSchema(supabase)
  try {
    const res = await fetch('/api/pos?action=status')
    return await res.json()
  } catch {
    return { ready: false }
  }
}
