/** Helpers do POS do bar — faturamento por hora + reposição.
 *  Só usa tabelas pos_* / drink_back_* / service_*. Nunca toca vendas (JBM).
 */

export const HOURS = Array.from({ length: 24 }, (_, h) => h)

/** Agrupa pos_vendas por hora (usa criado_em; fallback data). */
export function hourlyRevenue(posVendas) {
  const buckets = HOURS.map(h => ({ hora: h, label: `${String(h).padStart(2, '0')}:00`, total: 0, count: 0, ticket: 0 }))
  for (const v of posVendas || []) {
    const ts = v.criado_em || (v.data ? `${v.data}T12:00:00` : null)
    if (!ts) continue
    const h = new Date(ts).getHours()
    if (Number.isNaN(h)) continue
    buckets[h].total += +v.total || 0
    buckets[h].count += 1
  }
  for (const b of buckets) b.ticket = b.count ? Math.round(b.total / b.count) : 0
  return buckets
}

export function hourlySummary(buckets) {
  const active = buckets.filter(b => b.count > 0)
  const total = buckets.reduce((a, b) => a + b.total, 0)
  const count = buckets.reduce((a, b) => a + b.count, 0)
  const peak = [...buckets].sort((a, b) => b.total - a.total)[0]
  const idle = buckets.filter(b => b.count === 0)
  return { total, count, ticket: count ? Math.round(total / count) : 0, peak, idleHours: idle.map(b => b.hora), activeCount: active.length }
}

/** Sugestão de ação para horários ociosos (Módulo 1). */
export function idleSuggestion(hora) {
  if (hora >= 14 && hora <= 17) return 'Happy hour / set promocional da tarde'
  if (hora >= 0 && hora <= 5) return 'Evento late-night ou reserva VIP'
  if (hora >= 6 && hora <= 11) return 'Brunch / abertura antecipada em dias de evento'
  return 'Promoção relâmpago ou reserva de grupo'
}

/** Verifica se precisa repor e dispara webhook (Módulo 2). */
export async function checkAndTriggerReorder({ bar_id, sku_nome, produto_id = null, drink_menu_id = null, estoque_atual, estoque_minimo }) {
  if (+estoque_atual > +estoque_minimo) return { triggered: false }
  const qtd_sugerida = Math.max(1, Math.round(+estoque_minimo * 2 - +estoque_atual))
  try {
    const res = await fetch('/api/pos-reorder-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bar_id, sku_nome, produto_id, drink_menu_id, estoque_atual, estoque_minimo, qtd_sugerida }),
    })
    const data = await res.json()
    return { triggered: res.ok, qtd_sugerida, ...data }
  } catch (e) {
    return { triggered: false, error: e.message }
  }
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10)
}
