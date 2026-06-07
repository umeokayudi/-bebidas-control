import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmtYen, fmtDate, Spinner, Empty } from './utils'

export default function Cashflow() {
  const [tab, setTab] = useState('overview')
  return (
    <div>
      <div style={{ fontSize:20, fontWeight:800, marginBottom:4 }}>Cash Flow</div>
      <div style={{ fontSize:13, color:'var(--text2)', marginBottom:16 }}>Track money in (bar payments) and money out (supplier purchases)</div>
      <div style={{ display:'flex', gap:8, marginBottom:24 }}>
        {[['overview','📊 Overview'],['in','💚 Money In'],['out','🔴 Money Out'],['purchases','🛒 Purchases']].map(([id,label]) => (
          <button key={id} onClick={()=>setTab(id)} style={{ padding:'8px 18px', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', background:tab===id?'var(--navy)':'var(--bg3)', color:tab===id?'white':'var(--text2)', border:'none' }}>{label}</button>
        ))}
      </div>
      {tab==='overview'  && <CashflowOverview />}
      {tab==='in'        && <MoneyIn />}
      {tab==='out'       && <MoneyOut />}
      {tab==='purchases' && <PurchasePayments />}
    </div>
  )
}

function CashflowOverview() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { load() }, [])
  async function load() {
    const [fR, cR] = await Promise.all([
      supabase.from('faturas').select('*').order('vencimento'),
      supabase.from('compras').select('*').order('data'),
    ])
    setData({ faturas: fR.data||[], compras: cR.data||[] })
    setLoading(false)
  }
  if (loading) return <Spinner text="Loading..." />

  const { faturas, compras } = data
  const today = new Date().toISOString().slice(0,10)

  // Money in - paid invoices
  const paidIn = faturas.filter(f=>f.status==='pago').reduce((a,f)=>a+(+f.total||0),0)
  const pendingIn = faturas.filter(f=>f.status!=='pago').reduce((a,f)=>a+((+f.total||0)-(+f.pago||0)),0)

  // Money out - purchases
  const paidOut = compras.filter(c=>c.status_pagamento==='pago'||!c.status_pagamento).reduce((a,c)=>a+(+c.total_pago||0),0)
  const pendingOut = compras.filter(c=>c.status_pagamento==='pendente').reduce((a,c)=>a+(+c.total_pago||0),0)

  const netCash = paidIn - paidOut
  const projectedNet = (paidIn + pendingIn) - (paidOut + pendingOut)

  // Last 8 weeks cashflow
  const weeks = []
  for (let i=7; i>=0; i--) {
    const end = new Date(); end.setDate(end.getDate()-i*7)
    const start = new Date(end); start.setDate(start.getDate()-6)
    const s = start.toISOString().slice(0,10)
    const e = end.toISOString().slice(0,10)
    const inAmt = faturas.filter(f=>f.status==='pago'&&f.vencimento>=s&&f.vencimento<=e).reduce((a,f)=>a+(+f.total||0),0)
    const outAmt = compras.filter(c=>(c.data_pagamento||c.data)>=s&&(c.data_pagamento||c.data)<=e).reduce((a,c)=>a+(+c.total_pago||0),0)
    weeks.push({ label: start.toLocaleDateString('en-US',{month:'short',day:'numeric'}), in:inAmt, out:outAmt, net:inAmt-outAmt })
  }
  const maxVal = Math.max(...weeks.map(w=>Math.max(w.in,w.out)), 1)

  // Next 30 days projected
  const next30 = []
  for (let i=0; i<30; i++) {
    const d = new Date(); d.setDate(d.getDate()+i)
    const ds = d.toISOString().slice(0,10)
    const inAmt = faturas.filter(f=>f.status!=='pago'&&f.vencimento===ds).reduce((a,f)=>a+((+f.total||0)-(+f.pago||0)),0)
    const outAmt = compras.filter(c=>c.status_pagamento==='pendente'&&(c.data_pagamento||c.data)===ds).reduce((a,c)=>a+(+c.total_pago||0),0)
    if (inAmt>0||outAmt>0) next30.push({ date:ds, in:inAmt, out:outAmt })
  }

  return (
    <div>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Total received', value:fmtYen(paidIn), color:'var(--green)', icon:'💚' },
          { label:'Total paid out', value:fmtYen(paidOut), color:'var(--red)', icon:'🔴' },
          { label:'Net cash', value:fmtYen(netCash), color:netCash>=0?'var(--green)':'var(--red)', icon:'💰' },
          { label:'Pending in', value:fmtYen(pendingIn), color:'var(--amber)', icon:'⏳' },
        ].map(k=>(
          <div key={k.label} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'14px' }}>
            <div style={{ fontSize:20, marginBottom:4 }}>{k.icon}</div>
            <div style={{ fontSize:18, fontWeight:800, color:k.color }}>{k.value}</div>
            <div style={{ fontSize:10, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.05em', marginTop:4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Weekly cashflow chart */}
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'20px', marginBottom:16 }}>
        <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>Weekly cash flow — last 8 weeks</div>
        <div style={{ display:'flex', gap:16, marginBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}><div style={{ width:12,height:12,borderRadius:2,background:'var(--green)' }}/> Money in</div>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}><div style={{ width:12,height:12,borderRadius:2,background:'var(--red)' }}/> Money out</div>
        </div>
        <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:120 }}>
          {weeks.map((w,i) => (
            <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
              <div style={{ width:'100%', display:'flex', gap:2, alignItems:'flex-end', height:90 }}>
                <div style={{ flex:1, background:'rgba(52,199,89,0.8)', borderRadius:'3px 3px 0 0', height:Math.max(w.in/maxVal*90, w.in>0?3:0)+'px' }}/>
                <div style={{ flex:1, background:'rgba(255,59,48,0.8)', borderRadius:'3px 3px 0 0', height:Math.max(w.out/maxVal*90, w.out>0?3:0)+'px' }}/>
              </div>
              <div style={{ fontSize:9, color:i===7?'var(--navy)':'var(--text3)', fontWeight:i===7?700:400, textAlign:'center' }}>{w.label}</div>
              {w.net!==0 && <div style={{ fontSize:9, color:w.net>=0?'var(--green)':'var(--red)', fontWeight:600 }}>{w.net>=0?'+':''}{Math.round(w.net/1000)}k</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Next 30 days */}
      {next30.length>0 && (
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'20px', marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>Next 30 days — projected</div>
          {next30.map((d,i)=>(
            <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
              <span style={{ color:'var(--text2)' }}>{fmtDate(d.date)}</span>
              <div style={{ display:'flex', gap:16 }}>
                {d.in>0&&<span style={{ color:'var(--green)', fontWeight:600 }}>+{fmtYen(d.in)}</span>}
                {d.out>0&&<span style={{ color:'var(--red)', fontWeight:600 }}>-{fmtYen(d.out)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      <div style={{ background:'var(--navy)', borderRadius:16, padding:'20px 24px', color:'white' }}>
        <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>Projected position</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div><div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginBottom:4 }}>Expected to receive</div><div style={{ fontSize:18, fontWeight:800, color:'#34c759' }}>{fmtYen(pendingIn)}</div></div>
          <div><div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginBottom:4 }}>Expected to pay</div><div style={{ fontSize:18, fontWeight:800, color:'#ff6b6b' }}>{fmtYen(pendingOut)}</div></div>
          <div><div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginBottom:4 }}>Projected net</div><div style={{ fontSize:20, fontWeight:800, color:projectedNet>=0?'var(--gold)':'#ff3b30' }}>{fmtYen(projectedNet)}</div></div>
          <div><div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginBottom:4 }}>Current net cash</div><div style={{ fontSize:20, fontWeight:800, color:netCash>=0?'var(--gold)':'#ff3b30' }}>{fmtYen(netCash)}</div></div>
        </div>
      </div>
    </div>
  )
}

