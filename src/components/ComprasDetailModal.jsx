import { fmtYen, fmtDate } from './utils'

export default function ComprasDetailModal({ open, onClose, compras, monthLabel: monthLbl, custoVendidos, creditoBar }) {
  if (!open) return null

  const totalCompras = (compras || []).reduce((a, c) => a + (+c.total_real || 0), 0)
  const sorted = [...(compras || [])].sort((a, b) => (a.data || '').localeCompare(b.data || ''))

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,16,40,0.55)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg2)', borderRadius: 16, width: '100%', maxWidth: 640,
          maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,16,40,0.3)',
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>
            Compras — {monthLbl}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6, lineHeight: 1.6 }}>
            {sorted.length} compra(s) · Total pago {fmtYen(totalCompras)}
            {custoVendidos != null && (
              <> · Custo dos itens vendidos {fmtYen(custoVendidos)}</>
            )}
            {creditoBar > 0 && (
              <> · Crédito bar {fmtYen(creditoBar)}</>
            )}
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: '12px 16px 20px' }}>
          {sorted.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text3)', fontSize: 13 }}>
              Nenhuma compra neste mês
            </div>
          ) : sorted.map(c => (
            <div
              key={c.id}
              style={{
                border: '1px solid var(--border)', borderRadius: 12,
                padding: '14px 16px', marginBottom: 10, background: 'var(--bg3)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>{c.fornecedor || '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                    {fmtDate(c.data)} · {c.pagamento || '—'}
                  </div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--red)', flexShrink: 0 }}>
                  {fmtYen(c.total_real)}
                </div>
              </div>
              {(c.compras_itens || []).length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                  {(c.compras_itens || []).map((it, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text2)', marginBottom: 3 }}>
                      <span>{it.nome || '?'}</span>
                      <span>{fmtYen(it.custo_unitario)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
