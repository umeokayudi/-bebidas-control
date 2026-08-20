import { useState, useEffect } from 'react'
import { holdingSb } from '../lib/supabase'
import { fmtYen } from '../lib/format'

export default function HR() {
  const [rows, setRows] = useState([])

  useEffect(() => {
    holdingSb.from('hr_placements').select('*').order('placement_date', { ascending: false }).then(({ data }) => setRows(data || []))
  }, [])

  const active = rows.filter(r => r.status === 'active')
  const pending = active.reduce((a, r) => a + Number(r.fee || 0), 0)

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#c19c56', marginBottom: 20 }}>👥 JBM HR</div>
      <div className="grid-3" style={{ marginBottom: 20 }}>
        {[['Ativos', active.length, '#60a5fa'], ['Fees pendentes', pending, '#fbbf24'], ['Total placements', rows.length, '#4ade80']].map(([l, v, c]) => (
          <div key={l} className="card" style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: c }}>{typeof v === 'number' && l !== 'Ativos' && l !== 'Total placements' ? fmtYen(v) : v}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{l}</div></div>
        ))}
      </div>
      {rows.map(r => (
        <div key={r.id} className="card" style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 600 }}>{r.candidate_name}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{r.position} @ {r.client_company} · {fmtYen(r.fee)} · {r.status}</div>
        </div>
      ))}
    </div>
  )
}
