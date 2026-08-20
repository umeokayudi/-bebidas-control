const API_URL = import.meta.env.VITE_CASHFLOW_API || 'https://bebidas-control.vercel.app/api/cashflow-export'
const STORAGE_BUCKET = 'system-private'
const STORAGE_FILE = 'cashflow_snapshot.json'

let cache = null
let cacheAt = 0

export async function fetchHoldingSnapshot(holdingClient) {
  const now = Date.now()
  if (cache && now - cacheAt < 60_000) return cache

  let raw = null

  try {
    const res = await fetch(API_URL, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      if (!data.error) raw = data
    }
  } catch { /* */ }

  if (holdingClient) {
    try {
      const { data, error } = await holdingClient.storage.from(STORAGE_BUCKET).download(STORAGE_FILE)
      if (!error && data) {
        const stored = JSON.parse(await data.text())
        const storedNewer = stored.geradoEm && (!raw?.geradoEm || stored.geradoEm > raw.geradoEm)
        if (storedNewer || !raw) raw = stored
      }
    } catch { /* */ }
  }

  cache = normalizeSnapshot(raw || {})
  cacheAt = now
  return cache
}

/** @deprecated use fetchHoldingSnapshot */
export async function fetchDrinksCashflow(holdingClient) {
  const s = await fetchHoldingSnapshot(holdingClient)
  return s.drinks
}

function normalizeSnapshot(raw) {
  const f = raw.financeiro || {}
  const k = raw.kuripuro || {}

  const drinks = {
    geradoEm: raw.geradoEm,
    fonte: raw.fonte,
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

  const kuripuro = {
    receitaMes: k.receitaMes ?? 0,
    custoMes: k.custoMes ?? 0,
    lucroMes: k.lucroMes ?? 0,
    clientesAtivos: k.clientesAtivos ?? 0,
    funcionariosAtivos: k.funcionariosAtivos ?? 0,
    lancamentosReceita: k.lancamentosReceita ?? 0,
    lancamentosDespesa: k.lancamentosDespesa ?? 0,
    saldoLancamentos: k.saldoLancamentos ?? 0,
    contasPendentes: k.contasPendentes ?? 0,
    clientes: k.clientes || [],
    lancamentos: k.lancamentos || [],
  }

  return {
    geradoEm: raw.geradoEm,
    fonte: raw.fonte,
    drinks,
    kuripuro,
    holding: {
      receitaTotal: drinks.receitaMes + kuripuro.receitaMes,
      lucroTotal: drinks.lucroMes + kuripuro.lucroMes,
    },
  }
}
