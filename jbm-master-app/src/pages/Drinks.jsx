import { useState, useEffect } from 'react'
import { holdingSb } from '../lib/supabase'
import { fetchHoldingSnapshot } from '../lib/cashflowSync'
import { fmtYen, fmtPct } from '../lib/format'
import CashflowPanel from '../components/CashflowPanel'

export default function Drinks() {
  const [snap, setSnap] = useState(null)
  const [tab, setTab] = useState('overview')

  useEffect(() => {
    load()
    const iv = setInterval(load, 30_000)
    return () => clearInterval(iv)
  }, [])

  async function load() {
    setSnap(await fetchHoldingSnapshot(holdingSb))
  }

  const cf = snap?.drinks
  const receita = cf?.receitaMes ?? 0
  const custo = cf?.custoMes ?? 0
  const lucro = cf?.lucroMes ?? 0

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#4ade80' }}>🍾 JBM Drinks</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Dados sync bebidas-control</div>
      </div>

      <CashflowPanel cf={cf} title="💸 Cashflow real (Atomic + fornecedor)" />

      <div className="grid-4" style={{ marginBottom: 20 }}>
        {[['Receita mês', receita, '#c19c56'], ['Custo mês', custo, '#f87171'], ['Lucro', lucro, '#4ade80'], ['Margem', fmtPct(lucro, receita), '#60a5fa']].map(([label, val, color]) => (
          <div key={label} className="card" style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color, marginBottom: 4 }}>{typeof val === 'string' ? val : fmtYen(val)}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['overview', 'vendas', 'compras', 'faturas'].map(id => (
          <button key={id} type="button" onClick={() => setTab(id)} style={{ padding: '7px 14px', borderRadius: 20, border: '1px solid', borderColor: tab === id ? '#4ade80' : 'rgba(255,255,255,0.08)', background: tab === id ? 'rgba(74,222,128,0.1)' : 'none', color: tab === id ? '#4ade80' : 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer', textTransform: 'capitalize' }}>
            {id}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid-2">
          <RecentList title="Vendas recentes" items={cf?.recentes?.vendas} render={v => (<><div style={{ fontSize: 12 }}>{v.bar || '—'}</div><div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{v.data}</div></>)} amount={v => v.total} color="#c19c56" />
          <RecentList title="Compras recentes" items={cf?.recentes?.compras} render={c => (<><div style={{ fontSize: 12 }}>{c.fornecedor || '—'}</div><div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{c.data}</div></>)} amount={c => c.total} color="#f87171" />
        </div>
      )}

      {tab === 'vendas' && <RecentList title="Vendas" items={cf?.recentes?.vendas} wide render={v => (<><div style={{ fontSize: 13 }}>{v.bar || '—'}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{v.data}</div></>)} amount={v => v.total} color="#c19c56" />}
      {tab === 'compras' && <RecentList title="Compras" items={cf?.recentes?.compras} wide render={c => (<><div style={{ fontSize: 13 }}>{c.fornecedor || '—'}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{c.data} · {c.pagamento || ''}</div></>)} amount={c => c.total} color="#f87171" />}
      {tab === 'faturas' && <RecentList title="Faturas" items={cf?.recentes?.faturas} wide render={f => (<><div style={{ fontSize: 13 }}>{f.bar || '—'}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{f.vencimento} · {f.status}</div></>)} amount={f => f.valor} color="#c19c56" />}
    </div>
  )
}

function RecentList({ title, items = [], render, amount, color, wide }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 12 }}>{title}</div>
      {(items || []).length === 0 && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Sem dados</div>}
      {(items || []).map((item, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div>{render(item)}</div>
          <div style={{ fontSize: wide ? 14 : 13, fontWeight: 600, color }}>{fmtYen(amount(item))}</div>
        </div>
      ))}
    </div>
  )
}
