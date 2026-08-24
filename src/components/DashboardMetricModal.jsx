import ModalShell from './ModalShell'
import { fmtYen, fmtDate } from './utils'

function VendaRow({ v }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)', borderRadius: 12,
        padding: '12px 14px', marginBottom: 8, background: 'var(--bg3)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>
            {fmtDate(v.data)}
            {v.barNome && (
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: v.barCor || 'var(--text2)' }}>
                {v.barNome}
              </span>
            )}
          </div>
          {v.obs && (
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {v.obs}
            </div>
          )}
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)', flexShrink: 0 }}>
          {fmtYen(v.receita)}
        </div>
      </div>
    </div>
  )
}

export default function DashboardMetricModal({ open, onClose, type, monthLabel: monthLbl, stats }) {
  if (!open || !stats || type !== 'receita') return null

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={`Receita — ${monthLbl}`}
      subtitle={`${stats.totalVendas} venda(s) · Total ${fmtYen(stats.receitaMes)}`}
    >
      {stats.vendasDetalhe?.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text3)', fontSize: 13 }}>Nenhuma venda neste mês</div>
      ) : stats.vendasDetalhe.map(v => (
        <VendaRow key={v.id} v={v} />
      ))}
    </ModalShell>
  )
}
