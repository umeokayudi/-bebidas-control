import { fmtYen } from '../lib/format'

export default function CashflowPanel({ cf, title = '💸 Cashflow', color = 'var(--accent)' }) {
  if (!cf) return null
  const items = cf.items || [
    ['Caixa líquido', cf.caixaLiquido, 'var(--blue)'],
    ['A receber', cf.aReceber, 'var(--green)'],
    ...(cf.aPagarAtrasado > 0 ? [['Atrasado', cf.aPagarAtrasado, 'var(--red)']] : []),
    ...(cf.aPagarFuturo > 0 ? [['A pagar', cf.aPagarFuturo, 'var(--amber)']] : cf.aPagar > 0 ? [['A pagar', cf.aPagar, 'var(--red)']] : []),
    ['Projetado 30d', cf.projetado30d, color],
  ]
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
        {items.map(([label, val, c]) => (
          <div key={label} className="card" style={{ padding: 14, textAlign: 'center' }}>
            <div className="text-muted" style={{ fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{fmtYen(val)}</div>
          </div>
        ))}
      </div>
      {cf.faturasVencidas > 0 && (
        <div className="alert-banner alert-danger" style={{ marginTop: 10 }}>
          ⚠️ {cf.faturasVencidas} fatura(s) vencida(s)
        </div>
      )}
    </div>
  )
}

export function KuriPuroFinancePanel({ kp }) {
  if (!kp) return null
  const items = [
    ['Receita/mês', kp.receitaMes, 'var(--accent)'],
    ['A receber', kp.aReceber || kp.aReceberAtomic, 'var(--green)'],
    ['Lucro/mês', kp.lucroMes ?? kp.lucroAjustadoAgosto, 'var(--blue)'],
    ['Caixa', kp.caixaLiquido || 0, 'var(--amber)'],
  ]
  return (
    <div style={{ marginBottom: 20 }}>
      <CashflowPanel title="🧹 KuriPuro — Financeiro" color="var(--blue)" cf={{ items }} />
      {(kp.atomicFaturas || []).length > 0 && (
        <div className="text-muted" style={{ marginTop: 8 }}>
          Atomic: {(kp.atomicFaturas || []).map(f => `${f.mes?.slice(5) || '?'} ¥${Math.round(f.valor || 0).toLocaleString('ja-JP')}`).join(' · ')}
        </div>
      )}
    </div>
  )
}
