import { useState, useEffect } from 'react'
import { holdingSb } from '../lib/supabase'
import { fmtYen } from '../lib/format'

export default function Saques() {
  const [rows, setRows] = useState([])

  useEffect(() => {
    holdingSb.from('withdrawals').select('*').order('date', { ascending: false }).limit(30).then(({ data }) => setRows(data || []))
  }, [])

  const total = rows.reduce((a, r) => a + Number(r.amount || 0), 0)

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#f87171', marginBottom: 20 }}>💸 Saques</div>
      <div className="card" style={{ marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>TOTAL</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#f87171' }}>{fmtYen(total)}</div>
      </div>
      {rows.map(r => (
        <div key={r.id} className="card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
          <div><div style={{ fontWeight: 600 }}>{r.description}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{r.date} · {r.category}</div></div>
          <div style={{ fontWeight: 700, color: '#f87171' }}>{fmtYen(r.amount)}</div>
        </div>
      ))}
    </div>
  )
}
