/** Floor-phone slips. Send-to-bar only — never POS till, never JBM vendas/faturas. */

import { tokyoNightKey } from './tokyo.js'
import { isPourLine } from './drinkBoard.js'

export const FLOOR_TABLE = 'bar_floor_orders'
export const FLOOR_STATUS_SENT = 'sent'

export function pourItemsFromCart(cart = []) {
  return (cart || [])
    .map(it => ({
      nome: String(it.nome || '').trim(),
      qtd: Math.max(1, Math.round(+it.qtd || 1)),
      drink_menu_id: it.drink_menu_id || null,
      produto_id: it.produto_id || null,
    }))
    .filter(it => isPourLine(it))
}

export function floorOrderPayload({
  barId,
  nightKey = tokyoNightKey(),
  spaceId = '',
  spaceNome = '',
  cast = '',
  castId = '',
  note = '',
  items = [],
  sentBy = null,
  now = new Date(),
} = {}) {
  const at = now instanceof Date ? now : new Date(now)
  return {
    bar_id: barId || null,
    night_key: nightKey || tokyoNightKey(at),
    criado_em: at.toISOString(),
    space_id: spaceId || null,
    space_nome: String(spaceNome || '').trim(),
    cast: String(cast || '').trim(),
    cast_id: castId || null,
    note: String(note || '').trim().slice(0, 120),
    items: pourItemsFromCart(items),
    status: FLOOR_STATUS_SENT,
    kind: 'floor',
    sent_by: sentBy || null,
  }
}

export function floorOrderReady(row) {
  if (!row) return false
  if (!row.bar_id) return false
  return Array.isArray(row.items) && row.items.length > 0
}

/** Phone slips must never look like a till ticket. */
export function floorStaysOffTill(row = {}) {
  if (row.total != null && +row.total !== 0) return false
  if (row.metodo_pagamento) return false
  if (row.pos_venda_id) return false
  return row.kind === 'floor' || row.status === FLOOR_STATUS_SENT
}

export function floorSlipsTonight(rows = [], nightKey = tokyoNightKey()) {
  return (rows || [])
    .filter(r => r && (r.status || FLOOR_STATUS_SENT) === FLOOR_STATUS_SENT)
    .filter(r => String(r.night_key || '') === String(nightKey))
    .slice()
    .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
}
