import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmtYen, fmtDate, Spinner, Empty, compraDueDate, isCompraOverdue } from './utils'
import JbmHoldingPanel from './JbmHoldingPanel'
import { AdminPage, PortalKpi, PortalSurface, PortalPills } from './ui/PageLayout'

export default function Cashflow() {
  const [tab, setTab] = useState('overview')
  return (
    <AdminPage
      title="Fluxo de caixa"
      subtitle="Entradas, saídas e projeção"
      wide
      actions={
        <PortalPills
          scrollable
          options={[['overview','📊 Visão geral'],['in','💚 Entradas'],['out','🔴 Saídas'],['purchases','🛒 Compras'],['holding','🏛 JBM Holding'],['caixa','💵 Caixa'],['calendario','📅 Calendário']]}
          value={tab}
          onChange={setTab}
        />
      }
    >
      {tab==='overview'  && <CashflowOverview />}
      {tab==='in'        && <MoneyIn />}
      {tab==='out'       && <MoneyOut />}
      {tab==='purchases' && <PurchasePayments />}
      {tab==='holding'   && <JbmHoldingPanel />}
      {tab==='caixa'     && <Caixa />}
      {tab==='calendario' && <Calendario />}
    </AdminPage>
  )
}

function CashflowOverview() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { load(); const iv=setInterval(load,30000); return ()=>clearInterval(iv) }, [])
  async function load() {
    const [fR, cR, pR] = await Promise.all([
      supabase.from('faturas').select('*').order('data_vencimento'),
      supabase.from('compras').select('*').order('data'),
      supabase.from('fatura_pagamentos').select('valor,confirmado,metodo').eq('confirmado', false),
    ])
    setData({ faturas: fR.data||[], compras: cR.data||[], pagamentosPendentes: pR.data||[] })
    setLoading(false)
  }
  if (loading) return <Spinner text="Carregando..." />

  const { faturas, compras, pagamentosPendentes = [] } = data
  const today = new Date().toISOString().slice(0,10)

  // Entradas = valor já recebido dos bars (parcial ou total), não só fatura "paga"
  const paidIn = faturas.reduce((a, f) => a + (+f.pago || 0), 0)
  const pendingIn = faturas.reduce((a, f) => a + Math.max(0, (+f.total || +f.valor || 0) - (+f.pago || 0)), 0)
  const emAnalise = pagamentosPendentes.reduce((a, p) => a + (+p.valor || 0), 0)

  // Saídas = só compras marcadas como pagas (Le Vin pendente não entra no caixa)
  const paidOut = compras.filter(c => c.status_pagamento === 'pago').reduce((a, c) => a + (+c.total_real || +c.total_pago || 0), 0)
  const pendingOut = compras.filter(c => c.status_pagamento === 'pendente').reduce((a, c) => a + (+c.total_real || +c.total_pago || 0), 0)

  const netCash = paidIn - paidOut
  const projectedNet = (paidIn + pendingIn) - (paidOut + pendingOut)

  // Last 8 weeks cashflow
  const weeks = []
  for (let i=7; i>=0; i--) {
    const end = new Date(); end.setDate(end.getDate()-i*7)
    const start = new Date(end); start.setDate(start.getDate()-6)
    const s = start.toISOString().slice(0,10)
    const e = end.toISOString().slice(0,10)
    const inAmt = faturas.filter(f=>f.status==='pago'&&f.data_vencimento>=s&&f.data_vencimento<=e).reduce((a,f)=>a+(+f.valor||0),0)
    const outAmt = compras.filter(c=>(c.data_pagamento||c.data)>=s&&(c.data_pagamento||c.data)<=e).reduce((a,c)=>a+(+c.total_pago||0),0)
    weeks.push({ label: start.toLocaleDateString('en-US',{month:'short',day:'numeric'}), in:inAmt, out:outAmt, net:inAmt-outAmt })
  }
  const maxVal = Math.max(...weeks.map(w=>Math.max(w.in,w.out)), 1)

  // Next 30 days projected
  const next30 = []
  for (let i=0; i<30; i++) {
    const d = new Date(); d.setDate(d.getDate()+i)
    const ds = d.toISOString().slice(0,10)
    const inAmt = faturas.filter(f=>f.status!=='pago'&&f.data_vencimento===ds).reduce((a,f)=>a+((+f.valor||0)-(+f.pago||0)),0)
    const outAmt = compras.filter(c=>c.status_pagamento==='pendente'&&(c.data_pagamento||c.data)===ds).reduce((a,c)=>a+(+c.total_pago||0),0)
    if (inAmt>0||outAmt>0) next30.push({ date:ds, in:inAmt, out:outAmt })
  }

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:12, marginBottom:20 }}>
        {[
          { label:'Recebido (bars)', value:fmtYen(paidIn), color:'var(--green)', sub:'pagamentos confirmados na fatura' },
          { label:'Pago (fornec.)', value:fmtYen(paidOut), color:'var(--red)', sub:'notas marcadas pagas' },
          { label:'Caixa líquido', value:fmtYen(netCash), color:netCash>=0?'var(--green)':'var(--red)', sub:'recebido − pago' },
          { label:'A receber', value:fmtYen(pendingIn), color:'var(--amber)', sub:'saldo faturas em aberto' },
          ...(emAnalise > 0 ? [{ label:'Em análise', value:fmtYen(emAnalise), color:'var(--amber)', sub:'Stripe etc. — ainda não creditado' }] : []),
          ...(pendingOut > 0 ? [{ label:'A pagar', value:fmtYen(pendingOut), color:'var(--red)', sub:'compras pendentes (ex. Le Vin)' }] : []),
        ].map(k=>(
          <PortalKpi key={k.label} label={k.label} value={k.value} color={k.color} sub={k.sub} />
        ))}
      </div>
      {netCash < 0 && pendingIn > Math.abs(netCash) && (
        <PortalSurface title="Por que o caixa está negativo?" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0, lineHeight: 1.55 }}>
            Você já pagou fornecedores ({fmtYen(paidOut)}) mais do que recebeu dos bars ({fmtYen(paidIn)}).
            Ainda há {fmtYen(pendingIn)} a receber nas faturas{emAnalise > 0 ? `, mais ${fmtYen(emAnalise)} em análise no Stripe` : ''}.
            O caixa fica negativo até cobrar — isso é normal quando as cobranças atrasam.
          </p>
        </PortalSurface>
      )}

      <PortalSurface title="Fluxo semanal — últimas 8 semanas" style={{ marginBottom:16 }}>
        <div style={{ display:'flex', gap:16, marginBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}><div style={{ width:12,height:12,borderRadius:2,background:'var(--green)' }}/> Entradas</div>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}><div style={{ width:12,height:12,borderRadius:2,background:'var(--red)' }}/> Saídas</div>
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
      </PortalSurface>

      {next30.length>0 && (
        <PortalSurface title="Próximos 30 dias — projeção" style={{ marginBottom:16 }}>
          {next30.map((d,i)=>(
            <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
              <span style={{ color:'var(--text2)' }}>{fmtDate(d.date)}</span>
              <div style={{ display:'flex', gap:16 }}>
                {d.in>0&&<span style={{ color:'var(--green)', fontWeight:600 }}>+{fmtYen(d.in)}</span>}
                {d.out>0&&<span style={{ color:'var(--red)', fontWeight:600 }}>-{fmtYen(d.out)}</span>}
              </div>
            </div>
          ))}
        </PortalSurface>
      )}

      <PortalSurface title="Posição projetada" style={{ background:'var(--navy)', color:'white', border:'none' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div><div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginBottom:4 }}>Previsto a receber</div><div style={{ fontSize:18, fontWeight:800, color:'#34c759' }}>{fmtYen(pendingIn)}</div></div>
          <div><div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginBottom:4 }}>Previsto a pagar</div><div style={{ fontSize:18, fontWeight:800, color:'#ff6b6b' }}>{fmtYen(pendingOut)}</div></div>
          <div><div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginBottom:4 }}>Líquido projetado</div><div style={{ fontSize:20, fontWeight:800, color:projectedNet>=0?'var(--gold)':'#ff3b30' }}>{fmtYen(projectedNet)}</div></div>
          <div><div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginBottom:4 }}>Caixa líquido atual</div><div style={{ fontSize:20, fontWeight:800, color:netCash>=0?'var(--gold)':'#ff3b30' }}>{fmtYen(netCash)}</div></div>
        </div>
      </PortalSurface>
    </div>
  )
}

