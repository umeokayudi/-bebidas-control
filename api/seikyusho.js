import { createClient } from '@supabase/supabase-js'
import { setCorsHeaders, handleCorsPreflight } from './_cors.js'
import { geminiGenerate } from './_gemini.js'

const SEIKYUSHO_SYSTEM = `Você lê 請求書 (seikyusho) / faturas de fornecedores de bebidas no Japão.
Retorne APENAS JSON válido:
{
  "fornecedor": "",
  "cliente_bar": null,
  "numero_fatura": "",
  "data": "YYYY-MM-DD",
  "data_vencimento": null,
  "pagamento": "Transfer",
  "subtotal": 0,
  "total": 0,
  "consumo_tax": 0,
  "itens_custo": [{"nome": "", "qtd": 1, "custo_unitario": 0}],
  "itens_venda": [{"nome": "", "qtd": 1, "preco_unitario": 0}],
  "entregas": [{"bar_nome": "", "data": "YYYY-MM-DD", "itens": [{"nome": "", "qtd": 1, "preco_unitario": 0}]}],
  "observacoes": ""
}
Valores em iene. itens_custo = custo JBM. entregas/itens_venda = vendas ao bar.`

function adminClient() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function extractText(data) {
  return data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || ''
}

function parseJson(text) {
  const cleaned = String(text || '').replace(/```json|```/g, '').trim()
  return JSON.parse(cleaned)
}

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim()
}

function matchProduct(nome, produtos) {
  if (!nome) return null
  const n = norm(nome)
  const exact = produtos.find(p => norm(p.nome) === n)
  if (exact) return exact
  const partial = produtos.find(p => norm(p.nome).includes(n) || n.includes(norm(p.nome)))
  if (partial) return partial
  const first = n.split(/\s+/)[0]
  return produtos.find(p => norm(p.nome).includes(first)) || null
}

function matchBar(nome, bars) {
  if (!nome) return bars[0] || null
  const n = norm(nome)
  return bars.find(b => norm(b.nome).includes(n) || n.includes(norm(b.nome))) || bars[0] || null
}

async function analyzeSeikyusho(body) {
  const { image, context } = body || {}
  if (!image?.data) throw new Error('image is required')

  const parts = [
    { inlineData: { mimeType: image.mimeType || 'image/jpeg', data: image.data } },
    { text: context
      ? `Analise esta 請求書. Contexto:\n${context}\n\nExtraia dados completos.`
      : 'Analise esta 請求書 e extraia todos os dados.' },
  ]

  const data = await geminiGenerate({
    contents: [{ role: 'user', parts }],
    systemInstruction: { parts: [{ text: SEIKYUSHO_SYSTEM }] },
    generationConfig: { temperature: 0.15, maxOutputTokens: 4096 },
  })

  return parseJson(extractText(data))
}

