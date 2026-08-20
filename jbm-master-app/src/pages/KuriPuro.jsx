import { useState, useEffect } from 'react'
import { holdingSb } from '../lib/supabase'
import { fetchHoldingSnapshot } from '../lib/cashflowSync'
import { fmtYen } from '../lib/format'
import CashflowPanel, { KuriPuroFinancePanel } from '../components/CashflowPanel'

export default function KuriPuro() {
  const [snap, setSnap] = useState(null)
  const [clients, setClients] = useState([])

  useEffect(() => {
    load()
    const iv = setInterval(load, 30_000)
    return () => clearInterval(iv)
  }, [])

  async function load() {
    const s = await fetchHoldingSnapshot(holdingSb)
    setSnap(s)
    const { data } = await holdingSb.from('clients').select('*').eq('is_active', true).order('name')
    setClients(data || [])
  }

  const k = snap?.kuripuro || {}
  const revenue = k.receitaMes ?? clients.reduce((a, c) => a + Number(c.monthly_revenue || 0), 0)
  const cost = k.custoMes ?? clients.reduce((a, c) => a + Number(c.monthly_cost || 0), 0)

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#60a5fa', marginBottom: 20 }}>🧹 KuriPuro</div>

      <KuriPuroFinancePanel kp={k} />

      <div className="grid-3" style={{ marginBottom: 20 }}>
        {[['Receita/mês', revenue, '#c19c56'], ['Custo/mês', cost, '#f87171'], ['Lucro', revenue - cost, '#4ade80']].map(([l, v, c]) => (
          <div key={l} className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: c }}>{fmtYen(v)}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Clientes ativos</div>
          {clients.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>custo {fmtYen(c.monthly_cost)}/mês</div>
              </div>
              <div style={{ fontWeight: 600, color: '#c19c56' }}>{fmtYen(c.monthly_revenue)}</div>
            </div>
          ))}
        </div>
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Lançamentos financeiros</div>
          {(k.lancamentos || []).length === 0 && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Sem lançamentos</div>}
          {(k.lancamentos || []).map((e, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <div style={{ fontSize: 12 }}>{e.description}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{e.date} · {e.category}</div>
              </div>
              <div style={{ fontWeight: 600, color: e.type === 'income' ? '#4ade80' : '#f87171' }}>
                {e.type === 'income' ? '+' : '-'}{fmtYen(e.amount)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
