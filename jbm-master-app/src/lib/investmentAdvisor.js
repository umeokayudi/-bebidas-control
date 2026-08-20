/**
 * Advisor de investimentos JBM Holding — regras + prompts Gemini
 */
import { fmtYen } from './format'

const TODAY = () => new Date().toISOString().slice(0, 10)

function fmt(n) {
  return fmtYen(n)
}

export function analyzePortfolio(snap = {}, mods = {}) {
  const d = snap.drinks || {}
  const k = snap.kuripuro || {}
  const inv = mods.investments || {}
  const hr = mods.hr || {}
  const log = mods.logistics || {}

  const caixaGrupo = (d.caixaLiquido || 0) + (k.caixaLiquido || 0)
  const aReceber = (d.aReceber || 0) + (k.aReceber || 0) + (hr.commPending || 0) + (log.commPending || 0)
  const invested = inv.invested || 0
  const returned = inv.returned || 0
  const saldoInv = returned - invested

  const overdue = (inv.inv || []).filter(i =>
    i.status === 'ativo' && i.expected_return_date && i.expected_return_date < TODAY()
  )
  const negativeRoi = (inv.roi || []).filter(r => r.saldo < 0 && r.invested > 0)
  const strongRoi = (inv.roi || []).filter(r => r.invested > 0 && r.returned / r.invested >= 0.5)

  const alerts = []
  if (overdue.length) alerts.push({ type: 'warning', text: `${overdue.length} investimento(s) com retorno esperado vencido` })
  if (negativeRoi.length) alerts.push({ type: 'danger', text: `${negativeRoi.length} pessoa(s) com ROI negativo` })
  if ((d.faturasVencidas || 0) > 0) alerts.push({ type: 'warning', text: `${d.faturasVencidas} fatura(s) vencida(s) — Drinks` })
  if (caixaGrupo < 200000) alerts.push({ type: 'caution', text: 'Caixa do grupo abaixo de ¥200.000 — cautela em novos investimentos' })

  const recommendations = []

  if (strongRoi.length) {
    const top = [...strongRoi].sort((a, b) => b.returned / b.invested - a.returned / a.invested)[0]
    recommendations.push({
      action: 'priorizar',
      title: `Continuar investindo em ${top.name}`,
      reason: `ROI ${Math.round((top.returned / top.invested) * 100)}% — retorno comprovado na unidade ${top.unit || '—'}`,
      priority: 'alta',
    })
  }

  if (negativeRoi.length && caixaGrupo > 300000) {
    const worst = [...negativeRoi].sort((a, b) => a.saldo - b.saldo)[0]
    recommendations.push({
      action: 'revisar',
      title: `Reavaliar investimento em ${worst.name}`,
      reason: `Saldo ${fmt(worst.saldo)} — exigir plano de retorno antes de novo aporte`,
      priority: 'média',
    })
  }

  if (hr.commPending > 50000) {
    recommendations.push({
      action: 'oportunidade',
      title: 'HR com comissões pendentes altas',
      reason: `${fmt(hr.commPending)} a receber — investir em colocações pode acelerar retorno`,
      priority: 'alta',
    })
  }

  if (log.commPending > 30000) {
    recommendations.push({
      action: 'oportunidade',
      title: 'Logística gerando comissões',
      reason: `${fmt(log.commPending)} pendente — equipamento/formação pode escalar entregas`,
      priority: 'média',
    })
  }

  if (caixaGrupo > 500000 && invested < returned * 1.5) {
    recommendations.push({
      action: 'expandir',
      title: 'Capital disponível para formação',
      reason: `Caixa ~${fmt(caixaGrupo)} + a receber ${fmt(aReceber)} — portfolio retornando bem`,
      priority: 'média',
    })
  }

  if (!recommendations.length) {
    recommendations.push({
      action: 'monitorar',
      title: 'Manter portfolio atual',
      reason: 'Sem sinais urgentes — registre retornos semanalmente',
      priority: 'baixa',
    })
  }

  let verdict = 'neutral'
  let headline = 'Portfolio estável — revise retornos pendentes'
  if (overdue.length || negativeRoi.length > 1) {
    verdict = 'caution'
    headline = 'Atenção: cobrar retornos antes de novos aportes'
  } else if (caixaGrupo < 150000) {
    verdict = 'hold'
    headline = 'Segurar novos investimentos — caixa apertado'
  } else if (strongRoi.length && caixaGrupo > 400000) {
    verdict = 'invest'
    headline = 'Bom momento para investir em quem já retorna'
  }

  return {
    verdict,
    headline,
    alerts,
    recommendations: recommendations.slice(0, 5),
    metrics: { caixaGrupo, aReceber, invested, returned, saldoInv, overdue: overdue.length, negativeRoi: negativeRoi.length },
    overdue,
    negativeRoi,
    strongRoi,
  }
}

