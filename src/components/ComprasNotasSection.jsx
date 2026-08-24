import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtYen, fmtDate, Empty, RowActions } from './utils'
import { PortalSurface } from './ui/PageLayout'

function NotaBlock({ compra, onChanged }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const itens = compra.compras_itens || []
  const subLinhas = itens.reduce((a, it) => a + (+it.qtd || 0) * (+it.custo_unitario || 0), 0)

  function startEdit() {
    setForm({
      data: compra.data || '',
      fornecedor: compra.fornecedor || '',
      total_real: compra.total_real || compra.total_pago || 0,
      status_pagamento: compra.status_pagamento || 'pago',
      data_pagamento: compra.data_pagamento || '',
    })
    setEditing(true)
    setOpen(true)
  }

  async function saveEdit() {
    setSaving(true)
    await supabase.from('compras').update({
      data: form.data,
      fornecedor: form.fornecedor,
      total_real: +form.total_real,
      total_pago: +form.total_real,
      status_pagamento: form.status_pagamento,
      data_pagamento: form.data_pagamento || null,
    }).eq('id', compra.id)
    setSaving(false)
    setEditing(false)
    onChanged?.()
  }

  async function remove() {
    if (!confirm(`Excluir nota ${compra.fornecedor} (${fmtYen(compra.total_real)})?`)) return
    await supabase.from('compras').delete().eq('id', compra.id)
    onChanged?.()
  }

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 10,
      marginBottom: 8, overflow: 'hidden', background: 'var(--bg3)',
    }}>
      <div style={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        padding: '10px 14px', background: 'var(--bg2)',
      }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0,
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{compra.fornecedor || '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
              {fmtDate(compra.data)} · {itens.length} item(ns)
              {compra.status_pagamento === 'pendente' && ' · pendente'}
              {+compra.desconto_pontos > 0 && ` · pontos −${fmtYen(compra.desconto_pontos)}`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--red)' }}>{fmtYen(compra.total_real)}</span>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>{open ? '▲' : '▼'}</span>
          </div>
        </button>
        <RowActions onEdit={startEdit} onDelete={remove} />
      </div>

      {editing && (
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div><label className="form-label">Data</label><input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} /></div>
            <div><label className="form-label">Fornecedor</label><input value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} /></div>
            <div><label className="form-label">Total (¥)</label><input type="number" value={form.total_real} onChange={e => setForm(f => ({ ...f, total_real: e.target.value }))} /></div>
            <div><label className="form-label">Status pag.</label>
              <select value={form.status_pagamento} onChange={e => setForm(f => ({ ...f, status_pagamento: e.target.value }))}>
                <option value="pago">Pago</option>
                <option value="pendente">Pendente</option>
              </select>
            </div>
            <div><label className="form-label">Data pagamento</label><input type="date" value={form.data_pagamento || ''} onChange={e => setForm(f => ({ ...f, data_pagamento: e.target.value }))} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditing(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>Cancelar</button>
            <button className="btn-primary" onClick={saveEdit} disabled={saving} style={{ padding: '8px 14px', borderRadius: 8 }}>{saving ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
      )}

      {open && !editing && (
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

export default function ComprasNotasSection({ comprasMes, totalCompras, creditoBar, creditosBar, onChanged }) {
  const sorted = [...(comprasMes || [])].sort((a, b) => (a.data || '').localeCompare(b.data || ''))

  if (!sorted.length) {
    return (
      <PortalSurface title="Notas de compra">
        <Empty text="Nenhuma compra neste mês" />
      </PortalSurface>
    )
  }

  return (
    <PortalSurface
      title="Notas de compra"
      headerRight={<span style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>{fmtYen(totalCompras)}</span>}
    >
      {creditoBar > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, padding: '10px 12px', background: 'var(--bg3)', borderRadius: 8 }}>
          Pago direto pelo bar (abate fatura): {fmtYen(creditoBar)}
          {creditosBar?.length > 0 && creditosBar.map((c, i) => (
            <div key={i} style={{ marginTop: 4 }}>{c.label}: {fmtYen(c.valor)}</div>
          ))}
        </div>
      )}
      {sorted.map(c => (
        <NotaBlock key={c.id} compra={c} onChanged={onChanged} />
      ))}
    </PortalSurface>
  )
}
