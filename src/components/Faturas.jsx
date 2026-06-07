import { useState, useEffect } from "react"
import { supabase } from "../lib/supabase"
import { fmtYen, fmtDate, Spinner, Empty } from "./utils"

function getBillingPeriod(date) {
  const d = new Date(date)
  const day = d.getDate()
  const year = d.getFullYear()
  const month = d.getMonth()
  if (day <= 5) {
    return { start: new Date(year,month,1).toISOString().slice(0,10), end: new Date(year,month,5).toISOString().slice(0,10), due: new Date(year,month,20).toISOString().slice(0,10) }
  } else if (day <= 20) {
    return { start: new Date(year,month,6).toISOString().slice(0,10), end: new Date(year,month,20).toISOString().slice(0,10), due: new Date(year,month+1,5).toISOString().slice(0,10) }
  } else {
    return { start: new Date(year,month,21).toISOString().slice(0,10), end: new Date(year,month+1,0).toISOString().slice(0,10), due: new Date(year,month+1,20).toISOString().slice(0,10) }
  }
}

export default function Faturas() {
  const [tab, setTab] = useState("invoices")
  return (
    <div>
      <div style={{ fontSize:20, fontWeight:800, marginBottom:4 }}>Invoices and Payments</div>
      <div style={{ fontSize:13, color:"var(--text2)", marginBottom:16 }}>Track billing periods, payments and generate receipts</div>
      <div style={{ display:"flex", gap:8, marginBottom:24 }}>
        {[["overview","Overview"],["invoices","Invoices"],["payments","Payments"]].map(([id,label]) => (
          <button key={id} onClick={()=>setTab(id)} style={{ padding:"8px 18px", borderRadius:10, fontSize:13, fontWeight:600, cursor:"pointer", background:tab===id?"var(--navy)":"var(--bg3)", color:tab===id?"white":"var(--text2)", border:"none" }}>{label}</button>
        ))}
      </div>
      {tab==="overview"  && <Overview />}
      {tab==="invoices"  && <InvoiceList />}
      {tab==="payments"  && <PaymentList />}
    </div>
  )
}

