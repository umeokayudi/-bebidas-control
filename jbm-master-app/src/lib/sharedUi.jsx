import { fmtYen } from './format'

export function PageHeader({ icon, title, color, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
      <div className="page-title" style={{ color: color || 'var(--accent)' }}>{icon} {title}</div>
      {children}
    </div>
  )
}

export function StatGrid({ items }) {
  const cols = items.length >= 4 ? 'grid-4' : items.length === 2 ? 'grid-2' : 'grid-3'
  return (
    <div className={cols} style={{ marginBottom: 20 }}>
      {items.map(([label, value, color, fmt]) => (
        <div key={label} className="card" style={{ textAlign: 'center' }}>
          <div className="stat-value" style={{ color: color || 'var(--text)' }}>{fmt === 'yen' ? fmtYen(value) : value}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

export function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      {tabs.map(t => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)} style={{
          padding: '8px 16px', borderRadius: 20, border: '1px solid',
          borderColor: active === t.id ? 'var(--accent)' : 'var(--border)',
          background: active === t.id ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--surface)',
          color: active === t.id ? 'var(--accent)' : 'var(--text2)',
          fontSize: 12, fontWeight: active === t.id ? 600 : 500, cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}>{t.label}</button>
      ))}
    </div>
  )
}

export function StatusBadge({ status }) {
  const map = {
    pendente: 'var(--amber)', pago: 'var(--green)', ativo: 'var(--blue)', concluido: 'var(--green)',
    agendada: 'var(--blue)', realizada: 'var(--accent)', aprovada: 'var(--green)', recusada: 'var(--red)',
    cancelada: 'var(--red)', cancelado: 'var(--red)', quitado: 'var(--green)', cotacao: 'var(--purple)',
    parcial: 'var(--amber)',
  }
  return <span style={{ fontSize: 10, fontWeight: 700, color: map[status] || 'var(--text3)', textTransform: 'uppercase' }}>{status}</span>
}

export function Empty({ text = 'Nenhum registro' }) {
  return <div style={{ fontSize: 13, color: 'var(--text3)', padding: 32, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 'var(--radius)' }}>{text}</div>
}

export function Btn({ children, onClick, variant = 'primary' }) {
  if (variant === 'primary') return <button type="button" className="btn btn-primary" onClick={onClick}>{children}</button>
  if (variant === 'ghost') return <button type="button" className="btn" onClick={onClick} style={{ background: 'transparent', color: 'var(--text2)', marginTop: 6 }}>{children}</button>
  return <button type="button" className="btn" onClick={onClick}>{children}</button>
}

export function Field({ label, children }) {
  return (
    <label className="form-group">
      <label>{label}</label>
      {children}
    </label>
  )
}

export const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)', background: 'var(--surface2)',
  color: 'var(--text)', fontSize: 13, boxSizing: 'border-box',
  transition: 'border-color 0.2s, box-shadow 0.2s',
}

export function Modal({ open, title, onClose, children, wide = false }) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card modal-card" style={{ maxWidth: wide ? 640 : 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 16 }}>{title}</div>
        {children}
      </div>
    </div>
  )
}
