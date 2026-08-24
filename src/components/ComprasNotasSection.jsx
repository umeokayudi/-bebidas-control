import { useState } from 'react'
import { fmtYen, fmtDate, Empty } from './utils'
import { PortalSurface } from './ui/PageLayout'

function NotaBlock({ compra }) {
  const [open, setOpen] = useState(false)
  const itens = compra.compras_itens || []
  const subLinhas = itens.reduce((a, it) => a + (+it.qtd || 0) * (+it.custo_unitario || 0), 0)

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 10,
      marginBottom: 8, overflow: 'hidden', background: 'var(--bg3)',
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
          padding: '10px 14px', background: 'var(--bg2)', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{compra.fornecedor || '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
            {fmtDate(compra.data)} · {itens.length} item(ns)
            {+compra.desconto_pontos > 0 && ` · pontos −${fmtYen(compra.desconto_pontos)}`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--red)' }}>{fmtYen(compra.total_real)}</span>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        itens.length === 0 ? (
          <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text3)' }}>
            Sem itens detalhados{subLinhas !== +compra.total_real ? '' : ` · total ${fmtYen(compra.total_real)}`}
          </div>
        ) : (
          <table style={{ margin: 0, fontSize: 12 }}>
            <thead>
              <tr>
                <th>Produto</th>
                <th style={{ textAlign: 'right', width: 56 }}>Qtd</th>
                <th style={{ textAlign: 'right', width: 88 }}>Unit.</th>
                <th style={{ textAlign: 'right', width: 88 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((it, i) => {
                const qtd = +it.qtd || 0
                const unit = +it.custo_unitario || 0
                return (
                  <tr key={i}>
                    <td>{it.nome || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{qtd || '—'}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{unit ? fmtYen(unit) : '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--red)' }}>{fmtYen(qtd * unit)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )
      )}
    </div>
  )
}

export default function ComprasNotasSection({ comprasMes, totalCompras, creditoBar, creditosBar }) {
  const sorted = [...(comprasMes || [])].sort((a, b) => (a.data || '').localeCompare(b.data || ''))

  if (!sorted.length) {
    return (
      <PortalSurface title="Notas de compra">
        <Empty text="Nenhuma compra neste mês" />
      </PortalSurface>
    )
  }

  return (
    <PortalSurface title={`Notas de compra — ${sorted.length} nota(s)`} sub="Clique na nota para ver quantidade e custo de cada item.">

      {creditoBar > 0 && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(26,107,74,0.08)', fontSize: 12, color: 'var(--text2)' }}>
          Créditos bar: {(creditosBar || []).map(c => `${c.fornecedor} ${fmtYen(c.valor)}`).join(' · ')}
        </div>
      )}

      {sorted.map(c => <NotaBlock key={c.id} compra={c} />)}

      <div style={{
        display: 'flex', justifyContent: 'space-between', padding: '10px 14px',
        borderRadius: 10, background: 'rgba(155,44,44,0.08)', fontWeight: 800, fontSize: 14,
      }}>
        <span>Total pago</span>
        <span style={{ color: 'var(--red)' }}>{fmtYen(totalCompras)}</span>
      </div>
    </PortalSurface>
  )
}
