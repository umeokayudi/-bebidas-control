import { useState, useEffect } from 'react'
import { callGeminiChat } from '../lib/ai'
import { buildDailyReportPrompt, markDailyReportShown } from '../lib/investmentAdvisor'
import { Modal, Btn } from '../lib/sharedUi'

export function DailyReportModal({ open, onClose, snap, mods }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !snap || !mods) return
    let cancelled = false
    setLoading(true)
    setText('')
    callGeminiChat({ ...buildDailyReportPrompt(snap, mods), maxOutputTokens: 800 })
      .then(result => { if (!cancelled) setText(result) })
      .catch(e => { if (!cancelled) setText(`Não foi possível gerar: ${e.message}`) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, snap, mods])

  function dismiss() {
    markDailyReportShown()
    onClose()
  }

  return (
    <Modal open={open} title="📋 Relatório do dia" onClose={dismiss} wide>
      {loading && <div style={{ color: 'var(--text2)', fontSize: 13, padding: 20, textAlign: 'center' }}>Gerando briefing com IA…</div>}
      {text && !loading && (
        <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap', marginBottom: 16 }}>{text}</div>
      )}
      {!loading && <Btn onClick={dismiss}>Entendi — começar o dia</Btn>}
    </Modal>
  )
}

export function DailyReportBanner({ snap, mods, onOpenFull }) {
  const d = snap?.drinks || {}
  const inv = mods?.investments || {}
  const alerts = []
  if ((d.faturasVencidas || 0) > 0) alerts.push(`${d.faturasVencidas} fatura(s) vencida(s)`)
  if (inv.invested > 0 && inv.returned < inv.invested) {
    alerts.push(`Investimentos: ${Math.round((inv.returned / inv.invested) * 100)}% recuperado`)
  }

  return (
    <div className="hero-banner daily-banner">
      <div style={{ flex: 1 }}>
        <div className="text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, fontSize: 11 }}>Briefing diário</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
        {alerts.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--amber)' }}>⚠ {alerts.join(' · ')}</div>
        )}
      </div>
      <button type="button" className="btn btn-primary" onClick={onOpenFull}>Abrir relatório IA</button>
    </div>
  )
}
