import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './Auth'
import { fmtYen, fmtDate, Spinner, Empty, SectionTitle } from './utils'

const STATUS_PEDIDO = {
  pendente:   { label:'Pending',   color:'#8A5A00', bg:'#FDF3E0' },
  confirmado: { label:'Confirmed', color:'#1A4E8A', bg:'#EAF0FA' },
  entregue:   { label:'Delivered', color:'#1A7A5E', bg:'#EAF5F0' },
  cancelado:  { label:'Cancelled', color:'#C0392B', bg:'#FBEAEA' },
}

function Badge({ status }) {
  const s = STATUS_PEDIDO[status] || STATUS_PEDIDO.pendente
  return <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:s.bg, color:s.color }}>{s.label}</span>
}

// ── HOME ──────────────────────────────────────────────────────────────────────
function SparkLine({ data, color='var(--navy)', height=40 }) {
  if (!data || data.length < 2) return null
  const max = Math.max(...data, 1)
  const w = 200, h = height
  const pts = data.map((v,i) => {
    const x = (i / (data.length-1)) * w
    const y = h - (v/max)*h
    return x+','+y
  }).join(' ')
  return (
    <svg viewBox={'0 0 '+w+' '+h} style={{ width:'100%', height }} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points={'0,'+h+' '+pts+' '+w+','+h} fill={color} fillOpacity="0.08" stroke="none"/>
    </svg>
  )
}

