import { createClient } from '@supabase/supabase-js'
import { setCorsHeaders, handleCorsPreflight } from './_cors.js'
import { geminiGenerate } from './_gemini.js'
import { ATOMIC_BAR_ID } from './_atomicJuneFix.js'
import {
  matchBar,
  matchProduct,
  calcItemMargin,
  updateSupplierPrices,
  syncPedidosEntregues,
} from './_deliveryMargin.js'

const SEIKYUSHO_SYSTEM = `Você lê 請求書 (seikyusho) — fatura do FORNECEDOR que a JBM Drinks paga (custo de compra).
O cliente bar (ex: Atomic) já fez pedidos no portal; a entrega foi direta ao bar.

Retorne APENAS JSON válido:
{
  "fornecedor": "nome do fornecedor",
  "cliente_bar": "Atomic",
  "entrega_direta": true,
  "numero_fatura": "",
  "data": "YYYY-MM-DD",
  "periodo_inicio": "YYYY-MM-DD",
  "periodo_fim": "YYYY-MM-DD",
  "data_vencimento": null,
  "pagamento": "Transfer",
  "subtotal": 0,
  "total": 0,
  "itens_custo": [{"nome": "produto", "qtd": 1, "custo_unitario": 0}],
  "observacoes": ""
}

Regras:
- itens_custo = o que JBM PAGOU ao fornecedor (custo JBM, não preço ao bar).
- periodo_inicio/fim = período da fatura ou das entregas.
- entrega_direta=true quando a mercadoria foi entregue ao bar; pedidos do cliente já existem no sistema.
- NÃO invente preço de venda ao bar — isso vem dos pedidos do cliente.
- Valores em iene (inteiros).`

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

async function analyzeSeikyusho(body) {
  const { image, context } = body || {}
  if (!image?.data) throw new Error('image is required')

  const parts = [
    { inlineData: { mimeType: image.mimeType || 'image/jpeg', data: image.data } },
    { text: context
      ? `Analise esta 請求書 (custo JBM). Contexto:\n${context}\n\nEntrega direta ao bar — pedidos do cliente serão sincronizados.`
      : 'Analise esta 請求書 do fornecedor (custo JBM).' },
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
  const report = {
    compra: null,
    precosAtualizados: null,
    pedidos: null,
    receita: 0,
    custo: 0,
    lucro: 0,
    margemPct: 0,
  }

  const [{ data: produtos }, { data: bars }, { data: fornecedores }] = await Promise.all([
    sb.from('produtos').select('id,nome,custo,preco_venda,categoria').eq('ativo', true),
    sb.from('bars').select('id,nome'),
    sb.from('fornecedores').select('id,nome'),
  ])

  const prods = produtos || []
  const barList = bars || []

  // ── 1. Compra (custo JBM ao fornecedor) ──
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
    }
    report.custo = totalCusto
  }

  // ── 2. Atualizar custo JBM + lista de preços do fornecedor ──
  report.precosAtualizados = await updateSupplierPrices(sb, {
    fornecedorNome: extracted.fornecedor,
    itensCusto,
    produtos: prods,
    fornecedores: fornecedores || [],
  })

  // ── 3. Sincronizar pedidos do cliente → entregue + venda (data do pedido, preço ao bar) ──
  const bar = matchBar(extracted.cliente_bar, barList) || barList.find(b => b.id === ATOMIC_BAR_ID)
  const entregaDireta = extracted.entrega_direta !== false

  if (bar && entregaDireta) {
    const dateFrom = extracted.periodo_inicio || extracted.data
    const dateTo = extracted.periodo_fim || extracted.data

    report.pedidos = await syncPedidosEntregues(sb, {
      barId: bar.id,
      dateFrom,
      dateTo,
      prods,
      statusIn: ['pendente', 'confirmado'],
    })

    report.receita = report.pedidos.receita
    // Custo real = custo JBM dos itens vendidos (não só total da fatura)
    report.custo = report.pedidos.custo || report.custo
    report.lucro = report.receita - report.custo
    report.margemPct = report.receita > 0 ? Math.round((report.lucro / report.receita) * 100) : 0
  } else if (extracted.entregas?.length || extracted.itens_venda?.length) {
    // Fallback: entregas explícitas na fatura
    const entregas = [
      ...(extracted.entregas || []),
      ...(extracted.itens_venda?.length ? [{
        bar_nome: extracted.cliente_bar,
        data: extracted.data,
        itens: extracted.itens_venda,
      }] : []),
    ]

    for (const ent of entregas) {
      const b = matchBar(ent.bar_nome || extracted.cliente_bar, barList)
      if (!b) continue
      const mapped = (ent.itens || []).map(it => ({ prod: matchProduct(it.nome, prods), it })).filter(x => x.prod)
      if (!mapped.length) continue

      let receita = 0
      let custo = 0
      for (const { prod, it } of mapped) {
        const preco = it.preco_unitario || prod.preco_venda || 0
        const m = calcItemMargin(it.qtd, preco, prod.custo)
        receita += m.receita
        custo += m.custo
      }

      const { data: venda, error: vErr } = await sb.from('vendas').insert({
        data: ent.data || extracted.data,
        bar_id: b.id,
        total: receita,
        obs: `Seikyusho ${extracted.numero_fatura || ''} — entrega ${b.nome}`,
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

      report.receita += receita
      report.custo += custo
    }
    report.lucro = report.receita - report.custo
    report.margemPct = report.receita > 0 ? Math.round((report.lucro / report.receita) * 100) : 0
  }

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

    if (action === 'syncPedidos') {
      const sb = adminClient()
      const sync = await syncPedidosEntregues(sb, {
        barId: body.barId || ATOMIC_BAR_ID,
        dateFrom: body.dateFrom,
        dateTo: body.dateTo,
      })
      return res.status(200).json({ ok: true, ...sync })
    }

    return res.status(400).json({ error: 'action must be analyze, register or syncPedidos' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