function MoneyIn() {
  const [faturas, setFaturas] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('faturas').select('*, bars(nome)').order('vencimento',{ascending:false})
    setFaturas(data||[]); setLoading(false)
  }
  if (loading) return <Spinner text="Loading..." />
  const total = faturas.reduce((a,f)=>a+(+f.total||0),0)
  const paid = faturas.filter(f=>f.status==='pago').reduce((a,f)=>a+(+f.total||0),0)
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>
        {[
          { label:'Total billed', value:fmtYen(total), color:'var(--navy)' },
          { label:'Received', value:fmtYen(paid), color:'var(--green)' },
          { label:'Outstanding', value:fmtYen(total-paid), color:total-paid>0?'var(--red)':'var(--green)' },
        ].map(k=>(
          <div key={k.label} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'14px' }}>
            <div style={{ fontSize:22, fontWeight:800, color:k.color }}>{k.value}</div>
            <div style={{ fontSize:11, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.05em', marginTop:4 }}>{k.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {faturas.map(f=>{
          const pct = f.total>0?Math.round((f.pago||0)/f.total*100):0
          const isOverdue = f.status!=='pago'&&new Date(f.vencimento)<new Date()
          return (
            <div key={f.id} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700 }}>{f.bars?.nome}</div>
                  <div style={{ fontSize:11, color:'var(--text2)' }}>Due {fmtDate(f.vencimento)}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:15, fontWeight:800 }}>{fmtYen(f.total||0)}</div>
                  <span style={{ fontSize:11, fontWeight:700, color:f.status==='pago'?'var(--green)':isOverdue?'var(--red)':'var(--amber)' }}>
                    {f.status==='pago'?'Paid':isOverdue?'Overdue':'Pending'}
                  </span>
                </div>
              </div>
              <div style={{ height:4, background:'var(--bg3)', borderRadius:2, overflow:'hidden' }}>
                <div style={{ height:'100%', width:pct+'%', background:f.status==='pago'?'var(--green)':'var(--gold)', borderRadius:2 }}/>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MoneyOut() {
  const [compras, setCompras] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('compras').select('*').order('data',{ascending:false}).limit(100)
    setCompras(data||[]); setLoading(false)
  }
  if (loading) return <Spinner text="Loading..." />
  const total = compras.reduce((a,c)=>a+(+c.total_pago||0),0)
  const paid = compras.filter(c=>c.status_pagamento!=='pendente').reduce((a,c)=>a+(+c.total_pago||0),0)
  const pending = compras.filter(c=>c.status_pagamento==='pendente').reduce((a,c)=>a+(+c.total_pago||0),0)
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>
        {[
          { label:'Total purchased', value:fmtYen(total), color:'var(--navy)' },
          { label:'Paid', value:fmtYen(paid), color:'var(--red)' },
          { label:'Pending payment', value:fmtYen(pending), color:pending>0?'var(--amber)':'var(--green)' },
        ].map(k=>(
          <div key={k.label} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'14px' }}>
            <div style={{ fontSize:22, fontWeight:800, color:k.color }}>{k.value}</div>
            <div style={{ fontSize:11, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.05em', marginTop:4 }}>{k.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {compras.map(c=>(
          <div key={c.id} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700 }}>{c.fornecedor||'Supplier'}</div>
              <div style={{ fontSize:11, color:'var(--text2)' }}>
                Purchase: {fmtDate(c.data)}
                {c.data_pagamento && <span> · Paid: {fmtDate(c.data_pagamento)}</span>}
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:15, fontWeight:800, color:'var(--red)' }}>{fmtYen(c.total_pago||0)}</div>
              <span style={{ fontSize:11, fontWeight:700, color:c.status_pagamento==='pendente'?'var(--amber)':'var(--green)' }}>
                {c.status_pagamento==='pendente'?'Pending':'Paid'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PurchasePayments() {
  const [compras, setCompras] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ data_pagamento:'', metodo:'Card', status_pagamento:'pago' })
  const [saving, setSaving] = useState(false)
  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('compras').select('*').order('data',{ascending:false}).limit(100)
    setCompras(data||[]); setLoading(false)
  }
  async function save() {
    if (!modal) return; setSaving(true)
    await supabase.from('compras').update({ data_pagamento:form.data_pagamento||null, metodo_pagamento_real:form.metodo, status_pagamento:form.status_pagamento }).eq('id',modal.id)
    setSaving(false); setModal(null); load()
  }

  if (loading) return <Spinner text="Loading..." />
  const pendingCount = compras.filter(c=>c.status_pagamento==='pendente').length

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontSize:16, fontWeight:700 }}>Purchase Payment Dates</div>
        {pendingCount>0 && <div style={{ fontSize:12, color:'var(--amber)', fontWeight:600 }}>{pendingCount} pending payments</div>}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {compras.map(c=>(
          <div key={c.id} style={{ background:'var(--bg2)', border:'1px solid', borderColor:c.status_pagamento==='pendente'?'rgba(255,149,0,0.3)':'var(--border)', borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600 }}>{c.fornecedor||'Supplier'} — {fmtDate(c.data)}</div>
              <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>
                {c.pagamento} · {fmtYen(c.total_pago||0)}
                {c.data_pagamento&&<span> · Paid {fmtDate(c.data_pagamento)}</span>}
                {c.metodo_pagamento_real&&<span> via {c.metodo_pagamento_real}</span>}
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:c.status_pagamento==='pendente'?'#fffbeb':'#f0fdf4', color:c.status_pagamento==='pendente'?'var(--amber)':'var(--green)' }}>
                {c.status_pagamento==='pendente'?'Pending':'Paid'}
              </span>
              <button onClick={()=>{ setModal(c); setForm({ data_pagamento:c.data_pagamento||new Date().toISOString().slice(0,10), metodo:c.metodo_pagamento_real||'Card', status_pagamento:c.status_pagamento||'pago' }) }}
                style={{ padding:'5px 12px', fontSize:12, borderRadius:8, border:'1px solid var(--border)', background:'transparent', cursor:'pointer' }}>✏️ Edit</button>
            </div>
          </div>
        ))}
      </div>

      {modal&&(
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'var(--bg2)', borderRadius:20, padding:'28px', width:'100%', maxWidth:380, boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>{modal.fornecedor||'Supplier'}</div>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:20 }}>{fmtDate(modal.data)} · {fmtYen(modal.total_pago||0)}</div>
            <div style={{ marginBottom:12 }}><label className="form-label">Payment status</label>
              <select value={form.status_pagamento} onChange={e=>setForm({...form,status_pagamento:e.target.value})}>
                <option value="pago">Paid</option>
                <option value="pendente">Pending</option>
              </select>
            </div>
            <div style={{ marginBottom:12 }}><label className="form-label">Payment date</label>
              <input type="date" value={form.data_pagamento} onChange={e=>setForm({...form,data_pagamento:e.target.value})} />
            </div>
            <div style={{ marginBottom:20 }}><label className="form-label">Payment method</label>
              <select value={form.metodo} onChange={e=>setForm({...form,metodo:e.target.value})}>
                {['Cash','Card','Bank Transfer'].map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:8 }}>
              <button onClick={()=>setModal(null)} style={{ padding:'11px', borderRadius:12, border:'1px solid var(--border)', background:'transparent', cursor:'pointer' }}>Cancel</button>
              <button className="btn-primary" onClick={save} disabled={saving} style={{ padding:'11px', borderRadius:12 }}>{saving?'Saving...':'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
