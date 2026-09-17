import { useState } from 'react'
import { fmtYen } from '../utils'

export function StatCard({ label, value, sub, color = 'var(--navy)', icon, onClick }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px',
        cursor: onClick ? 'pointer' : 'default', minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        {icon && <span style={{ fontSize: 16, opacity: 0.6 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export function StatGrid({ children, min = 150 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(${min}px,1fr))`, gap: 10, marginBottom: 20 }}>
      {children}
    </div>
  )
}

export function ModeButtons({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      {options.map(([id, label]) => (
        <button key={id} type="button" onClick={() => onChange(id)} style={{
          padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          background: value === id ? 'var(--navy)' : 'var(--bg3)', color: value === id ? '#fff' : 'var(--text2)', border: 'none',
        }}>{label}</button>
      ))}
    </div>
  )
}

export function PosModal({ open, title, onClose, children, width = 420 }) {
  if (!open) return null
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg2)', borderRadius: 20, padding: 24, width: '100%', maxWidth: width, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}
        onClick={e => e.stopPropagation()}
      >
        {title && <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>{title}</div>}
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: 10, ...style }}>
      {label && <label className="form-label">{label}</label>}
      {children}
    </div>
  )
}

export function Pill({ children, color = 'var(--navy)', bg = 'var(--bg3)' }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: bg, color, whiteSpace: 'nowrap' }}>{children}</span>
  )
}

/** Barras por hora (mesmo visual do gráfico do dashboard). */
export function HourBars({ rows, height = 90, valueLabel = fmtYen, highlightKey = 'isPeak', idleKey = 'isIdle' }) {
  const [active, setActive] = useState(null)
  if (!rows?.length) return null
  const max = Math.max(...rows.map(r => r.total), 1)
  return (
    <div className="chart-bars" style={{ height: height + 48, gap: 4 }}>
      {rows.map((r, i) => {
        const barH = Math.max(3, (r.total / max) * height * 0.85)
        const on = active === i
        const color = r[highlightKey] ? 'var(--gold)' : r[idleKey] ? '#c0392b' : '#1a6b4a'
        return (
          <div key={r.hour ?? i} className={`chart-bar-cell${on ? ' is-active' : ''}`} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
            <div className="chart-bar-tip">{r.label} · {valueLabel(r.total)} · {r.count}×{r.ticket ? ` · ${valueLabel(r.ticket)}` : ''}</div>
            <div className="chart-bar-value" style={{ fontSize: 9 }}>{r.total ? valueLabel(r.total) : ''}</div>
            <div className="chart-bar-fill" style={{ height: barH, background: color, opacity: on || r[highlightKey] ? 1 : 0.55 }} />
            <div className="chart-bar-label" style={{ fontSize: 10 }}>{r.label}</div>
          </div>
        )
      })}
    </div>
  )
}

export function fmtQty(n) {
  const v = +n || 0
  if (Number.isInteger(v)) return String(v)
  return (Math.round(v * 100) / 100).toString()
}

export function fmtPct(n) {
  return `${Math.round(+n || 0)}%`
}

export const STATUS_COLORS = {
  aberto: { color: '#8A5A00', bg: '#FDF3E0' },
  agendado: { color: '#1A4E8A', bg: '#EAF0FA' },
  em_andamento: { color: '#6b21a8', bg: '#f3e8ff' },
  concluido: { color: '#1A7A5E', bg: '#EAF5F0' },
  cancelado: { color: '#7a1d1d', bg: '#fdecec' },
  pendente: { color: '#8A5A00', bg: '#FDF3E0' },
  enviado: { color: '#1A7A5E', bg: '#EAF5F0' },
  erro: { color: '#7a1d1d', bg: '#fdecec' },
  sem_webhook: { color: '#5a5a4a', bg: '#f2ede4' },
  confirmado: { color: '#1A4E8A', bg: '#EAF0FA' },
  entregue: { color: '#1A7A5E', bg: '#EAF5F0' },
}

export function StatusPill({ status, label }) {
  const c = STATUS_COLORS[status] || { color: 'var(--text2)', bg: 'var(--bg3)' }
  return <Pill color={c.color} bg={c.bg}>{label || status}</Pill>
}
