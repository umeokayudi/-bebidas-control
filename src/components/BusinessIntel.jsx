import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmtYen, Spinner, Empty, SectionTitle } from './utils'

export default function BusinessIntel() {
  const [tab, setTab] = useState('profit')
  return (
    <div>
      <div style={{ marginBottom:4 }}>
        <div style={{ fontSize:20, fontWeight:800 }}>Business Intelligence</div>
        <div style={{ fontSize:13, color:'var(--text2)', marginTop:2, marginBottom:16 }}>Profit projections, weekly reports and business health</div>
      </div>
      <div style={{ display:'flex', gap:8, marginBottom:24, flexWrap:'wrap' }}>
        {[['profit','💰 Profit/Bottle'],['revenue','📈 Revenue'],['report','📋 Weekly Report'],['custom','🗓 Custom Period']].map(([id,label]) => (
          <button key={id} onClick={()=>setTab(id)} style={{
            padding:'8px 18px', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer',
            background: tab===id ? 'var(--navy)' : 'var(--bg3)',
            color: tab===id ? 'white' : 'var(--text2)', border:'none'
          }}>{label}</button>
        ))}
      </div>
      {tab==='profit'  && <ProfitPerBottle />}
      {tab==='revenue' && <RevenueProjection />}
      {tab==='report'  && <WeeklyReport />}
      {tab==='custom'  && <CustomPeriodReport />}
    </div>
  )
}

