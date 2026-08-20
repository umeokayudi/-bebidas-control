import { fmtYen } from '../lib/format'

export default function CashflowPanel({ cf, title = '💸 Cashflow', color = '#c19c56' }) {
  if (!cf) return null
  const items = cf.items || [
    ['Caixa líquido', cf.caixaLiquido, '#60a5fa'],
    ['A receber', cf.aReceber, '#4ade80'],
    ['A pagar', cf.aPagar, '#f87171'],
    ['Projetado 30d', cf.projetado30d, color],
  ]
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
        {items.map(([label, val, c]) => (
          <div key={label} className="card" style={{ padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{fmtYen(val)}</div>
          </div>
        ))}
      </div>
      {cf.faturasVencidas > 0 && (
        <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', fontSize: 12, color: '#f87171' }}>
          ⚠️ {cf.faturasVencidas} fatura(s) vencida(s)
        </div>
      )}
    </div>
  )
}

export function KuriPuroFinancePanel({ kp }) {
  if (!kp) return null
  const items = [
    ['Receita/mês', kp.receitaMes, '#c19c56'],
    ['A receber', kp.aReceber || kp.aReceberAtomic, '#4ade80'],
    ['Lucro ajust. ago', kp.lucroAjustadoAgosto ?? kp.lucroMes, '#60a5fa'],
    ['Desc. OTP ago', kp.descontoOnThePlanetAgosto || 0, '#fbbf24'],
  ]
  return (
    <div style={{ marginBottom: 20 }}>
      <CashflowPanel title="🧹 KuriPuro — Financeiro" color="#60a5fa" cf={{ items }} />
      {(kp.atomicFaturas || []).length > 0 && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 8 }}>
          Atomic: {(kp.atomicFaturas || []).map(f => `${f.mes?.slice(5) || '?'} ¥${Math.round(f.valor || 0).toLocaleString('ja-JP')}`).join(' · ')}
        </div>
      )}
    </div>
  )
}
