/**
 * Dados de demonstração do preview do POS: uma noite típica do Atomic.
 * Só o preview de desenvolvimento usa este arquivo.
 */

const BAR_ID = 'bar-atomic'
const USER_ID = 'user-owner'

function today(hoursBack = 0) {
  const d = new Date()
  d.setHours(d.getHours() - hoursBack)
  return d
}

function isoAtHour(hour, daysBack = 0) {
  const d = new Date()
  d.setDate(d.getDate() - daysBack)
  d.setHours(hour, Math.floor(Math.random() * 50), 0, 0)
  return d.toISOString()
}

/** Data operacional: antes das 6h a venda pertence à noite anterior. */
function businessDay(daysBack = 0) {
  const d = new Date()
  if (d.getHours() < 6) d.setDate(d.getDate() - 1)
  d.setDate(d.getDate() - daysBack)
  return d.toISOString().slice(0, 10)
}

function dateOnly(daysBack = 0) {
  const d = new Date()
  d.setDate(d.getDate() - daysBack)
  return d.toISOString().slice(0, 10)
}

const PRODUTOS = [
  { id: 'prod-greygoose', nome: 'Grey Goose 700ml', categoria: 'Vodka', preco_venda: 4800, volume_ml: 700, ativo: true },
  { id: 'prod-hibiki', nome: 'Hibiki Harmony 700ml', categoria: 'Japanese Whisky', preco_venda: 9800, volume_ml: 700, ativo: true },
  { id: 'prod-tanqueray', nome: 'Tanqueray 750ml', categoria: 'Gin', preco_venda: 3200, volume_ml: 750, ativo: true },
  { id: 'prod-patron', nome: 'Patrón Silver 750ml', categoria: 'Tequila', preco_venda: 8600, volume_ml: 750, ativo: true },
  { id: 'prod-tonic', nome: 'Schweppes Tonic 1L', categoria: 'Soda', preco_venda: 380, volume_ml: 1000, ativo: true },
  { id: 'prod-ginger', nome: 'Ginger Ale 1L', categoria: 'Soda', preco_venda: 360, volume_ml: 1000, ativo: true },
  { id: 'prod-lime', nome: 'Lime Juice 500ml', categoria: 'Juice', preco_venda: 620, volume_ml: 500, ativo: true },
  { id: 'prod-asahi', nome: 'Asahi Super Dry 334ml', categoria: 'Beer', preco_venda: 240, volume_ml: 334, ativo: true },
  { id: 'prod-moet', nome: 'Moët Impérial 750ml', categoria: 'Champagne', preco_venda: 12800, volume_ml: 750, ativo: true },
]

const DRINKS = [
  { id: 'drink-moscow', bar_id: BAR_ID, nome: 'Moscow Mule', categoria: 'Signature', preco_venda: 1400, custo: 340, margem: 0.76, preco_desconto: 700, custom: true },
  { id: 'drink-gt', bar_id: BAR_ID, nome: 'Gin & Tonic', categoria: 'Classic', preco_venda: 1200, custo: 290, margem: 0.76, preco_desconto: 600, custom: true },
  { id: 'drink-highball', bar_id: BAR_ID, nome: 'Hibiki Highball', categoria: 'Signature', preco_venda: 1800, custo: 700, margem: 0.61, preco_desconto: 900, custom: true },
  { id: 'drink-margarita', bar_id: BAR_ID, nome: 'Margarita', categoria: 'Classic', preco_venda: 1600, custo: 620, margem: 0.61, preco_desconto: 800, custom: true },
  { id: 'drink-beer', bar_id: BAR_ID, nome: 'Asahi Draft', categoria: 'Beer', preco_venda: 700, custo: 240, margem: 0.66, preco_desconto: 500, custom: false },
]

const PRICING = [
  { id: 'pr-1', bar_id: BAR_ID, produto_id: 'prod-greygoose', drinks_por_garrafa: 16, preco_drink: 900 },
  { id: 'pr-2', bar_id: BAR_ID, produto_id: 'prod-hibiki', drinks_por_garrafa: 16, preco_drink: 1500 },
  { id: 'pr-3', bar_id: BAR_ID, produto_id: 'prod-tanqueray', drinks_por_garrafa: 16, preco_drink: 800 },
  { id: 'pr-4', bar_id: BAR_ID, produto_id: 'prod-patron', drinks_por_garrafa: 16, preco_drink: 1400 },
  { id: 'pr-5', bar_id: BAR_ID, produto_id: 'prod-tonic', drinks_por_garrafa: 6, preco_drink: 300 },
  { id: 'pr-6', bar_id: BAR_ID, produto_id: 'prod-ginger', drinks_por_garrafa: 6, preco_drink: 300 },
  { id: 'pr-7', bar_id: BAR_ID, produto_id: 'prod-lime', drinks_por_garrafa: 20, preco_drink: 200 },
]