export function buildInvestmentAIPrompt(analysis, context = {}) {
  const { snap = {}, mods = {} } = context
  const d = snap.drinks || {}
  const inv = mods.investments || {}
  const hr = mods.hr || {}
  const log = mods.logistics || {}

  const portfolioLines = (inv.roi || []).slice(0, 12).map(r =>
    `- ${r.name} (${r.unit || '?'}): investiu ${fmt(r.invested)}, retornou ${fmt(r.returned)}, saldo ${fmt(r.saldo)}`
  ).join('\n')

  return {
    system: `Você é o advisor de investimentos da JBM Holding (HR, Logística, KuriPuro, Drinks).
Responda em português do Brasil, direto e prático.
Com base nos dados reais do sistema, recomende:
1) Em QUEM investir (ou não) e por quê
2) Tipo de investimento (formação, equipamento, adiantamento)
3) Prioridade esta semana (alta/média/baixa)
4) Riscos de caixa
Use bullets claros. Máximo 400 palavras. Sem markdown headers.`,
    messages: [{
      role: 'user',
      content: `Análise portfolio JBM Holding (${TODAY()}):

CAIXA DRINKS: ${fmt(d.caixaLiquido || 0)} | A receber Drinks: ${fmt(d.aReceber || 0)}
Faturas vencidas: ${d.faturasVencidas || 0}

INVESTIMENTOS:
- Investido ativo: ${fmt(analysis.metrics.invested)}
- Retornado: ${fmt(analysis.metrics.returned)}
- Saldo líquido: ${fmt(analysis.metrics.saldoInv)}
- Atrasados (data retorno passou): ${analysis.metrics.overdue}
- ROI negativo: ${analysis.metrics.negativeRoi}

HR: comissões pendentes ${fmt(hr.commPending || 0)} | colocações ${(hr.placements || []).length}
Logística: comissões ${fmt(log.commPending || 0)} | jobs ${(log.jobs || []).length}

POR PESSOA:
${portfolioLines || '—'}

VEREDICTO REGRAS: ${analysis.headline}
ALERTAS: ${analysis.alerts.map(a => a.text).join('; ') || '—'}

Qual investimento fazer AGORA com o capital da holding? Seja específico (nome/unidade/tipo/valor sugerido).`,
    }],
  }
}

const DAILY_KEY = 'jbm_daily_report_date'

export function shouldShowDailyReport() {
  return localStorage.getItem(DAILY_KEY) !== TODAY()
}

export function markDailyReportShown() {
  localStorage.setItem(DAILY_KEY, TODAY())
}

export function buildDailyReportPrompt(snap = {}, mods = {}) {
  const analysis = analyzePortfolio(snap, mods)
  const d = snap.drinks || {}
  const k = snap.kuripuro || {}
  const hr = mods.hr || {}
  const log = mods.logistics || {}

  return {
    system: `Você gera o briefing diário da JBM Holding para o administrador.
Português do Brasil. Tom executivo, amigável. Estrutura:
• 1 frase de abertura (tom do dia)
• 3-5 bullets: caixa, a receber, investimentos, HR/logística, ação #1 do dia
• 1 alerta se houver risco
Sem markdown. Máx 250 palavras.`,
    messages: [{
      role: 'user',
      content: `Relatório diário ${TODAY()}:

Drinks receita mês: ${fmt(d.receitaMes || 0)} | lucro: ${fmt(d.lucroMes || 0)} | a receber: ${fmt(d.aReceber || 0)}
KuriPuro receita: ${fmt(k.receitaMes || 0)} | a receber: ${fmt(k.aReceber || 0)}
HR comissões pendentes: ${fmt(hr.commPending || 0)} | colocações ativas: ${(hr.placements || []).filter(p => p.status === 'active').length}
Logística receita: ${fmt(log.revenue || 0)} | comissões: ${fmt(log.commPending || 0)}
Investimentos: investido ${fmt(analysis.metrics.invested)} | retornado ${fmt(analysis.metrics.returned)}
Alertas: ${analysis.alerts.map(a => a.text).join('; ') || 'nenhum'}

Gere o briefing do dia.`,
    }],
  }
}

export const VERDICT_STYLE = {
  invest: { color: 'var(--green)', icon: '📈', label: 'Investir' },
  hold: { color: 'var(--amber)', icon: '⏸️', label: 'Segurar' },
  caution: { color: 'var(--red)', icon: '⚠️', label: 'Cautela' },
  neutral: { color: 'var(--blue)', icon: '📊', label: 'Estável' },
}

export const PRIORITY_COLOR = { alta: 'var(--red)', média: 'var(--amber)', baixa: 'var(--text3)' }
