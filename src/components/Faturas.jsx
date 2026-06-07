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
    const { data } = await supabase.from("faturas").select("*, bars(nome), fatura_pagamentos(*)").order("vencimento",{ascending:false})
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
