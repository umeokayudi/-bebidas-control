/** Margem JBM: preço ao bar − custo fornecedor */
export function calcLucroPreview(extracted, catalog = []) {
  const custo = (extracted.itens_custo || []).reduce((a, it) => a + (it.qtd || 1) * (it.custo_unitario || 0), 0)
    || (+extracted.total || 0)

  // Entrega direta: receita vem dos pedidos do cliente (estimativa via catálogo se não houver itens_venda)
  let venda = 0
  if (extracted.entrega_direta !== false) {
    venda = (extracted.receita_estimada || 0)
  } else {
    venda = (extracted.itens_venda || []).reduce((a, it) => a + (it.qtd || 1) * (it.preco_unitario || 0), 0)
      + (extracted.entregas || []).reduce((a, e) =>
        a + (e.itens || []).reduce((b, it) => b + (it.qtd || 1) * (it.preco_unitario || 0), 0), 0)
  }

  // Estimar margem por item de custo usando preço de venda do catálogo
  if (!venda && catalog.length && extracted.itens_custo?.length) {
    for (const it of extracted.itens_custo) {
      const prod = catalog.find(p =>
        p.nome?.toLowerCase().includes((it.nome || '').toLowerCase().split(' ')[0])
        || (it.nome || '').toLowerCase().includes(p.nome?.toLowerCase())
      )
      venda += (it.qtd || 1) * (prod?.preco_venda || 0)
    }
  }

  return { custo, venda, lucro: venda - custo, margemPct: venda > 0 ? Math.round(((venda - custo) / venda) * 100) : 0 }
}

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