const RECIPES = [
  { id: 'ing-1', drink_menu_id: 'drink-moscow', produto_id: 'prod-greygoose', doses: 1 },
  { id: 'ing-2', drink_menu_id: 'drink-moscow', produto_id: 'prod-ginger', doses: 0.5 },
  { id: 'ing-3', drink_menu_id: 'drink-moscow', produto_id: 'prod-lime', doses: 0.5 },
  { id: 'ing-4', drink_menu_id: 'drink-gt', produto_id: 'prod-tanqueray', doses: 1 },
  { id: 'ing-5', drink_menu_id: 'drink-gt', produto_id: 'prod-tonic', doses: 0.5 },
  { id: 'ing-6', drink_menu_id: 'drink-highball', produto_id: 'prod-hibiki', doses: 1 },
  { id: 'ing-7', drink_menu_id: 'drink-margarita', produto_id: 'prod-patron', doses: 1 },
  { id: 'ing-8', drink_menu_id: 'drink-margarita', produto_id: 'prod-lime', doses: 1 },
]

const STAFF = [
  { id: 'staff-kenji', bar_id: BAR_ID, nome: 'Kenji Sato', cargo: 'Bartender', tipo_pagamento: 'mensal', salario_base: 260000, comissao_pct: 2, ativo: true },
  { id: 'staff-lia', bar_id: BAR_ID, nome: 'Lia Moreira', cargo: 'Garçom', tipo_pagamento: 'diaria', salario_base: 12000, comissao_pct: 3, ativo: true },
  { id: 'staff-rui', bar_id: BAR_ID, nome: 'Rui Tanaka', cargo: 'Segurança', tipo_pagamento: 'hora', salario_base: 1600, comissao_pct: 0, ativo: true },
  { id: 'staff-ana', bar_id: BAR_ID, nome: 'Ana Kudo', cargo: 'Caixa', tipo_pagamento: 'mensal', salario_base: 210000, comissao_pct: 1, ativo: true },
]

const AGENTS = [
  { id: 'agent-yuki', bar_id: BAR_ID, nome: 'Yuki', codigo: 'DB-01', regiao: 'Kanto', cidade: 'Tokyo', comissao_pct: 25, meta_mensal: 400000, ativo: true },
  { id: 'agent-mari', bar_id: BAR_ID, nome: 'Mari', codigo: 'DB-02', regiao: 'Kanto', cidade: 'Yokohama', comissao_pct: 20, meta_mensal: 250000, ativo: true },
  { id: 'agent-sae', bar_id: BAR_ID, nome: 'Sae', codigo: 'DB-03', regiao: 'Kansai', cidade: 'Osaka', comissao_pct: 20, meta_mensal: 200000, ativo: true },
  { id: 'agent-noa', bar_id: BAR_ID, nome: 'Noa', codigo: 'DB-04', regiao: 'Chubu', cidade: 'Nagoya', comissao_pct: 22, meta_mensal: 150000, ativo: false },
]

// Noite de hoje: pico às 22h/23h, ocioso às 18h/19h e depois das 3h.
const HOURLY_PLAN = [
  { hora: 18, vendas: [4200] },
  { hora: 19, vendas: [6800, 3400] },
  { hora: 20, vendas: [12400, 8600, 5200] },
  { hora: 21, vendas: [18600, 14200, 9800, 7400] },
  { hora: 22, vendas: [28400, 22600, 16800, 12200, 9600] },
  { hora: 23, vendas: [31200, 24800, 18400, 11600] },
  { hora: 0, vendas: [19800, 15200, 10400] },
  { hora: 1, vendas: [12600, 8200] },
  { hora: 2, vendas: [6400] },
  { hora: 3, vendas: [2800] },
]

const POS_VENDAS = []
const POS_ITENS = []
const COMISSOES = []