function MoneyIn() {
  const [faturas, setFaturas] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { load(); const iv=setInterval(load,30000); return ()=>clearInterval(iv) }, [])
  async function load() {
    const { data } = await supabase.from('faturas').select('*, bars(nome)').order('data_vencimento',{ascending:false})
    setFaturas(data||[]); setLoading(false)
  }
  if (loading) return <Spinner text="Carregando..." />
  const total = faturas.reduce((a,f)=>a+(+f.valor||0),0)
  const paid = faturas.filter(f=>f.status==='pago').reduce((a,f)=>a+(+f.valor||0),0)
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
          const pct = f.valor>0?Math.round((f.pago||0)/f.total*100):0
          const isOverdue = f.status!=='pago'&&new Date(f.data_vencimento)<new Date()
          return (
            <div key={f.id} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700 }}>{f.bars?.nome}</div>
                  <div style={{ fontSize:11, color:'var(--text2)' }}>Due {fmtDate(f.data_vencimento)}</div>
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
  useEffect(() => { load(); const iv=setInterval(load,30000); return ()=>clearInterval(iv) }, [])
  async function load() {
    const { data } = await supabase.from('compras').select('*').order('data',{ascending:false}).limit(100)
    setCompras(data||[]); setLoading(false)
  }
  if (loading) return <Spinner text="Carregando..." />
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
  const [fornecedores, setFornecedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ data_pagamento:'', metodo:'Card', status_pagamento:'pago' })
  const [saving, setSaving] = useState(false)
  useEffect(() => { load(); const iv=setInterval(load,30000); return ()=>clearInterval(iv) }, [])
  async function load() {
    const [{ data: c }, { data: f }] = await Promise.all([
      supabase.from('compras').select('*').order('data',{ascending:false}).limit(100),
      supabase.from('fornecedores').select('nome,pagamento'),
    ])
    setCompras(c||[]); setFornecedores(f||[]); setLoading(false)
  }
  const pagamentoFor = nome => fornecedores.find(x => x.nome === nome)?.pagamento
  async function save() {
    if (!modal) return; setSaving(true)
    await supabase.from('compras').update({ data_pagamento:form.data_pagamento||null, metodo_pagamento_real:form.metodo, status_pagamento:form.status_pagamento }).eq('id',modal.id)
    setSaving(false); setModal(null); load()
  }

  if (loading) return <Spinner text="Carregando..." />
  const pendingCount = compras.filter(c=>c.status_pagamento==='pendente').length
  const overdueCount = compras.filter(c=>isCompraOverdue(c, pagamentoFor(c.fornecedor))).length

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontSize:16, fontWeight:700 }}>Pagamentos de compras</div>
        <div style={{ display:'flex', gap:12 }}>
          {overdueCount>0 && <div style={{ fontSize:12, color:'var(--red)', fontWeight:700 }}>{overdueCount} atrasado(s)</div>}
          {pendingCount>0 && <div style={{ fontSize:12, color:'var(--amber)', fontWeight:600 }}>{pendingCount} pendente(s)</div>}
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {compras.map(c=>{
          const due = compraDueDate(c, pagamentoFor(c.fornecedor))
          const overdue = isCompraOverdue(c, pagamentoFor(c.fornecedor))
          return (
          <div key={c.id} style={{ background:'var(--bg2)', border:'1px solid', borderColor:overdue?'rgba(239,68,68,0.45)':c.status_pagamento==='pendente'?'rgba(255,149,0,0.3)':'var(--border)', borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600 }}>{c.fornecedor||'Fornecedor'} — {fmtDate(c.data)}</div>
              <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>
                {c.pagamento} · {fmtYen(c.total_pago||0)}
                {due && c.status_pagamento==='pendente' && <span> · Vence {fmtDate(due)}</span>}
                {c.status_pagamento==='pago' && c.data_pagamento && <span> · Pago {fmtDate(c.data_pagamento)}</span>}
                {c.metodo_pagamento_real&&<span> via {c.metodo_pagamento_real}</span>}
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:overdue?'#fef2f2':c.status_pagamento==='pendente'?'#fffbeb':'#f0fdf4', color:overdue?'var(--red)':c.status_pagamento==='pendente'?'var(--amber)':'var(--green)' }}>
                {overdue?'Atrasado':c.status_pagamento==='pendente'?'Pendente':'Pago'}
              </span>
              <button onClick={()=>{ setModal(c); setForm({ data_pagamento:c.data_pagamento||due||new Date().toISOString().slice(0,10), metodo:c.metodo_pagamento_real||'Bank Transfer', status_pagamento:c.status_pagamento||'pago' }) }}
                style={{ padding:'5px 12px', fontSize:12, borderRadius:8, border:'1px solid var(--border)', background:'transparent', cursor:'pointer' }}>✏️ Editar</button>
            </div>
          </div>
        )})}
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

