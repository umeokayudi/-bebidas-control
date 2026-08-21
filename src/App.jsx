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
import { useState, useEffect, useMemo } from 'react'
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
import { fmtYen, monthLabel, monthKey, saleMonthKey, filterSupplierVendas, roleLabel } from './components/utils'
import { buildPurchaseCostIndex, buildPedidoByVendaPrefix, marginFromSales, marginFromVendaItem } from './lib/marginCost'

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

function DataHoverRow({ tip, children, style }) {
  return (
    <div className="data-hover-row" style={style}>
      <div className="data-hover-tip">{tip}</div>
      {children}
    </div>
  )
}

function MetricCardHover({ tip, className, children }) {
  return (
    <div className={`metric-card metric-card-hover ${className || ''}`}>
      <div className="metric-hover-tip">{tip}</div>
      {children}
    </div>
  )
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({ onNav }) {
  const [raw, setRaw] = useState(null)
  const [selMonth, setSelMonth] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    try {
      const now = new Date()
      const mesAtual = now.toISOString().slice(0, 7)
      const [{ data: purchases }, { data: salesRaw }, { data: products }, { data: bars }, { data: pedidos }, { data: pedidosEntregues }] = await Promise.all([
        supabase.from('compras').select('*, compras_itens(produto_id,nome,custo_unitario)').order('data'),
        supabase.from('vendas').select('*, vendas_itens(*, produtos(*))').order('data'),
        supabase.from('produtos').select('*').eq('ativo', true),
        supabase.from('bars').select('*'),
        supabase.from('pedidos').select('*').eq('status', 'pendente'),
        supabase.from('pedidos').select('id, pedidos_itens(produto_id, qtd, preco_unitario, produtos(custo))').eq('status', 'entregue'),
      ])
      const sales = filterSupplierVendas(salesRaw)
      const salesMonths = [...new Set((sales || []).map(saleMonthKey))].filter(Boolean).sort().reverse()
      const months = [...new Set([
        ...salesMonths,
        ...(purchases || []).map(c => monthKey(c.data)),
      ])].filter(Boolean).sort().reverse()
      const defaultMonth = salesMonths.includes(mesAtual) ? mesAtual : (salesMonths[0] || mesAtual)
      setRaw({ purchases, sales, products, bars, pedidos, pedidosEntregues, months })
      setSelMonth(prev => prev || defaultMonth)
      setLoading(false)
    } catch (e) {
      console.error('loadStats error', e)
      setLoading(false)
    }
  }

  const stats = useMemo(() => {
    if (!raw || !selMonth) return null
    const { purchases, sales, products, bars, pedidos, pedidosEntregues } = raw
    const costIndex = buildPurchaseCostIndex(purchases || [], products || [])
    const pedidoMap = buildPedidoByVendaPrefix(pedidosEntregues || [])
    const now = new Date()
    const meses = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      meses.push(d.toISOString().slice(0, 7))
    }

    const receitaPorMes = meses.map(m => {
      const sMes = (sales || []).filter(v => saleMonthKey(v) === m)
      const receita = marginFromSales(sMes, costIndex, products, pedidoMap).receita
      return {
        label: monthLabel(m).split('/')[0],
        month: monthLabel(m),
        value: receita,
        tip: `${monthLabel(m)} · Receita ${fmtYen(receita)}`,
      }
    })

    const custoPorMes = meses.map(m => {
      const sMes = (sales || []).filter(v => saleMonthKey(v) === m)
      return {
        label: monthLabel(m).split('/')[0],
        month: monthLabel(m),
        value: marginFromSales(sMes, costIndex, products, pedidoMap).custo,
      }
    })

    const lucroPorMes = meses.map((m, i) => ({
      label: monthLabel(m).split('/')[0],
      month: monthLabel(m),
      value: receitaPorMes[i].value - custoPorMes[i].value,
      tip: `${monthLabel(m)} · Lucro ${fmtYen(receitaPorMes[i].value - custoPorMes[i].value)} · Receita ${fmtYen(receitaPorMes[i].value)} · Custo ${fmtYen(custoPorMes[i].value)}`,
    }))

    const purchasesMes = (purchases || []).filter(c => c.data?.startsWith(selMonth))
    const salesMes = (sales || []).filter(v => saleMonthKey(v) === selMonth)
    const mesMargin = marginFromSales(salesMes, costIndex, products, pedidoMap)
    const receitaMes = mesMargin.receita
    const custoMes = mesMargin.custo
    const lucroMes = mesMargin.lucro
    const margem = mesMargin.margemPct
    const markup = custoMes > 0 ? Math.round((receitaMes / custoMes - 1) * 100) : 0

    const porBar = (bars || [])
      .map(bar => {
        const vBar = salesMes.filter(v => v.bar_id === bar.id)
        const m = marginFromSales(vBar, costIndex, products, pedidoMap)
        return { ...bar, receita: m.receita, custo: m.custo, lucro: m.lucro, sales: vBar.length }
      })
      .filter(b => b.sales > 0 || b.receita > 0)
      .sort((a, b) => b.receita - a.receita)

    const prodMap = {}
    salesMes.forEach(v => (v.vendas_itens || []).forEach(it => {
      const pid = it.produto_id
      const m = marginFromVendaItem(it, v.data, costIndex, products)
      if (!prodMap[pid]) prodMap[pid] = { nome: it.produtos?.nome || '?', qtd: 0, receita: 0, custo: 0, lucro: 0 }
      prodMap[pid].qtd += it.qtd
      prodMap[pid].receita += m.receita
      prodMap[pid].custo += m.custo
      prodMap[pid].lucro += m.lucro
    }))

    const topProdutos = Object.values(prodMap).sort((a, b) => b.receita - a.receita).slice(0, 5)
    const topLucro = Object.values(prodMap).sort((a, b) => b.lucro - a.lucro).slice(0, 5)
    const ultimasCompras = (purchases || []).slice(-4).reverse()

    return {
      custoMes, receitaMes, lucroMes, margem, markup, porBar, topProdutos, ultimasCompras,
      receitaPorMes, lucroPorMes, topLucro, totalProdutos: (products || []).length,
      totalVendas: salesMes.length, totalCompras: purchasesMes.length,
      pedidosPendentes: (pedidos || []).length,
      selMonth,
    }
  }, [raw, selMonth])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text2)' }}><span className="spinner" />Carregando...</div>
  if (!stats) return null

  const mesAtual = new Date().toISOString().slice(0, 7)
  const isCurrentMonth = selMonth === mesAtual

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', letterSpacing: -0.5 }}>Dashboard</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            {isCurrentMonth ? 'Mês atual' : 'Histórico'} · {monthLabel(selMonth)}
            {!isCurrentMonth && stats.receitaMes === 0 && (
              <span style={{ marginLeft: 8, color: 'var(--amber)' }}>sem vendas neste mês</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>Mês:</span>
          <select value={selMonth} onChange={e => setSelMonth(e.target.value)} style={{ width: 'auto', minWidth: 120 }}>
            {(raw?.months || []).map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
      </div>

      {stats.pedidosPendentes > 0 && (
        <div onClick={()=>onNav('pedidos')} style={{
          background:'linear-gradient(135deg,var(--navy),var(--navy2))',
          borderRadius:12, padding:'14px 20px', marginBottom:16, cursor:'pointer',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          border:'1px solid rgba(193,156,86,0.3)'
        }}>
          <div style={{color:'white',fontSize:13,fontWeight:600}}>
            ⚠️ {stats.pedidosPendentes} order(s) awaiting your confirmation
          </div>
          <span style={{color:'var(--gold)',fontSize:12,fontWeight:700}}>View orders →</span>
        </div>
      )}

      <div className="grid4" style={{marginBottom:20}}>
        <MetricCardHover className="red" tip={`Custo unitário dos itens vendidos\n${stats.totalCompras} compra(s) no mês`}>
          <div className="metric-label">Custo JBM (unitário)</div>
          <div className="metric-value" style={{color:'var(--red)',fontSize:22}}>{fmtYen(stats.custoMes)}</div>
          <div className="metric-sub">Custo real dos itens vendidos · {stats.totalCompras} compras no mês</div>
        </MetricCardHover>
        <MetricCardHover className="navy" tip={`${stats.totalVendas} venda(s) · Receita total ${fmtYen(stats.receitaMes)}`}>
          <div className="metric-label">Monthly revenue</div>
          <div className="metric-value" style={{color:'var(--navy)',fontSize:22}}>{fmtYen(stats.receitaMes)}</div>
          <div className="metric-sub">{stats.totalVendas} sales</div>
        </MetricCardHover>
        <MetricCardHover className="green" tip={`Margem ${stats.margem}% · Receita ${fmtYen(stats.receitaMes)} − Custo ${fmtYen(stats.custoMes)}`}>
          <div className="metric-label">Lucro real</div>
          <div className="metric-value" style={{color:'var(--green)',fontSize:22}}>{fmtYen(stats.lucroMes)}</div>
          <div className="metric-sub">Venda − custo unitário compras · {stats.margem}%</div>
        </MetricCardHover>
        <MetricCardHover className="gold" tip={`Markup médio sobre custo · ${stats.totalProdutos} produtos ativos`}>
          <div className="metric-label">Avg markup</div>
          <div className="metric-value" style={{color:'var(--gold)',fontSize:22}}>{stats.markup}%</div>
          <div className="metric-sub">{stats.totalProdutos} products</div>
        </MetricCardHover>
      </div>

      <div className="grid2" style={{marginBottom:16}}>
        <div className="card chart-card"><div style={{fontSize:13,fontWeight:700,color:'var(--navy)',marginBottom:4}}>Monthly revenue</div><div style={{fontSize:11,color:'var(--text3)',marginBottom:12}}>Last 6 months · passe o mouse nas barras</div><BarChart data={stats.receitaPorMes} color="#001028"/></div>
        <div className="card chart-card"><div style={{fontSize:13,fontWeight:700,color:'var(--green)',marginBottom:4}}>Monthly profit</div><div style={{fontSize:11,color:'var(--text3)',marginBottom:12}}>Last 6 months · passe o mouse nas barras</div><BarChart data={stats.lucroPorMes} color="#1a6b4a"/></div>
      </div>

      <div className="grid2" style={{marginBottom:16}}>
        <div className="card">
          <div style={{fontSize:13,fontWeight:700,color:'var(--navy)',marginBottom:16}}>Profit by bar</div>
          {stats.porBar.length===0?<div style={{color:'var(--text3)',fontSize:13,textAlign:'center',padding:'20px 0'}}>No sales in {monthLabel(selMonth)}</div>
          :stats.porBar.map(b=>(
            <DataHoverRow key={b.id} tip={`${b.nome} · Receita ${fmtYen(b.receita)} · Custo ${fmtYen(b.custo||0)} · Lucro ${fmtYen(b.lucro)} · ${b.sales} venda(s)`}>
              <div style={{marginBottom:8}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:8,height:8,borderRadius:'50%',background:b.cor}}/><span style={{fontWeight:600,fontSize:13}}>{b.nome}</span></div>
                <span style={{fontWeight:800,color:b.lucro>=0?'var(--green)':'var(--red)',fontSize:13}}>{fmtYen(b.lucro)}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text3)',marginBottom:6}}><span>Receita {fmtYen(b.receita)} · Custo unit. {fmtYen(b.custo||0)}</span><span>{b.sales} sales</span></div>
              <div className="progress-bar"><div className="progress-fill" style={{width:stats.receitaMes>0?`${Math.round(b.receita/stats.receitaMes*100)}%`:'0%',background:b.cor}}/></div>
              </div>
            </DataHoverRow>
          ))}
        </div>
        <div className="card">
          <div style={{fontSize:13,fontWeight:700,color:'var(--navy)',marginBottom:16}}>Top products</div>
          {stats.topProdutos.length===0?<div style={{color:'var(--text3)',fontSize:13,textAlign:'center',padding:'20px 0'}}>No sales in {monthLabel(selMonth)}</div>
          :stats.topProdutos.map((p,i)=>(
            <DataHoverRow key={i} tip={`${p.nome} · ${p.qtd} un. · Receita ${fmtYen(p.receita)} · Custo ${fmtYen(p.custo||0)} · Lucro ${fmtYen(p.lucro||0)}`}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:22,height:22,borderRadius:6,background:i===0?'var(--gold)':'var(--bg3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,color:i===0?'var(--navy)':'var(--text3)'}}>{i+1}</div>
                <div><div style={{fontSize:12,fontWeight:600}}>{p.nome}</div><div style={{fontSize:10,color:'var(--text3)'}}>{p.qtd} un.</div></div>
              </div>
              <span style={{fontWeight:700,fontSize:12,color:'var(--navy)'}}>{fmtYen(p.receita)}</span>
            </div>
            </DataHoverRow>
          ))}
        </div>
      </div>

            <div className="card" style={{marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:700,color:'var(--green)',marginBottom:16}}>🏆 Most profitable drinks</div>
        {stats.topLucro&&stats.topLucro.length===0?<div style={{color:'var(--text3)',fontSize:13,textAlign:'center',padding:'20px 0'}}>No sales in {monthLabel(selMonth)}</div>
        :(stats.topLucro||[]).map((p,i)=>(
          <DataHoverRow key={i} tip={`${p.nome} · ${p.qtd} un. · Lucro ${fmtYen(p.lucro)} · Margem ${p.receita>0?Math.round(p.lucro/p.receita*100):0}%`}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:22,height:22,borderRadius:6,background:i===0?'var(--green)':'var(--bg3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,color:i===0?'white':'var(--text3)'}}>{i+1}</div>
              <div><div style={{fontSize:12,fontWeight:600}}>{p.nome}</div><div style={{fontSize:10,color:'var(--text3)'}}>{p.qtd} un. · receita {fmtYen(p.receita)}</div></div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontWeight:700,fontSize:12,color:'var(--green)'}}>{fmtYen(p.lucro)}</div>
              <div style={{fontSize:10,color:'var(--text3)'}}>{p.receita>0?Math.round(p.lucro/p.receita*100):0}% margin</div>
            </div>
          </div>
          </DataHoverRow>
        ))}
      </div>

      <div className="card">
        <div style={{fontSize:13,fontWeight:700,color:'var(--navy)',marginBottom:14}}>Quick actions</div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          {[{label:'New purchase',tab:'purchases'},{label:'Register sale',tab:'sales'},{label:'View orders',tab:'pedidos'},{label:'Emitir 領収書',tab:'ryoshusho'}].map(a=>(
            <button key={a.tab} onClick={()=>onNav(a.tab)} className="btn-primary" style={{padding:'9px 18px',borderRadius:10,fontSize:12}}>{a.label}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── SHELL ─────────────────────────────────────────────────────────────────────
function Shell() {
  const { user, perfil, loading, signOut } = useAuth()
  const [tab, setTab] = useState('dashboard')
  const [bar, setBar] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pedidosPendentes, setPedidosPendentes] = useState(0)
  const { notifs, unread, markRead, markAllRead, deleteNotif, deleteAll } = useNotifications()

  useMobileMenuLock(menuOpen)

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
  return <AuthProvider><Shell/></AuthProvider>
}

export default function App() {
  return <ErrorBoundary><AppInner /></ErrorBoundary>
}
