/**
 * Backend falso do preview: responde `/api/pos-reorder` sem Vercel.
 *
 * Reproduz o que `api/pos-reorder.js` faz no banco (marcar as requests,
 * criar o pedido para a JBM), só que contra o store em memória — é isso
 * que deixa a reposição automática demonstrável offline.
 */

import { mockStore } from './mockSupabase'

const realFetch = globalThis.fetch?.bind(globalThis)

function posReorder(body) {
  const { request_ids: requestIds = [], itens = [], criar_pedido_jbm: criarPedido = true, bar_id: barId } = body

  let pedido = null
  if (criarPedido && itens.length) {
    pedido = {
      id: `pedido-preview-${mockStore.pedidos.length + 1}`,
      bar_id: barId,
      status: 'pendente',
      origem: 'pos_auto',
      data_pedido: new Date().toISOString().slice(0, 10),
      obs: `Reposição automática do POS · ${itens.length} item(ns)`,
      total_estimado: itens.reduce((a, i) => a + (+i.qtd_sugerida || 0) * (+i.preco_unitario || 0), 0),
      criado_em: new Date().toISOString(),
    }
    mockStore.pedidos.push(pedido)
    itens.forEach((i, idx) => mockStore.pedidos_itens.push({
      id: `pedido-item-preview-${mockStore.pedidos_itens.length + idx + 1}`,
      pedido_id: pedido.id,
      produto_id: i.produto_id,
      qtd: Math.max(1, Math.ceil(+i.qtd_sugerida || 1)),
      preco_unitario: +i.preco_unitario || 0,
    }))
  }

  const status = pedido ? 'pedido_criado' : 'enviado'
  mockStore.pos_reorder_requests
    .filter(r => requestIds.includes(r.id))
    .forEach(r => Object.assign(r, {
      status,
      pedido_id: pedido?.id || null,
      webhook_status: '200',
      webhook_resposta: 'preview',
      resolvido_em: new Date().toISOString(),
    }))

  return {
    ok: true,
    webhook: { configurado: true, ok: true, status: 200, body: 'preview' },
    pedido: pedido ? { id: pedido.id, itens: itens.length, total: pedido.total_estimado } : null,
    requests_atualizadas: requestIds.length,
  }
}

const ROUTES = {
  '/api/pos-reorder': posReorder,
}

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || ''
  const route = Object.keys(ROUTES).find(path => url.startsWith(path))
  if (!route) return realFetch(input, init)

  const body = init.body ? JSON.parse(init.body) : {}
  const data = ROUTES[route](body)
  console.info('[preview api]', route, data)
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