let vendaSeq = 0
HOURLY_PLAN.forEach(({ hora, vendas }) => {
  vendas.forEach(total => {
    vendaSeq += 1
    const id = `pv-${vendaSeq}`
    const agente = vendaSeq % 3 === 0 ? AGENTS[vendaSeq % 2] : null
    const staff = STAFF[vendaSeq % 3]
    const desconto = vendaSeq % 4 === 0 ? Math.round(total * 0.1) : 0
    POS_VENDAS.push({
      id,
      bar_id: BAR_ID,
      data: businessDay(0),
      hora,
      subtotal: total + desconto,
      desconto_total: desconto,
      total,
      metodo_pagamento: ['Cash', 'Credit card', 'PayPay'][vendaSeq % 3],
      tipo: agente ? 'drink_back' : 'balcao',
      staff_id: staff.id,
      drink_back_agent_id: agente?.id || null,
      drink_back_valor: agente ? Math.round((total * agente.comissao_pct) / 100) : 0,
      criado_por: USER_ID,
      criado_em: isoAtHour(hora),
    })
    const drink = DRINKS[vendaSeq % DRINKS.length]
    POS_ITENS.push({
      id: `pvi-${vendaSeq}`,
      pos_venda_id: id,
      drink_menu_id: drink.id,
      produto_id: null,
      nome: drink.nome,
      qtd: Math.max(1, Math.round(total / drink.preco_venda)),
      preco_unitario: drink.preco_venda,
      preco_lista: drink.preco_venda,
      tipo_preco: 'regular',
      desconto_valor: 0,
      custo_estimado: drink.custo,
    })
    if (agente) {
      COMISSOES.push({
        id: `dbc-${vendaSeq}`,
        bar_id: BAR_ID,
        agent_id: agente.id,
        pos_venda_id: id,
        data: businessDay(0),
        base_valor: total,
        comissao_pct: agente.comissao_pct,
        comissao_valor: Math.round((total * agente.comissao_pct) / 100),
        pago: vendaSeq % 2 === 0,
      })
    }
  })
})

// Noites anteriores, para a média de 7 dias e a folha do mês.
for (let d = 1; d <= 6; d++) {
  ;[20, 22, 23, 0].forEach((hora, i) => {
    vendaSeq += 1
    POS_VENDAS.push({
      id: `pv-hist-${d}-${i}`,
      bar_id: BAR_ID,
      data: businessDay(d),
      hora,
      subtotal: 120000 - d * 4000,
      desconto_total: 0,
      total: 120000 - d * 4000,
      metodo_pagamento: 'Credit card',
      tipo: 'balcao',
      staff_id: STAFF[i % 3].id,
      drink_back_agent_id: i === 0 ? AGENTS[d % 3].id : null,
      drink_back_valor: 0,
      criado_em: isoAtHour(hora, d),
    })
  })
}

const TURNOS = []
for (let d = 0; d <= 12; d++) {
  TURNOS.push({ id: `t-kenji-${d}`, bar_id: BAR_ID, staff_id: 'staff-kenji', data: dateOnly(d), hora_inicio: 18, hora_fim: 2, status: 'escalado' })
  TURNOS.push({ id: `t-ana-${d}`, bar_id: BAR_ID, staff_id: 'staff-ana', data: dateOnly(d), hora_inicio: 19, hora_fim: 3, status: 'escalado' })
  if (d % 2 === 0) TURNOS.push({ id: `t-lia-${d}`, bar_id: BAR_ID, staff_id: 'staff-lia', data: dateOnly(d), hora_inicio: 20, hora_fim: 2, status: 'escalado' })
  if (d % 3 === 0) TURNOS.push({ id: `t-rui-${d}`, bar_id: BAR_ID, staff_id: 'staff-rui', data: dateOnly(d), hora_inicio: 22, hora_fim: 4, status: 'escalado' })
}

