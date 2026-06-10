import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmtYen, fmtDate, Spinner, Empty } from './utils'

function getBillingPeriod(date) {
  const d = new Date(date)
  const day = d.getDate(), year = d.getFullYear(), month = d.getMonth()
  if (day <= 5) return { start: new Date(year,month,1).toISOString().slice(0,10), end: new Date(year,month,5).toISOString().slice(0,10), due: new Date(year,month,20).toISOString().slice(0,10) }
  if (day <= 20) return { start: new Date(year,month,6).toISOString().slice(0,10), end: new Date(year,month,20).toISOString().slice(0,10), due: new Date(year,month+1,5).toISOString().slice(0,10) }
  return { start: new Date(year,month,21).toISOString().slice(0,10), end: new Date(year,month+1,0).toISOString().slice(0,10), due: new Date(year,month+1,20).toISOString().slice(0,10) }
}

export default function Faturas() {
  const [tab, setTab] = useState('overview')
  return (
    <div>
      <div style={{ fontSize:20, fontWeight:800, marginBottom:4 }}>Invoices & Payments</div>
      <div style={{ fontSize:13, color:'var(--text2)', marginBottom:16 }}>Billing periods, payment tracking and revenue charts</div>
      <div style={{ display:'flex', gap:8, marginBottom:24, flexWrap:'wrap' }}>
        {[['overview','📊 Overview'],['invoices','🧾 Invoices'],['payments','💳 Payments']].map(([id,label]) => (
          <button key={id} onClick={()=>setTab(id)} style={{ padding:'8px 18px', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', background:tab===id?'var(--navy)':'var(--bg3)', color:tab===id?'white':'var(--text2)', border:'none' }}>{label}</button>
        ))}
      </div>
      {tab==='overview'  && <Overview />}
      {tab==='invoices'  && <InvoiceList />}
      {tab==='payments'  && <PaymentList />}
    </div>
  )
}

function Overview() {
  const [faturas, setFaturas] = useState([])
  const [vendas, setVendas] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { load(); const iv=setInterval(load,30000); return ()=>clearInterval(iv) }, [])
  const [pagamentos, setPagamentos] = useState([])
  async function load() {
    const [fR, vR, pR] = await Promise.all([
      supabase.from('faturas').select('*, bars(nome)').order('vencimento',{ascending:false}),
      supabase.from('vendas').select('total,data,bar_id').order('data'),
      supabase.from('fatura_pagamentos').select('*, faturas(*, bars(nome))').eq('confirmado',false).order('criado_em',{ascending:false}),
    ])
    setFaturas(fR.data||[]); setVendas(vR.data||[]); setPagamentos(pR.data||[]); setLoading(false)
  }
  if (loading) return <Spinner text="Loading..." />

  const pending = faturas.filter(f=>f.status!=='pago')
  const totalPending = pending.reduce((a,f)=>a+(f.total-f.pago),0)
  const overdue = pending.filter(f=>new Date(f.vencimento)<new Date())
  const upcoming = pending.filter(f=>new Date(f.vencimento)>=new Date()).sort((a,b)=>new Date(a.vencimento)-new Date(b.vencimento))

  // Weekly spend chart - last 8 weeks
  const weeks = []
  for (let i=7; i>=0; i--) {
    const end = new Date(); end.setDate(end.getDate() - i*7)
    const start = new Date(end); start.setDate(start.getDate()-6)
    const startStr = start.toISOString().slice(0,10)
    const endStr = end.toISOString().slice(0,10)
    const total = vendas.filter(v=>v.data>=startStr&&v.data<=endStr).reduce((a,v)=>a+(+v.total||0),0)
    weeks.push({ label: start.toLocaleDateString('en-US',{month:'short',day:'numeric'}), total })
  }
  const maxWeek = Math.max(...weeks.map(w=>w.total), 1)
  const avgWeek = Math.round(weeks.reduce((a,w)=>a+w.total,0)/weeks.filter(w=>w.total>0).length||1)

  // Monthly chart - last 4 months
  const months = []
  for (let i=3; i>=0; i--) {
    const d = new Date(); d.setMonth(d.getMonth()-i)
    const mk = d.toISOString().slice(0,7)
    const total = vendas.filter(v=>v.data?.startsWith(mk)).reduce((a,v)=>a+(+v.total||0),0)
    months.push({ label: mk.slice(5), total })
  }
  const maxMonth = Math.max(...months.map(m=>m.total), 1)

  return (
    <div>
      {overdue.length>0 && (
        <div style={{ background:'linear-gradient(135deg,#ff3b30,#c0392b)', borderRadius:16, padding:'16px 20px', marginBottom:16, boxShadow:'0 4px 20px rgba(255,59,48,0.25)' }}>
          <div style={{ fontSize:15, fontWeight:700, color:'white', marginBottom:4 }}>Overdue payments ({overdue.length})</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.85)' }}>{overdue.map(f=>(f.bars?.nome||'?')+' — '+fmtYen(f.total-f.pago)).join(' · ')}</div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Pending', value:fmtYen(totalPending), color:totalPending>0?'var(--red)':'var(--green)', icon:'⏳' },
          { label:'Overdue', value:overdue.length, color:overdue.length>0?'var(--red)':'var(--green)', icon:'🚨' },
          { label:'Upcoming', value:upcoming.length, color:'var(--navy)', icon:'📅' },
          { label:'Avg/week', value:fmtYen(avgWeek), color:'var(--navy)', icon:'📊' },
        ].map(k=>(
          <div key={k.label} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'14px' }}>
            <div style={{ fontSize:20, marginBottom:4 }}>{k.icon}</div>
            <div style={{ fontSize:18, fontWeight:800, color:k.color }}>{k.value}</div>
            <div style={{ fontSize:10, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.05em', marginTop:4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Pending client payments */}
      {pagamentos.length>0 && (
        <div style={{ background:'linear-gradient(135deg,#fffbeb,#fef3c7)', border:'1px solid #fcd34d', borderRadius:16, padding:'20px', marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>🔔 {pagamentos.length} payment{pagamentos.length>1?'s':''} waiting confirmation</div>
          {pagamentos.map(p=>(
            <div key={p.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid rgba(0,0,0,0.06)' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{p.faturas?.bars?.nome} — {fmtYen(p.valor)}</div>
                <div style={{ fontSize:11, color:'var(--text2)' }}>{fmtDate(p.data)} · {p.metodo} {p.notas?'· '+p.notas:''}</div>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                {p.comprovante_url && <a href={p.comprovante_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:'var(--navy)', fontWeight:600, padding:'5px 10px', borderRadius:8, border:'1px solid var(--border)', background:'white', textDecoration:'none' }}>📎 Receipt</a>}
                <button onClick={async()=>{
                  const f = p.faturas
                  const newPago = (+f.pago||0)+(+p.valor||0)
                  await supabase.from('fatura_pagamentos').update({ confirmado:true, confirmado_em:new Date().toISOString() }).eq('id',p.id)
                  await supabase.from('faturas').update({ pago:newPago, status:newPago>=(+f.total||0)?'pago':'parcial' }).eq('id',f.id)
                  load()
                }} style={{ padding:'6px 14px', fontSize:12, borderRadius:8, border:'none', background:'#16a34a', color:'white', cursor:'pointer', fontWeight:700 }}>Confirm</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Weekly chart */}
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'20px', marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:700 }}>Weekly revenue — last 8 weeks</div>
          <div style={{ fontSize:12, color:'var(--text2)' }}>Avg: {fmtYen(avgWeek)}/week</div>
        </div>
        <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:100 }}>
          {weeks.map((w,i) => {
            const pct = Math.max(w.total/maxWeek*100, w.total>0?4:0)
            const isCurrent = i===7
            const isHigh = w.total === Math.max(...weeks.map(x=>x.total)) && w.total > 0
            const isLow = w.total > 0 && w.total === Math.min(...weeks.filter(x=>x.total>0).map(x=>x.total))
            return (
              <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <div style={{ fontSize:9, color:'var(--text2)', fontWeight:600, textAlign:'center' }}>
                  {w.total>0?Math.round(w.total/1000)+'k':''}
                  {isHigh && <span style={{ color:'var(--green)' }}> ↑</span>}
                  {isLow && <span style={{ color:'var(--red)' }}> ↓</span>}
                </div>
                <div style={{ width:'100%', height:pct+'%', minHeight:w.total>0?3:0, borderRadius:'4px 4px 0 0', transition:'height 0.3s',
                  background:isHigh?'var(--green)':isLow?'var(--red)':isCurrent?'var(--navy)':'var(--border)' }}/>
                <div style={{ fontSize:9, color:isCurrent?'var(--navy)':'var(--text3)', fontWeight:isCurrent?700:400, textAlign:'center' }}>{w.label}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Monthly chart */}
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'20px', marginBottom:16 }}>
        <div style={{ fontSize:14, fontWeight:700, marginBottom:16 }}>Monthly revenue — last 4 months</div>
        <div style={{ display:'flex', alignItems:'flex-end', gap:10, height:80 }}>
          {months.map((m,i) => {
            const pct = Math.max(m.total/maxMonth*100, m.total>0?4:0)
            const isCurrent = i===3
            return (
              <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <div style={{ fontSize:11, color:'var(--text2)', fontWeight:600 }}>{m.total>0?fmtYen(m.total):''}</div>
                <div style={{ width:'100%', height:pct+'%', minHeight:m.total>0?3:0, background:isCurrent?'var(--navy)':'var(--border)', borderRadius:'6px 6px 0 0' }}/>
                <div style={{ fontSize:11, color:isCurrent?'var(--navy)':'var(--text3)', fontWeight:isCurrent?700:400 }}>{m.label}</div>
              </div>
            )
          })}
        </div>
      </div>

      {upcoming.length>0 && (
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'20px' }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>Upcoming payments</div>
          {upcoming.map(f => {
            const daysLeft = Math.ceil((new Date(f.vencimento)-new Date())/(1000*60*60*24))
            return (
              <div key={f.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ width:44, height:44, borderRadius:12, background:daysLeft<=5?'#fef2f2':'#f0fdf4', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:daysLeft<=5?'var(--red)':'var(--green)', lineHeight:1 }}>{daysLeft}</div>
                  <div style={{ fontSize:9, color:'var(--text2)', textTransform:'uppercase' }}>days</div>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600 }}>{f.bars?.nome}</div>
                  <div style={{ fontSize:11, color:'var(--text2)' }}>Due {fmtDate(f.vencimento)} · {fmtDate(f.periodo_inicio)} → {fmtDate(f.periodo_fim)}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:16, fontWeight:800, color:'var(--red)' }}>{fmtYen(f.total-(f.pago||0))}</div>
                  <div style={{ fontSize:10, color:'var(--text2)' }}>remaining</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function InvoiceList() {
  const [faturas, setFaturas] = useState([])
  const [bars, setBars] = useState([])
  const [vendas, setVendas] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [payModal, setPayModal] = useState(null)
  const [payForm, setPayForm] = useState({ valor:'', metodo:'Cash', notas:'' })
  const [saving, setSaving] = useState(false)
  const [selBar, setSelBar] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => { load(); const iv=setInterval(load,30000); return ()=>clearInterval(iv) }, [])
  async function load() {
    const [fR, bR, vR] = await Promise.all([
      supabase.from('faturas').select('*, bars(nome)').order('vencimento',{ascending:false}),
      supabase.from('bars').select('*').order('nome'),
      supabase.from('vendas').select('*, vendas_itens(qtd,preco_unitario,produtos(nome))').order('data',{ascending:false}),
    ])
    setFaturas(fR.data||[]); setBars(bR.data||[]); setVendas(vR.data||[])
    if (bR.data?.length>0 && !selBar) setSelBar(bR.data[0].id)
    setLoading(false)
  }
  async function generateInvoice() {
    if (!selBar) return; setSaving(true)
    const period = getBillingPeriod(new Date().toISOString().slice(0,10))
    const total = vendas.filter(v=>v.bar_id===selBar&&v.data>=period.start&&v.data<=period.end).reduce((a,v)=>a+(+v.total||0),0)
    await supabase.from('faturas').insert({ bar_id:selBar, valor:total, periodo_inicio:period.start, periodo_fim:period.end, vencimento:period.due, total, pago:0, status:'pendente' })
    setSaving(false); setShowForm(false); load()
  }
  async function registerPayment() {
    if (!payForm.valor||!payModal) return; setSaving(true)
    const valor = +payForm.valor
    await supabase.from('fatura_pagamentos').insert({ fatura_id:payModal.id, valor, metodo:payForm.metodo, notas:payForm.notas, data:new Date().toISOString().slice(0,10) })
    const newPago = (payModal.pago||0)+valor
    await supabase.from('faturas').update({ pago:newPago, status:newPago>=payModal.total?'pago':'parcial' }).eq('id',payModal.id)
    setSaving(false); setPayModal(null); setPayForm({ valor:'', metodo:'Cash', notas:'' }); load()
  }
  async function generateRyoshusho(fatura) {
    setSaving(true)
    const { data } = await supabase.from('ryoshusho').insert({ bar_id:fatura.bar_id, data:new Date().toISOString().slice(0,10), valor:fatura.total, descricao:'Payment '+fatura.periodo_inicio+' to '+fatura.periodo_fim, metodo:'Bank Transfer' }).select().single()
    if (data) await supabase.from('faturas').update({ ryoshusho_id:data.id }).eq('id',fatura.id)
    setSaving(false); load()
  }

  const filtered = faturas.filter(f=>filterStatus==='all'||f.status===filterStatus)
  if (loading) return <Spinner text="Loading..." />

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontSize:16, fontWeight:700 }}>Invoices ({filtered.length})</div>
        <div style={{ display:'flex', gap:8 }}>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ width:'auto', fontSize:12 }}>
            {[['all','All'],['pendente','Pending'],['parcial','Partial'],['pago','Paid']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
          <button className="btn-primary" onClick={()=>setShowForm(x=>!x)} style={{ padding:'8px 16px', fontSize:12, borderRadius:10 }}>{showForm?'Cancel':'+ Generate invoice'}</button>
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>Generate invoice for current period</div>
          <div style={{ marginBottom:12 }}><label className="form-label">Bar</label><select value={selBar} onChange={e=>setSelBar(e.target.value)}>{bars.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}</select></div>
          {selBar && (() => {
            const period = getBillingPeriod(new Date().toISOString().slice(0,10))
            const periodVendas = vendas.filter(v=>v.bar_id===selBar&&v.data>=period.start&&v.data<=period.end)
            const total = periodVendas.reduce((a,v)=>a+(+v.total||0),0)
            return (
              <div style={{ background:'var(--bg3)', borderRadius:10, padding:'12px 16px', marginBottom:12, fontSize:13 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ color:'var(--text2)' }}>Period</span><span style={{ fontWeight:600 }}>{period.start} → {period.end}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ color:'var(--text2)' }}>Due date</span><span style={{ fontWeight:600 }}>{period.due}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ color:'var(--text2)' }}>Deliveries</span><span style={{ fontWeight:600 }}>{periodVendas.length}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:'var(--text2)' }}>Total</span><span style={{ fontWeight:800, fontSize:16, color:'var(--navy)' }}>{fmtYen(total)}</span>
                </div>
              </div>
            )
          })()}
          <div style={{ display:'flex', justifyContent:'flex-end' }}><button className="btn-primary" onClick={generateInvoice} disabled={saving}>{saving?'Generating...':'Generate'}</button></div>
        </div>
      )}

      {filtered.length===0 ? <Empty text="No invoices" icon="🧾" /> : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {filtered.map(f => {
            const remaining = (f.total||0)-(f.pago||0)
            const pct = f.total>0?Math.round((f.pago||0)/f.total*100):0
            const isOverdue = f.status==='pendente'&&new Date(f.vencimento)<new Date()
            const periodVendas = vendas.filter(v=>v.bar_id===f.bar_id&&v.data>=f.periodo_inicio&&v.data<=f.periodo_fim)
            return (
              <div key={f.id} style={{ background:'var(--bg2)', border:'1px solid', borderColor:isOverdue?'rgba(255,59,48,0.3)':'var(--border)', borderRadius:14, overflow:'hidden' }}>
                <div style={{ padding:'14px 18px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700 }}>{f.bars?.nome}</div>
                      <div style={{ fontSize:12, color:'var(--text2)' }}>{fmtDate(f.periodo_inicio)} → {fmtDate(f.periodo_fim)} · Due {fmtDate(f.vencimento)}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:f.status==='pago'?'#f0fdf4':isOverdue?'#fef2f2':'#EAF0FA', color:f.status==='pago'?'var(--green)':isOverdue?'var(--red)':'var(--navy)' }}>
                        {f.status==='pago'?'Paid':isOverdue?'Overdue':f.status==='parcial'?'Partial':'Pending'}
                      </span>
                      <div style={{ fontSize:18, fontWeight:800, color:'var(--navy)', marginTop:4 }}>{fmtYen(f.total||0)}</div>
                    </div>
                  </div>
                  <div style={{ height:5, background:'var(--bg3)', borderRadius:3, overflow:'hidden', marginBottom:6 }}>
                    <div style={{ height:'100%', width:pct+'%', background:f.status==='pago'?'var(--green)':'var(--gold)', borderRadius:3 }}/>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text2)', marginBottom:10 }}>
                    <span>Paid: {fmtYen(f.pago||0)} ({pct}%)</span>
                    {remaining>0&&<span style={{ color:'var(--red)', fontWeight:600 }}>Remaining: {fmtYen(remaining)}</span>}
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {f.status!=='pago'&&<button onClick={()=>setPayModal(f)} style={{ padding:'6px 14px', fontSize:12, borderRadius:8, border:'none', background:'var(--navy)', color:'white', cursor:'pointer', fontWeight:600 }}>Register payment</button>}
                    {f.status==='pago'&&!f.ryoshusho_id&&<button onClick={()=>generateRyoshusho(f)} disabled={saving} style={{ padding:'6px 14px', fontSize:12, borderRadius:8, border:'none', background:'var(--gold)', color:'white', cursor:'pointer', fontWeight:600 }}>Generate 領収書</button>}
                    {f.ryoshusho_id&&<span style={{ fontSize:12, color:'var(--green)', fontWeight:600, padding:'6px 0' }}>領収書 issued</span>}
                    {periodVendas.length>0&&<button onClick={()=>setExpanded(expanded===f.id?null:f.id)} style={{ padding:'6px 14px', fontSize:12, borderRadius:8, border:'1px solid var(--border)', background:'transparent', cursor:'pointer' }}>
                      {expanded===f.id?'▲ Hide':'▼ Show'} {periodVendas.length} deliveries
                    </button>}
                    <button onClick={async()=>{ if(!confirm('Delete this invoice?'))return; await supabase.from('fatura_pagamentos').delete().eq('fatura_id',f.id); await supabase.from('faturas').delete().eq('id',f.id); setFaturas(prev=>prev.filter(x=>x.id!==f.id)) }} style={{ padding:'6px 14px', fontSize:12, borderRadius:8, border:'none', background:'#7f1d1d', color:'white', cursor:'pointer', fontWeight:600 }}>🗑</button>
                  </div>
                </div>
                {expanded===f.id && (
                  <div style={{ borderTop:'1px solid var(--border)', background:'var(--bg3)', padding:'12px 18px' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', marginBottom:8 }}>Deliveries in this period</div>
                    {periodVendas.map(v=>(
                      <div key={v.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:12 }}>
                        <div>
                          <span style={{ fontWeight:600 }}>{fmtDate(v.data)}</span>
                          <span style={{ color:'var(--text2)', marginLeft:8 }}>
                            {(v.vendas_itens||[]).map(it=>it.produtos?.nome+'×'+it.qtd).join(', ')}
                          </span>
                        </div>
                        <span style={{ fontWeight:700 }}>{fmtYen(v.total)}</span>
                      </div>
                    ))}
                    <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, marginTop:8, paddingTop:8, borderTop:'2px solid var(--border)' }}>
                      <span>Total</span><span style={{ color:'var(--navy)' }}>{fmtYen(periodVendas.reduce((a,v)=>a+(+v.total||0),0))}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {payModal&&(
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'var(--bg2)', borderRadius:20, padding:'28px', width:'100%', maxWidth:400, boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>{payModal.bars?.nome}</div>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:20 }}>Total: {fmtYen(payModal.total)} · Remaining: {fmtYen((payModal.total||0)-(payModal.pago||0))}</div>
            <div style={{ marginBottom:12 }}><label className="form-label">Amount (¥)</label><input type="number" value={payForm.valor} onChange={e=>setPayForm({...payForm,valor:e.target.value})} autoFocus /></div>
            <div style={{ marginBottom:12 }}><label className="form-label">Method</label><select value={payForm.metodo} onChange={e=>setPayForm({...payForm,metodo:e.target.value})}>{['Cash','Bank Transfer','Card'].map(m=><option key={m}>{m}</option>)}</select></div>
            <div style={{ marginBottom:20 }}><label className="form-label">Notes</label><input value={payForm.notas} onChange={e=>setPayForm({...payForm,notas:e.target.value})} /></div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:8 }}>
              <button onClick={()=>setPayModal(null)} style={{ padding:'11px', borderRadius:12, border:'1px solid var(--border)', background:'transparent', cursor:'pointer' }}>Cancel</button>
              <button className="btn-primary" onClick={registerPayment} disabled={saving||!payForm.valor} style={{ padding:'11px', borderRadius:12 }}>{saving?'Saving...':'Register payment'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PaymentList() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { load(); const iv=setInterval(load,30000); return ()=>clearInterval(iv) }, [])
  async function load() {
    const { data } = await supabase.from('fatura_pagamentos').select('*, faturas(*, bars(nome))').order('criado_em',{ascending:false}).limit(100)
    setPayments(data||[]); setLoading(false)
  }
  if (loading) return <Spinner text="Loading..." />
  const totalPaid = payments.reduce((a,p)=>a+p.valor,0)
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ fontSize:16, fontWeight:700 }}>Payment history</div>
        <div style={{ fontSize:14, fontWeight:700, color:'var(--green)' }}>Total received: {fmtYen(totalPaid)}</div>
      </div>
      {payments.length===0?<Empty text="No payments yet" icon="💳" />:(
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {payments.map(p=>(
            <div key={p.id} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px', display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:'#f0fdf4', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>
                {p.metodo==='Cash'?'💵':p.metodo==='Card'?'💳':'🏦'}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{p.faturas?.bars?.nome}</div>
                <div style={{ fontSize:11, color:'var(--text2)' }}>{fmtDate(p.data)} · {p.metodo} {p.notas?'· '+p.notas:''}</div>
              </div>
              <div style={{ fontSize:16, fontWeight:800, color:'var(--green)' }}>{fmtYen(p.valor)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
