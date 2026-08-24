import { Component } from 'react'
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e.message } }
  render() {
    if (this.state.error) return <div style={{padding:20,color:'red',fontSize:14,background:'white',minHeight:'100vh'}}><h2>Error</h2><p>{this.state.error}</p></div>
    return this.props.children
  }
}

import { LogoSidebar } from './components/Logo'
import { MobileTopBar, ShellOverlay, useMobileMenuLock } from './components/MobileShell'
import { useNotifications, NotificationBell } from './components/Notifications'
import { useState, useEffect } from 'react'
import { AuthProvider, useAuth, LoginPage } from './components/Auth'
import { supabase } from './lib/supabase'
import ComprasTab   from './components/Compras'
import VendasTab    from './components/Vendas'
import RelatorioTab from './components/Relatorio'
import RyoshushoTab from './components/Ryoshusho'
import SeikyushoTab from './components/Seikyusho'
import EstoqueTab from './components/Estoque'
import PortalCliente from './components/PortalCliente'
import { ProductsTab, BarsTab, UsuariosTab } from './components/Configs'
import Fornecedores from './components/Fornecedores'
import Faturas from './components/Faturas'
import Cashflow from './components/Cashflow'
import AIAssistant from './components/AIAssistant'
import BusinessIntel from './components/BusinessIntel'
import BarFinanceAdmin from './components/BarFinanceAdmin'
import { PedidosAdminTab } from './components/Configs'
import { fmtYen, monthLabel, roleLabel } from './components/utils'
import UiPrefsPanel from './components/UiPrefsPanel'
import { UiPrefsProvider, useUiPrefs, LAYOUTS } from './lib/uiPrefs'
import { loadDashboard } from './lib/loadDashboard'

// ── TABS por role ─────────────────────────────────────────────────────────────
const ADMIN_TABS = [
  { id:'dashboard', label:'Dashboard'  },
  { id:'purchases',   label:'Purchases'  },
  { id:'sales',    label:'Sales'      },
  { id:'pedidos',   label:'Orders'     },
  { id:'relatorio', label:'Report'     },
  { id:'ryoshusho', label:'領収書'      },
  { id:'seikyusho', label:'請求書 IA'   },
  { id:'products',  label:'Products'   },
  { id:'bars',      label:'Bars'       },
  { id:'usuarios',  label:'Users'      },
  { id:'faturas',    label:'💰 Invoices '  },
  { id:'bi',         label:'📊 Reports'   },
  { id:'ai',         label:'🤖 AI'       },
  { id:'suppliers',  label:'Suppliers'  },
  { id:'cashflow',   label:'💸 Cash Flow' },
  { id:'barfinance', label:'🏛 Bar Finance' },
]

const STAFF_TABS = [
  { id:'purchases',   label:'Purchases'  },
  { id:'sales',    label:'Sales'      },
  { id:'relatorio', label:'Report'     },
  { id:'ryoshusho', label:'領収書'      },
  { id:'products',  label:'Products'   },
]

// ── MINI BAR CHART ────────────────────────────────────────────────────────────
function BarChart({ data, color='#c19c56', height=80, valueLabel=fmtYen }) {
  const [active, setActive] = useState(null)
  if (!data || data.length === 0) return null
  const max = Math.max(...data.map(d => d.value), 1)

  return (
    <div className="chart-bars" style={{ height: height + 48 }}>
      {data.map((d, i) => {
        const barH = Math.max(4, (d.value / max) * height * 0.85)
        const isLast = i === data.length - 1
        const isOn = active === i
        const tip = d.tip || `${d.month || d.label}: ${valueLabel(d.value)}`
        return (
          <div
            key={i}
            className={`chart-bar-cell${isOn ? ' is-active' : ''}`}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            <div className="chart-bar-tip">{tip}</div>
            <div className="chart-bar-value">{valueLabel(d.value)}</div>
            <div
              className="chart-bar-fill"
              style={{
                height: `${barH}px`,
                background: color,
                opacity: isOn || isLast ? 1 : 0.45,
              }}
            />
            <div className="chart-bar-label">{d.label}</div>
          </div>
        )
      })}
    </div>
  )
}