// Estoque: Grey Goose zerado, Patrón e Tonic baixos, resto saudável.
const MOVIMENTOS = [
  { id: 'em-1', bar_id: BAR_ID, produto_id: 'prod-greygoose', tipo: 'entrada', qtd: 6, obs: 'Stock added', origem: 'manual', criado_em: isoAtHour(15, 6) },
  { id: 'em-2', bar_id: BAR_ID, produto_id: 'prod-greygoose', tipo: 'saida', qtd: 6, obs: 'POS · venda pv-12', origem: 'pos', criado_em: isoAtHour(23, 1) },
  { id: 'em-3', bar_id: BAR_ID, produto_id: 'prod-hibiki', tipo: 'entrada', qtd: 8, obs: 'Stock added', origem: 'manual', criado_em: isoAtHour(15, 6) },
  { id: 'em-4', bar_id: BAR_ID, produto_id: 'prod-hibiki', tipo: 'saida', qtd: 1.25, obs: 'POS', origem: 'pos', criado_em: isoAtHour(22, 1) },
  { id: 'em-5', bar_id: BAR_ID, produto_id: 'prod-tanqueray', tipo: 'entrada', qtd: 7, obs: 'Stock added', origem: 'manual', criado_em: isoAtHour(15, 5) },
  { id: 'em-6', bar_id: BAR_ID, produto_id: 'prod-patron', tipo: 'entrada', qtd: 4, obs: 'Stock added', origem: 'manual', criado_em: isoAtHour(15, 5) },
  { id: 'em-7', bar_id: BAR_ID, produto_id: 'prod-patron', tipo: 'saida', qtd: 3, obs: 'POS', origem: 'pos', criado_em: isoAtHour(23, 2) },
  { id: 'em-8', bar_id: BAR_ID, produto_id: 'prod-tonic', tipo: 'entrada', qtd: 12, obs: 'Stock added', origem: 'manual', criado_em: isoAtHour(15, 4) },
  { id: 'em-9', bar_id: BAR_ID, produto_id: 'prod-tonic', tipo: 'saida', qtd: 10, obs: 'POS', origem: 'pos', criado_em: isoAtHour(0, 1) },
  { id: 'em-10', bar_id: BAR_ID, produto_id: 'prod-ginger', tipo: 'entrada', qtd: 14, obs: 'Stock added', origem: 'manual', criado_em: isoAtHour(15, 4) },
  { id: 'em-11', bar_id: BAR_ID, produto_id: 'prod-lime', tipo: 'entrada', qtd: 9, obs: 'Stock added', origem: 'manual', criado_em: isoAtHour(15, 3) },
  { id: 'em-12', bar_id: BAR_ID, produto_id: 'prod-asahi', tipo: 'entrada', qtd: 48, obs: 'Stock added', origem: 'manual', criado_em: isoAtHour(15, 3) },
  { id: 'em-13', bar_id: BAR_ID, produto_id: 'prod-moet', tipo: 'entrada', qtd: 3, obs: 'Stock added', origem: 'manual', criado_em: isoAtHour(15, 2) },
]

const REGRAS = [
  { id: 'er-1', bar_id: BAR_ID, produto_id: 'prod-greygoose', minimo: 3 },
  { id: 'er-2', bar_id: BAR_ID, produto_id: 'prod-hibiki', minimo: 4 },
  { id: 'er-3', bar_id: BAR_ID, produto_id: 'prod-tanqueray', minimo: 3 },
  { id: 'er-4', bar_id: BAR_ID, produto_id: 'prod-patron', minimo: 3 },
  { id: 'er-5', bar_id: BAR_ID, produto_id: 'prod-tonic', minimo: 6 },
  { id: 'er-6', bar_id: BAR_ID, produto_id: 'prod-ginger', minimo: 6 },
  { id: 'er-7', bar_id: BAR_ID, produto_id: 'prod-asahi', minimo: 24 },
]

const SERVICE_ORDERS = [
  { id: 'so-1', bar_id: BAR_ID, tipo: 'limpeza', titulo: 'Limpeza pesada do salão e banheiros', descricao: 'Pós-fim de semana, inclui polimento do piso.', prioridade: 'alta', status: 'agendado', agendado_para: dateOnly(3), recorrencia: 'semanal', fornecedor_nome: 'Kirei Pro Cleaning', custo_estimado: 48000, criado_em: isoAtHour(12, 10) },
  { id: 'so-2', bar_id: BAR_ID, tipo: 'manutencao', titulo: 'Ar condicionado do salão pingando', descricao: 'Reclamação de cliente na mesa 4.', prioridade: 'urgente', status: 'aberto', agendado_para: dateOnly(-2), recorrencia: 'nenhuma', fornecedor_nome: 'Tokyo AC Service', custo_estimado: 62000, criado_em: isoAtHour(11, 2) },
  { id: 'so-3', bar_id: BAR_ID, tipo: 'manutencao', titulo: 'Revisão da máquina de gelo', prioridade: 'normal', status: 'em_andamento', agendado_para: dateOnly(-1), recorrencia: 'mensal', fornecedor_nome: 'Hoshizaki', custo_estimado: 18000, criado_em: isoAtHour(10, 5) },
  { id: 'so-4', bar_id: BAR_ID, tipo: 'limpeza', titulo: 'Higienização das linhas de chope', prioridade: 'normal', status: 'concluido', agendado_para: dateOnly(8), concluido_em: isoAtHour(14, 8), recorrencia: 'quinzenal', fornecedor_nome: 'Kirei Pro Cleaning', custo_estimado: 15000, custo_final: 16500, criado_em: isoAtHour(9, 14) },
  { id: 'so-5', bar_id: BAR_ID, tipo: 'outro', titulo: 'Dedetização anual', prioridade: 'baixa', status: 'aberto', agendado_para: null, recorrencia: 'nenhuma', custo_estimado: 22000, criado_em: isoAtHour(9, 1) },
]

