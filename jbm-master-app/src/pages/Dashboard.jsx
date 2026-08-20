import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { holdingSb } from '../lib/supabase'
import { fetchHoldingSnapshot } from '../lib/cashflowSync'
import { loadHoldingModules } from '../lib/holdingModules'
import { fmtYen, fmtPct } from '../lib/format'
import CashflowPanel, { KuriPuroFinancePanel } from '../components/CashflowPanel'

const UNIT_LINKS = [
  { to: '/kuripuro', icon: '🧹', name: 'KuriPuro', color: '#60a5fa' },
  { to: '/drinks', icon: '🍾', name: 'JBM Drinks', color: '#4ade80' },
  { to: '/hr', icon: '👥', name: 'JBM HR', color: '#c19c56' },
  { to: '/logistica', icon: '🚚', name: 'Logística', color: '#a78bfa' },
  { to: '/investimentos', icon: '📈', name: 'Investimentos', color: '#34d399' },
  { to: '/financeiro', icon: '💴', name: 'Financeiro', color: '#fbbf24' },
]

export default function Dashboard() {
  const [snap, setSnap] = useState(null)
  const [mods, setMods] = useState(null)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    load()
    const clock = setInterval(() => setNow(new Date()), 1000)
    const refresh = setInterval(load, 30_000)
    return () => { clearInterval(clock); clearInterval(refresh) }
  }, [])

  async function load() {
    const [s, m] = await Promise.all([fetchHoldingSnapshot(holdingSb), loadHoldingModules()])
    setSnap(s)
    setMods(m)
  }

  const d = snap?.drinks || {}
  const k = snap?.kuripuro || {}
  const hr = mods?.hr || {}
  const log = mods?.logistics || {}
  const inv = mods?.investments || {}

  const totalRevenue = (d.receitaMes || 0) + (k.receitaMes || 0) + (hr.placementFees || 0) + (log.revenue || 0)
  const totalReceivable = (d.aReceber || 0) + (k.aReceber || 0) + (hr.commPending || 0) + (log.commPending || 0)
  const totalProfit = (d.lucroMes || 0) + (k.lucroAjustadoAgosto ?? k.lucroMes ?? 0) + (hr.placementFees || 0) + (log.revenue || 0) - (log.jobs?.reduce((a, j) => a + Number(j.cost || 0), 0) || 0)

  const cards = [
    { name: 'KuriPuro', icon: '🧹', color: '#60a5fa', revenue: k.receitaMes, profit: k.lucroAjustadoAgosto ?? k.lucroMes, sub: `A receber ${fmtYen(k.aReceber)}` },
    { name: 'JBM Drinks', icon: '🍾', color: '#4ade80', revenue: d.receitaMes, profit: d.lucroMes, sub: `A receber ${fmtYen(d.aReceber)}` },
    { name: 'JBM HR', icon: '👥', color: '#c19c56', revenue: hr.placementFees, profit: hr.placementFees, sub: `Comissões ${fmtYen(hr.commPending)}` },
    { name: 'Logística', icon: '🚚', color: '#a78bfa', revenue: log.revenue, profit: log.revenue, sub: `Comissões ${fmtYen(log.commPending)}` },
    { name: 'Investimentos', icon: '📈', color: '#34d399', revenue: inv.returned, profit: inv.returned - inv.invested, sub: `Investido ${fmtYen(inv.invested)}` },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#c19c56' }}>JBM Holding</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
            {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div style={{ fontSize: 36, fontWeight: 700, fontFamily: 'monospace' }}>{now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <CashflowPanel cf={d} title="🍾 JBM Drinks" color="#4ade80" />
        <KuriPuroFinancePanel kp={k} />
      </div>

      <div className="hero-banner" style={{ background: 'linear-gradient(135deg,rgba(193,156,86,0.15),rgba(193,156,86,0.03))', border: '1px solid rgba(193,156,86,0.2)', borderRadius: 20, padding: '24px 28px', marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 20 }}>
        {[['Receita grupo', totalRevenue, '#c19c56'], ['A receber total', totalReceivable, '#4ade80'], ['Lucro estimado', totalProfit, '#60a5fa'], ['ROI investido', fmtPct(inv.returned, inv.invested), '#34d399']].map(([label, val, color]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color }}>{typeof val === 'string' ? val : fmtYen(val)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {UNIT_LINKS.map(u => (
          <Link key={u.to} to={u.to} style={{ padding: '8px 14px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)', color: u.color, fontSize: 12, textDecoration: 'none', background: 'rgba(255,255,255,0.03)' }}>
            {u.icon} {u.name}
          </Link>
        ))}
        <a href="https://bebidas-control.vercel.app" target="_blank" rel="noreferrer" style={{ padding: '8px 14px', borderRadius: 20, border: '1px solid rgba(74,222,128,0.2)', color: '#4ade80', fontSize: 12, textDecoration: 'none' }}>
          ↗ Portal Drinks (operacional)
        </a>
      </div>

      <div className="grid-3" style={{ marginBottom: 20 }}>
        {cards.map(c => (
          <Link key={c.name} to={UNIT_LINKS.find(u => u.name === c.name)?.to || '/'} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 22 }}>{c.icon}</span>
                <div style={{ fontWeight: 600, fontSize: 15, color: c.color }}>{c.name}</div>
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 3 }}>RECEITA</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{fmtYen(c.revenue)}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{c.sub}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
