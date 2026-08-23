import ModalShell from './ModalShell'
import { fmtYen, fmtDate } from './utils'

function SummaryRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
      <span style={{ color: 'var(--text2)' }}>{label}</span>
      <span style={{ fontWeight: 700, color: color || 'var(--navy)' }}>{value}</span>
    </div>
  )
}

function VendaRow({ v, showMargin }) {
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
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>{fmtYen(v.receita)}</div>
          {showMargin && (
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
              custo {fmtYen(v.custo)} · lucro{' '}
              <span style={{ color: v.lucro >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                {fmtYen(v.lucro)}
              </span>
              {v.margem != null && ` · ${v.margem}%`}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ProdutoRow({ p }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)', borderRadius: 12,
        padding: '12px 14px', marginBottom: 8, background: 'var(--bg3)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{p.nome}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{p.qtd} un.</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--green)' }}>{fmtYen(p.lucro)}</div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
            rec. {fmtYen(p.receita)} · custo {fmtYen(p.custo)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--gold)', marginTop: 2, fontWeight: 600 }}>
            margem {p.margem}% · markup {p.markup}%
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DashboardMetricModal({ open, onClose, type, monthLabel: monthLbl, stats }) {
  if (!open || !stats || !type) return null

  const titles = {
    receita: `Receita — ${monthLbl}`,
    lucro: `Lucro & margem — ${monthLbl}`,
    markup: `Margem por produto — ${monthLbl}`,
  }

  const subtitles = {
    receita: `${stats.totalVendas} venda(s) · Total ${fmtYen(stats.receitaMes)}`,
    lucro: `Lucro bruto ${fmtYen(stats.lucroMes)} (${stats.margem}%) · Receita ${fmtYen(stats.receitaMes)} − Custo ${fmtYen(stats.custoMes)}`,
    markup: `Markup médio ${stats.markup}% · ${stats.produtosDetalhe?.length || 0} produto(s) vendidos`,
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={titles[type]}
      subtitle={subtitles[type]}
      wide={type === 'markup' || type === 'lucro'}
    >
      {type === 'receita' && (
        <>
          {stats.vendasDetalhe?.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text3)', fontSize: 13 }}>Nenhuma venda neste mês</div>
          ) : stats.vendasDetalhe.map(v => (
            <VendaRow key={v.id} v={v} />
          ))}
        </>
      )}

      {type === 'lucro' && (
        <>
          <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--bg3)', marginBottom: 14 }}>
            <SummaryRow label="Receita" value={fmtYen(stats.receitaMes)} color="var(--navy)" />
            <SummaryRow label="Custo unitário (itens vendidos)" value={fmtYen(stats.custoMes)} color="var(--red)" />
            <SummaryRow label="Lucro bruto" value={fmtYen(stats.lucroMes)} color="var(--green)" />
            <SummaryRow label="Margem" value={`${stats.margem}%`} />
            {stats.creditoBar > 0 && (
              <>
                <div style={{ borderTop: '1px solid var(--border)', margin: '10px 0' }} />
                <SummaryRow label="Crédito bar (LM pago pelo Atomic)" value={`+${fmtYen(stats.creditoBar)}`} color="var(--green)" />
                <SummaryRow label="Lucro JBM" value={fmtYen(stats.lucroJbm)} color="var(--green)" />
              </>
            )}
          </div>

          {stats.porBar?.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Por bar
              </div>
              {stats.porBar.map(b => (
                <div key={b.id} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 8, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: 4 }}>
                    <span style={{ color: b.cor }}>{b.nome}</span>
                    <span style={{ color: 'var(--green)' }}>{fmtYen(b.lucro)}</span>
                  </div>
                  <div style={{ color: 'var(--text2)' }}>
                    {b.sales} venda(s) · Receita {fmtYen(b.receita)} · Custo {fmtYen(b.custo)} · Margem {b.receita > 0 ? Math.round(b.lucro / b.receita * 100) : 0}%
                  </div>
                </div>
              ))}
            </>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', margin: '14px 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Por entrega
          </div>
          {stats.vendasDetalhe?.map(v => (
            <VendaRow key={v.id} v={v} showMargin />
          ))}
        </>
      )}

      {type === 'markup' && (
        <>
          {stats.produtosDetalhe?.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text3)', fontSize: 13 }}>Nenhum produto vendido neste mês</div>
          ) : stats.produtosDetalhe.map((p, i) => (
            <ProdutoRow key={i} p={p} />
          ))}
        </>
      )}
    </ModalShell>
  )
}