const REORDER_REQUESTS = [
  { id: 'rr-1', bar_id: BAR_ID, produto_id: 'prod-greygoose', produto_nome: 'Grey Goose 700ml', estoque_atual: 0, minimo: 3, qtd_sugerida: 6, status: 'pedido_criado', webhook_status: '200', criado_em: isoAtHour(23, 1) },
  { id: 'rr-2', bar_id: BAR_ID, produto_id: 'prod-tonic', produto_nome: 'Schweppes Tonic 1L', estoque_atual: 2, minimo: 6, qtd_sugerida: 10, status: 'enviado', webhook_status: '200', criado_em: isoAtHour(1, 1) },
  { id: 'rr-3', bar_id: BAR_ID, produto_id: 'prod-patron', produto_nome: 'Patrón Silver 750ml', estoque_atual: 1, minimo: 3, qtd_sugerida: 5, status: 'falhou', webhook_status: '0', webhook_resposta: 'timeout', criado_em: isoAtHour(2, 2) },
]

export const SESSION = {
  access_token: 'preview-token',
  user: { id: USER_ID, email: 'owner@atomic.jp' },
}

export const PREVIEW_BAR = {
  id: BAR_ID,
  nome: 'Atomic',
  endereco: '2-14-5 Kabukicho, Shinjuku, Tokyo',
  telefone: '03-1234-5678',
}

export const SEED = {
  bars: [PREVIEW_BAR],
  perfis: [{ id: USER_ID, role: 'cliente', bar_id: BAR_ID, nome: 'Owner Atomic' }],
  produtos: PRODUTOS,
  produtos_public: PRODUTOS,
  bar_pos_config: [{
    bar_id: BAR_ID,
    hora_abertura: 18,
    hora_fechamento: 5,
    meta_faturamento_hora: 20000,
    auto_reorder_enabled: true,
    reorder_webhook_url: 'https://hook.eu2.make.com/preview',
    reorder_cooldown_horas: 24,
    reorder_multiplicador: 2,
    criar_pedido_jbm: true,
    drink_back_comissao_pct: 20,
  }],
  drink_menu: DRINKS,
  drink_menu_ingredientes: RECIPES,
  bar_pricing: PRICING,
  pos_vendas: POS_VENDAS,
  pos_vendas_itens: POS_ITENS,
  vip_members: [
    { id: 'vip-1', bar_id: BAR_ID, nome: 'Takeshi Mori', codigo: 'VIP-001', tier: 'gold', ativo: true },
    { id: 'vip-2', bar_id: BAR_ID, nome: 'Carla Souza', codigo: 'VIP-002', tier: 'standard', ativo: true },
  ],
  vip_usages: [],
  discount_codes: [
    { id: 'code-1', bar_id: BAR_ID, codigo: 'ATOMIC-NIGHT', descricao: 'Happy hour 18h-20h', tipo: 'percent', valor: 20, usos_atual: 12, max_usos: 100, ativo: true },
    { id: 'code-2', bar_id: BAR_ID, codigo: 'ATOMIC-500', descricao: '¥500 off', tipo: 'fixed', valor: 500, usos_atual: 3, ativo: true },
  ],
  discount_usages: [],
  bar_staff: STAFF,
  bar_staff_turnos: TURNOS,
  drink_back_agents: AGENTS,
  drink_back_comissoes: COMISSOES,
  service_orders: SERVICE_ORDERS,
  estoque_movimentos: MOVIMENTOS,
  estoque_regras: REGRAS,
  pos_reorder_requests: REORDER_REQUESTS,
  pedidos: [],
  pedidos_itens: [],
  notificacoes: [],
  vendas: [],
}

export const PREVIEW_NOW = today()