function Caixa() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ tipo:'entrada', valor:'', descricao:'', metodo:'Cash', data:new Date().toISOString().slice(0,10) })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load(); const iv=setInterval(load,30000); return ()=>clearInterval(iv) }, [])
  async function load() {
    const { data } = await supabase.from('caixa_movimentos').select('*').order('data',{ascending:false}).limit(100)
    setEntries(data||[])
    setLoading(false)
  }
  async function save() {
    setSaving(true)
    await supabase.from('caixa_movimentos').insert({ ...form, valor:+form.valor })
    setSaving(false); setModal(false); setForm({ tipo:'entrada', valor:'', descricao:'', metodo:'Cash', data:new Date().toISOString().slice(0,10) }); load()
  }

  const totalIn = entries.filter(e=>e.tipo==='entrada').reduce((a,e)=>a+(+e.valor||0),0)
  const totalOut = entries.filter(e=>e.tipo==='saida').reduce((a,e)=>a+(+e.valor||0),0)
  const balance = totalIn - totalOut

  if (loading) return <Spinner text="Carregando..." />
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Total in', value:fmtYen(totalIn), color:'var(--green)', icon:'💚' },
          { label:'Total out', value:fmtYen(totalOut), color:'var(--red)', icon:'🔴' },
          { label:'Balance', value:fmtYen(balance), color:balance>=0?'var(--green)':'var(--red)', icon:'💰' },
        ].map(k=>(
          <div key={k.label} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'16px' }}>
            <div style={{ fontSize:22, marginBottom:4 }}>{k.icon}</div>
            <div style={{ fontSize:22, fontWeight:800, color:k.color }}>{k.value}</div>
            <div style={{ fontSize:11, color:'var(--text2)', textTransform:'uppercase', marginTop:4 }}>{k.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontSize:16, fontWeight:700 }}>Cash movements</div>
        <button className="btn-primary" onClick={()=>setModal(true)} style={{ padding:'8px 16px', fontSize:12, borderRadius:10 }}>+ Add movement</button>
      </div>
      {entries.length===0?<Empty text="No movements" icon="💵" />:(
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {entries.map(e=>(
            <div key={e.id} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:e.tipo==='entrada'?'#f0fdf4':'#fef2f2', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
                {e.tipo==='entrada'?'↑':'↓'}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{e.descricao}</div>
                <div style={{ fontSize:11, color:'var(--text2)' }}>{fmtDate(e.data)} · {e.metodo}</div>
              </div>
              <button onClick={async()=>{ if(!confirm('Delete?'))return; await supabase.from('caixa_movimentos').delete().eq('id',e.id); setEntries(prev=>prev.filter(x=>x.id!==e.id)) }} style={{padding:'4px 8px',fontSize:11,borderRadius:6,background:'#7f1d1d',color:'white',border:'none',cursor:'pointer',marginRight:8}}>🗑</button>
              <div style={{ fontSize:15, fontWeight:800, color:e.tipo==='entrada'?'var(--green)':'var(--red)' }}>
                {e.tipo==='entrada'?'+':'-'}{fmtYen(e.valor)}
              </div>
            </div>
          ))}
        </div>
      )}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'var(--bg2)', borderRadius:20, padding:'28px', width:'100%', maxWidth:380, boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:20 }}>Add cash movement</div>
            <div style={{ marginBottom:12 }}>
              <label className="form-label">Type</label>
              <select value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})}>
                <option value="entrada">Entrada (in)</option>
                <option value="saida">Saída (out)</option>
              </select>
            </div>
            <div style={{ marginBottom:12 }}>
              <label className="form-label">Amount (¥)</label>
              <input type="number" value={form.valor} onChange={e=>setForm({...form,valor:e.target.value})} autoFocus />
            </div>
            <div style={{ marginBottom:12 }}>
              <label className="form-label">Description</label>
              <input value={form.descricao} onChange={e=>setForm({...form,descricao:e.target.value})} placeholder="e.g. Atomic payment, Costco purchase..." />
            </div>
            <div style={{ marginBottom:12 }}>
              <label className="form-label">Method</label>
              <select value={form.metodo} onChange={e=>setForm({...form,metodo:e.target.value})}>
                {['Cash','Bank Transfer','Card'].map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:20 }}>
              <label className="form-label">Date</label>
              <input type="date" value={form.data} onChange={e=>setForm({...form,data:e.target.value})} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:8 }}>
              <button onClick={()=>setModal(false)} style={{ padding:'11px', borderRadius:12, border:'1px solid var(--border)', background:'transparent', cursor:'pointer' }}>Cancel</button>
              <button className="btn-primary" onClick={save} disabled={saving||!form.valor||!form.descricao} style={{ padding:'11px', borderRadius:12 }}>{saving?'Saving...':'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Calendario() {
  const [faturas, setFaturas] = useState([])
  const [compras, setCompras] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(null)
  const [popup, setPopup] = useState(null)

  useEffect(() => { load(); const iv=setInterval(load,30000); return ()=>clearInterval(iv) }, [])
  async function load() {
    const [fR, cR] = await Promise.all([
      supabase.from('faturas').select('*, bars(nome)').order('data_vencimento'),
      supabase.from('compras').select('*').order('data'),
    ])
    setFaturas(fR.data||[])
    setCompras(cR.data||[])
    setLoading(false)
  }

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const monthStr = currentMonth.toISOString().slice(0,7)
  const today = new Date()
  const isCurrentMonth = today.getMonth()===month && today.getFullYear()===year

  const events = {}
  faturas.forEach(f => {
    if (f.data_vencimento?.startsWith(monthStr)) {
      const day = +f.data_vencimento.slice(8,10)
      if (!events[day]) events[day] = []
      events[day].push({ type:'in', label:f.bars?.nome, amount:(+f.valor||0)-(+f.pago||0), status:f.status, date:f.data_vencimento, note:'Invoice due' })
    }
  })
  compras.forEach(c => {
    const payDate = c.data_pagamento || c.data
    if (payDate?.startsWith(monthStr)) {
      const day = +payDate.slice(8,10)
      if (!events[day]) events[day] = []
      events[day].push({ type:'out', label:c.fornecedor||'Supplier', amount:+c.total_pago||0, status:c.status_pagamento, date:payDate, note:'Purchase' })
    }
  })

  // Next 3 upcoming events
  const allEvents = [
    ...faturas.filter(f=>f.status!=='pago').map(f=>({ date:f.data_vencimento, label:f.bars?.nome, amount:(+f.valor||0)-(+f.pago||0), type:'in', note:'Invoice due' })),
    ...compras.filter(c=>c.status_pagamento==='pendente').map(c=>({ date:c.data_pagamento||c.data, label:c.fornecedor||'Supplier', amount:+c.total_pago||0, type:'out', note:'Purchase' }))
  ].sort((a,b)=>(a.date||'').localeCompare(b.date||''))

  const nextEvents = allEvents.filter(e=>e.date>=today.toISOString().slice(0,10)).slice(0,5)

  if (loading) return <Spinner text="Carregando..." />

  return (
    <div>
      {/* Next payments banner */}
      {nextEvents.length>0 && (
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'16px 20px', marginBottom:20 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>⚡ Next upcoming events</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {nextEvents.map((ev,i)=>{
              const daysLeft = Math.ceil((new Date(ev.date)-today)/(1000*60*60*24))
              return (
                <div key={i} style={{ background:ev.type==='in'?'#f0fdf4':'#fef2f2', border:'1px solid', borderColor:ev.type==='in'?'#86efac':'#fca5a5', borderRadius:12, padding:'10px 14px', minWidth:140 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:ev.type==='in'?'var(--green)':'var(--red)', marginBottom:2 }}>{ev.type==='in'?'↑ IN':'↓ OUT'}</div>
                  <div style={{ fontSize:13, fontWeight:700 }}>{fmtYen(ev.amount)}</div>
                  <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>{ev.label}</div>
                  <div style={{ fontSize:11, color:daysLeft<=3?'var(--red)':'var(--text2)', fontWeight:daysLeft<=3?700:400, marginTop:4 }}>
                    {daysLeft===0?'Today':daysLeft===1?'Tomorrow':'In '+daysLeft+' days'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Calendar header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <button onClick={()=>setCurrentMonth(new Date(year,month-1,1))} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', cursor:'pointer', fontSize:16 }}>←</button>
        <div style={{ fontSize:16, fontWeight:700 }}>{currentMonth.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</div>
        <button onClick={()=>setCurrentMonth(new Date(year,month+1,1))} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', cursor:'pointer', fontSize:16 }}>→</button>
      </div>

      <div style={{ display:'flex', gap:12, marginBottom:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12 }}><div style={{ width:10,height:10,borderRadius:2,background:'#86efac' }}/> Money in</div>
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12 }}><div style={{ width:10,height:10,borderRadius:2,background:'#fca5a5' }}/> Money out</div>
      </div>

      {/* Calendar grid */}
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, overflow:'hidden', marginBottom:20 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', background:'var(--navy)' }}>
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>(
            <div key={d} style={{ padding:'10px', textAlign:'center', fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)' }}>{d}</div>
          ))}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
          {Array.from({length:firstDay}).map((_,i)=>(
            <div key={'e'+i} style={{ minHeight:70, borderRight:'1px solid var(--border)', borderBottom:'1px solid var(--border)', background:'var(--bg3)' }}/>
          ))}
          {Array.from({length:daysInMonth}).map((_,i)=>{
            const day = i+1
            const dayEvents = events[day]||[]
            const isToday = isCurrentMonth && day===today.getDate()
            const hasIn = dayEvents.some(e=>e.type==='in')
            const hasOut = dayEvents.some(e=>e.type==='out')
            return (
              <div key={day} onClick={()=>{ if(dayEvents.length>0){ setSelectedDay(day); setPopup(dayEvents) }}}
                style={{ minHeight:70, borderRight:'1px solid var(--border)', borderBottom:'1px solid var(--border)',
                  background:isToday?'rgba(193,156,86,0.1)':'transparent',
                  cursor:dayEvents.length>0?'pointer':'default',
                  transition:'background 0.15s' }}>
                <div style={{ padding:'6px 8px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                    <span style={{ fontSize:13, fontWeight:isToday?800:400, color:isToday?'var(--gold)':'var(--text)',
                      width:24, height:24, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                      background:isToday?'var(--navy)':'transparent' }}>{day}</span>
                    {dayEvents.length>0 && <span style={{ fontSize:10, color:'var(--text3)' }}>{dayEvents.length}</span>}
                  </div>
                  {hasIn && <div style={{ height:4, background:'#86efac', borderRadius:2, marginBottom:2 }}/>}
                  {hasOut && <div style={{ height:4, background:'#fca5a5', borderRadius:2 }}/>}
                  {dayEvents.slice(0,2).map((ev,ei)=>{
                    const daysLeft = Math.ceil((new Date(ev.date)-today)/(1000*60*60*24))
                    return (
                      <div key={ei} style={{ fontSize:9, padding:'2px 4px', borderRadius:3, marginTop:2,
                        background:ev.type==='in'?'#f0fdf4':'#fef2f2', color:ev.type==='in'?'#16a34a':'#dc2626',
                        fontWeight:600, lineHeight:1.4 }}>
                        {ev.type==='in'?'↑':'↓'} {Math.round(ev.amount/1000)}k
                        {daysLeft>=0 && <span style={{ display:'block', fontSize:8, opacity:0.8 }}>{daysLeft===0?'today':daysLeft+'d'}</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Popup */}
      {popup && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={()=>setPopup(null)}>
          <div style={{ background:'var(--bg2)', borderRadius:20, padding:'24px', width:'100%', maxWidth:380, boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}
            onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:16 }}>
              {currentMonth.toLocaleDateString('en-US',{month:'long'})} {selectedDay}, {year}
            </div>
            {popup.map((ev,i)=>(
              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20,
                      background:ev.type==='in'?'#f0fdf4':'#fef2f2', color:ev.type==='in'?'var(--green)':'var(--red)' }}>
                      {ev.type==='in'?'↑ RECEIVE':'↓ PAY'}
                    </span>
                    {ev.status && <span style={{ fontSize:10, color:'var(--text3)' }}>{ev.status}</span>}
                  </div>
                  <div style={{ fontSize:13, fontWeight:600 }}>{ev.label}</div>
                  <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>{ev.note}</div>
                </div>
                <div style={{ fontSize:16, fontWeight:800, color:ev.type==='in'?'var(--green)':'var(--red)' }}>
                  {ev.type==='in'?'+':'-'}{fmtYen(ev.amount)}
                </div>
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, marginTop:12, paddingTop:12, borderTop:'2px solid var(--border)' }}>
              <span>Net</span>
              <span style={{ color:popup.reduce((a,e)=>a+(e.type==='in'?e.amount:-e.amount),0)>=0?'var(--green)':'var(--red)' }}>
                {fmtYen(popup.reduce((a,e)=>a+(e.type==='in'?e.amount:-e.amount),0))}
              </span>
            </div>
            <button onClick={()=>setPopup(null)} style={{ width:'100%', marginTop:16, padding:'12px', borderRadius:12, border:'1px solid var(--border)', background:'transparent', cursor:'pointer', fontSize:13 }}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