function Overview() {
  const [faturas, setFaturas] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from("faturas").select("*, bars(nome)").order("vencimento",{ascending:false})
    setFaturas(data||[]); setLoading(false)
  }
  if (loading) return <Spinner text="Loading..." />
  const pending = faturas.filter(f=>f.status!=='pago')
  const totalPending = pending.reduce((a,f)=>a+(f.total-f.pago),0)
  const overdue = pending.filter(f=>new Date(f.vencimento)<new Date())
  const upcoming = pending.filter(f=>new Date(f.vencimento)>=new Date()).sort((a,b)=>new Date(a.vencimento)-new Date(b.vencimento))
  const today = new Date().toISOString().slice(0,10)
  const currentPeriod = getBillingPeriod(today)
  return (
    <div>
      {overdue.length>0 && (
        <div style={{ background:"linear-gradient(135deg,#ff3b30,#c0392b)", borderRadius:16, padding:"16px 20px", marginBottom:16, boxShadow:"0 4px 20px rgba(255,59,48,0.25)" }}>
          <div style={{ fontSize:15, fontWeight:700, color:"white", marginBottom:4 }}>Overdue payments ({overdue.length})</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.85)" }}>{overdue.map(f=>f.bars?.nome+" — "+fmtYen(f.total-f.pago)).join(" · ")}</div>
        </div>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:20 }}>
        {[
          { label:"Total pending", value:fmtYen(totalPending), color:totalPending>0?"var(--red)":"var(--green)", icon:"💰" },
          { label:"Overdue", value:overdue.length, color:overdue.length>0?"var(--red)":"var(--green)", icon:"⚠️" },
          { label:"Upcoming", value:upcoming.length, color:"var(--navy)", icon:"📅" },
        ].map(k=>(
          <div key={k.label} style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:14, padding:"16px" }}>
            <div style={{ fontSize:22, marginBottom:6 }}>{k.icon}</div>
            <div style={{ fontSize:24, fontWeight:800, color:k.color }}>{k.value}</div>
            <div style={{ fontSize:11, color:"var(--text2)", textTransform:"uppercase", letterSpacing:"0.05em", marginTop:4 }}>{k.label}</div>
          </div>
        ))}
      </div>
      {upcoming.length>0 && (
        <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:16, padding:"20px", marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:16 }}>Upcoming payments</div>
          {upcoming.map(f => {
            const daysLeft = Math.ceil((new Date(f.vencimento)-new Date())/(1000*60*60*24))
            const remaining = f.total - f.pago
            return (
              <div key={f.id} style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 0", borderBottom:"1px solid var(--border)" }}>
                <div style={{ width:44, height:44, borderRadius:12, background:daysLeft<=3?"#fef2f2":"#f0fdf4", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:daysLeft<=3?"var(--red)":"var(--green)", lineHeight:1 }}>{daysLeft}</div>
                  <div style={{ fontSize:9, color:"var(--text2)", textTransform:"uppercase" }}>days</div>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600 }}>{f.bars?.nome}</div>
                  <div style={{ fontSize:11, color:"var(--text2)" }}>Due {fmtDate(f.vencimento)} · {fmtDate(f.periodo_inicio)} to {fmtDate(f.periodo_fim)}</div>
                </div>
                <div style={{ fontSize:16, fontWeight:800, color:"var(--navy)" }}>{fmtYen(remaining)}</div>
              </div>
            )
          })}
        </div>
      )}
      <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:16, padding:"20px" }}>
        <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>Current billing period</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div style={{ padding:"12px 16px", background:"var(--bg3)", borderRadius:10 }}>
            <div style={{ fontSize:11, color:"var(--text2)", textTransform:"uppercase", marginBottom:4 }}>Period</div>
            <div style={{ fontSize:14, fontWeight:700 }}>{fmtDate(currentPeriod.start)} to {fmtDate(currentPeriod.end)}</div>
          </div>
          <div style={{ padding:"12px 16px", background:"var(--bg3)", borderRadius:10 }}>
            <div style={{ fontSize:11, color:"var(--text2)", textTransform:"uppercase", marginBottom:4 }}>Due date</div>
            <div style={{ fontSize:14, fontWeight:700 }}>{fmtDate(currentPeriod.due)}</div>
          </div>
        </div>
      </div>
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
  const [payForm, setPayForm] = useState({ valor:"", metodo:"Cash", notas:"" })
  const [saving, setSaving] = useState(false)
  const [selBar, setSelBar] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  useEffect(() => { load() }, [])
  async function load() {
    const [fR, bR, vR] = await Promise.all([
      supabase.from("faturas").select("*, bars(nome)").order("vencimento",{ascending:false}),
      supabase.from("bars").select("*").order("nome"),
      supabase.from("vendas").select("total,data,bar_id").order("data"),
    ])
    setFaturas(fR.data||[]); setBars(bR.data||[]); setVendas(vR.data||[])
    if (bR.data?.length>0 && !selBar) setSelBar(bR.data[0].id)
    setLoading(false)
  }
  async function generateInvoice() {
    if (!selBar) return
    setSaving(true)
    const today = new Date().toISOString().slice(0,10)
    const period = getBillingPeriod(today)
    const total = vendas.filter(v=>v.bar_id===selBar&&v.data>=period.start&&v.data<=period.end).reduce((a,v)=>a+(+v.total||0),0)
    await supabase.from("faturas").insert({ bar_id:selBar, periodo_inicio:period.start, periodo_fim:period.end, vencimento:period.due, total, pago:0, status:"pendente" })
    setSaving(false); setShowForm(false); load()
  }
  async function registerPayment() {
    if (!payForm.valor||!payModal) return
    setSaving(true)
    const valor = +payForm.valor
    await supabase.from("fatura_pagamentos").insert({ fatura_id:payModal.id, valor, metodo:payForm.metodo, notas:payForm.notas, data:new Date().toISOString().slice(0,10) })
    const newPago = (payModal.pago||0)+valor
    await supabase.from("faturas").update({ pago:newPago, status:newPago>=payModal.total?"pago":"parcial" }).eq("id",payModal.id)
    setSaving(false); setPayModal(null); setPayForm({ valor:"", metodo:"Cash", notas:"" }); load()
  }
  async function generateRyoshusho(fatura) {
    setSaving(true)
    const { data } = await supabase.from("ryoshusho").insert({ bar_id:fatura.bar_id, data:new Date().toISOString().slice(0,10), valor:fatura.total, descricao:"Payment "+fatura.periodo_inicio+" to "+fatura.periodo_fim, metodo:"Bank Transfer" }).select().single()
    if (data) await supabase.from("faturas").update({ ryoshusho_id:data.id }).eq("id",fatura.id)
    setSaving(false); load()
  }
  const filtered = faturas.filter(f=>filterStatus==="all"||f.status===filterStatus)
  if (loading) return <Spinner text="Loading..." />
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize:16, fontWeight:700 }}>Invoices</div>
        <div style={{ display:"flex", gap:8 }}>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ width:"auto", fontSize:12 }}>
            {[["all","All"],["pendente","Pending"],["parcial","Partial"],["pago","Paid"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
          <button className="btn-primary" onClick={()=>setShowForm(x=>!x)} style={{ padding:"8px 16px", fontSize:12, borderRadius:10 }}>{showForm?"Cancel":"+ Generate invoice"}</button>
        </div>
      </div>
      {showForm && (
        <div className="card" style={{ marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>Generate invoice for current period</div>
          <div style={{ marginBottom:12 }}><label className="form-label">Bar</label><select value={selBar} onChange={e=>setSelBar(e.target.value)}>{bars.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}</select></div>
          <div style={{ display:"flex", justifyContent:"flex-end" }}><button className="btn-primary" onClick={generateInvoice} disabled={saving}>{saving?"Generating...":"Generate"}</button></div>
        </div>
      )}
      {filtered.length===0 ? <Empty text="No invoices yet" icon="🧾" /> : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {filtered.map(f => {
            const remaining = f.total-f.pago
            const pct = f.total>0?Math.round(f.pago/f.total*100):0
            const isOverdue = f.status==="pendente"&&new Date(f.vencimento)<new Date()
            return (
              <div key={f.id} style={{ background:"var(--bg2)", border:"1px solid", borderColor:isOverdue?"rgba(255,59,48,0.3)":"var(--border)", borderRadius:14, padding:"16px 20px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700 }}>{f.bars?.nome}</div>
                    <div style={{ fontSize:12, color:"var(--text2)" }}>{fmtDate(f.periodo_inicio)} to {fmtDate(f.periodo_fim)} · Due {fmtDate(f.vencimento)}</div>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:20, background:f.status==="pago"?"#f0fdf4":isOverdue?"#fef2f2":"#EAF0FA", color:f.status==="pago"?"var(--green)":isOverdue?"var(--red)":"var(--navy)" }}>
                    {f.status==="pago"?"Paid":f.status==="parcial"?"Partial":isOverdue?"Overdue":"Pending"}
                  </span>
                </div>
                <div style={{ marginBottom:10 }}>
                  <div style={{ height:6, background:"var(--bg3)", borderRadius:3, overflow:"hidden", marginBottom:4 }}>
                    <div style={{ height:"100%", width:pct+"%", background:f.status==="pago"?"var(--green)":"var(--gold)", borderRadius:3 }}/>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--text2)" }}>
                    <span>Paid: {fmtYen(f.pago)} ({pct}%)</span>
                    <span style={{ fontWeight:700, color:"var(--navy)" }}>Total: {fmtYen(f.total)}</span>
                  </div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  {f.status!=="pago"&&<button onClick={()=>setPayModal(f)} style={{ padding:"7px 14px", fontSize:12, borderRadius:8, border:"none", background:"var(--navy)", color:"white", cursor:"pointer", fontWeight:600 }}>Register payment</button>}
                  {f.status==="pago"&&!f.ryoshusho_id&&<button onClick={()=>generateRyoshusho(f)} disabled={saving} style={{ padding:"7px 14px", fontSize:12, borderRadius:8, border:"none", background:"var(--gold)", color:"white", cursor:"pointer", fontWeight:600 }}>Generate 領収書</button>}
                  {f.ryoshusho_id&&<span style={{ fontSize:12, color:"var(--green)", fontWeight:600 }}>領収書 issued</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {payModal&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:"var(--bg2)", borderRadius:20, padding:"28px", width:"100%", maxWidth:400, boxShadow:"0 24px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>{payModal.bars?.nome}</div>
            <div style={{ fontSize:12, color:"var(--text2)", marginBottom:20 }}>Remaining: {fmtYen(payModal.total-payModal.pago)}</div>
            <div style={{ marginBottom:12 }}><label className="form-label">Amount</label><input type="number" value={payForm.valor} onChange={e=>setPayForm({...payForm,valor:e.target.value})} autoFocus /></div>
            <div style={{ marginBottom:12 }}><label className="form-label">Method</label><select value={payForm.metodo} onChange={e=>setPayForm({...payForm,metodo:e.target.value})}>{["Cash","Bank Transfer","Card"].map(m=><option key={m}>{m}</option>)}</select></div>
            <div style={{ marginBottom:20 }}><label className="form-label">Notes</label><input value={payForm.notas} onChange={e=>setPayForm({...payForm,notas:e.target.value})} /></div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:8 }}>
              <button onClick={()=>setPayModal(null)} style={{ padding:"11px", borderRadius:12, border:"1px solid var(--border)", background:"transparent", cursor:"pointer" }}>Cancel</button>
              <button className="btn-primary" onClick={registerPayment} disabled={saving||!payForm.valor} style={{ padding:"11px", borderRadius:12 }}>{saving?"Saving...":"Register payment"}</button>
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
  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from("fatura_pagamentos").select("*, faturas(*, bars(nome))").order("criado_em",{ascending:false}).limit(100)
    setPayments(data||[]); setLoading(false)
  }
  if (loading) return <Spinner text="Loading..." />
  const totalPaid = payments.reduce((a,p)=>a+p.valor,0)
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
        <div style={{ fontSize:16, fontWeight:700 }}>Payment history</div>
        <div style={{ fontSize:14, fontWeight:700, color:"var(--green)" }}>Total: {fmtYen(totalPaid)}</div>
      </div>
      {payments.length===0?<Empty text="No payments yet" icon="💳" />:(
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {payments.map(p=>(
            <div key={p.id} style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:12, padding:"14px 16px", display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:"#f0fdf4", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>
                {p.metodo==="Cash"?"💵":p.metodo==="Card"?"💳":"🏦"}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{p.faturas?.bars?.nome}</div>
                <div style={{ fontSize:11, color:"var(--text2)" }}>{fmtDate(p.data)} · {p.metodo}</div>
              </div>
              <div style={{ fontSize:16, fontWeight:800, color:"var(--green)" }}>{fmtYen(p.valor)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
