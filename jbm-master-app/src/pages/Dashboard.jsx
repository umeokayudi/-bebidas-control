import { useState, useEffect } from 'react'
import { holdingSb } from '../lib/supabase'
import { fetchDrinksCashflow } from '../lib/cashflowSync'
import { fmtYen, fmtPct } from '../lib/format'
import CashflowPanel from '../components/CashflowPanel'

export default function Dashboard() {
  const [data, setData] = useState({
    kuriRevenue: 0, kuriProfit: 0, kuriEmployees: 0, kuriClients: 0,
    drinksRevenue: 0, drinksProfit: 0, hrPlacements: 0, hrRevenue: 0,
    totalRevenue: 0, totalProfit: 0,
  })
  const [cf, setCf] = useState(null)
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
    const cashflow = await fetchDrinksCashflow(holdingSb)
    setCf(cashflow)

    const [clientsR, employeesR, hrR] = await Promise.all([
      holdingSb.from('clients').select('monthly_revenue,monthly_cost').eq('is_active', true),
      holdingSb.from('employees').select('id').eq('is_active', true),
      holdingSb.from('hr_placements').select('*').eq('status', 'active'),
    ])

    const kuriRevenue = (clientsR.data || []).reduce((a, c) => a + Number(c.monthly_revenue || 0), 0)
    const kuriCost = (clientsR.data || []).reduce((a, c) => a + Number(c.monthly_cost || 0), 0)
    const kuriProfit = kuriRevenue - kuriCost
    const drinksRevenue = cashflow.receitaMes
    const drinksProfit = cashflow.lucroMes
    const hrRevenue = (hrR.data || []).reduce((a, p) => a + Number(p.fee || 0), 0)

    setData({
      kuriRevenue, kuriProfit,
      kuriEmployees: (employeesR.data || []).length,
      kuriClients: (clientsR.data || []).length,
      drinksRevenue, drinksProfit,
      hrPlacements: (hrR.data || []).length,
      hrRevenue,
      totalRevenue: kuriRevenue + drinksRevenue + hrRevenue,
      totalProfit: kuriProfit + drinksProfit + hrRevenue,
    })
    setLoading(false)
  }

  const cards = [
    { name: 'KuriPuro', icon: '🧹', color: '#60a5fa', revenue: data.kuriRevenue, profit: data.kuriProfit, sub: `${data.kuriClients} clientes · ${data.kuriEmployees} staff` },
    { name: 'JBM Drinks', icon: '🍾', color: '#4ade80', revenue: data.drinksRevenue, profit: data.drinksProfit, sub: 'Sync bebidas-control' },
    { name: 'JBM HR', icon: '👥', color: '#c19c56', revenue: data.hrRevenue, profit: data.hrRevenue, sub: `${data.hrPlacements} placements ativos` },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#c19c56', letterSpacing: -0.5 }}>JBM Holding</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
            {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div style={{ fontSize: 36, fontWeight: 700, fontFamily: 'monospace', color: '#fff' }}>
          {now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      <CashflowPanel cf={cf} />

      <div style={{ background: 'linear-gradient(135deg,rgba(193,156,86,0.15),rgba(193,156,86,0.03))', border: '1px solid rgba(193,156,86,0.2)', borderRadius: 20, padding: '24px 28px', marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
        {[['Receita total', data.totalRevenue, '#c19c56'], ['Lucro total', data.totalProfit, '#4ade80'], ['Margem', fmtPct(data.totalProfit, data.totalRevenue), '#60a5fa']].map(([label, val, color]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
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