// ── PROFIT PER BOTTLE ─────────────────────────────────────────────────────────
function ProfitPerBottle() {
  const [produtos, setProdutos] = useState([])
  const [compras, setCompras] = useState([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState('margin')
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])
  async function load() {
    const [pR, cR] = await Promise.all([
      supabase.from('produtos').select('*').eq('ativo',true).order('categoria').order('nome'),
      supabase.from('compras_itens').select('produto_id, qtd, preco_unitario').limit(500),
    ])
    setProdutos(pR.data||[])
    setCompras(cR.data||[])
    setLoading(false)
  }

  const list = produtos.map(p => {
    const bought = compras.filter(c=>c.produto_id===p.id)
    const totalQty = bought.reduce((a,c)=>a+c.qtd,0)
    const avgCost = bought.length > 0 ? bought.reduce((a,c)=>a+(c.preco_unitario*c.qtd),0)/totalQty : p.custo
    const margin = p.preco_venda > 0 ? Math.round((p.preco_venda - (avgCost||p.custo))/p.preco_venda*100) : 0
    const profitPerBottle = p.preco_venda - (avgCost||p.custo||0)
    const profitPerMl = p.volume_ml > 0 ? profitPerBottle/p.volume_ml : 0
    return { ...p, avgCost: avgCost||p.custo||0, margin, profitPerBottle, profitPerMl, totalQty }
  }).filter(p => !search || p.nome.toLowerCase().includes(search.toLowerCase()) || p.categoria.toLowerCase().includes(search.toLowerCase()))
   .sort((a,b) => {
    if (sort==='margin') return b.margin - a.margin
    if (sort==='profit') return b.profitPerBottle - a.profitPerBottle
    if (sort==='cost') return a.avgCost - b.avgCost
    return a.nome.localeCompare(b.nome)
  })

  const avgMargin = list.length > 0 ? Math.round(list.reduce((a,p)=>a+p.margin,0)/list.length) : 0
  const topProfit = list[0]

  if (loading) return <Spinner text="Loading..." />

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Avg margin', value:avgMargin+'%', color:'var(--green)', icon:'📊' },
          { label:'Best product', value:topProfit?.nome?.split(' ')[0]||'—', color:'var(--navy)', icon:'🏆' },
          { label:'Total SKUs', value:list.length, color:'var(--blue)', icon:'📦' },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'16px' }}>
            <div style={{ fontSize:20, marginBottom:6 }}>{k.icon}</div>
            <div style={{ fontSize:22, fontWeight:800, color:k.color }}>{k.value}</div>
            <div style={{ fontSize:11, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.05em', marginTop:4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:10, marginBottom:16 }}>
        <div style={{ position:'relative', flex:1 }}>
          <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--text3)' }}>🔍</span>
          <input type="text" placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}
            style={{ width:'100%', padding:'9px 12px 9px 36px', borderRadius:10, fontSize:13 }} />
        </div>
        <select value={sort} onChange={e=>setSort(e.target.value)} style={{ width:'auto', fontSize:12 }}>
          <option value="margin">Sort: Margin</option>
          <option value="profit">Sort: Profit/bottle</option>
          <option value="cost">Sort: Cost</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      <div style={{ overflowX:'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th style={{ textAlign:'right' }}>JBM Cost</th>
              <th style={{ textAlign:'right' }}>Bar Price</th>
              <th style={{ textAlign:'right' }}>Profit/bottle</th>
              <th style={{ textAlign:'right' }}>Margin</th>
              <th style={{ textAlign:'right' }}>Profit/ml</th>
              <th style={{ textAlign:'right' }}>Purchased</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p,i) => {
              const color = p.margin>=70?'var(--green)':p.margin>=50?'var(--amber)':'var(--red)'
              return (
                <tr key={p.id} style={{ background:i===0?'rgba(193,156,86,0.05)':'transparent' }}>
                  <td>
                    <div style={{ fontWeight:600, fontSize:13 }}>{p.nome}</div>
                    <div style={{ fontSize:11, color:'var(--text2)' }}>{p.categoria} {p.volume_ml>0?'· '+p.volume_ml+'ml':''}</div>
                  </td>
                  <td style={{ textAlign:'right', color:'var(--red)', fontWeight:600 }}>{fmtYen(p.avgCost)}</td>
                  <td style={{ textAlign:'right', fontWeight:600 }}>{fmtYen(p.preco_venda)}</td>
                  <td style={{ textAlign:'right', fontWeight:700, color:'var(--green)' }}>{fmtYen(p.profitPerBottle)}</td>
                  <td style={{ textAlign:'right' }}>
                    <span style={{ fontSize:12, fontWeight:800, padding:'3px 10px', borderRadius:20,
                      background:p.margin>=70?'#f0fdf4':p.margin>=50?'#fffbeb':'#fef2f2', color }}>
                      {p.margin}%
                    </span>
                  </td>
                  <td style={{ textAlign:'right', fontSize:12, color:'var(--text2)' }}>
                    {p.profitPerMl>0?'¥'+p.profitPerMl.toFixed(1)+'/ml':'—'}
                  </td>
                  <td style={{ textAlign:'right', fontSize:12, color:'var(--text2)' }}>{p.totalQty>0?p.totalQty+' units':'—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── REVENUE PROJECTION ────────────────────────────────────────────────────────
function RevenueProjection() {
  const [drinks, setDrinks] = useState([])
  const [movimentos, setMovimentos] = useState([])
  const [bars, setBars] = useState([])
  const [loading, setLoading] = useState(true)
  const [selBar, setSelBar] = useState('')
  const [periodo, setPeriodo] = useState('30')

  useEffect(() => { load() }, [])
  async function load() {
    const [dR, mR, bR] = await Promise.all([
      supabase.from('drink_menu').select('*').order('categoria').order('nome'),
      supabase.from('estoque_movimentos').select('*').eq('tipo','saida').order('criado_em',{ascending:false}).limit(1000),
      supabase.from('bars').select('*').order('nome'),
    ])
    setDrinks(dR.data||[])
    setMovimentos(mR.data||[])
    setBars(bR.data||[])
    if (bR.data?.length>0) setSelBar(bR.data[0].id)
    setLoading(false)
  }

  const days = +periodo
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-days)
  const cutStr = cutoff.toISOString()

  const barMovs = movimentos.filter(m => m.bar_id===selBar && m.criado_em>=cutStr)
  const barDrinks = drinks.filter(d => d.bar_id===selBar)

  // For each movement (bottle opened), calculate revenue potential
  const prodRevMap = {}
  barMovs.forEach(m => {
    const drink = barDrinks.find(d => d.receita?.includes(m.produto_id))
    if (!drink) return
    if (!prodRevMap[drink.id]) prodRevMap[drink.id] = { drink, bottles:0, revenue:0, cost:0 }
    prodRevMap[drink.id].bottles += m.qtd
    prodRevMap[drink.id].revenue += m.qtd * drink.preco_venda
    prodRevMap[drink.id].cost += m.qtd * drink.custo
  })

  const totalRevenue = barDrinks.reduce((a,d) => a + d.preco_venda, 0)
  const totalCost = barDrinks.reduce((a,d) => a + d.custo, 0)
  const avgMargin = barDrinks.length>0 ? Math.round((totalRevenue-totalCost)/totalRevenue*100) : 0

  const cats = [...new Set(barDrinks.map(d=>d.categoria))]

  if (loading) return <Spinner text="Loading..." />

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700 }}>Revenue Projection</div>
          <div style={{ fontSize:13, color:'var(--text2)' }}>Based on drink menu pricing</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <select value={selBar} onChange={e=>setSelBar(e.target.value)} style={{ width:'auto', fontSize:12 }}>
            {bars.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
          <select value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{ width:'auto', fontSize:12 }}>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </select>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Total drinks in menu', value:barDrinks.length, icon:'🍹', color:'var(--navy)' },
          { label:'Avg menu margin', value:avgMargin+'%', icon:'📊', color:'var(--green)' },
          { label:'Categories', value:cats.length, icon:'📂', color:'var(--blue)' },
        ].map(k=>(
          <div key={k.label} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'16px' }}>
            <div style={{ fontSize:20, marginBottom:6 }}>{k.icon}</div>
            <div style={{ fontSize:22, fontWeight:800, color:k.color }}>{k.value}</div>
            <div style={{ fontSize:11, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.05em', marginTop:4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {cats.map(cat => (
        <div key={cat} style={{ marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>{cat}</div>
          <div style={{ overflowX:'auto' }}>
            <table>
              <thead><tr><th>Drink</th><th>Recipe</th><th style={{textAlign:'right'}}>Sale price</th><th style={{textAlign:'right'}}>Cost</th><th style={{textAlign:'right'}}>Margin</th><th style={{textAlign:'right'}}>Profit/drink</th></tr></thead>
              <tbody>
                {barDrinks.filter(d=>d.categoria===cat).map(d => {
                  const m = Math.round(d.margem*100)
                  const color = m>=85?'var(--green)':m>=70?'var(--amber)':'var(--red)'
                  return (
                    <tr key={d.id}>
                      <td style={{ fontWeight:600, fontSize:13 }}>{d.nome}</td>
                      <td style={{ fontSize:11, color:'var(--text2)' }}>{d.receita}</td>
                      <td style={{ textAlign:'right', fontWeight:600 }}>{fmtYen(d.preco_venda)}</td>
                      <td style={{ textAlign:'right', color:'var(--red)', fontSize:12 }}>{fmtYen(d.custo)}</td>
                      <td style={{ textAlign:'right' }}><span style={{ fontSize:12, fontWeight:700, padding:'2px 8px', borderRadius:20, background:m>=85?'#f0fdf4':m>=70?'#fffbeb':'#fef2f2', color }}>{m}%</span></td>
                      <td style={{ textAlign:'right', fontWeight:700, color:'var(--green)' }}>{fmtYen(d.preco_venda-d.custo)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── WEEKLY REPORT ─────────────────────────────────────────────────────────────
function WeeklyReport() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-7)
    const weekStr = weekAgo.toISOString().slice(0,10)
    const prevWeek = new Date(); prevWeek.setDate(prevWeek.getDate()-14)
    const prevStr = prevWeek.toISOString().slice(0,10)

    const [vR, cR, mR, pR] = await Promise.all([
      supabase.from('vendas').select('*, vendas_itens(qtd,preco_unitario,produto_id)').gte('data',weekStr),
      supabase.from('compras').select('*, compras_itens(qtd,preco_unitario,produto_id)').gte('data',weekStr),
      supabase.from('estoque_movimentos').select('*').gte('criado_em',weekStr+'T00:00:00'),
      supabase.from('vendas').select('total').gte('data',prevStr).lt('data',weekStr),
    ])

    const vendas = vR.data||[]
    const compras = cR.data||[]
    const movs = mR.data||[]
    const prevVendas = pR.data||[]

    const totalRevenue = vendas.reduce((a,v)=>a+(+v.total||0),0)
    const totalCost = compras.reduce((a,c)=>a+(+c.total_pago||0),0)
    const prevRevenue = prevVendas.reduce((a,v)=>a+(+v.total||0),0)
    const growth = prevRevenue>0 ? Math.round((totalRevenue-prevRevenue)/prevRevenue*100) : null

    const entries = movs.filter(m=>m.tipo==='entrada').reduce((a,m)=>a+m.qtd,0)
    const exits = movs.filter(m=>m.tipo==='saida').reduce((a,m)=>a+m.qtd,0)

    setData({ totalRevenue, totalCost, profit:totalRevenue-totalCost, growth, entries, exits, vendas:vendas.length, compras:compras.length })
    setLoading(false)
  }

  if (loading) return <Spinner text="Loading weekly data..." />

  const d = data
  const isGood = d.profit > 0 && (d.growth===null || d.growth >= 0)

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700 }}>Weekly Report</div>
          <div style={{ fontSize:13, color:'var(--text2)' }}>Last 7 days · {new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <div style={{ padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:700,
            background:isGood?'#f0fdf4':'#fef2f2', color:isGood?'var(--green)':'var(--red)' }}>
            {isGood?'✅ Good week':'⚠️ Watch out'}
          </div>
          <button onClick={async()=>{setSending(true); await new Promise(r=>setTimeout(r,1500)); setSending(false); setSent(true)}}
            disabled={sending||sent} className="btn-primary" style={{ padding:'8px 16px', fontSize:12, borderRadius:10 }}>
            {sent?'✅ Sent!':sending?'Sending...':'📧 Email report'}
          </button>
        </div>
      </div>

      {/* Health banner */}
      <div style={{ background:isGood?'linear-gradient(135deg,#f0fdf4,#dcfce7)':'linear-gradient(135deg,#fef2f2,#fee2e2)',
        border:isGood?'1px solid #86efac':'1px solid #fca5a5', borderRadius:16, padding:'20px 24px', marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:800, color:isGood?'#16a34a':'#dc2626', marginBottom:8 }}>
          {isGood?'💪 Business is healthy this week':'⚠️ Business needs attention'}
        </div>
        <div style={{ fontSize:13, color:isGood?'#15803d':'#b91c1c', lineHeight:1.6 }}>
          {d.growth!==null && `Revenue ${d.growth>=0?'grew':'dropped'} ${Math.abs(d.growth)}% vs last week. `}
          {d.profit>0?`Net profit: ${fmtYen(d.profit)}.`:`Net loss: ${fmtYen(Math.abs(d.profit))}.`}
          {d.entries>d.exits?' Stock increasing — good inventory control.':' More stock going out than in — check waste.'}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Revenue (sales to bars)', value:fmtYen(d.totalRevenue), color:'var(--navy)', sub:d.growth!==null?(d.growth>=0?'↑ +'+d.growth+'% vs last week':'↓ '+d.growth+'% vs last week'):null, subColor:d.growth>=0?'var(--green)':'var(--red)' },
          { label:'Purchases (cost)', value:fmtYen(d.totalCost), color:'var(--red)', sub:d.compras+' purchase orders' },
          { label:'Net profit', value:fmtYen(d.profit), color:d.profit>=0?'var(--green)':'var(--red)', sub:d.totalRevenue>0?Math.round(d.profit/d.totalRevenue*100)+'% margin':null },
          { label:'Stock movements', value:d.entries+' in / '+d.exits+' out', color:'var(--navy)', sub:'Net: '+(d.entries-d.exits>=0?'+':'')+(d.entries-d.exits)+' units' },
        ].map(k=>(
          <div key={k.label} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'18px 20px' }}>
            <div style={{ fontSize:11, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>{k.label}</div>
            <div style={{ fontSize:22, fontWeight:800, color:k.color }}>{k.value}</div>
            {k.sub && <div style={{ fontSize:12, color:k.subColor||'var(--text2)', marginTop:6, fontWeight:k.subColor?600:400 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Tips */}
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'20px 24px' }}>
        <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>💡 Tips for this week</div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {[
            d.profit < 0 && '⚠️ You are operating at a loss. Review purchase costs and check if sales prices need adjustment.',
            d.exits > d.entries && '📦 More stock going out than coming in. Consider placing orders soon.',
            d.growth !== null && d.growth < 0 && '📉 Revenue dropped vs last week. Check if orders were delayed or canceled.',
            d.growth !== null && d.growth > 20 && '🚀 Great growth! Make sure you have enough stock to sustain demand.',
            '💰 Focus on high-margin products like Shochu and house champagne to maximize profit.',
            '🔄 Review slow-moving products and consider replacing them with higher-margin alternatives.',
          ].filter(Boolean).map((tip,i) => (
            <div key={i} style={{ fontSize:13, padding:'10px 14px', background:'var(--bg3)', borderRadius:10, lineHeight:1.5 }}>{tip}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── CUSTOM PERIOD REPORT ──────────────────────────────────────────────────────
function CustomPeriodReport() {
  const today = new Date().toISOString().slice(0,10)
  const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate()-30)
  const [from, setFrom] = useState(monthAgo.toISOString().slice(0,10))
  const [to, setTo] = useState(today)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)

  async function generate() {
    setLoading(true)
    const [vR, cR, mR] = await Promise.all([
      supabase.from('vendas').select('*, vendas_itens(qtd,preco_unitario,produto_id,produtos(nome,categoria))').gte('data',from).lte('data',to),
      supabase.from('compras').select('*, compras_itens(qtd,preco_unitario,produto_id,produtos(nome))').gte('data',from).lte('data',to),
      supabase.from('estoque_movimentos').select('*, produtos(nome,categoria)').gte('criado_em',from+'T00:00:00').lte('criado_em',to+'T23:59:59'),
    ])

    const vendas = vR.data||[]
    const compras = cR.data||[]
    const movs = mR.data||[]

    const totalRevenue = vendas.reduce((a,v)=>a+(+v.total||0),0)
    const totalCost = compras.reduce((a,c)=>a+(+c.total_pago||0),0)
    const profit = totalRevenue - totalCost
    const margin = totalRevenue>0 ? Math.round(profit/totalRevenue*100) : 0

    // Top products by revenue
    const prodRev = {}
    vendas.forEach(v => (v.vendas_itens||[]).forEach(it => {
      const nome = it.produtos?.nome||'?'
      prodRev[nome] = (prodRev[nome]||0) + (it.preco_unitario*it.qtd)
    }))
    const topRevenue = Object.entries(prodRev).sort((a,b)=>b[1]-a[1]).slice(0,5)

    // Stock in vs out
    const entries = movs.filter(m=>m.tipo==='entrada').reduce((a,m)=>a+m.qtd,0)
    const exits = movs.filter(m=>m.tipo==='saida').reduce((a,m)=>a+m.qtd,0)

    setData({ totalRevenue, totalCost, profit, margin, topRevenue, entries, exits, vendas:vendas.length, compras:compras.length, days: Math.round((new Date(to)-new Date(from))/(1000*60*60*24)) })
    setLoading(false)
  }

  return (
    <div>
      <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Custom Period Report</div>
      <div style={{ fontSize:13, color:'var(--text2)', marginBottom:16 }}>Generate a full business report for any date range</div>

      <div style={{ display:'flex', gap:12, alignItems:'flex-end', marginBottom:20, flexWrap:'wrap' }}>
        <div>
          <label style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>From</label>
          <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{ padding:'9px 12px', borderRadius:10 }} />
        </div>
        <div>
          <label style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>To</label>
          <input type="date" value={to} onChange={e=>setTo(e.target.value)} style={{ padding:'9px 12px', borderRadius:10 }} />
        </div>
        <button className="btn-primary" onClick={generate} disabled={loading} style={{ padding:'10px 24px', borderRadius:10 }}>
          {loading?'Generating...':'Generate report'}
        </button>
      </div>

      {data && (
        <div className="fade-in">
          <div style={{ background:'var(--navy)', borderRadius:16, padding:'24px', marginBottom:16, color:'white' }}>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.6)', marginBottom:4 }}>Period: {from} → {to} ({data.days} days)</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
              {[
                { label:'Revenue', value:fmtYen(data.totalRevenue), color:'var(--gold)' },
                { label:'Costs', value:fmtYen(data.totalCost), color:'#ff6b6b' },
                { label:'Net Profit', value:fmtYen(data.profit), color:data.profit>=0?'#34c759':'#ff3b30' },
                { label:'Margin', value:data.margin+'%', color:data.margin>=30?'#34c759':data.margin>=0?'var(--gold)':'#ff3b30' },
              ].map(k=>(
                <div key={k.label}>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{k.label}</div>
                  <div style={{ fontSize:20, fontWeight:800, color:k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
            <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'18px 20px' }}>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>Top products by revenue</div>
              {data.topRevenue.length===0 ? <Empty text="No sales data" /> :
                data.topRevenue.map(([nome,val],i)=>(
                  <div key={nome} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                    <span>{i===0?'🥇':i===1?'🥈':i===2?'🥉':'  '} {nome}</span>
                    <span style={{ fontWeight:600 }}>{fmtYen(val)}</span>
                  </div>
                ))
              }
            </div>
            <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'18px 20px' }}>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>Stock movements</div>
              {[
                { label:'Stock in (received)', value:data.entries+' units', color:'var(--green)', icon:'↑' },
                { label:'Stock out (used/sold)', value:data.exits+' units', color:'var(--amber)', icon:'↓' },
                { label:'Net change', value:(data.entries-data.exits>=0?'+':'')+(data.entries-data.exits)+' units', color:data.entries>=data.exits?'var(--green)':'var(--red)', icon:'=' },
                { label:'Deliveries', value:data.vendas+' orders', color:'var(--navy)', icon:'📦' },
                { label:'Purchases', value:data.compras+' orders', color:'var(--navy)', icon:'🛒' },
              ].map(k=>(
                <div key={k.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                  <span style={{ color:'var(--text2)' }}>{k.icon} {k.label}</span>
                  <span style={{ fontWeight:600, color:k.color }}>{k.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'18px 20px' }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>Business health assessment</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {[
                { ok:data.profit>=0, msg:data.profit>=0?'✅ Profitable period — keep it up!':'⚠️ Loss period — review costs and pricing' },
                { ok:data.margin>=30, msg:data.margin>=30?'✅ Healthy margin ('+data.margin+'%)':'⚠️ Low margin ('+data.margin+'%) — consider price adjustments' },
                { ok:data.entries>=data.exits*0.8, msg:data.entries>=data.exits*0.8?'✅ Good stock management':'⚠️ High stock consumption — check for waste or theft' },
                { ok:data.vendas>0, msg:data.vendas>0?'✅ '+data.vendas+' deliveries made in this period':'⚠️ No deliveries recorded — check data' },
              ].map((item,i)=>(
                <div key={i} style={{ padding:'10px 14px', borderRadius:10, background:item.ok?'#f0fdf4':'#fef2f2', border:'1px solid', borderColor:item.ok?'#86efac':'#fca5a5', fontSize:13, color:item.ok?'#16a34a':'#dc2626' }}>
                  {item.msg}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
