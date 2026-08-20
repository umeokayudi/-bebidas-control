import { useState, useEffect } from 'react'
import { holdingSb } from '../lib/supabase'
import { fetchHoldingSnapshot } from '../lib/cashflowSync'
import { fmtYen, fmtPct } from '../lib/format'
import CashflowPanel, { KuriPuroFinancePanel } from '../components/CashflowPanel'

export default function Dashboard() {
  const [snap, setSnap] = useState(null)
  const [hr, setHr] = useState({ placements: 0, revenue: 0 })
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    load()
    const clock = setInterval(() => setNow(new Date()), 1000)
    const refresh = setInterval(load, 30_000)
    return () => { clearInterval(clock); clearInterval(refresh) }
  }, [])

  async function load() {
    setLoading(true)
    const s = await fetchHoldingSnapshot(holdingSb)
    setSnap(s)
    const { data } = await holdingSb.from('hr_placements').select('fee').eq('status', 'active')
    setHr({
      placements: (data || []).length,
      revenue: (data || []).reduce((a, p) => a + Number(p.fee || 0), 0),
    })
    setLoading(false)
  }

  const d = snap?.drinks || {}
  const k = snap?.kuripuro || {}
  const totalRevenue = (d.receitaMes || 0) + (k.receitaMes || 0) + hr.revenue
  const totalProfit = (d.lucroMes || 0) + (k.lucroMes || 0) + hr.revenue

  const cards = [
    { name: 'KuriPuro', icon: '🧹', color: '#60a5fa', revenue: k.receitaMes, profit: k.lucroMes, sub: `${k.clientesAtivos} clientes · ${k.funcionariosAtivos} staff` },
    { name: 'JBM Drinks', icon: '🍾', color: '#4ade80', revenue: d.receitaMes, profit: d.lucroMes, sub: `A receber ${fmtYen(d.aReceber)}` },
    { name: 'JBM HR', icon: '👥', color: '#c19c56', revenue: hr.revenue, profit: hr.revenue, sub: `${hr.placements} placements` },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#c19c56' }}>JBM Holding</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
            {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div style={{ fontSize: 36, fontWeight: 700, fontFamily: 'monospace', color: '#fff' }}>
          {now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <CashflowPanel cf={d} title="🍾 JBM Drinks" color="#4ade80" />
        <KuriPuroFinancePanel kp={k} />
      </div>

      <div style={{ background: 'linear-gradient(135deg,rgba(193,156,86,0.15),rgba(193,156,86,0.03))', border: '1px solid rgba(193,156,86,0.2)', borderRadius: 20, padding: '24px 28px', marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
        {[['Receita total', totalRevenue, '#c19c56'], ['Lucro total', totalProfit, '#4ade80'], ['Margem', fmtPct(totalProfit, totalRevenue), '#60a5fa']].map(([label, val, color]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 32, fontWeight: 800, color }}>{typeof val === 'string' ? val : fmtYen(val)}</div>
          </div>
        ))}
      </div>

      <div className="grid-3" style={{ marginBottom: 20 }}>
        {cards.map(c => (
          <div key={c.name} className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 22 }}>{c.icon}</span>
              <div style={{ fontWeight: 600, fontSize: 15, color: c.color }}>{c.name}</div>
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 3 }}>RECEITA</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{fmtYen(c.revenue)}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 3 }}>LUCRO</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#4ade80', marginBottom: 12 }}>{fmtYen(c.profit)}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {loading && <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Atualizando...</div>}
    </div>
  )
}
