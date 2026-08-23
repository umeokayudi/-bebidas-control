import ModalShell from './ModalShell'
import { fmtYen, fmtDate } from './utils'

export default function ComprasDetailModal({ open, onClose, compras, monthLabel: monthLbl, custoVendidos, creditoBar }) {
  if (!open) return null

  const totalCompras = (compras || []).reduce((a, c) => a + (+c.total_real || 0), 0)
  const sorted = [...(compras || [])].sort((a, b) => (a.data || '').localeCompare(b.data || ''))
  const diff = custoVendidos != null ? custoVendidos - totalCompras : 0
  const showDiff = custoVendidos != null && Math.abs(diff) >= 1

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={`Compras — ${monthLbl}`}
      subtitle={
        <>
          {sorted.length} compra(s) · Total pago {fmtYen(totalCompras)}
          {custoVendidos != null && <> · Custo dos itens vendidos {fmtYen(custoVendidos)}</>}
          {creditoBar > 0 && <> · Crédito bar {fmtYen(creditoBar)}</>}
        </>
      }
    >
          {showDiff && (
            <div style={{
              background: 'rgba(193,156,86,0.12)', border: '1px solid rgba(193,156,86,0.35)',
              borderRadius: 12, padding: '12px 14px', marginBottom: 14, fontSize: 12, lineHeight: 1.55,
              color: 'var(--text2)',
            }}>
              <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>
                Por que os valores são diferentes?
              </div>
              <div><strong>Compras pagas ({fmtYen(totalCompras)})</strong> — soma das notas de compra pagas neste mês.</div>
              <div style={{ marginTop: 4 }}>
                <strong>Custo dos itens vendidos ({fmtYen(custoVendidos)})</strong> — custo unitário de cada produto vendido,
                na data da venda. Esse valor entra no cálculo de lucro.
              </div>
              <div style={{ marginTop: 6, color: 'var(--text3)' }}>
                Diferença {fmtYen(Math.abs(diff))} {diff > 0 ? 'a mais' : 'a menos'} no custo vendido:
                estoque comprado mas ainda não vendido, produtos vendidos de compras anteriores,
                ou pequenas diferenças entre nota e custo unitário do catálogo.
              </div>
            </div>
          )}
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
    </ModalShell>
  )
}
