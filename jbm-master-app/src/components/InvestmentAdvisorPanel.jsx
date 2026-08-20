import { useState } from 'react'
import toast from 'react-hot-toast'
import { callGeminiChat } from '../lib/ai'
import { analyzePortfolio, buildInvestmentAIPrompt, VERDICT_STYLE, PRIORITY_COLOR } from '../lib/investmentAdvisor'
import { Btn } from '../lib/sharedUi'

export default function InvestmentAdvisorPanel({ snap, mods, compact = false }) {
  const [aiText, setAiText] = useState('')
  const [loading, setLoading] = useState(false)

  const analysis = analyzePortfolio(snap, mods)
  const style = VERDICT_STYLE[analysis.verdict] || VERDICT_STYLE.neutral

  async function askAI() {
    setLoading(true)
    setAiText('')
    try {
      const prompt = buildInvestmentAIPrompt(analysis, { snap, mods })
      const text = await callGeminiChat(prompt)
      setAiText(text)
    } catch (e) {
      toast.error(e.message || 'Erro na IA')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="advisor-panel" style={{ borderColor: style.color }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            {style.icon} Advisor IA — {style.label}
          </div>
          <div style={{ fontSize: compact ? 15 : 18, fontWeight: 700, color: 'var(--text)' }}>{analysis.headline}</div>
        </div>
        <Btn onClick={askAI}>{loading ? 'Analisando…' : '🤖 Perguntar IA'}</Btn>
      </div>

      {analysis.alerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {analysis.alerts.map((a, i) => (
            <div key={i} className={`alert-banner alert-${a.type}`}>{a.text}</div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>Recomendações (dados reais)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {analysis.recommendations.map((r, i) => (
          <div key={i} className="card" style={{ padding: '12px 14px', marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{r.title}</div>
              <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLOR[r.priority] || 'var(--text3)', textTransform: 'uppercase' }}>{r.priority}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{r.reason}</div>
          </div>
        ))}
      </div>

      {aiText && (
        <div className="ai-response" style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8, fontWeight: 600 }}>🤖 Análise Gemini</div>
          <div style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{aiText}</div>
        </div>
      )}
    </div>
  )
}
