import { LogoSidebar } from './components/Logo'
import { useNotifications, NotificationBell } from './components/Notifications'
import { useState, useEffect } from 'react'
import { AuthProvider, useAuth, LoginPage } from './components/Auth'
import { supabase } from './lib/supabase'
import ComprasTab   from './components/Compras'
import VendasTab    from './components/Vendas'
import RelatorioTab from './components/Relatorio'
import RyoshushoTab from './components/Ryoshusho'
import EstoqueTab from './components/Estoque'
import PortalCliente from './components/PortalCliente'
import { ProductsTab, BarsTab, UsuariosTab } from './components/Configs'
import Fornecedores from './components/Fornecedores'
import Faturas from './components/Faturas'
//import Cashflow from './components/Cashflow'
import AIAssistant from './components/AIAssistant'
import BusinessIntel from './components/BusinessIntel'
import { PedidosAdminTab } from './components/Configs'
import { fmtYen, monthLabel } from './components/utils'

// ── TABS por role ─────────────────────────────────────────────────────────────
const ADMIN_TABS = [
  { id:'dashboard', label:'Dashboard'  },
  { id:'purchases',   label:'Purchases'  },
  { id:'sales',    label:'Sales'      },
  { id:'pedidos',   label:'Orders'     },
  { id:'relatorio', label:'Report'     },
  { id:'ryoshusho', label:'領収書'      },
  { id:'products',  label:'Products'   },
  { id:'bars',      label:'Bars'       },
  { id:'usuarios',  label:'Users'      },
  { id:'faturas',    label:'💰 Invoices'   },
  { id:'cashflow',   label:'💸 Cash Flow' },
  { id:'bi',         label:'📊 Reports'   },
  { id:'ai',         label:'🤖 AI'       },
  { id:'suppliers',  label:'Suppliers'  },
]

const STAFF_TABS = [
  { id:'purchases',   label:'Purchases'  },
  { id:'sales',    label:'Sales'      },
  { id:'relatorio', label:'Report'     },
  { id:'ryoshusho', label:'領収書'      },
  { id:'products',  label:'Products'   },
]

