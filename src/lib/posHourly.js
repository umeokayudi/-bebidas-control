/**
 * Módulo 1 — Faturamento por hora e monetização de horários ociosos.
 *
 * Só lê vendas de `pos_vendas` (balcão do bar). Vendas de fornecimento
 * JBM (`vendas`) nunca entram aqui: são negócios diferentes e misturar
 * os dois quebraria o relatório de margem do fornecedor.
 */

export const DEFAULT_OPEN_HOUR = 18
export const DEFAULT_CLOSE_HOUR = 5

function toDate(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Hora (0-23) de uma venda. Usa a coluna `hora` quando o banco já tem. */
export function saleHour(venda) {
  if (venda == null) return null
  if (Number.isFinite(venda.hora)) return ((venda.hora % 24) + 24) % 24
  const d = toDate(venda.criado_em || venda.data_hora || venda.data)
  return d ? d.getHours() : null
}

export function saleTotal(venda) {
  return Math.max(0, +(venda?.total ?? 0) || 0)
}

/**
 * Lista de horas na ordem de operação do bar. Um bar que abre 18h e
 * fecha 5h roda 18,19,...,23,0,...,4 — a madrugada pertence à noite
 * anterior, então a ordem precisa atravessar a meia-noite.
 */
export function operatingHours(openHour = DEFAULT_OPEN_HOUR, closeHour = DEFAULT_CLOSE_HOUR) {
  const open = normalizeHour(openHour)
  const close = normalizeHour(closeHour)
  const hours = []
  let h = open
  for (let i = 0; i < 24; i++) {
    hours.push(h)
    h = (h + 1) % 24
    if (h === close) break
  }
  return hours
}

function normalizeHour(h) {
  const n = Math.trunc(+h)
  if (!Number.isFinite(n)) return 0
  return ((n % 24) + 24) % 24
}

export function hourLabel(hour) {
  const h = normalizeHour(hour)
  return `${String(h).padStart(2, '0')}:00`
}

export function hourRangeLabel(hour) {
  const h = normalizeHour(hour)
  return `${hourLabel(h)}–${hourLabel(h + 1)}`
}

/**
 * Agrega vendas do POS em faixas de uma hora.
 * @returns {{hora:number,label:string,range:string,faturamento:number,vendas:number,ticketMedio:number,itens:number,desconto:number}[]}
 */
export function buildHourlyBuckets(vendas, options = {}) {
  const {
    openHour = DEFAULT_OPEN_HOUR,
    closeHour = DEFAULT_CLOSE_HOUR,
    includeEmpty = true,
  } = options

  const hours = operatingHours(openHour, closeHour)
  const map = new Map()
  const ensure = hora => {
    if (!map.has(hora)) {
      map.set(hora, {
        hora,
        label: hourLabel(hora),
        range: hourRangeLabel(hora),
        faturamento: 0,
        vendas: 0,
        itens: 0,
        desconto: 0,
        ticketMedio: 0,
      })
    }
    return map.get(hora)
  }

  if (includeEmpty) hours.forEach(ensure)

  ;(vendas || []).forEach(v => {
    const hora = saleHour(v)
    if (hora == null) return
    const bucket = ensure(hora)
    bucket.faturamento += saleTotal(v)
    bucket.vendas += 1
    bucket.desconto += Math.max(0, +(v.desconto_total ?? 0) || 0)
    bucket.itens += Array.isArray(v.pos_vendas_itens)
      ? v.pos_vendas_itens.reduce((a, it) => a + (+it.qtd || 0), 0)
      : 0
  })

  map.forEach(b => {
    b.ticketMedio = b.vendas > 0 ? Math.round(b.faturamento / b.vendas) : 0
  })

  const order = new Map(hours.map((h, i) => [h, i]))
  return [...map.values()].sort((a, b) => {
    const ai = order.has(a.hora) ? order.get(a.hora) : 100 + a.hora
    const bi = order.has(b.hora) ? order.get(b.hora) : 100 + b.hora
    return ai - bi
  })
}

export function dayTotals(vendas) {
  const list = vendas || []
  const faturamento = list.reduce((a, v) => a + saleTotal(v), 0)
  const desconto = list.reduce((a, v) => a + (Math.max(0, +(v.desconto_total ?? 0) || 0)), 0)
  return {
    faturamento,
    desconto,
    vendas: list.length,
    ticketMedio: list.length > 0 ? Math.round(faturamento / list.length) : 0,
  }
}

/** Horas com mais faturamento (gargalo de operação: precisa de mais staff). */
export function peakHours(buckets, limit = 3) {
  return [...(buckets || [])]
    .filter(b => b.faturamento > 0)
    .sort((a, b) => b.faturamento - a.faturamento || a.hora - b.hora)
    .slice(0, limit)
}

/**
 * Horas ociosas: dentro do horário de operação e abaixo da meta.
 * Sem meta explícita usa 40% da média das horas com movimento —
 * assim um bar de movimento baixo não marca a noite toda como ociosa.
 */
export function idleHours(buckets, options = {}) {
  const { limit = 3, metaHora = 0 } = options
  const list = buckets || []
  const ativos = list.filter(b => b.faturamento > 0)
  const media = ativos.length > 0
    ? ativos.reduce((a, b) => a + b.faturamento, 0) / ativos.length
    : 0
  const limite = metaHora > 0 ? metaHora : Math.round(media * 0.4)

  return list
    .filter(b => b.faturamento < limite)
    .sort((a, b) => a.faturamento - b.faturamento || a.hora - b.hora)
    .slice(0, limit)
    .map(b => ({ ...b, limite, deficit: Math.max(0, Math.round(limite - b.faturamento)) }))
}

export const IDLE_PLAYBOOK = [
  { id: 'happy_hour', minFill: 0, tipo: 'promo', labelKey: 'pos.idle.happyHour' },
  { id: 'reserva', minFill: 0.35, tipo: 'reserva', labelKey: 'pos.idle.reserva' },
  { id: 'evento', minFill: 0.6, tipo: 'evento', labelKey: 'pos.idle.evento' },
]

/**
 * Sugestões de monetização por hora ociosa. `fill` é o quanto a hora
 * já preenche da meta — hora quase vazia pede desconto agressivo,
 * hora meio cheia pede evento/reserva que agrega ticket.
 */
export function suggestIdlePromotions(buckets, options = {}) {
  const idle = idleHours(buckets, options)
  return idle.map(b => {
    const fill = b.limite > 0 ? b.faturamento / b.limite : 0
    const play = [...IDLE_PLAYBOOK].reverse().find(p => fill >= p.minFill) || IDLE_PLAYBOOK[0]
    return {
      hora: b.hora,
      range: b.range,
      faturamento: b.faturamento,
      deficit: b.deficit,
      fill: Math.round(fill * 100) / 100,
      acao: play.id,
      tipo: play.tipo,
      labelKey: play.labelKey,
    }
  })
}

/** Série pronta para o gráfico de barras do dashboard. */
export function hourlyChartData(buckets) {
  return (buckets || []).map(b => ({
    label: String(b.hora).padStart(2, '0'),
    value: b.faturamento,
    hora: b.hora,
    vendas: b.vendas,
  }))
}

/** Compara o dia atual com a média dos dias anteriores, hora a hora. */
export function hourlyTrend(todayBuckets, historyBuckets, dias = 1) {
  const hist = new Map((historyBuckets || []).map(b => [b.hora, b]))
  const divisor = Math.max(1, dias)
  return (todayBuckets || []).map(b => {
    const media = (hist.get(b.hora)?.faturamento || 0) / divisor
    const delta = b.faturamento - media
    return {
      ...b,
      media: Math.round(media),
      delta: Math.round(delta),
      deltaPct: media > 0 ? Math.round((delta / media) * 100) : null,
    }
  })
}