async function registerSeikyusho(body) {
  const extracted = body.extracted
  if (!extracted?.fornecedor && !extracted?.total) {
    throw new Error('Dados extraídos inválidos — analise a fatura primeiro')
  }

  const sb = adminClient()
  const report = { compra: null, vendas: [], pedidosAtualizados: 0, lucro: 0, custo: 0, receita: 0 }

  const [{ data: produtos }, { data: bars }] = await Promise.all([
    sb.from('produtos').select('id,nome,custo,preco_venda,categoria').eq('ativo', true),
    sb.from('bars').select('id,nome'),
  ])

  const prods = produtos || []
  const barList = bars || []

  // ── Compra (custo) ──
  const itensCusto = extracted.itens_custo?.length ? extracted.itens_custo : []
  const totalCusto = itensCusto.length
    ? itensCusto.reduce((a, it) => a + (it.qtd || 1) * (it.custo_unitario || 0), 0)
    : (+extracted.total || +extracted.subtotal || 0)

  if (totalCusto > 0) {
    const { data: compra, error } = await sb.from('compras').insert({
      data: extracted.data || new Date().toISOString().slice(0, 10),
      fornecedor: extracted.fornecedor || 'Fornecedor',
      pagamento: extracted.pagamento || 'Transfer',
      subtotal: +extracted.subtotal || totalCusto,
      desconto_pontos: 0,
      total_pago: +extracted.total || totalCusto,
      total_real: totalCusto,
      data_pagamento: extracted.data_vencimento || null,
      status_pagamento: extracted.data_vencimento ? 'pendente' : 'pago',
      obs: `Seikyusho ${extracted.numero_fatura || ''} — ${extracted.observacoes || ''}`.trim(),
    }).select().single()

    if (error) throw new Error(`compra: ${error.message}`)
    report.compra = compra.id

    if (itensCusto.length) {
      await sb.from('compras_itens').insert(
        itensCusto.map(it => ({
          compra_id: compra.id,
          nome: it.nome,
          qtd: it.qtd || 1,
          custo_unitario: it.custo_unitario || 0,
        }))
      )
      for (const it of itensCusto) {
        const prod = matchProduct(it.nome, prods)
        if (prod && it.custo_unitario) {
          await sb.from('produtos').update({ custo: it.custo_unitario }).eq('id', prod.id)
        }
      }
    }
    report.custo = totalCusto
  }

  // ── Entregas (vendas) ──
  const entregas = [
    ...(extracted.entregas || []),
    ...(extracted.itens_venda?.length ? [{
      bar_nome: extracted.cliente_bar,
      data: extracted.data,
      itens: extracted.itens_venda,
    }] : []),
  ]

  for (const ent of entregas) {
    const itens = ent.itens || []
    if (!itens.length) continue

    const bar = matchBar(ent.bar_nome || extracted.cliente_bar, barList)
    if (!bar) continue

    const mapped = itens.map(it => {
      const prod = matchProduct(it.nome, prods)
      return { prod, it }
    }).filter(x => x.prod)

    if (!mapped.length) continue

    const total = mapped.reduce((a, { prod, it }) =>
      a + (it.qtd || 1) * (it.preco_unitario || prod.preco_venda || 0), 0)

    const { data: venda, error: vErr } = await sb.from('vendas').insert({
      data: ent.data || extracted.data || new Date().toISOString().slice(0, 10),
      bar_id: bar.id,
      total,
      obs: `Seikyusho ${extracted.numero_fatura || ''} — entrega ${bar.nome}`,
    }).select().single()

    if (vErr) throw new Error(`venda: ${vErr.message}`)

    await sb.from('vendas_itens').insert(
      mapped.map(({ prod, it }) => ({
        venda_id: venda.id,
        produto_id: prod.id,
        qtd: it.qtd || 1,
        preco_unitario: it.preco_unitario || prod.preco_venda || 0,
      }))
    )

    report.vendas.push({ id: venda.id, bar: bar.nome, total })
    report.receita += total

    // Marca pedidos pendentes/confirmados do bar na mesma data como entregue
    const entDate = ent.data || extracted.data
    if (entDate) {
      const { data: pedidos } = await sb.from('pedidos')
        .select('id,total_estimado,pedidos_itens(produto_id,qtd,preco_unitario)')
        .eq('bar_id', bar.id)
        .in('status', ['pendente', 'confirmado'])
        .eq('data_pedido', entDate)

      for (const p of pedidos || []) {
        await sb.from('pedidos').update({ status: 'entregue' }).eq('id', p.id)
        report.pedidosAtualizados++
      }
    }
  }

  report.lucro = report.receita - report.custo
  report.margemPct = report.receita > 0 ? Math.round((report.lucro / report.receita) * 100) : 0

  return report
}

export default async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return
  setCorsHeaders(req, res)

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const action = body.action || 'analyze'

    if (action === 'analyze') {
      const extracted = await analyzeSeikyusho(body)
      return res.status(200).json({ ok: true, extracted })
    }

    if (action === 'register') {
      const result = await registerSeikyusho(body)
      return res.status(200).json({ ok: true, ...result })
    }

    return res.status(400).json({ error: 'action must be analyze or register' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
