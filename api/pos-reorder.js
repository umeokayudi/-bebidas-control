import { setCorsHeaders, handleCorsPreflight } from './_cors.js'
import { drinksAdminClient } from './_supabaseAdmin.js'

export default async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return
  setCorsHeaders(req, res)

  let sb
  try {
    sb = drinksAdminClient()
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }

  // GET: Consultar produtos abaixo do mínimo e configurações de reposição
  if (req.method === 'GET') {
    const barId = req.query?.bar_id
    if (!barId) {
      return res.status(400).json({ error: 'bar_id é obrigatório' })
    }

    try {
      const [{ data: bar }, { data: regras }, { data: movimentos }, { data: settings }] = await Promise.all([
        sb.from('bars').select('id, nome').eq('id', barId).single(),
        sb.from('estoque_regras').select('produto_id, minimo').eq('bar_id', barId),
        sb.from('estoque_movimentos').select('produto_id, tipo, qtd').eq('bar_id', barId),
        sb.from('pos_reorder_settings').select('*').eq('bar_id', barId).maybeSingle(),
      ])

      const stockMap = {}
      ;(movimentos || []).forEach(m => {
        if (!stockMap[m.produto_id]) stockMap[m.produto_id] = 0
        stockMap[m.produto_id] += m.tipo === 'entrada' ? +m.qtd : -+m.qtd
      })

      const minMap = {}
      ;(regras || []).forEach(r => {
        minMap[r.produto_id] = +r.minimo
      })

      const lowStockProductIds = Object.keys(minMap).filter(pid => {
        const current = Math.max(0, stockMap[pid] || 0)
        return minMap[pid] > 0 && current <= minMap[pid]
      })

      let lowStockProducts = []
      if (lowStockProductIds.length > 0) {
        const { data: prods } = await sb.from('produtos').select('id, nome, categoria, preco_venda, volume_ml').in('id', lowStockProductIds)
        lowStockProducts = (prods || []).map(p => {
          const current = Math.max(0, stockMap[p.id] || 0)
          const min = minMap[p.id]
          const suggested = Math.max(min * 2, min - current + 6)
          return {
            ...p,
            stock_atual: current,
            minimo: min,
            qtd_sugerida: suggested,
          }
        })
      }

      return res.status(200).json({
        ok: true,
        bar: bar || { id: barId },
        settings: settings || {
          bar_id: barId,
          webhook_url: '',
          auto_order_jbm: true,
          ativo: true,
        },
        low_stock_count: lowStockProducts.length,
        low_stock_products: lowStockProducts,
      })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // POST: Processa baixa de estoque pós-venda POS e dispara webhook/pedido automático
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const { action, bar_id, items, settings: newSettings } = body

    if (!bar_id) return res.status(400).json({ error: 'bar_id é obrigatório' })

    // Salvar configurações de webhook do bar
    if (action === 'saveSettings') {
      try {
        const { error: sErr } = await sb.from('pos_reorder_settings').upsert({
          bar_id,
          webhook_url: newSettings.webhook_url || null,
          auto_order_jbm: newSettings.auto_order_jbm !== false,
          email_notificacao: newSettings.email_notificacao || null,
          ativo: newSettings.ativo !== false,
          atualizado_em: new Date().toISOString(),
        }, { onConflict: 'bar_id' })
        if (sErr) throw sErr
        return res.status(200).json({ ok: true, message: 'Configurações de reposição salvas' })
      } catch (e) {
        return res.status(500).json({ error: e.message })
      }
    }

    // Criar pedido avulso de reposição direto para a JBM
    if (action === 'createJbmOrder') {
      const orderItems = body.order_items || []
      if (!orderItems.length) return res.status(400).json({ error: 'Nenhum item informado' })

      try {
        const totalEstimado = orderItems.reduce((acc, it) => acc + (+it.preco_unitario || 0) * (+it.qtd || 1), 0)
        const { data: pedido, error: pErr } = await sb.from('pedidos').insert({
          bar_id,
          status: 'pendente',
          data_pedido: new Date().toISOString().slice(0, 10),
          obs: 'Auto: Reposição automática de estoque (POS)',
          total_estimado: totalEstimado,
        }).select().single()

        if (pErr) throw pErr

        const { error: iErr } = await sb.from('pedidos_itens').insert(
          orderItems.map(it => ({
            pedido_id: pedido.id,
            produto_id: it.produto_id,
            qtd: it.qtd,
            preco_unitario: it.preco_unitario || 0,
          }))
        )
        if (iErr) throw iErr

        return res.status(200).json({ ok: true, pedido_id: pedido.id, total: totalEstimado })
      } catch (e) {
        return res.status(500).json({ error: e.message })
      }
    }

    // Lógica padrão pós-venda: Baixar estoque e verificar reposição
    try {
      const [{ data: bar }, { data: regras }, { data: movimentos }, { data: settings }] = await Promise.all([
        sb.from('bars').select('id, nome').eq('id', bar_id).single(),
        sb.from('estoque_regras').select('produto_id, minimo').eq('bar_id', bar_id),
        sb.from('estoque_movimentos').select('produto_id, tipo, qtd').eq('bar_id', bar_id),
        sb.from('pos_reorder_settings').select('*').eq('bar_id', bar_id).maybeSingle(),
      ])

      const stockMap = {}
      ;(movimentos || []).forEach(m => {
        if (!stockMap[m.produto_id]) stockMap[m.produto_id] = 0
        stockMap[m.produto_id] += m.tipo === 'entrada' ? +m.qtd : -+m.qtd
      })

      const minMap = {}
      ;(regras || []).forEach(r => {
        minMap[r.produto_id] = +r.minimo
      })

      const triggeredAlerts = []
      const estoqueBaixas = []

      for (const item of (items || [])) {
        if (!item.produto_id) continue
        const qtdSold = Number(item.qtd || 1)

        // Registrar baixa em estoque_movimentos
        estoqueBaixas.push({
          produto_id: item.produto_id,
          bar_id,
          tipo: 'saida',
          qtd: qtdSold,
          obs: `POS venda: ${item.nome || 'Item balcão'}`,
        })

        const previousStock = stockMap[item.produto_id] || 0
        const newStock = previousStock - qtdSold
        stockMap[item.produto_id] = newStock

        const minStock = minMap[item.produto_id] || 0
        if (minStock > 0 && newStock <= minStock) {
          const suggestedQty = Math.max(minStock * 2, (minStock - newStock) + 6)
          triggeredAlerts.push({
            produto_id: item.produto_id,
            nome: item.nome,
            stock_anterior: previousStock,
            stock_atual: newStock,
            minimo: minStock,
            qtd_sugerida: suggestedQty,
          })
        }
      }

      // Persistir baixas de estoque
      if (estoqueBaixas.length > 0) {
        await sb.from('estoque_movimentos').insert(estoqueBaixas)
      }

      const results = {
        bar_id,
        items_processed: estoqueBaixas.length,
        triggered_reorder: triggeredAlerts.length > 0,
        alerts: triggeredAlerts,
        webhook_sent: false,
        auto_order_created: null,
      }

      // Se houver alerta de estoque e webhook configurado, disparar webhook
      if (triggeredAlerts.length > 0 && settings?.webhook_url && settings?.ativo) {
        try {
          const webhookPayload = {
            event: 'pos_low_stock_reorder',
            timestamp: new Date().toISOString(),
            bar: {
              id: bar?.id || bar_id,
              nome: bar?.nome || 'Bar',
            },
            fornecedor: 'JBM Drinks',
            reorder_items: triggeredAlerts.map(a => ({
              produto_id: a.produto_id,
              nome: a.nome,
              stock_atual: a.stock_atual,
              minimo: a.minimo,
              quantidade_reposicao_sugerida: a.qtd_sugerida,
            })),
          }

          const webRes = await fetch(settings.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookPayload),
          })
          results.webhook_sent = webRes.ok
        } catch (wErr) {
          results.webhook_error = wErr.message
        }
      }

      return res.status(200).json({ ok: true, ...results })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
