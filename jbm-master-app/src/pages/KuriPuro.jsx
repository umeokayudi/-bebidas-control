import { useState, useEffect } from 'react'
import { holdingSb } from '../lib/supabase'
import { fmtYen } from '../lib/format'

export default function KuriPuro() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await holdingSb.from('clients').select('*').eq('is_active', true).order('name')
    setClients(data || [])
    setLoading(false)
  }

  const revenue = clients.reduce((a, c) => a + Number(c.monthly_revenue || 0), 0)
  const cost = clients.reduce((a, c) => a + Number(c.monthly_cost || 0), 0)

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#60a5fa', marginBottom: 20 }}>🧹 KuriPuro</div>
      <div className="grid-3" style={{ marginBottom: 20 }}>
        {[['Receita/mês', revenue, '#c19c56'], ['Custo/mês', cost, '#f87171'], ['Lucro', revenue - cost, '#4ade80']].map(([l, v, c]) => (
          <div key={l} className="card" style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: c }}>{fmtYen(v)}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{l}</div></div>
        ))}
      </div>
      {loading ? <div>Carregando...</div> : clients.map(c => (
        <div key={c.id} className="card" style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 600 }}>{c.name}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{fmtYen(c.monthly_revenue)}/mês · custo {fmtYen(c.monthly_cost)}</div>
        </div>
      ))}
    </div>
  )
}
