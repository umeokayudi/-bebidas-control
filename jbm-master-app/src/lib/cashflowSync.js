const API_URL = import.meta.env.VITE_CASHFLOW_API || 'https://bebidas-control.vercel.app/api/cashflow-export'
const STORAGE_BUCKET = 'system-private'
const STORAGE_FILE = 'cashflow_snapshot.json'

let cache = null
let cacheAt = 0

export async function fetchDrinksCashflow(holdingClient) {
  const now = Date.now()
  if (cache && now - cacheAt < 60_000) return cache

  try {
    const res = await fetch(API_URL, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      if (!data.error) {
        cache = normalizeCashflow(data)
        cacheAt = now
        return cache
      }
    }
  } catch { /* fallback storage */ }

  if (holdingClient) {
    try {
      const { data, error } = await holdingClient.storage.from(STORAGE_BUCKET).download(STORAGE_FILE)
      if (!error && data) {
        const parsed = normalizeCashflow(JSON.parse(await data.text()))
        cache = parsed
        cacheAt = now
        return parsed
      }
    } catch { /* */ }
  }

  return emptyCashflow()
}

function normalizeCashflow(raw) {
  const f = raw.financeiro || {}
  return {
    geradoEm: raw.geradoEm || new Date().toISOString(),
    fonte: raw.fonte || 'sync',
    receitaMes: f.receitaMes ?? 0,
    custoMes: f.custoMes ?? 0,
    lucroMes: f.lucroMes ?? ((f.receitaMes ?? 0) - (f.custoMes ?? 0)),
    caixaLiquido: f.caixaLiquido ?? 0,
    projetado30d: f.projetado30d ?? 0,
    aReceber: f.aReceber ?? 0,
    aPagar: f.aPagar ?? 0,
    faturasVencidas: f.faturasVencidas ?? 0,
    entradas30d: f.entradas30d ?? 0,
    saidas30d: f.saidas30d ?? 0,
    recentes: raw.recentes || {},
  }
}

function emptyCashflow() {
  return {
    geradoEm: null,
    fonte: 'empty',
    receitaMes: 0, custoMes: 0, lucroMes: 0,
    caixaLiquido: 0, projetado30d: 0, aReceber: 0, aPagar: 0,
    faturasVencidas: 0, entradas30d: 0, saidas30d: 0,
    recentes: {},
  }
}