function MetricCard({ label, value, sub, color, border, onClick, hint }) {
  return (
    <div
      className={`metric-card${onClick ? ' metric-card-hover is-clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={border ? { borderTop: `3px solid ${border}` } : undefined}
    >
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={{ color, fontSize: 22 }}>{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
      {hint && <div className="metric-open-hint">{hint}</div>}
    </div>
  )
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function goToReport(onNav, month) {
  try { sessionStorage.setItem('relatorioMonth', month) } catch {}
  onNav('relatorio')
}

function Dashboard({ onNav }) {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [selMonth, setSelMonth] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (user) loadStats() }, [user])

  async function loadStats() {
    try {
      const payload = await loadDashboard()
      const mesAtual = new Date().toISOString().slice(0, 7)
      setData(payload)
      setSelMonth(prev => prev || (payload.months?.includes(mesAtual) ? mesAtual : payload.months?.[0]) || mesAtual)
    } catch (e) {
      console.error('loadStats error', e)
    } finally {
      setLoading(false)
    }
  }

  const m = data?.byMonth?.[selMonth]
  const lucroChart = (data?.chart || []).map(row => ({
    label: monthLabel(row.month).split('/')[0],
    month: monthLabel(row.month),
    value: row.lucro,
    tip: `${monthLabel(row.month)} · Lucro ${fmtYen(row.lucro)} · Rec. ${fmtYen(row.receita)} · Compras ${fmtYen(row.compras)}`,
  }))

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text2)' }}><span className="spinner" />Carregando...</div>
  if (!m) return null

  const mesAtual = new Date().toISOString().slice(0, 7)
  const isCurrentMonth = selMonth === mesAtual

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', letterSpacing: -0.5 }}>Dashboard</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            {isCurrentMonth ? 'Mês atual' : 'Histórico'} · {monthLabel(selMonth)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>Mês:</span>
          <select value={selMonth} onChange={e => setSelMonth(e.target.value)} style={{ width: 'auto', minWidth: 120 }}>
            {(data?.months || []).map(mon => <option key={mon} value={mon}>{monthLabel(mon)}</option>)}
          </select>
        </div>
      </div>

      {data.pedidosPendentes > 0 && (
        <div onClick={() => onNav('pedidos')} style={{
          background: 'linear-gradient(135deg,var(--navy),var(--navy2))',
          borderRadius: 12, padding: '12px 16px', marginBottom: 14, cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          border: '1px solid rgba(193,156,86,0.3)',
        }}>
          <div style={{ color: 'white', fontSize: 13, fontWeight: 600 }}>
            {data.pedidosPendentes} pedido(s) aguardando confirmação
          </div>
          <span style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 700 }}>Ver →</span>
        </div>
      )}

      <div className="grid3" style={{ marginBottom: 16 }}>
        <MetricCard
          label="Compras (notas)"
          value={fmtYen(m.compras)}
          sub={`${m.comprasCount} nota(s)`}
          color="var(--red)"
          border="var(--red)"
          onClick={() => goToReport(onNav, selMonth)}
          hint="Detalhes no Report →"
        />
        <MetricCard
          label="Receita"
          value={fmtYen(m.receita)}
          sub={`${m.vendasCount} venda(s)`}
          color="var(--navy)"
          border="#001028"
          onClick={() => goToReport(onNav, selMonth)}
          hint="Detalhes no Report →"
        />
        <MetricCard
          label="Lucro"
          value={fmtYen(m.lucro)}
          sub={`${m.margem}%${m.creditoBar > 0 ? ` · JBM ${fmtYen(m.lucroJbm)}` : ''}`}
          color="var(--green)"
          border="var(--green)"
          onClick={() => goToReport(onNav, selMonth)}
          hint="Detalhes no Report →"
        />
      </div>

      <div className="card chart-card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>Lucro — últimos 6 meses</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>Receita − compras pagas (valores das notas)</div>
        <BarChart data={lucroChart} color="#1a6b4a" height={64} />
      </div>

      <div className="card" style={{ padding: '14px 18px', marginBottom: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          Itens, quantidades e custos das notas ficam no <strong style={{ color: 'var(--navy)' }}>Report</strong>.
        </div>
        <button type="button" onClick={() => goToReport(onNav, selMonth)} className="btn-primary" style={{ padding: '8px 16px', borderRadius: 10, fontSize: 12 }}>
          Abrir Report — {monthLabel(selMonth)}
        </button>
      </div>

      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 12 }}>Ações rápidas</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[{ label: 'Nova compra', tab: 'purchases' }, { label: 'Registrar venda', tab: 'sales' }, { label: 'Pedidos', tab: 'pedidos' }, { label: '領収書', tab: 'ryoshusho' }].map(a => (
            <button key={a.tab} onClick={() => onNav(a.tab)} className="btn-primary" style={{ padding: '8px 16px', borderRadius: 10, fontSize: 12 }}>{a.label}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── SHELL ─────────────────────────────────────────────────────────────────────
function Shell() {
  const { user, perfil, loading, signOut } = useAuth()
  const { layout } = useUiPrefs()
  const [tab, setTab] = useState('dashboard')
  const [bar, setBar] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pedidosPendentes, setPedidosPendentes] = useState(0)
  const { notifs, unread, markRead, markAllRead, deleteNotif, deleteAll } = useNotifications()

  useMobileMenuLock(menuOpen)

  useEffect(() => {
    if (layout === LAYOUTS.desktop) setMenuOpen(false)
  }, [layout])

  function selectTab(id) {
    setTab(id)
    setMenuOpen(false)
  }

  useEffect(() => {
    if (perfil?.role === 'cliente' && perfil.bar_id) {
      supabase.from('bars').select('*').eq('id', perfil.bar_id).single()
        .then(({ data }) => setBar(data))
    }
    if (perfil?.role === 'admin') {
      supabase.from('pedidos').select('id', { count:'exact' }).eq('status','pendente')
        .then(({ count }) => setPedidosPendentes(count||0))
    }
  }, [perfil])

  if (loading || (user && !perfil)) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16,background:'var(--navy)'}}>
      <LogoSidebar />
      <span className="spinner"/>
    </div>
  )

  if (!user) return <LoginPage />

  // PORTAL DO CLIENTE
  if (perfil?.role === 'cliente') {
    if (!perfil.bar_id) {
      return (
        <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--navy)', color:'white', flexDirection:'column', gap:16, padding:24, textAlign:'center' }}>
          <LogoSidebar />
          <div style={{ fontSize:16, fontWeight:700 }}>Account not linked to a bar</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.55)', maxWidth:360, lineHeight:1.6 }}>
            Ask JBM admin to open <strong>Users</strong>, edit your account, set role <strong>Client</strong> and select your bar (e.g. Atomic Bar).
          </div>
          <button onClick={signOut} style={{ marginTop:8, padding:'10px 20px', borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'transparent', color:'white', cursor:'pointer' }}>Sign out</button>
        </div>
      )
    }
    if (!bar) return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--navy)',color:'white',flexDirection:'column',gap:16}}><LogoSidebar /><div style={{color:'rgba(255,255,255,0.5)',fontSize:13}}>Loading portal...</div></div>
    return <PortalCliente bar={bar} signOut={signOut} notifs={notifs} unread={unread} markRead={markRead} markAllRead={markAllRead} deleteNotif={deleteNotif} deleteAll={deleteAll}/>
  }

  // ADMIN / FUNCIONÁRIO
  const tabs = perfil?.role==='admin' ? ADMIN_TABS : STAFF_TABS
  if (tab==='dashboard' && perfil?.role!=='admin') setTab('purchases')

  return (
    <div className="app-shell">
      <ShellOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />
      <MobileTopBar
        open={menuOpen}
        onToggle={() => setMenuOpen(o => !o)}
      >
        <NotificationBell notifs={notifs} unread={unread} markRead={markRead} markAllRead={markAllRead} deleteNotif={deleteNotif} deleteAll={deleteAll} onNavigate={selectTab}/>
      </MobileTopBar>

      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <LogoSidebar />
        </div>
        <nav className="sidebar-nav">
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>selectTab(t.id)} className={`nav-item ${tab===t.id?'active':''}`}>
              <span style={{fontSize:13}}>{t.label}</span>
              {t.id==='pedidos'&&pedidosPendentes>0&&(
                <span style={{marginLeft:'auto',background:'var(--gold)',color:'var(--navy)',fontSize:10,fontWeight:800,padding:'1px 6px',borderRadius:10}}>{pedidosPendentes}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <div style={{width:34,height:34,borderRadius:10,background:'rgba(193,156,86,0.2)',border:'1px solid rgba(193,156,86,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:'var(--gold)',flexShrink:0}}>
              {(perfil?.nome||user.email||'U')[0].toUpperCase()}
            </div>
            <div style={{minWidth:0}}>
              <div style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,0.85)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{perfil?.nome||user.email}</div>
              <div style={{fontSize:10,color:'rgba(193,156,86,0.7)'}}>{roleLabel(perfil?.role)}</div>
            </div>
          </div>
          <div className="sidebar-footer-notifs">
            <NotificationBell notifs={notifs} unread={unread} markRead={markRead} markAllRead={markAllRead} deleteNotif={deleteNotif} deleteAll={deleteAll} onNavigate={selectTab}/>
          </div>
          <UiPrefsPanel />
          <button onClick={signOut} className="sidebar-signout">Sign out</button>
        </div>
      </aside>

      <main className="app-main">
        <div className="fade-in" key={tab}>
          {tab==='dashboard' && <Dashboard onNav={selectTab}/>}
          {tab==='purchases'   && <ComprasTab/>}
          {tab==='sales'    && <VendasTab/>}
          {tab==='pedidos'   && <PedidosAdminTab/>}
          {tab==='relatorio' && <RelatorioTab/>}
          {tab==='ryoshusho' && <RyoshushoTab/>}
          {tab==='seikyusho' && <SeikyushoTab/>}
          {tab==='products'  && <ProductsTab/>}
          {tab==='bars'      && <BarsTab/>}
          {tab==='usuarios'  && <UsuariosTab/>}
        {tab==='faturas'   && <Faturas />}
        {tab==='cashflow'   && <Cashflow />}
        {tab==='bi'        && <BusinessIntel />}
        {tab==='ai'        && <AIAssistant />}
        {tab==='suppliers' && <Fornecedores />}
        {tab==='barfinance' && <BarFinanceAdmin />}
        </div>
      </main>
    </div>
  )
}

function AppInner() {
  return (
    <UiPrefsProvider>
      <AuthProvider><Shell/></AuthProvider>
    </UiPrefsProvider>
  )
}

export default function App() {
  return <ErrorBoundary><AppInner /></ErrorBoundary>
}
