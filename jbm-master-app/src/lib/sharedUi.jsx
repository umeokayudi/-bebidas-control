import { fmtYen } from './format'

export function PageHeader({ icon, title, color = '#c19c56', children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{icon} {title}</div>
      {children}
    </div>
  )
}

export function StatGrid({ items }) {
  return (
    <div className="grid-3" style={{ marginBottom: 20 }}>
      {items.map(([label, value, color, fmt]) => (
        <div key={label} className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color }}>{fmt === 'yen' ? fmtYen(value) : value}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{label}</div>
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
          padding: '7px 14px', borderRadius: 20, border: '1px solid',
          borderColor: active === t.id ? '#c19c56' : 'rgba(255,255,255,0.08)',
          background: active === t.id ? 'rgba(193,156,86,0.12)' : 'none',
          color: active === t.id ? '#c19c56' : 'rgba(255,255,255,0.45)',
          fontSize: 12, cursor: 'pointer',
        }}>{t.label}</button>
      ))}
    </div>
  )
}

export function StatusBadge({ status }) {
  const map = {
    pendente: '#fbbf24', pago: '#4ade80', ativo: '#60a5fa', concluido: '#4ade80',
    agendada: '#60a5fa', realizada: '#c19c56', aprovada: '#4ade80', recusada: '#f87171',
    cancelada: '#f87171', cancelado: '#f87171', quitado: '#4ade80', cotacao: '#a78bfa',
  }
  const c = map[status] || 'rgba(255,255,255,0.4)'
  return <span style={{ fontSize: 10, fontWeight: 700, color: c, textTransform: 'uppercase' }}>{status}</span>
}

export function Empty({ text = 'Nenhum registro' }) {
  return <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', padding: 20, textAlign: 'center' }}>{text}</div>
}

export function Btn({ children, onClick, variant = 'primary' }) {
  const bg = variant === 'primary' ? '#c19c56' : variant === 'danger' ? '#7f1d1d' : 'rgba(255,255,255,0.08)'
  const color = variant === 'ghost' ? 'rgba(255,255,255,0.7)' : '#060d18'
  return (
    <button type="button" onClick={onClick} style={{
      padding: '8px 16px', borderRadius: 10, border: 'none', background: bg, color: variant === 'ghost' ? color : '#060d18',
      fontWeight: 700, fontSize: 12, cursor: 'pointer',
    }}>{children}</button>
  )
}

export function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  )
}

export const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
  color: '#fff', fontSize: 13, boxSizing: 'border-box',
}

export function Modal({ open, title, onClose, children }) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 16 }}>{title}</div>
        {children}
      </div>
    </div>
  )
}