function HomeTab({ bar, onTab }) {
  const [vendas,    setVendas]    = useState([])
  const [pedidos,   setPedidos]   = useState([])
  const [itens,     setItens]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [periodo,   setPeriodo]   = useState('30')  // days: 7, 30, 90, 365

  useEffect(() => { load() }, [bar])

  async function load() {
    const [vR, pR, iR] = await Promise.all([
      supabase.from('vendas').select('*').eq('bar_id', bar.id).order('data', { ascending:true }),
      supabase.from('pedidos').select('*').eq('bar_id', bar.id).order('criado_em', { ascending:false }),
      supabase.from('vendas_itens').select('*, produtos(nome,preco_venda,preco_bar), vendas(data,bar_id)').eq('vendas.bar_id', bar.id),
    ])
    setVendas(vR.data || [])
    setPedidos(pR.data || [])
    setItens(iR.data?.filter(i => i.vendas) || [])
    setLoading(false)
  }

  const days = +periodo
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().slice(0,10)

  const vendasPeriod = vendas.filter(v => v.data >= cutoffStr)
  const totalPeriod  = vendasPeriod.reduce((a,v) => a+(+v.total||0), 0)
  const avgOrder     = vendasPeriod.length > 0 ? Math.round(totalPeriod / vendasPeriod.length) : 0

  // Previous period comparison
  const prev = new Date(cutoff); prev.setDate(prev.getDate() - days)
  const prevStr = prev.toISOString().slice(0,10)
  const vendasPrev = vendas.filter(v => v.data >= prevStr && v.data < cutoffStr)
  const totalPrev  = vendasPrev.reduce((a,v) => a+(+v.total||0), 0)
  const growth     = totalPrev > 0 ? Math.round((totalPeriod-totalPrev)/totalPrev*100) : null

  // Monthly spend chart (last 6 months)
  const monthlyData = []
  const monthLabels = []
  for (let i=5; i>=0; i--) {
    const d = new Date(); d.setMonth(d.getMonth()-i)
    const mk = d.toISOString().slice(0,7)
    monthLabels.push(mk.slice(5))
    monthlyData.push(vendas.filter(v=>v.data?.startsWith(mk)).reduce((a,v)=>a+(+v.total||0),0))
  }

  // Top products by revenue
  const prodMap = {}
  const prodVol = {}
  itens.filter(it => it.vendas?.data >= cutoffStr).forEach(it => {
    const nome = it.produtos?.nome || '?'
    const val  = (it.preco_unitario||0) * it.qtd
    prodMap[nome] = (prodMap[nome]||0) + val
    prodVol[nome] = (prodVol[nome]||0) + it.qtd
  })
  const topRevenue = Object.entries(prodMap).sort((a,b)=>b[1]-a[1]).slice(0,5)
  const topVolume  = Object.entries(prodVol).sort((a,b)=>b[1]-a[1]).slice(0,5)

  // Top by bar margin (preco_bar - preco_venda) * qty
  const margMap = {}
  itens.filter(it => it.vendas?.data >= cutoffStr).forEach(it => {
    const nome = it.produtos?.nome || '?'
    const barPrice = it.produtos?.preco_bar || 0
    const jbmPrice = it.preco_unitario || it.produtos?.preco_venda || 0
    const margin = (barPrice - jbmPrice) * it.qtd
    if (barPrice > 0) margMap[nome] = (margMap[nome]||0) + margin
  })
  const topMargin = Object.entries(margMap).sort((a,b)=>b[1]-a[1]).slice(0,5)

  const ativos  = pedidos.filter(p=>p.status==='pendente'||p.status==='confirmado')
  const mes     = new Date().toISOString().slice(0,7)
  const totalMes = vendas.filter(v=>v.data?.startsWith(mes)).reduce((a,v)=>a+(+v.total||0),0)

  const maxMonth = Math.max(...monthlyData, 1)

  if (loading) return <Spinner text="Loading dashboard..." />

  return (
    <div className="fade-in" style={{ maxWidth:900 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
        <div>
          <div style={{ fontSize:24, fontWeight:800, letterSpacing:-0.5 }}>{bar.nome}</div>
          <div style={{ fontSize:13, color:'var(--text2)', marginTop:2 }}>Dashboard · JBM Drinks</div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {[['7','7d'],['30','30d'],['90','90d'],['365','1y']].map(([v,l])=>(
            <button key={v} onClick={()=>setPeriodo(v)} style={{
              padding:'6px 12px', borderRadius:8, fontSize:12, fontWeight:600,
              background:periodo===v?'var(--navy)':'var(--bg3)',
              color:periodo===v?'white':'var(--text2)', border:'none', cursor:'pointer'
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Total spend', value:fmtYen(totalPeriod), sub: growth!==null?(growth>=0?'↑ +'+growth+'% vs prev':'↓ '+growth+'% vs prev'):null, subColor:growth>=0?'var(--green)':'var(--red)', color:'var(--navy)' },
          { label:'Deliveries', value:vendasPeriod.length, sub:'in '+periodo+' days', color:'var(--blue)' },
          { label:'Avg order', value:fmtYen(avgOrder), sub:'per delivery', color:'var(--green)' },
          { label:'Active orders', value:ativos.length, sub:ativos.length>0?ativos.map(p=>p.status).join(', '):'all clear ✓', color:ativos.length>0?'var(--gold)':'var(--green)' },
        ].map(k => (
          <div key={k.label} style={{
            background:'var(--bg2)', border:'1px solid var(--border)',
            borderRadius:16, padding:'16px 18px'
          }}>
            <div style={{ fontSize:10, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8, fontWeight:600 }}>{k.label}</div>
            <div style={{ fontSize:22, fontWeight:800, color:k.color, lineHeight:1 }}>{k.value}</div>
            {k.sub && <div style={{ fontSize:11, color:k.subColor||'var(--text2)', marginTop:6, fontWeight:k.subColor?600:400 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Spend chart */}
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'20px 24px', marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:700 }}>Monthly spend</div>
          <div style={{ fontSize:13, fontWeight:800, color:'var(--navy)' }}>{fmtYen(totalMes)} this month</div>
        </div>
        {/* Bar chart */}
        <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:100 }}>
          {monthlyData.map((v,i) => {
            const pct = Math.max(v/maxMonth*100, v>0?4:0)
            const isCurrent = i===5
            return (
              <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <div style={{ fontSize:10, color:'var(--text2)', fontWeight:600 }}>
                  {v>0 ? (v>=10000 ? Math.round(v/1000)+'k' : fmtYen(v)) : ''}
                </div>
                <div style={{
                  width:'100%', height:pct+'%', minHeight:v>0?4:0,
                  background:isCurrent?'var(--navy)':'var(--border)',
                  borderRadius:'6px 6px 0 0', transition:'height 0.3s',
                  position:'relative'
                }}>
                  {isCurrent && v>0 && <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg,rgba(255,255,255,0.15) 0%,transparent 100%)', borderRadius:'6px 6px 0 0' }}/>}
                </div>
                <div style={{ fontSize:10, color:isCurrent?'var(--navy)':'var(--text3)', fontWeight:isCurrent?700:400 }}>{monthLabels[i]}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Top products */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
        {/* By revenue */}
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'20px 24px' }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Top by cost</div>
          <div style={{ fontSize:11, color:'var(--text2)', marginBottom:16 }}>What you spent · Last {periodo} days</div>
          {topRevenue.length === 0
            ? <Empty text="No data" icon="📊" />
            : topRevenue.map(([nome,val], i) => {
              const pct = val/topRevenue[0][1]*100
              return (
                <div key={nome} style={{ marginBottom:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                    <span style={{ fontWeight:i===0?700:500, color:i===0?'var(--navy)':'var(--text)' }}>
                      {i===0?'🥇':i===1?'🥈':i===2?'🥉':'  '} {nome}
                    </span>
                    <span style={{ fontWeight:600 }}>{fmtYen(val)}</span>
                  </div>
                  <div style={{ height:4, background:'var(--bg3)', borderRadius:2, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:pct+'%', background:'var(--navy)', borderRadius:2 }}/>
                  </div>
                </div>
              )
            })
          }
        </div>

        {/* By volume */}
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'20px 24px' }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Top by volume</div>
          <div style={{ fontSize:11, color:'var(--text2)', marginBottom:16 }}>Last {periodo} days</div>
          {topVolume.length === 0
            ? <Empty text="No data" icon="📊" />
            : topVolume.map(([nome,vol], i) => {
              const pct = vol/topVolume[0][1]*100
              return (
                <div key={nome} style={{ marginBottom:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                    <span style={{ fontWeight:i===0?700:500, color:i===0?'var(--navy)':'var(--text)' }}>
                      {i===0?'🥇':i===1?'🥈':i===2?'🥉':'  '} {nome}
                    </span>
                    <span style={{ fontWeight:600, color:'var(--text2)' }}>{vol} units</span>
                  </div>
                  <div style={{ height:4, background:'var(--bg3)', borderRadius:2, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:pct+'%', background:'var(--gold)', borderRadius:2 }}/>
                  </div>
                </div>
              )
            })
          }
        </div>
      </div>

      {/* Top margin */}
      {topMargin.length > 0 && (
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'20px 24px', marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Top margin products 🏆</div>
          <div style={{ fontSize:11, color:'var(--text2)', marginBottom:16 }}>Your most profitable products · Last {periodo} days</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10 }}>
            {topMargin.map(([nome,margin],i) => (
              <div key={nome} style={{
                background:i===0?'linear-gradient(135deg,var(--navy),#2563eb)':'var(--bg3)',
                borderRadius:12, padding:'14px',
                border:i===0?'none':'1px solid var(--border)'
              }}>
                <div style={{ fontSize:11, marginBottom:4 }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':'  '}</div>
                <div style={{ fontSize:12, fontWeight:600, color:i===0?'white':'var(--text)', marginBottom:6, lineHeight:1.3 }}>{nome}</div>
                <div style={{ fontSize:18, fontWeight:800, color:i===0?'#34c759':'var(--green)' }}>{fmtYen(margin)}</div>
                <div style={{ fontSize:10, color:i===0?'rgba(255,255,255,0.6)':'var(--text2)', marginTop:2 }}>margin</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drink Economics */}
      {(() => {
        const drinkProds = itens
          .filter(it => it.vendas?.data >= cutoffStr && it.produtos?.drinks_por_garrafa > 0)
          .reduce((acc, it) => {
            const p = it.produtos
            const nome = p.nome
            if (!acc[nome]) acc[nome] = {
              nome, qtd:0,
              custo_unit: p.preco_venda || 0,
              drinks_por_garrafa: p.drinks_por_garrafa || 1,
              preco_drink: p.preco_drink || 0,
              preco_bar: p.preco_bar || 0
            }
            acc[nome].qtd += it.qtd
            return acc
          }, {})
        const rows = Object.values(drinkProds).map(p => {
          const totalGarrafas = p.qtd
          const totalDrinks   = totalGarrafas * p.drinks_por_garrafa
          const custoTotal    = totalGarrafas * p.custo_unit
          const revenueTotal  = totalDrinks * p.preco_drink
          const costPerDrink  = p.drinks_por_garrafa > 0 ? Math.round(p.custo_unit / p.drinks_por_garrafa) : 0
          const marginPerDrink = p.preco_drink - costPerDrink
          const marginPct     = p.preco_drink > 0 ? Math.round(marginPerDrink/p.preco_drink*100) : 0
          return {...p, totalDrinks, custoTotal, revenueTotal, costPerDrink, marginPerDrink, marginPct}
        }).filter(p => p.preco_drink > 0).sort((a,b) => b.revenueTotal - a.revenueTotal)

        if (rows.length === 0) return null
        return (
          <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'20px 24px', marginBottom:16 }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>🍹 Drink economics</div>
            <div style={{ fontSize:11, color:'var(--text2)', marginBottom:16 }}>Cost per drink · margin · revenue estimate · Last {periodo} days</div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ borderBottom:'2px solid var(--border)' }}>
                    {['Product','Bottles','Drinks','Cost/drink','Price/drink','Margin','Est. Revenue','Margin %'].map(h => (
                      <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r,i) => (
                    <tr key={r.nome} style={{ borderBottom:'1px solid var(--border)', background:i===0?'rgba(193,156,86,0.04)':'transparent' }}>
                      <td style={{ padding:'10px', fontWeight:i===0?700:500 }}>{i===0?'🥇 ':''}{r.nome}</td>
                      <td style={{ padding:'10px', textAlign:'right' }}>{r.qtd}</td>
                      <td style={{ padding:'10px', textAlign:'right', fontWeight:600 }}>{r.totalDrinks}</td>
                      <td style={{ padding:'10px', textAlign:'right', color:'var(--red)' }}>{fmtYen(r.costPerDrink)}</td>
                      <td style={{ padding:'10px', textAlign:'right' }}>{fmtYen(r.preco_drink)}</td>
                      <td style={{ padding:'10px', textAlign:'right', color:'var(--green)', fontWeight:600 }}>{fmtYen(r.marginPerDrink)}</td>
                      <td style={{ padding:'10px', textAlign:'right', fontWeight:700, color:'var(--navy)' }}>{fmtYen(r.revenueTotal)}</td>
                      <td style={{ padding:'10px', textAlign:'right' }}>
                        <span style={{
                          padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:700,
                          background: r.marginPct>60?'#f0fdf4':r.marginPct>40?'#fffbeb':'#fef2f2',
                          color: r.marginPct>60?'var(--green)':r.marginPct>40?'var(--amber)':'var(--red)'
                        }}>{r.marginPct}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* Quick actions + recent */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:12 }}>
        <div style={{ background:'var(--navy)', borderRadius:16, padding:'20px 24px', display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'white', marginBottom:4 }}>Quick actions</div>
          {[
            { label:'+ New order', icon:'🛒', tab:'orders' },
            { label:'View deliveries', icon:'📦', tab:'deliveries' },
            { label:'Check inventory', icon:'📊', tab:'inventory' },
          ].map(a => (
            <button key={a.tab} onClick={()=>onTab(a.tab)} style={{
              background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.15)',
              borderRadius:10, padding:'10px 14px', color:'white', fontSize:13,
              fontWeight:600, cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:8
            }}><span>{a.icon}</span>{a.label}</button>
          ))}
        </div>

        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'20px 24px' }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>Recent deliveries</div>
          {vendas.length === 0
            ? <Empty text="No deliveries yet" />
            : vendas.slice(-8).reverse().map(v => (
              <div key={v.id} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                <span style={{ color:'var(--text2)' }}>{fmtDate(v.data)}</span>
                <span style={{ fontWeight:600 }}>{fmtYen(v.total)}</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}


// ── DELIVERIES ────────────────────────────────────────────────────────────────
function DeliveriesTab({ bar }) {
  const [vendas,    setVendas]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [dateFrom,  setDateFrom]  = useState('')
  const [dateTo,    setDateTo]    = useState('')
  const [filterMes, setFilterMes] = useState('')

  useEffect(() => { load() }, [bar])

  async function load() {
    const { data } = await supabase.from('vendas').select('*, vendas_itens(*, produtos(*))').eq('bar_id', bar.id).order('data', { ascending:false })
    setVendas(data || [])
    setLoading(false)
  }

  const meses = [...new Set(vendas.map(v => v.data?.slice(0,7)).filter(Boolean))].sort().reverse()

  const filtered = vendas.filter(v => {
    if (filterMes && !v.data?.startsWith(filterMes)) return false
    if (dateFrom && v.data < dateFrom) return false
    if (dateTo && v.data > dateTo) return false
    if (search) {
      const s = search.toLowerCase()
      const hasItem = (v.vendas_itens||[]).some(it => it.produtos?.nome?.toLowerCase().includes(s))
      if (!hasItem && !v.data?.includes(s)) return false
    }
    return true
  })

  const total = filtered.reduce((a,v) => a+(+v.total||0), 0)

  if (loading) return <Spinner text="Loading..." />

  return (
    <div className="fade-in">
      <SectionTitle>Delivery history</SectionTitle>

      {/* Filters */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:14 }}>
        <div style={{ position:'relative' }}>
          <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--text3)', fontSize:14 }}>🔍</span>
          <input type="text" placeholder="Search product..." value={search}
            onChange={e=>setSearch(e.target.value)}
            style={{ paddingLeft:36, width:'100%', borderRadius:10, padding:'9px 12px 9px 36px', fontSize:13 }}
          />
        </div>
        <div>
          <input type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setFilterMes('')}}
            style={{ width:'100%', borderRadius:10, padding:'9px 12px', fontSize:13 }}
            placeholder="From"
          />
        </div>
        <div>
          <input type="date" value={dateTo} onChange={e=>{setDateTo(e.target.value);setFilterMes('')}}
            style={{ width:'100%', borderRadius:10, padding:'9px 12px', fontSize:13 }}
            placeholder="To"
          />
        </div>
      </div>

      {/* Month pills */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
        <button onClick={()=>{setFilterMes('');setDateFrom('');setDateTo('')}} style={{
          padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer',
          background:!filterMes&&!dateFrom?'var(--navy)':'var(--bg3)',
          color:!filterMes&&!dateFrom?'white':'var(--text2)', border:'none'
        }}>All</button>
        {meses.map(m => (
          <button key={m} onClick={()=>{setFilterMes(m);setDateFrom('');setDateTo('')}} style={{
            padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer',
            background:filterMes===m?'var(--navy)':'var(--bg3)',
            color:filterMes===m?'white':'var(--text2)', border:'none'
          }}>{m}</button>
        ))}
      </div>

      {/* Total */}
      {filtered.length > 0 && (
        <div style={{ marginBottom:14, padding:'12px 16px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, fontSize:13, display:'flex', justifyContent:'space-between' }}>
          <span style={{ color:'var(--text2)' }}>{filtered.length} deliveries</span>
          <strong>Total: {fmtYen(total)}</strong>
        </div>
      )}

      {filtered.length === 0
        ? <Empty text="No deliveries found" />
        : filtered.map(v => (
          <div key={v.id} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'16px', marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontWeight:700, fontSize:14 }}>{fmtDate(v.data)}</span>
              <span style={{ fontWeight:800, color:'var(--navy)', fontSize:15 }}>{fmtYen(v.total)}</span>
            </div>
            {(v.vendas_itens||[]).map(it => (
              <div key={it.id} style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text2)', marginBottom:4 }}>
                <span>{it.produtos?.nome} × {it.qtd}</span>
                <span>{fmtYen((it.preco_unitario||0)*it.qtd)}</span>
              </div>
            ))}
          </div>
        ))
      }
    </div>
  )
}

// ── ORDERS ────────────────────────────────────────────────────────────────────
function OrdersTab({ bar }) {
  const { user } = useAuth()
  const [produtos,  setProdutos]  = useState([])
  const [pedidos,   setPedidos]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [showForm,  setShowForm]  = useState(false)
  const [qtyPopup, setQtyPopup] = useState(null) // produto_id
  const [orderPreview, setOrderPreview] = useState(null) // pedido object
  const [qtyInput, setQtyInput] = useState('')
  const [items,     setItems]     = useState([])
  const [obs,       setObs]       = useState('')
  const [entrega,   setEntrega]   = useState('')

  useEffect(() => { load() }, [bar])

  async function load() {
    const [pR, pedR] = await Promise.all([
      supabase.from('produtos_public').select('*').eq('ativo', true).order('categoria').order('nome'),
      supabase.from('pedidos').select('*, pedidos_itens(*, produtos(*))').eq('bar_id', bar.id).order('criado_em', { ascending:false }),
    ])
    setProdutos(pR.data || [])
    setPedidos(pedR.data || [])
    setLoading(false)
  }

  const totalOrder = items.reduce((a, it) => {
    const p = produtos.find(x => x.id === it.produto_id)
    return a + (p ? p.preco_venda * it.qtd : 0)
  }, 0)

  async function enviarOrder() {
    if (items.length === 0) return alert('Add at least one item')
    setSaving(true)
    const { data: pedido, error } = await supabase.from('pedidos').insert({
      bar_id: bar.id, criado_por: user.id,
      status: 'pendente',
      data_pedido: new Date().toISOString().slice(0,10),
      data_entrega_prevista: entrega || null,
      obs, total_estimado: totalOrder
    }).select().single()

    if (error) { alert('Error: ' + error.message); setSaving(false); return }
    if (!pedido) { alert('Error saving order'); setSaving(false); return }

    const { error: itemsError } = await supabase.from('pedidos_itens').insert(
      items.map(it => {
        const p = produtos.find(x => x.id === it.produto_id)
        return { pedido_id: pedido.id, produto_id: it.produto_id, qtd: it.qtd, preco_unitario: p?.preco_venda||0 }
      })
    )
    if (itemsError) alert('Error saving items: ' + itemsError.message)

    const { data: admins } = await supabase.from('perfis').select('id').eq('role', 'admin')
    if (admins && admins.length > 0) {
      await supabase.from('notificacoes').insert(
        admins.map(adm => ({
          user_id: adm.id, tipo: 'pedido_novo',
          titulo: 'New order from ' + bar.nome,
          mensagem: items.length + ' product(s) - \u00a5' + Math.round(totalOrder).toLocaleString()
        }))
      )
    }

    setSaving(false)
    setItems([]); setObs(''); setEntrega(''); setShowForm(false)
    load()
  }

  const cats = [...new Set(produtos.map(p => p.categoria))]

  if (loading) return <Spinner text="Loading..." />

  return (
    <div className="fade-in">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <SectionTitle>My orders</SectionTitle>
        <button className="btn-primary" onClick={() => setShowForm(x => !x)} style={{ padding:'9px 18px', borderRadius:10 }}>
          {showForm ? 'Cancel' : '+ New order'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:16 }}>New order for JBM Drinks</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
            <div>
              <label className="form-label">Requested delivery date</label>
              <input type="date" value={entrega} onChange={e => setEntrega(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Notes</label>
              <input type="text" value={obs} onChange={e => setObs(e.target.value)} placeholder="urgent, deliver morning..." />
            </div>
          </div>
          {cats.map(cat => (
            <div key={cat} style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', marginBottom:8 }}>{cat}</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {produtos.filter(p => p.categoria===cat).map(p => {
                  const item = items.find(i => i.produto_id===p.id)
                  return (
                    <div key={p.id} style={{
                      border: item ? '2px solid var(--navy)' : '1px solid var(--border)',
                      borderRadius:10, padding:'8px 12px', background: item ? 'var(--navy)' : 'var(--bg2)',
                      color: item ? 'white' : 'var(--text)', fontSize:12,
                      display:'flex', alignItems:'center', gap:8, position:'relative'
                    }}>
                      <span onClick={() => {
                        if (!item) return
                        else if (item.qtd > 1) setItems(items.map(i => i.produto_id===p.id ? {...i, qtd:i.qtd-1} : i))
                        else setItems(items.filter(i => i.produto_id!==p.id))
                      }} style={{ cursor:'pointer', padding:'0 2px' }}>−</span>
                      <span onClick={() => {
                        if (!item) setItems([...items, {produto_id:p.id, qtd:1}])
                        else { setQtyPopup(p.id); setQtyInput(String(item.qtd)) }
                      }} style={{ cursor:'pointer', flex:1 }}>
                        {p.nome}
                        <span style={{ fontSize:10, opacity:0.7, marginLeft:4 }}>¥{p.preco_venda?.toLocaleString()}</span>
                      </span>
                      {item && <span onClick={() => { setQtyPopup(p.id); setQtyInput(String(item.qtd)) }}
                        style={{ fontWeight:800, cursor:'pointer', minWidth:16, textAlign:'center' }}>{item.qtd}</span>}
                      <span onClick={() => {
                        if (!item) setItems([...items, {produto_id:p.id, qtd:1}])
                        else setItems(items.map(i => i.produto_id===p.id ? {...i, qtd:i.qtd+1} : i))
                      }} style={{ cursor:'pointer', padding:'0 2px' }}>+</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {/* Qty popup */}
          {qtyPopup && (
            <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
              onClick={()=>setQtyPopup(null)}>
              <div style={{ background:'var(--bg2)', borderRadius:20, padding:'28px 24px', width:280, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}
                onClick={e=>e.stopPropagation()}>
                <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>
                  {produtos.find(p=>p.id===qtyPopup)?.nome}
                </div>
                <div style={{ fontSize:12, color:'var(--text2)', marginBottom:16 }}>Set quantity</div>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                  <button onClick={()=>setQtyInput(v=>String(Math.max(0,+v-1)))}
                    style={{ width:44, height:44, borderRadius:12, border:'1px solid var(--border)', background:'var(--bg3)', fontSize:20, cursor:'pointer', fontWeight:700 }}>−</button>
                  <input type="number" min="0" value={qtyInput} onChange={e=>setQtyInput(e.target.value)}
                    style={{ flex:1, textAlign:'center', fontSize:24, fontWeight:800, padding:'8px', borderRadius:12 }}
                    autoFocus
                  />
                  <button onClick={()=>setQtyInput(v=>String(+v+1))}
                    style={{ width:44, height:44, borderRadius:12, border:'none', background:'var(--navy)', color:'white', fontSize:20, cursor:'pointer', fontWeight:700 }}>+</button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <button onClick={()=>{setItems(items.filter(i=>i.produto_id!==qtyPopup));setQtyPopup(null)}}
                    style={{ padding:'12px', borderRadius:12, border:'1px solid var(--red)', background:'transparent', color:'var(--red)', fontWeight:600, cursor:'pointer', fontSize:13 }}>
                    Remove
                  </button>
                  <button onClick={()=>{
                    const qty = +qtyInput
                    if (qty <= 0) setItems(items.filter(i=>i.produto_id!==qtyPopup))
                    else setItems(items.map(i=>i.produto_id===qtyPopup?{...i,qtd:qty}:i))
                    setQtyPopup(null)
                  }} style={{ padding:'12px', borderRadius:12, border:'none', background:'var(--navy)', color:'white', fontWeight:700, cursor:'pointer', fontSize:14 }}>
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          )}

          {items.length > 0 && (
            <div style={{ borderTop:'1px solid var(--border)', paddingTop:14, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:14, fontWeight:700 }}>Estimated total: {fmtYen(totalOrder)}</div>
              <button className="btn-primary" onClick={enviarOrder} disabled={saving} style={{ padding:'10px 20px' }}>
                {saving ? 'Sending...' : 'Send order →'}
              </button>
            </div>
          )}
        </div>
      )}

      {pedidos.length === 0
        ? <Empty text="No orders yet" icon="🛒" />
        : pedidos.map(p => {
          const s = STATUS_PEDIDO[p.status] || STATUS_PEDIDO.pendente
          return (
            <div key={p.id} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:'16px', marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:14 }}>{fmtDate(p.criado_em?.slice(0,10))}</div>
                  {p.data_entrega_prevista && <div style={{ fontSize:12, color:'var(--text2)' }}>Expected: {p.data_entrega_prevista}</div>}
                  {p.obs && <div style={{ fontSize:12, color:'var(--text2)' }}>{p.obs}</div>}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontWeight:700 }}>{fmtYen(p.total_estimado)}</span>
                  <Badge status={p.status} />
                </div>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                {(p.pedidos_itens||[]).map(it => (
                  <span key={it.id} style={{ fontSize:11, padding:'3px 10px', borderRadius:20, background:'var(--bg3)', color:'var(--text2)' }}>
                    {it.produtos?.nome} ×{it.qtd}
                  </span>
                ))}
              </div>
              <button onClick={()=>setOrderPreview(p)} style={{
                fontSize:11, padding:'5px 12px', borderRadius:8,
                border:'1px solid var(--border)', background:'transparent',
                cursor:'pointer', color:'var(--text2)', fontWeight:600
              }}>📋 View order details</button>
            </div>
          )
        })
      }

      {/* Order preview modal */}
      {orderPreview && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={()=>setOrderPreview(null)}>
          <div style={{ background:'var(--bg2)', borderRadius:20, padding:'32px', width:'100%', maxWidth:480, maxHeight:'85vh', overflowY:'auto', boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}
            onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
              <div>
                <div style={{ fontSize:18, fontWeight:800 }}>Order Details</div>
                <div style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>{fmtDate(orderPreview.criado_em?.slice(0,10))}</div>
              </div>
              <span style={{ fontSize:11, fontWeight:700, padding:'4px 12px', borderRadius:20,
                background: orderPreview.status==='entregue'?'#EAF5F0':'#FDF3E0',
                color: orderPreview.status==='entregue'?'#1A7A5E':'#8A5A00'
              }}>{orderPreview.status}</span>
            </div>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Items</div>
              {(orderPreview.pedidos_itens||[]).map(it => (
                <div key={it.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{it.produtos?.nome}</div>
                    <div style={{ fontSize:11, color:'var(--text2)' }}>¥{(it.preco_unitario||0).toLocaleString()} x {it.qtd}</div>
                  </div>
                  <div style={{ fontWeight:700 }}>¥{((it.preco_unitario||0)*it.qtd).toLocaleString()}</div>
                </div>
              ))}
            </div>
            <div style={{ background:'var(--navy)', borderRadius:12, padding:'14px 18px', display:'flex', justifyContent:'space-between', marginBottom:20 }}>
              <span style={{ color:'rgba(255,255,255,0.7)', fontSize:13 }}>Total</span>
              <span style={{ color:'var(--gold)', fontWeight:800, fontSize:18 }}>¥{Math.round(orderPreview.total_estimado||0).toLocaleString()}</span>
            </div>
            <button onClick={()=>setOrderPreview(null)} style={{ width:'100%', padding:'12px', borderRadius:14, border:'1px solid var(--border)', background:'transparent', fontSize:13, cursor:'pointer' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}


// ── INVENTORY ────────────────────────────────────────────────────────────────
function InventoryTab({ bar, onOrder }) {
  const { user } = useAuth()
  const [produtos,   setProdutos]   = useState([])
  const [movimentos, setMovimentos] = useState([])
  const [regras,     setRegras]     = useState({}) // prodId -> minimo
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState(null) // prodId for modal
  const [modalQty,   setModalQty]   = useState(1)
  const [saving,     setSaving]     = useState(false)
  const [editMin,    setEditMin]     = useState(null)
  const [editMinVal, setEditMinVal]  = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [bar])

  async function load() {
    const [pR, mR, rR] = await Promise.all([
      supabase.from('produtos_public').select('*').eq('ativo', true).order('categoria').order('nome'),
      supabase.from('estoque_movimentos').select('*').eq('bar_id', bar.id).order('criado_em', { ascending: false }).limit(500),
      supabase.from('estoque_regras').select('*').eq('bar_id', bar.id),
    ])
    setProdutos(pR.data || [])
    setMovimentos(mR.data || [])
    const rMap = {}
    ;(rR.data || []).forEach(r => { rMap[r.produto_id] = r.minimo })
    setRegras(rMap)
    setLoading(false)
  }

  async function saveMinimo(prodId, val) {
    const minimo = +val || 0
    await supabase.from('estoque_regras').upsert(
      { bar_id: bar.id, produto_id: prodId, minimo },
      { onConflict: 'bar_id,produto_id' }
    )
    setRegras(prev => ({...prev, [prodId]: minimo}))
    setEditMin(null)
  }

  async function doMove(prodId, tipo) {
    if (!modalQty || modalQty <= 0) return
    setSaving(true)
    await supabase.from('estoque_movimentos').insert({
      produto_id: prodId, bar_id: bar.id, tipo,
      qtd: modalQty, criado_por: user.id,
      obs: tipo === 'entrada' ? 'Stock added' : 'Used'
    })
    setSaving(false)
    setSelected(null)
    setModalQty(1)
    load()
  }

  const stockMap = {}
  movimentos.forEach(m => {
    if (!stockMap[m.produto_id]) stockMap[m.produto_id] = 0
    stockMap[m.produto_id] += m.tipo === 'entrada' ? m.qtd : -m.qtd
  })

  const list = produtos.map(p => ({
    ...p,
    stock: Math.max(0, stockMap[p.id] || 0),
    minimo: regras[p.id] || 0
  }))

  const filtered = search ? list.filter(p => p.nome.toLowerCase().includes(search.toLowerCase()) || p.categoria.toLowerCase().includes(search.toLowerCase())) : list

  const critical = filtered.filter(p => p.minimo > 0 && p.stock === 0)
  const low      = filtered.filter(p => p.minimo > 0 && p.stock > 0 && p.stock < p.minimo)
  const good     = filtered.filter(p => p.minimo === 0 || p.stock >= p.minimo)
  const selectedProd = list.find(p => p.id === selected)

  if (loading) return <Spinner text="Loading..." />

      {/* Search bar - added after loading check in render */}

  return (
    <div className="fade-in" style={{ maxWidth:800 }}>

      {/* Alert banners */}
      {critical.length > 0 && (
        <div style={{
          background:'linear-gradient(135deg,#ff3b30 0%,#c0392b 100%)',
          borderRadius:20, padding:'20px 24px', marginBottom:12,
          display:'flex', justifyContent:'space-between', alignItems:'center',
          boxShadow:'0 8px 32px rgba(255,59,48,0.3)'
        }}>
          <div>
            <div style={{ fontSize:17, fontWeight:700, color:'white', marginBottom:6 }}>
              🚨 Out of stock ({critical.length})
            </div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.85)', lineHeight:1.5 }}>
              {critical.map(p => p.nome).join('  ·  ')}
            </div>
          </div>
          <button onClick={onOrder} style={{
            background:'white', color:'#ff3b30', border:'none',
            borderRadius:14, padding:'12px 22px', fontWeight:700,
            fontSize:13, cursor:'pointer', flexShrink:0, marginLeft:16,
            boxShadow:'0 2px 8px rgba(0,0,0,0.1)'
          }}>Order now →</button>
        </div>
      )}

      {low.length > 0 && (
        <div style={{
          background:'linear-gradient(135deg,#ff9500 0%,#e67e22 100%)',
          borderRadius:20, padding:'20px 24px', marginBottom:12,
          display:'flex', justifyContent:'space-between', alignItems:'center',
          boxShadow:'0 8px 32px rgba(255,149,0,0.25)'
        }}>
          <div>
            <div style={{ fontSize:17, fontWeight:700, color:'white', marginBottom:6 }}>
              ⚠️ Running low ({low.length})
            </div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.85)', lineHeight:1.5 }}>
              {low.map(p => p.nome + ' — ' + p.stock + ' left (min ' + p.minimo + ')').join('  ·  ')}
            </div>
          </div>
          <button onClick={onOrder} style={{
            background:'white', color:'#ff9500', border:'none',
            borderRadius:14, padding:'12px 22px', fontWeight:700,
            fontSize:13, cursor:'pointer', flexShrink:0, marginLeft:16,
            boxShadow:'0 2px 8px rgba(0,0,0,0.1)'
          }}>Order now →</button>
        </div>
      )}

      {/* Search */}
      <div style={{ position:'relative', marginBottom:16 }}>
        <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:16, color:'var(--text3)' }}>🔍</span>
        <input
          type="text" placeholder="Search products..."
          value={search} onChange={e=>setSearch(e.target.value)}
          style={{ width:'100%', padding:'11px 14px 11px 40px', borderRadius:12, fontSize:14 }}
        />
        {search && (
          <button onClick={()=>setSearch('')} style={{
            position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
            background:'none', border:'none', fontSize:16, cursor:'pointer', color:'var(--text3)'
          }}>✕</button>
        )}
      </div>
      {/* Summary */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, margin:'20px 0' }}>
        {[
          { label:'Total products', value:list.length, icon:'📦', color:'var(--navy)' },
          { label:'Need attention', value:critical.length+low.length, icon:critical.length>0?'🚨':'⚠️', color:critical.length>0?'#ff3b30':low.length>0?'#ff9500':'var(--green)' },
          { label:'Well stocked', value:good.filter(p=>p.stock>0).length, icon:'✅', color:'#34c759' },
        ].map(s => (
          <div key={s.label} style={{
            background:'var(--bg2)', border:'1px solid var(--border)',
            borderRadius:16, padding:'16px', textAlign:'center'
          }}>
            <div style={{ fontSize:22, marginBottom:6 }}>{s.icon}</div>
            <div style={{ fontSize:26, fontWeight:800, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:11, color:'var(--text2)', marginTop:3, textTransform:'uppercase', letterSpacing:'0.05em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Product list */}
      {[...new Set(filtered.map(p=>p.categoria))].map(cat => (
        <div key={cat} style={{ marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10, paddingLeft:4 }}>{cat}</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {filtered.filter(p=>p.categoria===cat).map(p => {
              const isCrit = p.minimo>0 && p.stock===0
              const isLow  = p.minimo>0 && p.stock>0 && p.stock<p.minimo
              const dotColor = isCrit?'#ff3b30':isLow?'#ff9500':'#34c759'
              const pct = p.minimo>0 ? Math.min(p.stock/p.minimo*100,100) : null
              return (
                <div key={p.id} style={{
                  background:'var(--bg2)',
                  border: isCrit?'1px solid rgba(255,59,48,0.25)':isLow?'1px solid rgba(255,149,0,0.25)':'1px solid var(--border)',
                  borderRadius:14, padding:'14px 16px',
                  display:'flex', alignItems:'center', gap:14,
                  transition:'all 0.15s'
                }}>
                  {/* Status indicator */}
                  <div style={{
                    width:8, height:8, borderRadius:'50%', flexShrink:0,
                    background:dotColor,
                    boxShadow: isCrit?'0 0 10px rgba(255,59,48,0.7)':isLow?'0 0 8px rgba(255,149,0,0.5)':'none'
                  }}/>

                  {/* Name + progress */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:600, marginBottom: pct!==null?6:0 }}>{p.nome}</div>
                    {pct !== null && (
                      <div style={{ height:4, background:'var(--bg3)', borderRadius:2, overflow:'hidden', maxWidth:160 }}>
                        <div style={{ height:'100%', width:pct+'%', background:dotColor, borderRadius:2, transition:'width 0.4s' }}/>
                      </div>
                    )}
                  </div>

                  {/* Stock */}
                  <div style={{ textAlign:'center', minWidth:44 }}>
                    <div style={{ fontSize:22, fontWeight:800, color:dotColor, lineHeight:1 }}>{p.stock}</div>
                    <div style={{ fontSize:9, color:'var(--text2)', textTransform:'uppercase', marginTop:2 }}>stock</div>
                  </div>

                  {/* Min rule */}
                  <div style={{ textAlign:'center', minWidth:44 }}>
                    {editMin===p.id ? (
                      <input type="number" min="0" defaultValue={p.minimo}
                        style={{ width:48, padding:'4px', fontSize:13, textAlign:'center', borderRadius:8 }}
                        autoFocus
                        onBlur={e=>saveMinimo(p.id,e.target.value)}
                        onKeyDown={e=>e.key==='Enter'&&saveMinimo(p.id,e.target.value)}
                      />
                    ) : (
                      <div onClick={()=>setEditMin(p.id)} style={{ cursor:'pointer' }} title="Set minimum stock rule">
                        <div style={{ fontSize:16, fontWeight:700, color:p.minimo>0?'var(--navy)':'var(--text3)' }}>
                          {p.minimo>0?p.minimo:'—'}
                        </div>
                        <div style={{ fontSize:9, color:'var(--text2)', textTransform:'uppercase', marginTop:2 }}>minimum</div>
                      </div>
                    )}
                  </div>

                  {/* Update button */}
                  <button onClick={()=>{setSelected(p.id);setModalQty(1)}} style={{
                    background:'var(--navy)', color:'white', border:'none',
                    borderRadius:10, padding:'8px 16px', fontSize:12,
                    fontWeight:600, cursor:'pointer', flexShrink:0,
                    transition:'opacity 0.15s'
                  }}>Update</button>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Update modal */}
      {selected && selectedProd && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
          zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20
        }}>
          <div style={{
            background:'var(--bg2)', borderRadius:24, padding:'32px',
            width:'100%', maxWidth:360, boxShadow:'0 24px 60px rgba(0,0,0,0.3)'
          }}>
            <div style={{ fontSize:18, fontWeight:800, marginBottom:4 }}>{selectedProd.nome}</div>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:24 }}>
              Current stock: <strong style={{ color:'var(--navy)' }}>{selectedProd.stock}</strong>
              {selectedProd.minimo>0 && <span> · Minimum: <strong>{selectedProd.minimo}</strong></span>}
            </div>

            <label style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:8 }}>Quantity</label>
            <input type="number" min="0.5" step="0.5" value={modalQty}
              onChange={e=>setModalQty(+e.target.value)}
              style={{ width:'100%', padding:'14px', fontSize:20, textAlign:'center', borderRadius:12, fontWeight:700, marginBottom:20 }}
              autoFocus
            />

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
              <button onClick={()=>doMove(selected,'entrada')} disabled={saving} style={{
                padding:'14px', borderRadius:14, border:'none',
                background:'linear-gradient(135deg,#34c759,#30b350)',
                color:'white', fontSize:14, fontWeight:700, cursor:'pointer',
                boxShadow:'0 4px 12px rgba(52,199,89,0.3)'
              }}>
                {saving?'..':'+ Add stock'}
              </button>
              <button onClick={()=>doMove(selected,'saida')} disabled={saving} style={{
                padding:'14px', borderRadius:14, border:'none',
                background:'linear-gradient(135deg,#ff9500,#e67e22)',
                color:'white', fontSize:14, fontWeight:700, cursor:'pointer',
                boxShadow:'0 4px 12px rgba(255,149,0,0.3)'
              }}>
                {saving?'..':'− Used'}
              </button>
            </div>

            <button onClick={()=>{setSelected(null);setModalQty(1)}} style={{
              width:'100%', padding:'12px', borderRadius:14, border:'1px solid var(--border)',
              background:'transparent', fontSize:13, cursor:'pointer', color:'var(--text2)'
            }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}



// ── PRICING ───────────────────────────────────────────────────────────────────
function PricingTab({ bar }) {
  const { user } = useAuth()
  const [produtos,  setProdutos]  = useState([])
  const [pricing,   setPricing]   = useState({}) // prodId -> {drinks_por_garrafa, preco_drink}
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(null)
  const [selected,  setSelected]  = useState(null)
  const [form,      setForm]      = useState({ drinks: '', preco: '' })
  const [search,    setSearch]    = useState('')

  useEffect(() => { load() }, [bar])

  async function load() {
    const [pR, prR] = await Promise.all([
      supabase.from('produtos_public').select('*').eq('ativo', true).order('categoria').order('nome'),
      supabase.from('bar_pricing').select('*').eq('bar_id', bar.id),
    ])
    setProdutos(pR.data || [])
    const pMap = {}
    ;(prR.data || []).forEach(p => { pMap[p.produto_id] = p })
    setPricing(pMap)
    setLoading(false)
  }

  async function savePricing(prodId) {
    const drinks = parseFloat(form.drinks)
    const preco  = parseFloat(form.preco)
    if (!drinks || !preco) return
    setSaving(prodId)
    await supabase.from('bar_pricing').upsert(
      { bar_id: bar.id, produto_id: prodId, drinks_por_garrafa: drinks, preco_drink: preco },
      { onConflict: 'bar_id,produto_id' }
    )
    setSaving(null)
    setSelected(null)
    setForm({ drinks: '', preco: '' })
    load()
  }

  const list = produtos.map(p => {
    const pr = pricing[p.id]
    const drinks = pr?.drinks_por_garrafa || 0
    const preco  = pr?.preco_drink || 0
    const custo_drink = drinks > 0 ? Math.round(p.preco_venda / drinks) : 0
    const margem = preco > 0 && custo_drink > 0 ? Math.round((preco - custo_drink) / preco * 100) : null
    const revenue_garrafa = drinks > 0 ? drinks * preco : 0
    const roi = p.preco_venda > 0 && revenue_garrafa > 0 ? Math.round((revenue_garrafa - p.preco_venda) / p.preco_venda * 100) : null
    return { ...p, drinks, preco, custo_drink, margem, revenue_garrafa, roi }
  })

  const configured = list.filter(p => p.drinks > 0 && p.preco > 0)
  const notConfigured = list.filter(p => !p.drinks || !p.preco)
  const filtered = search
    ? list.filter(p => p.nome.toLowerCase().includes(search.toLowerCase()) || p.categoria.toLowerCase().includes(search.toLowerCase()))
    : list

  const selectedProd = list.find(p => p.id === selected)
  const cats = [...new Set(filtered.map(p => p.categoria))]

  if (loading) return <Spinner text="Loading..." />

  return (
    <div className="fade-in" style={{ maxWidth:860 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:800 }}>Drink Pricing</div>
          <div style={{ fontSize:13, color:'var(--text2)', marginTop:2 }}>
            Set your selling price to calculate cost & margin
          </div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:22, fontWeight:800, color:'var(--green)' }}>{configured.length}</div>
          <div style={{ fontSize:11, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.05em' }}>configured</div>
        </div>
      </div>

      {/* Search */}
      <div style={{ position:'relative', marginBottom:16 }}>
        <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:16, color:'var(--text3)' }}>🔍</span>
        <input type="text" placeholder="Search products..." value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width:'100%', padding:'11px 14px 11px 40px', borderRadius:12, fontSize:14 }}
        />
        {search && <button onClick={()=>setSearch('')} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', fontSize:16, cursor:'pointer', color:'var(--text3)' }}>✕</button>}
      </div>

      {/* Summary cards */}
      {configured.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:20 }}>
          {[
            { label:'Avg margin', value: Math.round(configured.filter(p=>p.margem!==null).reduce((a,p)=>a+p.margem,0)/configured.filter(p=>p.margem!==null).length||0)+'%', color:'var(--green)', icon:'📈' },
            { label:'Best margin', value: configured.filter(p=>p.margem!==null).sort((a,b)=>b.margem-a.margem)[0]?.nome?.split(' ')[0]||'—', color:'var(--navy)', icon:'🏆' },
            { label:'Not set', value: notConfigured.length, color: notConfigured.length>0?'var(--amber)':'var(--green)', icon:'⚙️' },
          ].map(s => (
            <div key={s.label} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:22 }}>{s.icon}</span>
              <div>
                <div style={{ fontSize:18, fontWeight:800, color:s.color }}>{s.value}</div>
                <div style={{ fontSize:11, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Product list by category */}
      {cats.map(cat => (
        <div key={cat} style={{ marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10, paddingLeft:4 }}>{cat}</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {filtered.filter(p=>p.categoria===cat).map(p => {
              const isSet = p.drinks > 0 && p.preco > 0
              return (
                <div key={p.id} style={{
                  background:'var(--bg2)',
                  border: isSet ? '1px solid var(--border)' : '1px dashed var(--border)',
                  borderRadius:14, padding:'14px 16px',
                  display:'flex', alignItems:'center', gap:14
                }}>
                  {/* Status */}
                  <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0,
                    background: !isSet ? 'var(--text3)' : p.margem > 60 ? '#34c759' : p.margem > 40 ? '#ff9500' : 'var(--red)',
                    boxShadow: isSet && p.margem > 60 ? '0 0 8px rgba(52,199,89,0.5)' : 'none'
                  }}/>

                  {/* Name */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>{p.nome}</div>
                    <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>
                      JBM cost: {fmtYen(p.preco_venda)}
                      {isSet && <span style={{ marginLeft:8 }}>· {p.drinks} drinks/bottle · {fmtYen(p.custo_drink)}/drink</span>}
                    </div>
                  </div>

                  {/* Stats if set */}
                  {isSet && (
                    <>
                      <div style={{ textAlign:'center', minWidth:64 }}>
                        <div style={{ fontSize:15, fontWeight:800, color:'var(--navy)' }}>{fmtYen(p.preco)}</div>
                        <div style={{ fontSize:9, color:'var(--text2)', textTransform:'uppercase', marginTop:1 }}>price/drink</div>
                      </div>
                      <div style={{ textAlign:'center', minWidth:54 }}>
                        <div style={{ fontSize:15, fontWeight:800, color:p.margem>60?'#34c759':p.margem>40?'#ff9500':'var(--red)' }}>{p.margem}%</div>
                        <div style={{ fontSize:9, color:'var(--text2)', textTransform:'uppercase', marginTop:1 }}>margin</div>
                      </div>
                      <div style={{ textAlign:'center', minWidth:70 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'var(--green)' }}>{fmtYen(p.revenue_garrafa)}</div>
                        <div style={{ fontSize:9, color:'var(--text2)', textTransform:'uppercase', marginTop:1 }}>rev/bottle</div>
                      </div>
                    </>
                  )}

                  {/* Set/Edit button */}
                  <button onClick={()=>{ setSelected(p.id); setForm({ drinks: p.drinks||'', preco: p.preco||'' }) }} style={{
                    background: isSet ? 'var(--bg3)' : 'var(--navy)',
                    color: isSet ? 'var(--text)' : 'white',
                    border: isSet ? '1px solid var(--border)' : 'none',
                    borderRadius:10, padding:'8px 14px', fontSize:12,
                    fontWeight:600, cursor:'pointer', flexShrink:0
                  }}>{isSet ? 'Edit' : 'Set price'}</button>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Modal */}
      {selected && selectedProd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'var(--bg2)', borderRadius:24, padding:'32px', width:'100%', maxWidth:380, boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:18, fontWeight:800, marginBottom:4 }}>{selectedProd.nome}</div>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:24 }}>
              JBM cost per bottle: <strong>{fmtYen(selectedProd.preco_venda)}</strong>
            </div>

            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:8 }}>
                Drinks per bottle
              </label>
              <input type="number" min="1" step="1" value={form.drinks}
                onChange={e=>setForm({...form, drinks:e.target.value})}
                placeholder="e.g. 16 shots of 45ml"
                style={{ width:'100%', padding:'12px 14px', fontSize:16, borderRadius:12 }}
                autoFocus
              />
              {form.drinks > 0 && selectedProd.preco_venda > 0 && (
                <div style={{ fontSize:12, color:'var(--text2)', marginTop:6 }}>
                  Cost per drink: <strong style={{ color:'var(--red)' }}>{fmtYen(Math.round(selectedProd.preco_venda / form.drinks))}</strong>
                </div>
              )}
            </div>

            <div style={{ marginBottom:24 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:8 }}>
                Your selling price per drink (¥)
              </label>
              <input type="number" min="0" value={form.preco}
                onChange={e=>setForm({...form, preco:e.target.value})}
                placeholder="e.g. 1200"
                style={{ width:'100%', padding:'12px 14px', fontSize:16, borderRadius:12 }}
              />
              {form.drinks > 0 && form.preco > 0 && selectedProd.preco_venda > 0 && (
                <div style={{ marginTop:10, padding:'12px 14px', background:'var(--bg3)', borderRadius:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:6 }}>
                    <span style={{ color:'var(--text2)' }}>Cost/drink</span>
                    <span style={{ color:'var(--red)', fontWeight:600 }}>{fmtYen(Math.round(selectedProd.preco_venda/form.drinks))}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:6 }}>
                    <span style={{ color:'var(--text2)' }}>Margin/drink</span>
                    <span style={{ color:'var(--green)', fontWeight:600 }}>{fmtYen(Math.round(form.preco - selectedProd.preco_venda/form.drinks))}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, fontWeight:700 }}>
                    <span>Revenue/bottle</span>
                    <span style={{ color:'var(--navy)' }}>{fmtYen(Math.round(form.drinks * form.preco))}</span>
                  </div>
                  <div style={{ marginTop:8, height:4, background:'var(--border)', borderRadius:2, overflow:'hidden' }}>
                    <div style={{
                      height:'100%', borderRadius:2,
                      width: Math.min(Math.round((form.preco - selectedProd.preco_venda/form.drinks)/form.preco*100), 100) + '%',
                      background: Math.round((form.preco - selectedProd.preco_venda/form.drinks)/form.preco*100) > 60 ? '#34c759' : '#ff9500'
                    }}/>
                  </div>
                  <div style={{ fontSize:11, color:'var(--text2)', marginTop:4, textAlign:'right' }}>
                    {Math.round((form.preco - selectedProd.preco_venda/form.drinks)/form.preco*100)}% margin
                  </div>
                </div>
              )}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:10 }}>
              <button onClick={()=>{setSelected(null);setForm({drinks:'',preco:''})}} style={{
                padding:'13px', borderRadius:14, border:'1px solid var(--border)',
                background:'transparent', fontSize:13, cursor:'pointer', color:'var(--text2)'
              }}>Cancel</button>
              <button onClick={()=>savePricing(selected)} disabled={!form.drinks||!form.preco||saving===selected} style={{
                padding:'13px', borderRadius:14, border:'none',
                background:'var(--navy)', color:'white',
                fontSize:13, fontWeight:700, cursor:'pointer'
              }}>
                {saving===selected ? 'Saving...' : 'Save pricing'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ── MENU ─────────────────────────────────────────────────────────────────────
function MenuTab({ bar }) {
  const [drinks,   setDrinks]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [cat,      setCat]      = useState('')
  const [sortBy,   setSortBy]   = useState('margem')
  const [showAdd,  setShowAdd]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [editId,   setEditId]   = useState(null)

  const [ingredientes, setIngredientes] = useState([]) // {nome, volume_garrafa, preco_garrafa, ml_no_drink}
  const emptyForm = { nome:'', categoria:'Custom', receita:'', copo:'', preco_venda:'', custo:'', preco_desconto:'', notas:'' }
  const emptyIng  = { nome:'', volume_garrafa: '', preco_garrafa: '', ml_no_drink: '' }
  const [form, setForm] = useState(emptyForm)

  const [produtosDB, setProdutosDB] = useState([])

  useEffect(() => { load() }, [bar])

  async function load() {
    const [dR, pR] = await Promise.all([
      supabase.from('drink_menu').select('*').eq('bar_id', bar.id).order('categoria').order('nome'),
      supabase.from('produtos_public').select('*').eq('ativo',true).order('nome')
    ])
    setDrinks(dR.data || [])
    setProdutosDB(pR.data || [])
    setLoading(false)
  }

  async function saveDrink() {
    if (!form.nome || !form.preco_venda) return
    setSaving(true)
    // Auto-calculate cost from ingredientes if set
    const autoCost = ingredientes.filter(i=>i.preco_garrafa&&i.volume_garrafa&&i.ml_no_drink)
      .reduce((sum,i) => sum + Math.round((+i.preco_garrafa/+i.volume_garrafa)*(+i.ml_no_drink)), 0)
    const finalCost = autoCost > 0 ? autoCost : (+form.custo||0)
    const autoReceita = ingredientes.filter(i=>i.nome&&i.ml_no_drink).map(i=>i.nome+' '+i.ml_no_drink+'ml').join(' + ')
    const payload = {
      bar_id: bar.id,
      nome: form.nome,
      categoria: form.categoria || 'Custom',
      receita: autoReceita || form.receita || '',
      copo: form.copo || '',
      preco_venda: +form.preco_venda || 0,
      custo: finalCost,
      margem: form.preco_venda > 0 ? (+form.preco_venda - finalCost) / +form.preco_venda : 0,
      preco_desconto: +form.preco_desconto || 500,
      notas: form.notas || '',
      custom: true
    }
    if (editId) {
      await supabase.from('drink_menu').update(payload).eq('id', editId)
    } else {
      await supabase.from('drink_menu').insert(payload)
    }
    setSaving(false)
    setShowAdd(false)
    setEditId(null)
    setForm(emptyForm)
    setIngredientes([])
    load()
  }

  async function deleteDrink(id) {
    if (!confirm('Delete this drink?')) return
    await supabase.from('drink_menu').delete().eq('id', id)
    load()
  }

  function startEdit(d) {
    setForm({ nome:d.nome, categoria:d.categoria, receita:d.receita||'', copo:d.copo||'',
      preco_venda:d.preco_venda, custo:d.custo, preco_desconto:d.preco_desconto||500, notas:d.notas||'' })
    setEditId(d.id)
    setShowAdd(true)
  }

  const cats = [...new Set(drinks.map(d => d.categoria))]
  const allCats = [...new Set([...cats, 'Custom', 'Hennessy','Shochu Hai','Vodka Base','Gin Base','Whisky Base','Tequila Base','Rum Base','Shots','Liqueurs','Champagne','Wine','Beer','Soft Drinks'])]

  const filtered = drinks
    .filter(d => {
      if (cat && d.categoria !== cat) return false
      if (search) {
        const s = search.toLowerCase()
        return d.nome.toLowerCase().includes(s) || (d.receita||'').toLowerCase().includes(s)
      }
      return true
    })
    .sort((a,b) => {
      if (sortBy === 'margem') return b.margem - a.margem
      if (sortBy === 'custo') return a.custo - b.custo
      if (sortBy === 'preco') return b.preco_venda - a.preco_venda
      return a.nome.localeCompare(b.nome)
    })

  const avgMargem = drinks.length > 0 ? Math.round(drinks.reduce((a,d) => a + d.margem, 0) / drinks.length * 100) : 0
  const topDrink  = [...drinks].sort((a,b) => b.margem - a.margem)[0]
  const lowDrink  = [...drinks].sort((a,b) => a.margem - b.margem)[0]

  const liveMargin = form.preco_venda && form.custo
    ? Math.round((+form.preco_venda - +form.custo) / +form.preco_venda * 100) : null
  const liveMarginVip = form.preco_desconto && form.custo
    ? Math.round((+form.preco_desconto - +form.custo) / +form.preco_desconto * 100) : null

  if (loading) return <Spinner text="Loading menu..." />

  return (
    <div className="fade-in" style={{ maxWidth:900 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:800 }}>Menu & Pricing</div>
          <div style={{ fontSize:13, color:'var(--text2)', marginTop:2 }}>{drinks.length} drinks · recipes, costs & margins</div>
        </div>
        <button className="btn-primary" onClick={()=>{setShowAdd(x=>!x);setEditId(null);setForm(emptyForm)}}
          style={{ padding:'9px 18px', borderRadius:10 }}>
          {showAdd ? 'Cancel' : '+ Add drink'}
        </button>
      </div>

      {/* Add/Edit form */}
      {showAdd && (
        <div style={{ background:'var(--bg2)', border:'2px solid rgba(193,156,86,0.3)', borderRadius:16, padding:'24px', marginBottom:20 }}>
          <div style={{ fontSize:15, fontWeight:700, marginBottom:16 }}>{editId ? 'Edit drink' : 'Add custom drink'}</div>

          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <label className="form-label">Name *</label>
              <input type="text" value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})} placeholder="e.g. Gin & Tonic Special" />
            </div>
            <div>
              <label className="form-label">Category</label>
              <select value={form.categoria} onChange={e=>setForm({...form,categoria:e.target.value})}>
                {allCats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <label className="form-label">Recipe / ingredients</label>
              <input type="text" value={form.receita} onChange={e=>setForm({...form,receita:e.target.value})} placeholder="e.g. gin 30ml + tonic 150ml + lime 1ml" />
            </div>
            <div>
              <label className="form-label">Glass / vessel</label>
              <input type="text" value={form.copo} onChange={e=>setForm({...form,copo:e.target.value})} placeholder="e.g. Red Cup 210ml" />
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <label className="form-label">Sale price (¥) *</label>
              <input type="number" value={form.preco_venda} onChange={e=>setForm({...form,preco_venda:e.target.value})} placeholder="1000" />
            </div>
            <div>
              <label className="form-label">Cost (¥)</label>
              <input type="number" value={form.custo} onChange={e=>setForm({...form,custo:e.target.value})} placeholder="0" />
            </div>
            <div>
              <label className="form-label">VIP/Disc. price (¥)</label>
              <input type="number" value={form.preco_desconto} onChange={e=>setForm({...form,preco_desconto:e.target.value})} placeholder="500" />
            </div>
          </div>

          {/* Live margin preview */}
          {liveMargin !== null && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
              <div style={{ padding:'12px 16px', borderRadius:12, background: liveMargin>70?'#f0fdf4':'#fffbeb', border:'1px solid', borderColor:liveMargin>70?'#86efac':'#fcd34d' }}>
                <div style={{ fontSize:11, color:'var(--text2)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>Regular margin</div>
                <div style={{ fontSize:22, fontWeight:800, color:liveMargin>70?'#16a34a':'#d97706' }}>{liveMargin}%</div>
                <div style={{ fontSize:11, color:'var(--text2)' }}>¥{Math.round(+form.preco_venda - +form.custo).toLocaleString()} profit/drink</div>
              </div>
              {liveMarginVip !== null && (
                <div style={{ padding:'12px 16px', borderRadius:12, background:liveMarginVip>50?'#fdf8ec':'#fef2f2', border:'1px solid', borderColor:liveMarginVip>50?'var(--gold)':'#fca5a5' }}>
                  <div style={{ fontSize:11, color:'var(--text2)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>VIP margin</div>
                  <div style={{ fontSize:22, fontWeight:800, color:liveMarginVip>50?'var(--gold)':'#dc2626' }}>{liveMarginVip}%</div>
                  <div style={{ fontSize:11, color:'var(--text2)' }}>¥{Math.round(+form.preco_desconto - +form.custo).toLocaleString()} profit/drink</div>
                </div>
              )}
            </div>
          )}

          {/* Ingredient cost calculator */}
          <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <label className="form-label" style={{ marginBottom:0 }}>Ingredients (auto-calculate cost)</label>
              <button type="button" onClick={()=>setIngredientes([...ingredientes,{...emptyIng}])}
                style={{ fontSize:11, padding:'4px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg3)', cursor:'pointer', fontWeight:600 }}>+ Add ingredient</button>
            </div>
            {ingredientes.map((ing,idx) => {
              const selProd = produtosDB.find(p=>p.id===ing.produto_id)
              const costPerMl = selProd && selProd.volume_ml > 0 ? selProd.preco_venda / selProd.volume_ml : 0
              const ingCost = costPerMl > 0 && ing.ml_no_drink ? Math.round(costPerMl * +ing.ml_no_drink) : 0
              return (
                <div key={idx} style={{ background:'var(--bg3)', borderRadius:10, padding:'10px 12px', marginBottom:8 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 28px', gap:8, marginBottom:8, alignItems:'center' }}>
                    <select value={ing.produto_id||''} onChange={e=>{
                      const p = produtosDB.find(x=>x.id===e.target.value)
                      const a=[...ingredientes]
                      a[idx]={...a[idx], produto_id:e.target.value, nome:p?.nome||'', volume_garrafa:p?.volume_ml||0, preco_garrafa:p?.preco_venda||0}
                      setIngredientes(a)
                    }} style={{ padding:'8px 10px', borderRadius:8, fontSize:13 }}>
                      <option value="">Select product from JBM catalogue...</option>
                      {produtosDB.map(p=>(
                        <option key={p.id} value={p.id}>{p.nome} — ¥{p.preco_venda?.toLocaleString()} / {p.volume_ml||'?'}ml</option>
                      ))}
                    </select>
                    <button onClick={()=>setIngredientes(ingredientes.filter((_,i)=>i!==idx))}
                      style={{ padding:'6px', borderRadius:6, border:'none', background:'#fef2f2', color:'var(--red)', cursor:'pointer', fontSize:13 }}>✕</button>
                  </div>
                  {selProd && (
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ flex:1 }}>
                        <label style={{ fontSize:10, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:4 }}>ml in this drink</label>
                        <input type="number" min="0" step="5" placeholder="e.g. 30"
                          value={ing.ml_no_drink} onChange={e=>{const a=[...ingredientes];a[idx]={...a[idx],ml_no_drink:e.target.value};setIngredientes(a)}}
                          style={{ width:'100%', padding:'7px 10px', borderRadius:8, fontSize:13 }} />
                      </div>
                      <div style={{ textAlign:'center', minWidth:80 }}>
                        <div style={{ fontSize:10, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Cost</div>
                        <div style={{ fontSize:16, fontWeight:800, color: ingCost>0?'var(--red)':'var(--text3)' }}>
                          {ingCost>0 ? '¥'+ingCost.toLocaleString() : '—'}
                        </div>
                      </div>
                      <div style={{ textAlign:'center', minWidth:100, fontSize:11, color:'var(--text2)' }}>
                        ¥{selProd.preco_venda?.toLocaleString()} / {selProd.volume_ml}ml<br/>
                        <span style={{ fontSize:10 }}>= ¥{costPerMl.toFixed(1)}/ml</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {ingredientes.length > 0 && (() => {
              const autoCost = ingredientes.filter(i=>i.preco_garrafa&&i.volume_garrafa&&i.ml_no_drink)
                .reduce((sum,i)=>sum+Math.round((+i.preco_garrafa/+i.volume_garrafa)*(+i.ml_no_drink)),0)
              if (autoCost === 0) return null
              const margem = form.preco_venda > 0 ? Math.round((+form.preco_venda-autoCost)/+form.preco_venda*100) : null
              return (
                <div style={{ padding:'10px 14px', background:'var(--bg3)', borderRadius:10, fontSize:13, display:'flex', gap:20 }}>
                  <span>🧮 Auto cost: <strong style={{color:'var(--red)'}}>¥{autoCost.toLocaleString()}</strong></span>
                  {margem!==null && <span>Margin: <strong style={{color:margem>70?'var(--green)':'var(--amber)'}}>{margem}%</strong></span>}
                  {form.preco_venda && <span>Profit: <strong style={{color:'var(--green)'}}>¥{(+form.preco_venda-autoCost).toLocaleString()}</strong></span>}
                </div>
              )
            })()}
          </div>

          <div style={{ marginBottom:12 }}>
            <label className="form-label">Notes</label>
            <input type="text" value={form.notas} onChange={e=>setForm({...form,notas:e.target.value})} placeholder="Special instructions, variations..." />
          </div>

          <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
            <button onClick={()=>{setShowAdd(false);setEditId(null);setForm(emptyForm)}}
              style={{ padding:'10px 20px', borderRadius:10, border:'1px solid var(--border)', background:'transparent', cursor:'pointer' }}>Cancel</button>
            <button className="btn-primary" onClick={saveDrink} disabled={saving || !form.nome || !form.preco_venda}
              style={{ padding:'10px 20px', borderRadius:10 }}>
              {saving ? 'Saving...' : editId ? 'Save changes' : 'Add drink'}
            </button>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:20 }}>
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px' }}>
          <div style={{ fontSize:10, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Avg margin</div>
          <div style={{ fontSize:22, fontWeight:800, color:'var(--green)' }}>{avgMargem}%</div>
          <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>across all drinks</div>
        </div>
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px' }}>
          <div style={{ fontSize:10, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Best margin 🏆</div>
          <div style={{ fontSize:13, fontWeight:700 }}>{topDrink?.nome}</div>
          <div style={{ fontSize:13, color:'var(--green)', fontWeight:700 }}>{topDrink ? Math.round(topDrink.margem*100)+'%' : ''}</div>
        </div>
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px' }}>
          <div style={{ fontSize:10, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Watch out ⚠️</div>
          <div style={{ fontSize:13, fontWeight:700 }}>{lowDrink?.nome}</div>
          <div style={{ fontSize:13, color:'var(--red)', fontWeight:700 }}>{lowDrink ? Math.round(lowDrink.margem*100)+'%' : ''}</div>
        </div>
      </div>

      {/* Search + sort */}
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <div style={{ position:'relative', flex:1 }}>
          <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--text3)' }}>🔍</span>
          <input type="text" placeholder="Search drink or ingredient..." value={search}
            onChange={e=>setSearch(e.target.value)}
            style={{ width:'100%', padding:'10px 12px 10px 36px', borderRadius:10, fontSize:13 }}
          />
          {search && <button onClick={()=>setSearch('')} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text3)', fontSize:14 }}>✕</button>}
        </div>
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ width:'auto', fontSize:12 }}>
          <option value="margem">Margin ↓</option>
          <option value="nome">Name</option>
          <option value="custo">Cost ↑</option>
          <option value="preco">Price ↓</option>
        </select>
      </div>

      {/* Category pills */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
        <button onClick={()=>setCat('')} style={{ padding:'5px 14px', borderRadius:20, fontSize:11, fontWeight:600, background:!cat?'var(--navy)':'var(--bg3)', color:!cat?'white':'var(--text2)', border:'none', cursor:'pointer' }}>
          All ({drinks.length})
        </button>
        {cats.map(c => (
          <button key={c} onClick={()=>setCat(c===cat?'':c)} style={{ padding:'5px 14px', borderRadius:20, fontSize:11, fontWeight:600, background:cat===c?'var(--navy)':'var(--bg3)', color:cat===c?'white':'var(--text2)', border:'none', cursor:'pointer' }}>
            {c} ({drinks.filter(d=>d.categoria===c).length})
          </button>
        ))}
      </div>

      {/* Table header */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 70px 70px 64px 64px 64px', gap:8, padding:'6px 14px', fontSize:10, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
        <span>Drink · Recipe</span>
        <span style={{ textAlign:'right' }}>Price</span>
        <span style={{ textAlign:'right' }}>Cost</span>
        <span style={{ textAlign:'right' }}>VIP</span>
        <span style={{ textAlign:'center' }}>Margin</span>
        <span style={{ textAlign:'center' }}>VIP %</span>
        <span></span>
      </div>

      {/* Drink rows */}
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        {filtered.map(d => {
          const margPct = Math.round(d.margem * 100)
          const vipMarg = d.preco_desconto && d.custo ? Math.round((d.preco_desconto - d.custo) / d.preco_desconto * 100) : null
          const margColor = margPct >= 85 ? '#34c759' : margPct >= 70 ? '#ff9500' : '#ff3b30'
          const vipColor  = vipMarg !== null ? (vipMarg >= 50 ? '#f59e0b' : '#ff3b30') : 'var(--text3)'
          return (
            <div key={d.id} style={{
              display:'grid', gridTemplateColumns:'1fr 80px 70px 70px 64px 64px 64px',
              gap:8, padding:'10px 14px', alignItems:'center',
              background:'var(--bg2)', border:'1px solid var(--border)',
              borderLeft: d.custom ? '3px solid var(--gold)' : '3px solid transparent',
              borderRadius:10
            }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600 }}>{d.nome} {d.custom && <span style={{ fontSize:10, color:'var(--gold)', fontWeight:700 }}>CUSTOM</span>}</div>
                <div style={{ fontSize:11, color:'var(--text2)', marginTop:1 }}>{d.receita} {d.copo ? '· '+d.copo : ''}</div>
                {d.notas && <div style={{ fontSize:11, color:'var(--gold)', marginTop:1 }}>📝 {d.notas}</div>}
              </div>
              <div style={{ textAlign:'right', fontSize:13, fontWeight:700 }}>¥{d.preco_venda.toLocaleString()}</div>
              <div style={{ textAlign:'right', fontSize:12, color:'var(--red)' }}>¥{d.custo.toLocaleString()}</div>
              <div style={{ textAlign:'right', fontSize:12, color:'var(--gold)' }}>
                {d.preco_desconto ? '¥'+d.preco_desconto.toLocaleString() : '—'}
              </div>
              <div style={{ textAlign:'center' }}>
                <span style={{ fontSize:13, fontWeight:800, color:margColor }}>{margPct}%</span>
              </div>
              <div style={{ textAlign:'center' }}>
                <span style={{ fontSize:12, fontWeight:700, color:vipColor }}>{vipMarg !== null ? vipMarg+'%' : '—'}</span>
              </div>
              <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                <button onClick={()=>startEdit(d)} style={{ padding:'4px 8px', fontSize:11, borderRadius:6, border:'1px solid var(--border)', background:'transparent', cursor:'pointer', color:'var(--text2)' }}>✏️</button>
                <button onClick={()=>deleteDrink(d.id)} style={{ padding:'4px 8px', fontSize:11, borderRadius:6, border:'none', background:'#fef2f2', cursor:'pointer', color:'var(--red)' }}>🗑</button>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && <Empty text="No drinks found" icon="🍹" />}
      </div>
    </div>
  )
}



// ── FATURAS CLIENTE ───────────────────────────────────────────────────────────
function FaturasTab({ bar }) {
  const [faturas, setFaturas] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => { load() }, [bar])

  async function load() {
    const { data } = await supabase
      .from("faturas")
      .select("*, fatura_pagamentos(*)")
      .eq("bar_id", bar.id)
      .order("vencimento", { ascending: false })
    setFaturas(data || [])
    setLoading(false)
  }

  const pending = faturas.filter(f => f.status !== "pago")
  const totalPending = pending.reduce((a, f) => a + (f.total - f.pago), 0)
  const overdue = pending.filter(f => new Date(f.vencimento) < new Date())

  if (loading) return <Spinner text="Loading..." />

  return (
    <div className="fade-in" style={{ maxWidth:800 }}>
      {overdue.length > 0 && (
        <div style={{ background:"linear-gradient(135deg,#ff3b30,#c0392b)", borderRadius:16, padding:"16px 20px", marginBottom:16, boxShadow:"0 4px 20px rgba(255,59,48,0.25)" }}>
          <div style={{ fontSize:15, fontWeight:700, color:"white", marginBottom:4 }}>🚨 Overdue payment{overdue.length>1?"s":""}</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.85)" }}>Please contact JBM Drinks to arrange payment</div>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:20 }}>
        {[
          { label:"Total pending", value:fmtYen(totalPending), color:totalPending>0?"var(--red)":"var(--green)", icon:"💰" },
          { label:"Overdue", value:overdue.length, color:overdue.length>0?"var(--red)":"var(--green)", icon:"⚠️" },
          { label:"Total invoices", value:faturas.length, color:"var(--navy)", icon:"🧾" },
        ].map(k => (
          <div key={k.label} style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:14, padding:"16px" }}>
            <div style={{ fontSize:22, marginBottom:6 }}>{k.icon}</div>
            <div style={{ fontSize:22, fontWeight:800, color:k.color }}>{k.value}</div>
            <div style={{ fontSize:11, color:"var(--text2)", textTransform:"uppercase", letterSpacing:"0.05em", marginTop:4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>Invoice history</div>
      {faturas.length === 0 ? <Empty text="No invoices yet" icon="🧾" /> : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {faturas.map(f => {
            const remaining = f.total - f.pago
            const pct = f.total > 0 ? Math.round(f.pago / f.total * 100) : 0
            const isOverdue = f.status === "pendente" && new Date(f.vencimento) < new Date()
            const payments = f.fatura_pagamentos || []
            return (
              <div key={f.id} style={{ background:"var(--bg2)", border:"1px solid", borderColor:isOverdue?"rgba(255,59,48,0.3)":"var(--border)", borderRadius:14, padding:"16px 20px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700 }}>Period: {fmtDate(f.periodo_inicio)} → {fmtDate(f.periodo_fim)}</div>
                    <div style={{ fontSize:12, color:"var(--text2)", marginTop:2 }}>Due: {fmtDate(f.vencimento)}</div>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:20,
                    background:f.status==="pago"?"#f0fdf4":isOverdue?"#fef2f2":"#EAF0FA",
                    color:f.status==="pago"?"var(--green)":isOverdue?"var(--red)":"var(--navy)" }}>
                    {f.status==="pago"?"✅ Paid":isOverdue?"🚨 Overdue":"⏳ Pending"}
                  </span>
                </div>

                <div style={{ marginBottom:10 }}>
                  <div style={{ height:6, background:"var(--bg3)", borderRadius:3, overflow:"hidden", marginBottom:4 }}>
                    <div style={{ height:"100%", width:pct+"%", background:f.status==="pago"?"var(--green)":"var(--gold)", borderRadius:3 }}/>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                    <span style={{ color:"var(--text2)" }}>Paid: {fmtYen(f.pago)} ({pct}%)</span>
                    <span style={{ fontWeight:700, color:"var(--navy)" }}>Total: {fmtYen(f.total)}</span>
                  </div>
                </div>

                {remaining > 0 && (
                  <div style={{ fontSize:13, fontWeight:700, color:"var(--red)", marginBottom:8 }}>
                    Remaining: {fmtYen(remaining)}
                  </div>
                )}

                {payments.length > 0 && (
                  <button onClick={()=>setSelected(selected===f.id?null:f.id)}
                    style={{ fontSize:11, color:"var(--text2)", background:"none", border:"none", cursor:"pointer", padding:0 }}>
                    {selected===f.id?"▲ Hide":"▼ Show"} {payments.length} payment{payments.length>1?"s":""}
                  </button>
                )}

                {selected === f.id && (
                  <div style={{ marginTop:10, borderTop:"1px solid var(--border)", paddingTop:10 }}>
                    {payments.map(p => (
                      <div key={p.id} style={{ display:"flex", justifyContent:"space-between", fontSize:12, padding:"4px 0", color:"var(--text2)" }}>
                        <span>{fmtDate(p.data)} · {p.metodo}</span>
                        <span style={{ fontWeight:600, color:"var(--green)" }}>{fmtYen(p.valor)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── MAIN PORTAL ───────────────────────────────────────────────────────────────
import { NotificationBell } from './Notifications'

export default function PortalCliente({ bar, signOut, notifs=[], unread=0, markRead, markAllRead }) {
  const [tab, setTab] = useState('home')

  const NAV = [
    { id:'home',       label:'Home',       icon:'🏠' },
    { id:'orders',     label:'Orders',     icon:'🛒' },
    { id:'deliveries', label:'Deliveries', icon:'📦' },
    { id:'inventory',  label:'Inventory',  icon:'📊' },
    { id:'pricing',    label:'Pricing',    icon:'💰' },
    { id:'menu',       label:'Menu',       icon:'🍹' },
    { id:'faturas',    label:'Invoices',   icon:'💰' },
  ]

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--bg)' }}>
      <aside className="sidebar">
        <div style={{padding:'24px 20px 20px',borderBottom:'1px solid rgba(193,156,86,0.15)'}}>
          <div style={{fontSize:18,fontWeight:800,color:'white',letterSpacing:2}}>JBM</div>
          <div style={{fontSize:9,color:'var(--gold)',letterSpacing:'0.15em',textTransform:'uppercase',marginTop:2}}>Drinks</div>
        </div>
        <div style={{padding:'12px 0',flex:1}}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)} style={{
              display:'flex', alignItems:'center', gap:10,
              padding:'10px 20px', background: tab===n.id ? 'rgba(255,255,255,0.1)' : 'transparent',
              border:'none', color: tab===n.id ? 'white' : 'rgba(255,255,255,0.55)',
              fontSize:13, fontWeight: tab===n.id ? 700 : 400,
              cursor:'pointer', textAlign:'left', width:'100%',
              borderLeft: tab===n.id ? '3px solid var(--gold)' : '3px solid transparent',
              transition:'all 0.15s'
            }}>
              <span>{n.icon}</span>{n.label}
            </button>
          ))}
        </div>
        <div style={{padding:'16px 20px',borderTop:'1px solid rgba(255,255,255,0.08)'}}>
          <div style={{fontSize:10,color:'rgba(255,255,255,0.4)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.06em'}}>Client portal</div>
          <div style={{fontSize:13,fontWeight:700,color:'var(--gold)',marginBottom:12}}>{bar.nome}</div>
          <div style={{marginBottom:8}}>
            <NotificationBell notifs={notifs} unread={unread} markRead={markRead} markAllRead={markAllRead}/>
          </div>
          <button onClick={signOut} style={{width:'100%',padding:'7px',fontSize:11,color:'rgba(255,255,255,0.4)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,background:'transparent',textTransform:'uppercase',letterSpacing:'0.04em'}}>Sign out</button>
        </div>
      </aside>
      <main style={{flex:1,padding:'28px 32px',overflowY:'auto',maxWidth:900}}>
        {tab==='home'       && <HomeTab bar={bar} onTab={setTab} />}
        {tab==='orders'     && <OrdersTab bar={bar} />}
        {tab==='deliveries' && <DeliveriesTab bar={bar} />}
        {tab==='inventory'  && <InventoryTab bar={bar} onOrder={()=>setTab('orders')} />}
        {tab==='pricing'    && <PricingTab bar={bar} />}
        {tab==='menu'       && <MenuTab bar={bar} />}
        {tab==='faturas'    && <FaturasTab bar={bar} />}
      </main>
    </div>
  )
}
