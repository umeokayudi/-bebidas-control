import { filterSupplierVendas } from '../components/utils'
import { filterJbmDrinksFaturas, faturaPago, faturaRemaining, faturaValor } from './barPortal'
import {
  analyzePurchases,
  buildPricingMap,
  monthlyAccountSummary,
  monthlySpendSeries,
} from './clientAnalytics'

export async function fetchClientPortalSnapshot(supabase, bar) {
  const [vR, pedR, iR, bpR, fR, estR] = await Promise.all([
    supabase.from('vendas').select('*').eq('bar_id', bar.id).order('data', { ascending: false }).limit(400),
    supabase.from('pedidos').select('*').eq('bar_id', bar.id).order('criado_em', { ascending: false }).limit(80),
    supabase.from('vendas_itens').select('*, produtos(nome,categoria,preco_venda,volume_ml), vendas(data,bar_id,obs)').eq('vendas.bar_id', bar.id),
    supabase.from('bar_pricing').select('produto_id,drinks_por_garrafa,preco_drink').eq('bar_id', bar.id),
    supabase.from('faturas').select('*').eq('bar_id', bar.id).order('data_vencimento', { ascending: false }).limit(24),
    supabase.from('estoque').select('*, produtos(nome,categoria)').eq('bar_id', bar.id),
  ])

  const vendas = filterSupplierVendas(vR.data || [])
  const pedidos = pedR.data || []
  const itens = (iR.data || []).filter(i => i.vendas && filterSupplierVendas([i.vendas]).length)
  const barPricing = bpR.data || []
  const faturas = filterJbmDrinksFaturas(fR.data || [])
  const estoque = estR.data || []

  const pricingMap = buildPricingMap(barPricing)
  const mes = new Date().toISOString().slice(0, 7)
  const account = monthlyAccountSummary(vendas, faturas, mes)
  const projection = analyzePurchases(itens, pricingMap, { monthKey: mes })
  const { values: monthlySpend } = monthlySpendSeries(vendas, 6)

  const pendingFaturas = faturas.filter(f => f.status !== 'pago')
  const overdue = pendingFaturas.filter(f => {
    const venc = f.data_vencimento || f.periodo_fim
    return venc && new Date(venc) < new Date()
  })

  const topProducts = projection.products.slice(0, 8).map(p => ({
    nome: p.nome,
    qtd: p.qtd,
    jbm: p.jbmTotal,
    pos: p.posTotal,
    marginPct: p.marginPct,
  }))

  const lowStock = (estoque || [])
    .filter(e => (+e.qtd || 0) <= (+e.minimo || 3))
    .slice(0, 10)
    .map(e => ({ nome: e.produtos?.nome || '?', qtd: e.qtd, minimo: e.minimo }))

  return {
    bar: { id: bar.id, nome: bar.nome },
    mes,
    comprasMes: account.contaMes,
    comprasMesAnterior: account.contaPrev,
    crescimentoPct: account.growth,
    entregasMes: account.deliveries,
    faturaPendente: account.faturaPendente,
    faturaPagaMes: account.faturaPaga,
    faturasPendentes: pendingFaturas.length,
    faturasAtraso: overdue.length,
    totalPendente: pendingFaturas.reduce((a, f) => a + faturaRemaining(f), 0),
    projecaoPosMes: projection.posTotal,
    margemMes: projection.margin,
    margemPct: projection.marginPct,
    roiPct: projection.roiPct,
    topProducts,
    pedidosRecentes: pedidos.slice(0, 5).map(p => ({
      status: p.status,
      total: p.total,
      criado: p.criado_em?.slice(0, 10),
    })),
    gastoUltimos6Meses: monthlySpend,
    estoqueBaixo: lowStock,
    faturasResumo: faturas.slice(0, 6).map(f => ({
      status: f.status,
      total: faturaValor(f),
      pago: faturaPago(f),
      vencimento: f.data_vencimento || f.periodo_fim,
    })),
  }
}

export function buildClientChatSystem(snapshot) {
  const s = snapshot || {}
  return `Você é o assistente IA do portal do cliente JBM Drinks para o bar "${s.bar?.nome || 'cliente'}".
Responda em português, de forma clara e objetiva. Use os dados abaixo como fonte — não invente números.

DADOS ATUAIS (${s.mes || 'mês atual'}):
- Compras JBM no mês: ¥${Math.round(s.comprasMes || 0).toLocaleString('ja-JP')} (${s.entregasMes || 0} entregas)
- Crescimento vs mês anterior: ${s.crescimentoPct != null ? s.crescimentoPct + '%' : 'N/A'}
- Projeção de venda POS (mês): ¥${Math.round(s.projecaoPosMes || 0).toLocaleString('ja-JP')}
- Margem estimada: ¥${Math.round(s.margemMes || 0).toLocaleString('ja-JP')} (${s.margemPct || 0}%)
- ROI estimado: ${s.roiPct || 0}%
- Faturas pendentes: ${s.faturasPendentes || 0} (¥${Math.round(s.totalPendente || 0).toLocaleString('ja-JP')}) — ${s.faturasAtraso || 0} em atraso
- Fatura paga no mês: ¥${Math.round(s.faturaPagaMes || 0).toLocaleString('ja-JP')}

Top produtos (margem): ${JSON.stringify(s.topProducts || [])}
Pedidos recentes: ${JSON.stringify(s.pedidosRecentes || [])}
Estoque baixo: ${JSON.stringify(s.estoqueBaixo || [])}
Faturas recentes: ${JSON.stringify(s.faturasResumo || [])}
Gasto últimos 6 meses: ${JSON.stringify(s.gastoUltimos6Meses || [])}

Escopo: compras de bebidas, pedidos, entregas, faturas JBM, preços POS, margem e estoque do bar.
Não fale sobre dados de outros bares ou da holding. Se não souber, diga o que falta cadastrar (ex.: preços POS).`
}
