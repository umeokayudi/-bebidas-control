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
import PortalCliente from './components/PortalCliente'
import { ProductsTab, BarsTab, UsuariosTab } from './components/Configs'
import Fornecedores from './components/Fornecedores'
import Faturas from './components/Faturas'
import Cashflow from './components/Cashflow'
import { PedidosAdminTab } from './components/Configs'
import { fmtYen, monthLabel, roleLabel } from './components/utils'
import UiPrefsPanel from './components/UiPrefsPanel'
import { UiPrefsProvider, useUiPrefs, LAYOUTS } from './lib/uiPrefs'
import { loadDashboard } from './lib/loadDashboard'
import { PageHeader, PortalHero, PortalKpi, PortalSurface, PortalAlert } from './components/ui/PageLayout'

// ── TABS por role ─────────────────────────────────────────────────────────────
const ADMIN_TABS = [
  { id:'dashboard', label:'Dashboard', icon:'📊' },
  { id:'purchases', label:'Compras', icon:'🛒' },
  { id:'sales',    label:'Vendas', icon:'💴' },
  { id:'pedidos',   label:'Pedidos', icon:'📋' },
  { id:'relatorio', label:'Relatório', icon:'📈' },
  { id:'ryoshusho', label:'領収書', icon:'🧾' },
  { id:'seikyusho', label:'Leitor de cobrança', icon:'📄' },
  { id:'products',  label:'Produtos', icon:'🍾' },
  { id:'bars',      label:'Bares', icon:'🏪' },
  { id:'usuarios',  label:'Usuários', icon:'👥' },
  { id:'faturas',    label:'Faturas', icon:'💰' },
  { id:'suppliers',  label:'Fornecedores', icon:'🏭' },
  { id:'cashflow',   label:'Fluxo de caixa', icon:'💸' },
]

const STAFF_TABS = [
  { id:'purchases', label:'Compras', icon:'🛒' },
  { id:'sales',    label:'Vendas', icon:'💴' },
  { id:'relatorio', label:'Relatório', icon:'📈' },
  { id:'ryoshusho', label:'領収書', icon:'🧾' },
  { id:'products',  label:'Produtos', icon:'🍾' },
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

function MetricCard({ label, value, sub, color, onClick, hint }) {
  return (
    <PortalKpi
      label={label}
      value={value}
      sub={sub}
      color={color}
      onClick={onClick}
      hint={hint}
    />
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
    <div className="fade-in" style={{ maxWidth: 1000 }}>
      <PageHeader
        title="Dashboard"
        subtitle={`${isCurrentMonth ? 'Mês atual' : 'Histórico'} · ${monthLabel(selMonth)}`}
        actions={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>Mês</span>
            <select value={selMonth} onChange={e => setSelMonth(e.target.value)} style={{ width: 'auto', minWidth: 120 }}>
              {(data?.months || []).map(mon => <option key={mon} value={mon}>{monthLabel(mon)}</option>)}
            </select>
          </div>
        )}
      />

      {data.pedidosPendentes > 0 && (
        <PortalAlert variant="navy" onClick={() => onNav('pedidos')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{data.pedidosPendentes} pedido(s) aguardando confirmação</span>
            <span style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 700 }}>Ver →</span>
          </div>
        </PortalAlert>
      )}

      <div className="portal-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
        <PortalHero
          label={`Lucro · ${monthLabel(selMonth)}`}
          value={fmtYen(m.lucro)}
          sub={`Margem ${m.margem}% · receita ${fmtYen(m.receita)} − compras ${fmtYen(m.compras)}`}
          onClick={() => goToReport(onNav, selMonth)}
        />
        <PortalKpi
          label="A receber"
          value={fmtYen(m.aReceber || 0)}
          sub="Saldo pendente nas faturas do mês"
          color={(m.aReceber || 0) > 0 ? 'var(--amber)' : 'var(--green)'}
          onClick={() => onNav('faturas')}
          hint="Ver faturas →"
        />
        <PortalKpi
          label="Compras (notas)"
          value={fmtYen(m.compras)}
          sub={`${m.comprasCount} nota(s) pagas`}
          color="var(--red)"
          onClick={() => goToReport(onNav, selMonth)}
          hint="Detalhe no Relatório →"
        />
        <PortalKpi
          label="Receita"
          value={fmtYen(m.receita)}
          sub={`${m.vendasCount} entrega(s)`}
          color="var(--navy)"
          onClick={() => goToReport(onNav, selMonth)}
          hint="Detalhe no Relatório →"
        />
      </div>

      <PortalSurface title="Lucro — últimos 6 meses" sub="Receita − compras pagas (valores das notas)">
        <BarChart data={lucroChart} color="#1a6b4a" height={72} />
      </PortalSurface>

      <PortalSurface
        title="Detalhes do mês"
        sub="Quantidades, itens e custos por nota ficam no Relatório."
        headerRight={(
          <button type="button" onClick={() => goToReport(onNav, selMonth)} className="btn-primary" style={{ padding: '8px 16px', borderRadius: 10, fontSize: 12 }}>
            Abrir Relatório — {monthLabel(selMonth)}
          </button>
        )}
      />

      <PortalSurface title="Ações rápidas">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Nova compra', tab: 'purchases' },
            { label: 'Registrar venda', tab: 'sales' },
            { label: 'Pedidos', tab: 'pedidos' },
            { label: 'Leitor de cobrança', tab: 'seikyusho' },
            { label: 'Faturas', tab: 'faturas' },
          ].map(a => (
            <button key={a.tab} onClick={() => onNav(a.tab)} className="btn-primary" style={{ padding: '8px 16px', borderRadius: 10, fontSize: 12 }}>{a.label}</button>
          ))}
        </div>
      </PortalSurface>
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
              <span>{t.icon}</span>
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
          <div style={{fontSize:10,color:'rgba(255,255,255,0.4)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.06em'}}>Painel admin JBM</div>
          <UiPrefsPanel />
          <button onClick={signOut} className="sidebar-signout">Sair</button>
        </div>
      </aside>

      <main className="app-main app-main-wide">
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
          {tab==='suppliers' && <Fornecedores />}
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
