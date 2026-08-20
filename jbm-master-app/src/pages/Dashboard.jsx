import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { holdingSb } from '../lib/supabase'
import { fetchHoldingSnapshot } from '../lib/cashflowSync'
import { loadHoldingModules } from '../lib/holdingModules'
import { fmtYen, fmtPct } from '../lib/format'
import CashflowPanel, { KuriPuroFinancePanel } from '../components/CashflowPanel'
import { DailyReportBanner } from '../components/DailyReport'

const UNIT_LINKS = [
  { to: '/kuripuro', icon: '🧹', name: 'KuriPuro', color: 'var(--blue)' },
  { to: '/drinks', icon: '🍾', name: 'JBM Drinks', color: 'var(--green)' },
  { to: '/hr', icon: '👥', name: 'JBM HR', color: 'var(--accent)' },
  { to: '/logistica', icon: '🚚', name: 'Logística', color: 'var(--purple)' },
  { to: '/investimentos', icon: '📈', name: 'Investimentos', color: 'var(--green)' },
  { to: '/financeiro', icon: '💴', name: 'Financeiro', color: 'var(--amber)' },
]

export default function Dashboard({ onOpenDailyReport }) {
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
  const totalProfit = (d.lucroMes || 0) + (k.lucroMes || 0) + (hr.placementFees || 0) + (log.revenue || 0) - (log.jobs?.reduce((a, j) => a + Number(j.cost || 0), 0) || 0)

  const cards = [
    { name: 'KuriPuro', icon: '🧹', color: 'var(--blue)', revenue: k.receitaMes, sub: `A receber ${fmtYen(k.aReceber)}` },
    { name: 'JBM Drinks', icon: '🍾', color: 'var(--green)', revenue: d.receitaMes, sub: `A receber ${fmtYen(d.aReceber)}` },
    { name: 'JBM HR', icon: '👥', color: 'var(--accent)', revenue: hr.placementFees, sub: `Comissões ${fmtYen(hr.commPending)}` },
    { name: 'Logística', icon: '🚚', color: 'var(--purple)', revenue: log.revenue, sub: `Comissões ${fmtYen(log.commPending)}` },
    { name: 'Investimentos', icon: '📈', color: 'var(--green)', revenue: inv.returned, sub: `Investido ${fmtYen(inv.invested)}` },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title" style={{ color: 'var(--accent)' }}>JBM Holding</div>
          <div className="text-muted">
            {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div style={{ fontSize: 36, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text)' }}>
          {now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {snap && mods && onOpenDailyReport && (
        <DailyReportBanner snap={snap} mods={mods} onOpenFull={onOpenDailyReport} />
      )}

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <CashflowPanel cf={d} title="🍾 JBM Drinks" color="var(--green)" />
        <KuriPuroFinancePanel kp={k} />
      </div>

      <div className="hero-banner" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 20 }}>
        {[['Receita grupo', totalRevenue, 'var(--accent)'], ['A receber total', totalReceivable, 'var(--green)'], ['Lucro estimado', totalProfit, 'var(--blue)'], ['ROI investido', fmtPct(inv.returned, inv.invested), 'var(--green)']].map(([label, val, color]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div className="text-muted" style={{ textTransform: 'uppercase', marginBottom: 6, fontSize: 11 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color }}>{typeof val === 'string' ? val : fmtYen(val)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '20px 0' }}>
        {UNIT_LINKS.map(u => (
          <Link key={u.to} to={u.to} className="unit-link" style={{ color: u.color }}>{u.icon} {u.name}</Link>
        ))}
        <a href="https://bebidas-control.vercel.app" target="_blank" rel="noreferrer" className="unit-link" style={{ color: 'var(--green)' }}>
          ↗ Portal Drinks
        </a>
        <Link to="/investimentos" className="unit-link" style={{ color: 'var(--green)' }}>🤖 Advisor investimentos</Link>
      </div>

      <div className="grid-3">
        {cards.map(c => (
          <Link key={c.name} to={UNIT_LINKS.find(u => u.name === c.name)?.to || '/'} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 22 }}>{c.icon}</span>
                <div style={{ fontWeight: 600, fontSize: 15, color: c.color }}>{c.name}</div>
              </div>
              <div className="text-muted" style={{ fontSize: 10, marginBottom: 3 }}>RECEITA</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{fmtYen(c.revenue)}</div>
              <div className="text-muted">{c.sub}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
