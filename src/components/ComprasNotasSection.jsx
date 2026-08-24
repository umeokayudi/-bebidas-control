import { fmtYen, fmtDate, Empty, SectionTitle } from './utils'
import { flattenComprasItens } from '../lib/marginCost'

export default function ComprasNotasSection({ comprasMes, totalCompras, creditoBar, creditosBar }) {
  const sorted = [...(comprasMes || [])].sort((a, b) => (a.data || '').localeCompare(b.data || ''))
  const linhas = flattenComprasItens(comprasMes)
  const totalLinhas = linhas.reduce((a, r) => a + r.totalLinha, 0)

  if (!sorted.length) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <SectionTitle>Notas de compra — itens e custos</SectionTitle>
        <Empty text="Nenhuma compra neste mês" />
      </div>
    )
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <SectionTitle>Notas de compra — itens e custos</SectionTitle>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.55 }}>
        Valores das notas que você cadastrou: quantidade, custo unitário e total por linha.
        {totalLinhas !== totalCompras && (
          <span style={{ display: 'block', marginTop: 4, color: 'var(--amber)' }}>
            Soma das linhas {fmtYen(totalLinhas)} · total das notas {fmtYen(totalCompras)}
          </span>
        )}
      </div>

      {creditoBar > 0 && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(26,107,74,0.08)', fontSize: 12, color: 'var(--text2)' }}>
          Créditos pagos pelo bar: {(creditosBar || []).map(c => `${c.fornecedor} ${fmtYen(c.valor)}`).join(' · ')}
        </div>
      )}

      {sorted.map(c => {
        const itens = c.compras_itens || []
        const subLinhas = itens.reduce((a, it) => a + (+it.qtd || 0) * (+it.custo_unitario || 0), 0)
        return (
          <div
            key={c.id}
            style={{
              border: '1px solid var(--border)', borderRadius: 12,
              marginBottom: 14, overflow: 'hidden', background: 'var(--bg3)',
            }}
          >
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
              padding: '12px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>{c.fornecedor || '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  {fmtDate(c.data)} · {c.pagamento || '—'}
                  {+c.desconto_pontos > 0 && ` · pontos −${fmtYen(c.desconto_pontos)}`}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--red)' }}>{fmtYen(c.total_real)}</div>
                {itens.length > 0 && subLinhas !== +c.total_real && (
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>linhas {fmtYen(subLinhas)}</div>
                )}
              </div>
            </div>

            {itens.length === 0 ? (
              <div style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text3)' }}>
                Nota sem itens detalhados — valor total {fmtYen(c.total_real)}
              </div>
            ) : (
              <table style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th style={{ textAlign: 'right' }}>Qtd</th>
                    <th style={{ textAlign: 'right' }}>Custo unit.</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((it, i) => {
                    const qtd = +it.qtd || 0
                    const unit = +it.custo_unitario || 0
                    const total = qtd * unit
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{it.nome || '—'}</td>
                        <td style={{ textAlign: 'right' }}>{qtd || '—'}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{unit ? fmtYen(unit) : '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--red)' }}>{fmtYen(total)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )
      })}

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 16px', borderRadius: 12, background: 'rgba(155,44,44,0.08)',
        border: '1px solid rgba(155,44,44,0.2)', fontSize: 14, fontWeight: 800,
      }}>
        <span style={{ color: 'var(--navy)' }}>Total compras pagas ({sorted.length} nota{sorted.length === 1 ? '' : 's'})</span>
        <span style={{ color: 'var(--red)' }}>{fmtYen(totalCompras)}</span>
      </div>
    </div>
  )
}
