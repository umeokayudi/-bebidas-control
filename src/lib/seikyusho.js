export async function analyzeSeikyusho({ image, contextText }) {
  const res = await fetch('/api/seikyusho', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'analyze', image, context: contextText }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || res.statusText)
  return data.extracted
}

export async function registerSeikyusho(payload) {
  const res = await fetch('/api/seikyusho', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'register', ...payload }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || res.statusText)
  return data
}

export function calcLucroPreview(extracted) {
  const custo = (extracted.itens_custo || []).reduce((a, it) => a + (it.qtd || 1) * (it.custo_unitario || 0), 0)
    || (+extracted.total || 0)
  const venda = (extracted.itens_venda || []).reduce((a, it) => a + (it.qtd || 1) * (it.preco_unitario || 0), 0)
    + (extracted.entregas || []).reduce((a, e) =>
      a + (e.itens || []).reduce((b, it) => b + (it.qtd || 1) * (it.preco_unitario || 0), 0), 0)
  return { custo, venda, lucro: venda - custo, margemPct: venda > 0 ? Math.round(((venda - custo) / venda) * 100) : 0 }
}