// ── MINI BAR CHART ────────────────────────────────────────────────────────────
function BarChart({ data, color='#c19c56', height=80 }) {
  if (!data||data.length===0) return null
  const max = Math.max(...data.map(d=>d.value),1)
  return (
    <div style={{display:'flex',alignItems:'flex-end',gap:4,height,paddingTop:8}}>
      {data.map((d,i)=>(
        <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
          <div style={{width:'100%',borderRadius:'3px 3px 0 0',
            height:`${Math.max(4,(d.value/max)*height*0.85)}px`,
            background:color,opacity:i===data.length-1?1:0.5,transition:'height 0.4s ease'}}/>
          <div style={{fontSize:9,color:'var(--text3)',whiteSpace:'nowrap'}}>{d.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({ onNav }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(()=>{ loadStats() },[])

  async function loadStats() {
    const now = new Date()
    const mesAtual = now.toISOString().slice(0,7)
    const [{ data:purchases },{ data:sales },{ data:products },{ data:bars },{ data:pedidos }] = await Promise.all([
      supabase.from('purchases').select('*').order('data'),
      supabase.from('sales').select('*, sales_itens(*, products(*))').order('data'),
      supabase.from('products').select('*').eq('ativo',true),
      supabase.from('bars').select('*'),
      supabase.from('pedidos').select('*').eq('status','pendente'),
    ])
    const meses=[]
    for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);meses.push(d.toISOString().slice(0,7))}
    const receitaPorMes=meses.map(m=>({label:monthLabel(m).split('/')[0],value:(sales||[]).filter(v=>v.data?.startsWith(m)).reduce((a,v)=>a+(+v.total||0),0)}))
    const custoPorMes=meses.map(m=>({label:monthLabel(m).split('/')[0],value:(purchases||[]).filter(c=>c.data?.startsWith(m)).reduce((a,c)=>a+(+c.total_real||0),0)}))
    const lucroPorMes=meses.map((m,i)=>({label:monthLabel(m).split('/')[0],value:receitaPorMes[i].value-custoPorMes[i].value}))
    const purchasesMes=(purchases||[]).filter(c=>c.data?.startsWith(mesAtual))
    const salesMes=(sales||[]).filter(v=>v.data?.startsWith(mesAtual))
    const custoMes=purchasesMes.reduce((a,c)=>a+(+c.total_real||0),0)
    const receitaMes=salesMes.reduce((a,v)=>a+(+v.total||0),0)
    const lucroMes=receitaMes-custoMes
    const margem=receitaMes>0?Math.round(lucroMes/receitaMes*100):0
    const markup=custoMes>0?Math.round((receitaMes/custoMes-1)*100):0
    const porBar=(bars||[]).map(bar=>{
      const vBar=salesMes.filter(v=>v.bar_id===bar.id)
      const receita=vBar.reduce((a,v)=>a+(+v.total||0),0)
      const custo=vBar.reduce((a,v)=>a+(v.sales_itens||[]).reduce((b,it)=>b+((it.products?.custo||0)*it.qtd),0),0)
      return {...bar,receita,lucro:receita-custo,sales:vBar.length}
    })
    const prodMap={}
    salesMes.forEach(v=>(v.sales_itens||[]).forEach(it=>{
      const pid=it.produto_id
      if(!prodMap[pid])prodMap[pid]={nome:it.products?.nome||'?',qtd:0,receita:0}
      prodMap[pid].qtd+=it.qtd;prodMap[pid].receita+=it.preco_unitario*it.qtd
    }))
    const topProdutos=Object.values(prodMap).sort((a,b)=>b.receita-a.receita).slice(0,5)
    const ultimasCompras=(purchases||[]).slice(-4).reverse()
    setStats({custoMes,receitaMes,lucroMes,margem,markup,porBar,topProdutos,ultimasCompras,
              receitaPorMes,lucroPorMes,totalProdutos:(products||[]).length,
              totalVendas:salesMes.length,totalCompras:purchasesMes.length,
              pedidosPendentes:(pedidos||[]).length})
    setLoading(false)
  }

  if(loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:300,color:'var(--text2)'}}><span className="spinner"/>Carregando...</div>
  const mes=new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'})

  return (
    <div className="fade-in">
      <div style={{marginBottom:24}}>
        <div style={{fontSize:22,fontWeight:800,color:'var(--navy)',letterSpacing:-0.5}}>Dashboard</div>
        <div style={{fontSize:12,color:'var(--text3)',marginTop:2,textTransform:'capitalize'}}>{mes}</div>
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
        <div className="metric-card red"><div className="metric-label">Monthly cost</div><div className="metric-value" style={{color:'var(--red)',fontSize:22}}>{fmtYen(stats.custoMes)}</div><div className="metric-sub">{stats.totalCompras} purchases</div></div>
        <div className="metric-card navy"><div className="metric-label">Monthly revenue</div><div className="metric-value" style={{color:'var(--navy)',fontSize:22}}>{fmtYen(stats.receitaMes)}</div><div className="metric-sub">{stats.totalVendas} sales</div></div>
        <div className="metric-card green"><div className="metric-label">Net profit</div><div className="metric-value" style={{color:'var(--green)',fontSize:22}}>{fmtYen(stats.lucroMes)}</div><div className="metric-sub">Margin {stats.margem}%</div></div>
        <div className="metric-card gold"><div className="metric-label">Avg markup</div><div className="metric-value" style={{color:'var(--gold)',fontSize:22}}>{stats.markup}%</div><div className="metric-sub">{stats.totalProdutos} products</div></div>
      </div>

      <div className="grid2" style={{marginBottom:16}}>
        <div className="card"><div style={{fontSize:13,fontWeight:700,color:'var(--navy)',marginBottom:4}}>Monthly revenue</div><div style={{fontSize:11,color:'var(--text3)',marginBottom:12}}>Last 6 months</div><BarChart data={stats.receitaPorMes} color="#001028"/></div>
        <div className="card"><div style={{fontSize:13,fontWeight:700,color:'var(--green)',marginBottom:4}}>Monthly profit</div><div style={{fontSize:11,color:'var(--text3)',marginBottom:12}}>Last 6 months</div><BarChart data={stats.lucroPorMes} color="#1a6b4a"/></div>
      </div>

      <div className="grid2" style={{marginBottom:16}}>
        <div className="card">
          <div style={{fontSize:13,fontWeight:700,color:'var(--navy)',marginBottom:16}}>Profit by bar</div>
          {stats.porBar.length===0?<div style={{color:'var(--text3)',fontSize:13,textAlign:'center',padding:'20px 0'}}>No sales this month</div>
          :stats.porBar.map(b=>(
            <div key={b.id} style={{marginBottom:18}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:8,height:8,borderRadius:'50%',background:b.cor}}/><span style={{fontWeight:600,fontSize:13}}>{b.nome}</span></div>
                <span style={{fontWeight:800,color:b.lucro>=0?'var(--green)':'var(--red)',fontSize:13}}>{fmtYen(b.lucro)}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text3)',marginBottom:6}}><span>Receita {fmtYen(b.receita)}</span><span>{b.sales} sales</span></div>
              <div className="progress-bar"><div className="progress-fill" style={{width:stats.receitaMes>0?`${Math.round(b.receita/stats.receitaMes*100)}%`:'0%',background:b.cor}}/></div>
            </div>
          ))}
        </div>
        <div className="card">
          <div style={{fontSize:13,fontWeight:700,color:'var(--navy)',marginBottom:16}}>Top products</div>
          {stats.topProdutos.length===0?<div style={{color:'var(--text3)',fontSize:13,textAlign:'center',padding:'20px 0'}}>No sales this month</div>
          :stats.topProdutos.map((p,i)=>(
            <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:22,height:22,borderRadius:6,background:i===0?'var(--gold)':'var(--bg3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,color:i===0?'var(--navy)':'var(--text3)'}}>{i+1}</div>
                <div><div style={{fontSize:12,fontWeight:600}}>{p.nome}</div><div style={{fontSize:10,color:'var(--text3)'}}>{p.qtd} un.</div></div>
              </div>
              <span style={{fontWeight:700,fontSize:12,color:'var(--navy)'}}>{fmtYen(p.receita)}</span>
            </div>
          ))}
        </div>
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

  if (loading) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16,background:'var(--navy)'}}>
      <LogoSidebar />
      <span className="spinner"/>
    </div>
  )

  if (!user) return <LoginPage />

  // PORTAL DO CLIENTE
  if (perfil?.role === 'cliente') {
    if (!bar) return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--navy)',color:'white',flexDirection:'column',gap:16}}><LogoSidebar /><div style={{color:'rgba(255,255,255,0.5)',fontSize:13}}>Loading portal...</div></div>
    return <PortalCliente bar={bar} signOut={signOut} notifs={notifs} unread={unread} markRead={markRead} markAllRead={markAllRead}/>
  }

  // ADMIN / FUNCIONÁRIO
  const tabs = perfil?.role==='admin' ? ADMIN_TABS : STAFF_TABS
  if (tab==='dashboard' && perfil?.role!=='admin') setTab('purchases')

  return (
    <div style={{display:'flex',minHeight:'100vh',background:'var(--bg)'}}>
      <aside className="sidebar">
        <div style={{padding:'28px 20px 24px',borderBottom:'1px solid rgba(193,156,86,0.15)'}}>
          <LogoSidebar />
        </div>
        <nav style={{flex:1,padding:'16px 12px',overflowY:'auto'}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} className={`nav-item ${tab===t.id?'active':''}`}>
              <span style={{fontSize:13}}>{t.label}</span>
              {t.id==='pedidos'&&pedidosPendentes>0&&(
                <span style={{marginLeft:'auto',background:'var(--gold)',color:'var(--navy)',fontSize:10,fontWeight:800,padding:'1px 6px',borderRadius:10}}>{pedidosPendentes}</span>
              )}
            </button>
          ))}
        </nav>
        <div style={{padding:'16px 20px',borderTop:'1px solid rgba(193,156,86,0.15)'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <div style={{width:34,height:34,borderRadius:10,background:'rgba(193,156,86,0.2)',border:'1px solid rgba(193,156,86,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:'var(--gold)',flexShrink:0}}>
              {(perfil?.nome||user.email||'U')[0].toUpperCase()}
            </div>
            <div style={{minWidth:0}}>
              <div style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,0.85)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{perfil?.nome||user.email}</div>
              <div style={{fontSize:10,color:'rgba(193,156,86,0.7)'}}>{perfil?.role==='admin'?'Administrator':'Staff'}</div>
            </div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
            <NotificationBell notifs={notifs} unread={unread} markRead={markRead} markAllRead={markAllRead} deleteNotif={deleteNotif} deleteAll={deleteAll} onNavigate={setTab}/>
          </div>
          <button onClick={signOut} style={{width:'100%',padding:'7px',fontSize:11,color:'rgba(255,255,255,0.4)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,background:'transparent',letterSpacing:'0.04em',textTransform:'uppercase'}}>Sign out</button>
        </div>
      </aside>

      <main style={{flex:1,padding:'28px 32px',maxWidth:980,overflowX:'hidden'}}>
        <div className="fade-in" key={tab}>
          {tab==='dashboard' && <Dashboard onNav={setTab}/>}
          {tab==='purchases'   && <ComprasTab/>}
          {tab==='sales'    && <VendasTab/>}
          {tab==='pedidos'   && <PedidosAdminTab/>}
          {tab==='relatorio' && <RelatorioTab/>}
          {tab==='ryoshusho' && <RyoshushoTab/>}
          {tab==='products'  && <ProductsTab/>}
          {tab==='bars'      && <BarsTab/>}
          {tab==='usuarios'  && <UsuariosTab/>}
        {tab==='faturas'   && <Faturas />}
        {tab==='cashflow'  && <div>Cashflow</div>}
        {tab==='bi'        && <BusinessIntel />}
        {tab==='ai'        && <AIAssistant />}
        {tab==='suppliers' && <Fornecedores />}
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return <AuthProvider><Shell/></AuthProvider>
}
