/** Primitivos visuais do POS — mesma linguagem visual do portal do bar. */

import { fmtYen } from '../utils'

export function PosTabs({ options, value, onChange }) {
  return (
    <div className="pos-tabs">
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`pos-tab${value === opt.id ? ' active' : ''}`}
        >
          <span aria-hidden="true">{opt.icon}</span>
          <span>{opt.label}</span>
          {opt.badge > 0 && <span className="pos-tab-badge">{opt.badge}</span>}
        </button>
      ))}
    </div>
  )
}

export function StatTile({ label, value, sub, color = 'var(--navy)', icon, onClick }) {
  const clickable = typeof onClick === 'function'
  return (
    <div
      className={`pos-stat${clickable ? ' is-clickable' : ''}`}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      <div className="pos-stat-label">
        {icon && <span aria-hidden="true" style={{ marginRight: 6 }}>{icon}</span>}
        {label}
      </div>
      <div className="pos-stat-value" style={{ color }}>{value}</div>
      {sub && <div className="pos-stat-sub">{sub}</div>}
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

export function Card({ title, sub, children, headerRight, style }) {
  return (
    <div className="pos-card" style={style}>
      {(title || headerRight) && (
        <div className="pos-card-head">
          <div>
            {title && <div className="pos-card-title">{title}</div>}
            {sub && <div className="pos-card-sub">{sub}</div>}
          </div>
          {headerRight}
        </div>
      )}
      {children}
    </div>
  )
}

export function Field({ label, children, hint }) {
  return (
    <label className="pos-field">
      <span className="pos-field-label">{label}</span>
      {children}
      {hint && <span className="pos-field-hint">{hint}</span>}
    </label>
  )
}

export function Pill({ tone = 'neutral', children }) {
  return <span className={`pos-pill pos-pill-${tone}`}>{children}</span>
}

/**
 * Gráfico de barras por hora. Destaca pico (verde) e horas ociosas
 * (âmbar) para o dono ver o gargalo sem precisar ler a tabela.
 */
export function HourBars({ buckets, peaks = [], idles = [], height = 120, emptyLabel }) {
  const list = buckets || []
  const max = Math.max(...list.map(b => b.faturamento), 1)
  const peakSet = new Set(peaks.map(p => p.hora))
  const idleSet = new Set(idles.map(p => p.hora))

  if (!list.length) return <div className="pos-empty">{emptyLabel}</div>

  return (
    <div className="pos-hourbars" style={{ height: height + 46 }}>
      {list.map(b => {
        const h = b.faturamento > 0 ? Math.max(4, (b.faturamento / max) * height) : 3
        const tone = peakSet.has(b.hora) ? '#1a7a5e' : idleSet.has(b.hora) ? '#e6912c' : 'var(--navy)'
        return (
          <div key={b.hora} className="pos-hourbar">
            <div className="pos-hourbar-tip">
              {b.range} · {fmtYen(b.faturamento)} · {b.vendas} vendas
            </div>
            <div
              className="pos-hourbar-fill"
              style={{ height: `${h}px`, background: tone, opacity: b.faturamento > 0 ? 1 : 0.25 }}
            />
            <div className="pos-hourbar-label">{String(b.hora).padStart(2, '0')}</div>
          </div>
        )
      })}
    </div>
  )
}

export function EmptyState({ icon = '📭', text, action }) {
  return (
    <div className="pos-empty">
      <div style={{ fontSize: 28, marginBottom: 8 }} aria-hidden="true">{icon}</div>
      <div>{text}</div>
      {action}
    </div>
  )
}

export function Banner({ tone = 'amber', title, children, action }) {
  return (
    <div className={`pos-banner pos-banner-${tone}`}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div className="pos-banner-title">{title}</div>}
        {children && <div className="pos-banner-body">{children}</div>}
      </div>
      {action}
    </div>
  )
}
