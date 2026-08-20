import { fmtYen } from '../lib/format'

export default function CashflowPanel({ cf, title = '💸 Cashflow JBM Drinks (sync)' }) {
  if (!cf) return null
  const items = [
    ['Caixa líquido', cf.caixaLiquido, '#60a5fa'],
    ['A receber', cf.aReceber, '#4ade80'],
    ['A pagar', cf.aPagar, '#f87171'],
    ['Projetado 30d', cf.projetado30d, '#c19c56'],
  ]
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#c19c56', marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
        {items.map(([label, val, color]) => (
          <div key={label} className="card" style={{ padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color }}>{fmtYen(val)}</div>
          </div>
        ))}
      </div>
      {cf.faturasVencidas > 0 && (
        <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', fontSize: 12, color: '#f87171' }}>
          ⚠️ {cf.faturasVencidas} fatura(s) vencida(s) — total a receber {fmtYen(cf.aReceber)}
        </div>
      )}
      {cf.geradoEm && (
        <div style={{ marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
          Atualizado: {new Date(cf.geradoEm).toLocaleString('pt-BR')} · fonte: {cf.fonte}
        </div>
      )}
    </div>
  )
}
