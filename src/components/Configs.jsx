import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './Auth'
import { fmtYen, Badge, Spinner, Empty, SectionTitle, DelBtn, CATEGORIAS } from './utils'

// ── PRODUTOS ─────────────────────────────────────────────────────────────────
export function ProductsTab() {
  const [produtos, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving,  setSaving]    = useState(false)
  const [editId,  setEditId]    = useState(null)
  const [form, setForm] = useState({ nome:'', categoria:'Cerveja', custo:0, preco_venda:0 })

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const { data } = await supabase.from('produtos').select('*').order('nome')
    setProducts(data||[])
    setLoading(false)
  }

  const setF = (k,v) => setForm(f=>({...f,[k]:v}))

  async function save() {
    if (!form.nome) return
    setSaving(true)
    if (editId) {
      await supabase.from('produtos').update(form).eq('id', editId)
      setEditId(null)
    } else {
      await supabase.from('produtos').insert(form)
    }
    setSaving(false)
    setForm({ nome:'', categoria:'Cerveja', custo:0, preco_venda:0 })
    load()
  }

  async function del(id) {
    if (!confirm('Remove product?')) return
    await supabase.from('produtos').update({ ativo: false }).eq('id', id)
    load()
  }

  function startEdit(p) {
    setEditId(p.id)
    setForm({ nome:p.nome, categoria:p.categoria, custo:p.custo, preco_venda:p.preco_venda })
  }

  return (
    <div className="fade-in">
      <div className="card">
        <SectionTitle>{editId ? 'Edit product' : 'New product'}</SectionTitle>
        <div className="grid4" style={{ marginBottom:12, alignItems:'end' }}>
          <div style={{ gridColumn:'span 1' }}>
            <label className="form-label">Name</label>
            <input type="text" value={form.nome} onChange={e=>setF('nome',e.target.value)} placeholder="Ex: Asahi 500ml" />
          </div>
          <div>
            <label className="form-label">Category</label>
            <select value={form.categoria} onChange={e=>setF('categoria',e.target.value)}>
              {CATEGORIAS.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Cost (¥)</label>
            <input type="number" value={form.custo} onChange={e=>setF('custo',+e.target.value)} />
          </div>
          <div>
            <label className="form-label">Sale price (¥)</label>
            <input type="number" value={form.preco_venda} onChange={e=>setF('preco_venda',+e.target.value)} />
          </div>
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          {editId && <button onClick={()=>{setEditId(null);setForm({nome:'',categoria:'Cerveja',custo:0,preco_venda:0})}}>Cancel</button>}
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner"/>Saving...</> : editId?'Save edit':'Add product'}
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? <Spinner /> : produtos.length===0 ? <Empty text="No products" /> : (
          <table>
            <thead><tr><th>Product</th><th>Category</th><th>Custo</th><th>Venda</th><th>Margin</th><th></th></tr></thead>
            <tbody>
              {produtos.filter(p=>p.ativo!==false).map(p=>{
                const m = p.preco_venda>0 ? Math.round((p.preco_venda-p.custo)/p.preco_venda*100) : 0
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight:500 }}>{p.nome}</td>
                    <td><Badge color="var(--amber)">{p.categoria}</Badge></td>
                    <td>{fmtYen(p.custo)}</td>
                    <td>{fmtYen(p.preco_venda)}</td>
                    <td style={{ fontWeight:700,
                      color:m>50?'var(--green)':m>30?'var(--amber)':'var(--red)'
                    }}>{m}%</td>
                    <td style={{ display:'flex', gap:4 }}>
                      <button style={{padding:'4px 8px',fontSize:12}} onClick={()=>startEdit(p)}>✏️</button>
                      <DelBtn onClick={()=>del(p.id)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── BARES ─────────────────────────────────────────────────────────────────────
export function BarsTab() {
  const [bars,    setBars]    = useState([])
  const [vendas,  setSales]  = useState([])
  const [loading, setLoading] = useState(true)
  const [nome, setName] = useState('')
  const [cor,  setColor]  = useState('#185FA5')

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const [{ data: b }, { data: v }] = await Promise.all([
      supabase.from('bars').select('*').order('nome'),
      supabase.from('vendas').select('bar_id, total')
    ])
    setBars(b||[]); setSales(v||[])
    setLoading(false)
  }

  async function add() {
    if (!nome) return
    await supabase.from('bars').insert({ nome, cor })
    setName(''); setColor('#185FA5'); load()
  }

  async function del(id) {
    if (!confirm('Remove bar?')) return
    await supabase.from('bars').delete().eq('id', id)
    load()
  }

  return (
    <div className="fade-in">
      <div className="card">
        <SectionTitle>Add bar / client</SectionTitle>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 60px auto', gap:10, alignItems:'end' }}>
          <div><label className="form-label">Name</label>
            <input type="text" value={nome} onChange={e=>setName(e.target.value)} placeholder="Name do bar" /></div>
          <div><label className="form-label">Color</label>
            <input type="color" value={cor} onChange={e=>setColor(e.target.value)} style={{ height:38, padding:'2px 4px' }} /></div>
          <button className="btn-primary" onClick={add}>Add</button>
        </div>
      </div>
      <div className="card">
        {loading ? <Spinner /> : bars.length===0 ? <Empty text="No bars registered" /> : (
          <table>
            <thead><tr><th>Bar</th><th>Color</th><th>Sales</th><th>Total revenue</th><th></th></tr></thead>
            <tbody>
              {bars.map(b=>{
                const v = vendas.filter(x=>x.bar_id===b.id)
                const receita = v.reduce((a,x)=>a+(+x.total||0),0)
                return (
                  <tr key={b.id}>
                    <td style={{ fontWeight:600 }}>{b.nome}</td>
                    <td><div style={{ width:24,height:24,borderRadius:6,background:b.cor,border:'0.5px solid var(--border)' }}/></td>
                    <td>{v.length}</td>
                    <td style={{ fontWeight:600 }}>{fmtYen(receita)}</td>
                    <td><DelBtn onClick={()=>del(b.id)} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── USUÁRIOS (admin only) ─────────────────────────────────────────────────────
export function UsuariosTab() {
  const [users, setUsers] = useState([])
  const [bars, setBars] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ nome:'', email:'', role:'cliente', bar_id:'' })
  const [showNew, setShowNew] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [creating, setCreating] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: u }, { data: b }] = await Promise.all([
      supabase.from('perfis').select('*').order('nome'),
      supabase.from('bars').select('id,nome').order('nome'),
    ])
    setUsers(u || [])
    setBars(b || [])
    setLoading(false)
  }

  async function saveEdit(id) {
    setSaving(true)
    await supabase.from('perfis').update({
      nome: form.nome,
      role: form.role,
      bar_id: form.bar_id || null,
    }).eq('id', id)
    setSaving(false)
    setEditId(null)
    load()
  }

  async function deleteUser(id) {
    if (!confirm('Delete this user?')) return
    await supabase.from('perfis').delete().eq('id', id)
    load()
  }

  function startEdit(u) {
    setEditId(u.id)
    setForm({ nome: u.nome||'', email: u.email||'', role: u.role||'cliente', bar_id: u.bar_id||'' })
  }

  const roleColor = { admin:'var(--gold)', staff:'var(--navy)', cliente:'var(--green)' }

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:200,color:'var(--text2)'}}><span className="spinner"/>Loading...</div>

  return (
    <div className="fade-in">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div style={{fontSize:18,fontWeight:800,color:'var(--navy)'}}>Users <span style={{fontSize:13,fontWeight:400,color:'var(--text3)'}}>({users.length})</span></div>
        <button className="btn-primary" style={{fontSize:12,padding:'8px 16px'}} onClick={()=>setShowNew(v=>!v)}>+ New user</button>
      </div>

      {msg && <div style={{background:'var(--green)',color:'white',borderRadius:8,padding:'10px 16px',marginBottom:16,fontSize:13}}>{msg}</div>}

      {showNew && (
        <div className="card" style={{marginBottom:20,background:'var(--bg2)',border:'1px solid rgba(193,156,86,0.2)'}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:'var(--navy)'}}>Create new user</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
            <input className="input" placeholder="Full name" value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})}/>
            <input className="input" placeholder="Email" value={newEmail} onChange={e=>setNewEmail(e.target.value)}/>
            <input className="input" placeholder="Password" type="password" value={newPw} onChange={e=>setNewPw(e.target.value)}/>
            <select className="input" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
              <option value="admin">Admin</option>
              <option value="staff">Staff</option>
              <option value="cliente">Cliente</option>
            </select>
            {form.role==='cliente' && (
              <select className="input" value={form.bar_id} onChange={e=>setForm({...form,bar_id:e.target.value})}>
                <option value="">— Select bar —</option>
                {bars.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}
              </select>
            )}
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn-primary" style={{fontSize:12,padding:'8px 16px'}} disabled={creating||!newEmail||!newPw||!form.nome}
              onClick={async()=>{
                setCreating(true)
                try {
                  const res = await fetch('/api/create-user', {
                    method: 'POST',
                    headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({ email: newEmail, password: newPw, nome: form.nome, role: form.role, bar_id: form.bar_id||null })
                  })
                  const json = await res.json()
                  if (!res.ok) { setMsg('Error: '+(json.error||'unknown')); setCreating(false); return }
                  setMsg('User created: '+newEmail)
                  setShowNew(false); setNewEmail(''); setNewPw('')
                  setForm({nome:'',email:'',role:'cliente',bar_id:''})
                  load()
                  setTimeout(()=>setMsg(''),4000)
                } catch(e) { setMsg('Error: '+e.message) }
                setCreating(false)
              }}>
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button onClick={()=>setShowNew(false)} style={{fontSize:12,padding:'8px 16px',background:'var(--bg3)',border:'none',borderRadius:8,cursor:'pointer',color:'var(--text2)'}}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr style={{background:'var(--bg2)',borderBottom:'1px solid var(--border)'}}>
              {['Name','Email','Role','Bar','Actions'].map(h=>(
                <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u,i)=>(
              <tr key={u.id} style={{borderBottom:'1px solid var(--border)',background:i%2===0?'white':'var(--bg)'}}>
                {editId===u.id ? (
                  <>
                    <td style={{padding:'8px 14px'}}><input className="input" style={{padding:'4px 8px',fontSize:12,width:'100%'}} value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})}/></td>
                    <td style={{padding:'8px 14px',fontSize:12,color:'var(--text3)'}}>{u.email}</td>
                    <td style={{padding:'8px 14px'}}>
                      <select className="input" style={{padding:'4px 8px',fontSize:12}} value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
                        <option value="admin">Admin</option>
                        <option value="staff">Staff</option>
                        <option value="cliente">Cliente</option>
                      </select>
                    </td>
                    <td style={{padding:'8px 14px'}}>
                      <select className="input" style={{padding:'4px 8px',fontSize:12}} value={form.bar_id} onChange={e=>setForm({...form,bar_id:e.target.value})}>
                        <option value="">—</option>
                        {bars.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}
                      </select>
                    </td>
                    <td style={{padding:'8px 14px'}}>
                      <div style={{display:'flex',gap:6}}>
                        <button className="btn-primary" style={{fontSize:11,padding:'4px 10px'}} disabled={saving} onClick={()=>saveEdit(u.id)}>{saving?'...':'Save'}</button>
                        <button onClick={()=>setEditId(null)} style={{fontSize:11,padding:'4px 10px',background:'var(--bg3)',border:'none',borderRadius:6,cursor:'pointer'}}>Cancel</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{padding:'10px 14px',fontSize:13,fontWeight:600}}>{u.nome||'—'}</td>
                    <td style={{padding:'10px 14px',fontSize:12,color:'var(--text2)'}}>{u.email||'—'}</td>
                    <td style={{padding:'10px 14px'}}>
                      <span style={{fontSize:11,fontWeight:700,padding:'3px 8px',borderRadius:20,background:`${roleColor[u.role]||'#ccc'}20`,color:roleColor[u.role]||'#666',textTransform:'uppercase',letterSpacing:'0.04em'}}>{u.role||'—'}</span>
                    </td>
                    <td style={{padding:'10px 14px',fontSize:12,color:'var(--text2)'}}>{bars.find(b=>b.id===u.bar_id)?.nome||'—'}</td>
                    <td style={{padding:'10px 14px'}}>
                      <div style={{display:'flex',gap:6}}>
                        <button onClick={()=>startEdit(u)} style={{fontSize:11,padding:'4px 10px',background:'var(--navy)',color:'white',border:'none',borderRadius:6,cursor:'pointer'}}>Edit</button>
                        <button onClick={()=>deleteUser(u.id)} style={{fontSize:11,padding:'4px 10px',background:'var(--red)',color:'white',border:'none',borderRadius:6,cursor:'pointer'}}>Del</button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {users.length===0 && <div style={{padding:32,textAlign:'center',color:'var(--text3)',fontSize:13}}>No users found</div>}
      </div>
    </div>
  )
}

export function PedidosAdminTab() {
  const [pedidos,setPedidos]=useState([])
  const [loading,setLoading]=useState(true)
  const [filterStatus,setFilterStatus]=useState('')
  const [checklistPedido,setChecklistPedido]=useState(null)
  const [checkedItems,setCheckedItems]=useState({})

  useEffect(()=>{ load(); const iv=setInterval(load,30000); return ()=>clearInterval(iv) },[])

  async function load(){
    const [{data:p}]=await Promise.all([
      supabase.from('pedidos').select('*, pedidos_itens(*, produtos(*)), bars(nome)').order('criado_em',{ascending:false})
    ])
    setPedidos(p||[])
    setLoading(false)
  }

  async function updateStatus(id,status){
    await supabase.from('pedidos').update({status}).eq('id',id)
    if(status==='entregue'){
      const pedido=pedidos.find(p=>p.id===id)
      if(pedido){
        const {data:venda}=await supabase.from('vendas').insert({
          data:new Date().toISOString().slice(0,10),
          bar_id:pedido.bar_id,
          total:pedido.total_estimado,
          obs:'Auto: order '+pedido.id.slice(0,8),
          criado_por:pedido.criado_por
        }).select().single()
        if(venda&&pedido.pedidos_itens&&pedido.pedidos_itens.length>0){
          await supabase.from('vendas_itens').insert(
            pedido.pedidos_itens.map(it=>({
              venda_id:venda.id,produto_id:it.produto_id,
              qtd:it.qtd,preco_unitario:it.preco_unitario
            }))
          )
        }
        await supabase.from('notificacoes').insert({
          user_id:pedido.criado_por,tipo:'pedido_entregue',
          titulo:'Order delivered',
          mensagem:'Delivered. Total: \u00a5'+Math.round(pedido.total_estimado).toLocaleString()
        }).catch(()=>{})
        // Auto-generate fatura
        const hoje = new Date().toISOString().slice(0,10)
        const dia = new Date().getDate()
        const venc = dia<=5
          ? new Date(new Date().getFullYear(),new Date().getMonth(),20).toISOString().slice(0,10)
          : new Date(new Date().getFullYear(),new Date().getMonth()+1,20).toISOString().slice(0,10)
        await supabase.from('faturas').insert({
          bar_id: pedido.bar_id,
          venda_id: venda?.id || null,
          valor: pedido.total_estimado,
          status: 'pendente',
          data_emissao: hoje,
          data_vencimento: venc
        }).catch((e)=>{ console.error('auto-fatura error:', e) })
      }
    }
    if(status==='confirmado'){
      const pedido=pedidos.find(p=>p.id===id)
      if(pedido) await supabase.from('notificacoes').insert({
        user_id:pedido.criado_por,tipo:'pedido_confirmado',
        titulo:'Order confirmed',mensagem:'Your order is being prepared.'
      }).catch(()=>{})
    }
    // Update local state immediately for real-time feel
    setPedidos(prev => prev.map(p => p.id===id ? {...p, status} : p))
    load()
  }

  function openChecklist(pedido){
    const init={}
    ;(pedido.pedidos_itens||[]).forEach(it=>{init[it.id]=false})
    setCheckedItems(init)
    setChecklistPedido(pedido)
  }

  async function confirmDelivery(){
    if(!Object.values(checkedItems).every(v=>v)){
      alert("Check all items first.")
      return
    }
    const pedido=checklistPedido
    const id=pedido.id
    setChecklistPedido(null)
    setCheckedItems({})
    await supabase.from("pedidos").update({status:"entregue"}).eq("id",id)
    const {data:venda}=await supabase.from("vendas").insert({
      data:new Date().toISOString().slice(0,10),
      bar_id:pedido.bar_id,total:pedido.total_estimado,
      obs:"Auto: order "+id.slice(0,8),criado_por:pedido.criado_por
    }).select().single()
    if(venda&&pedido.pedidos_itens&&pedido.pedidos_itens.length>0){
      await supabase.from("vendas_itens").insert(
        pedido.pedidos_itens.map(it=>({venda_id:venda.id,produto_id:it.produto_id,qtd:it.qtd,preco_unitario:it.preco_unitario}))
      )
    }
    await supabase.from("notificacoes").insert({user_id:pedido.criado_por,tipo:"pedido_entregue",titulo:"Order delivered",mensagem:"Delivered"}).catch(()=>{})

    // Auto-add to invoice for current billing period
    try {
      const today = new Date()
      const day = today.getDate()
      const year = today.getFullYear()
      const month = today.getMonth()
      let periodStart, periodEnd, dueDate
      if (day <= 5) {
        periodStart = new Date(year,month,1).toISOString().slice(0,10)
        periodEnd = new Date(year,month,5).toISOString().slice(0,10)
        dueDate = new Date(year,month,20).toISOString().slice(0,10)
      } else if (day <= 20) {
        periodStart = new Date(year,month,6).toISOString().slice(0,10)
        periodEnd = new Date(year,month,20).toISOString().slice(0,10)
        dueDate = new Date(year,month+1,5).toISOString().slice(0,10)
      } else {
        periodStart = new Date(year,month,21).toISOString().slice(0,10)
        periodEnd = new Date(year,month+1,0).toISOString().slice(0,10)
        dueDate = new Date(year,month+1,20).toISOString().slice(0,10)
      }
      // Find existing invoice for this period and bar
      const {data:existingFatura} = await supabase.from("faturas")
        .select("*").eq("bar_id",pedido.bar_id).eq("periodo_inicio",periodStart).eq("periodo_fim",periodEnd).single()
      if (existingFatura) {
        // Update total
        await supabase.from("faturas").update({ total: existingFatura.total + pedido.total_estimado }).eq("id",existingFatura.id)
      } else {
        // Create new invoice
        await supabase.from("faturas").insert({
          bar_id: pedido.bar_id,
          periodo_inicio: periodStart,
          periodo_fim: periodEnd,
          vencimento: dueDate,
          total: pedido.total_estimado,
          pago: 0,
          status: "pendente",
          notas: "Auto-generated"
        })
      }
    } catch(e) { console.error("Invoice auto-create failed:", e) }

    load()
  }

  const STATUS_MAP={
    pendente:{label:'Pending',color:'#8A5A00',bg:'#FDF3E0'},
    confirmado:{label:'Confirmed',color:'#1A4E8A',bg:'#EAF0FA'},
    entregue:{label:'Delivered',color:'#1A7A5E',bg:'#EAF5F0'},
    cancelado:{label:'Cancelled',color:'#C0392B',bg:'#FBEAEA'},
  }
  const filtered=filterStatus?pedidos.filter(p=>p.status===filterStatus):pedidos
  const pendentes=pedidos.filter(p=>p.status==='pendente').length

  return(
    <div className="fade-in">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div>
          <div style={{fontSize:16,fontWeight:700}}>Client orders</div>
          {pendentes>0&&<div style={{fontSize:12,color:'var(--red)',marginTop:2}}>{pendentes} order(s) awaiting confirmation</div>}
        </div>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{width:'auto'}}>
          <option value="">All</option>
          <option value="pendente">Pending</option>
          <option value="confirmado">Confirmed</option>
          <option value="entregue">Delivered</option>
          <option value="cancelado">Cancelled</option>
        </select>
      </div>

      {loading
        ? <div style={{color:'var(--text2)',fontSize:13}}>Loading...</div>
        : filtered.length===0
          ? <div style={{color:'var(--text3)',textAlign:'center',padding:'40px 0'}}>No orders</div>
          : filtered.map(p=>{
            const s=STATUS_MAP[p.status]||STATUS_MAP.pendente
            return(
              <div key={p.id} className="card" style={{marginBottom:12,borderLeft:p.status==='pendente'?'3px solid var(--gold)':'3px solid var(--border)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14}}>{p.bars?.nome} &mdash; {new Date(p.criado_em).toLocaleDateString('en-US')}</div>
                    {p.data_entrega_prevista&&<div style={{fontSize:12,color:'var(--text3)'}}>Requested: {p.data_entrega_prevista}</div>}
                    {p.obs&&<div style={{fontSize:12,color:'var(--text2)',marginTop:2}}>{p.obs}</div>}
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontWeight:700}}>&yen;{Math.round(p.total_estimado).toLocaleString()}</span>
                    <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20,background:s.bg,color:s.color}}>{s.label}</span>
                  </div>
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:12}}>
                  {(p.pedidos_itens||[]).map(it=>(
                    <span key={it.id} style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:'var(--bg3)',color:'var(--text2)'}}>
                      {it.produtos?.nome} &times;{it.qtd}
                    </span>
                  ))}
                </div>
                <div style={{display:'flex',gap:8}}>
                  {p.status==='pendente'&&<>
                    <button onClick={()=>updateStatus(p.id,'confirmado')} style={{padding:'6px 14px',fontSize:11,borderRadius:8,background:'var(--navy)',color:'var(--gold)',border:'none',fontWeight:600}}>Confirm</button>
                    <button onClick={()=>updateStatus(p.id,'cancelado')} className="btn-danger" style={{padding:'6px 14px',fontSize:11,borderRadius:8}}>Cancel</button>
                  </>}
                  <button onClick={async()=>{ if(!confirm('Delete this order?'))return; setPedidos(prev=>prev.filter(x=>x.id!==p.id)); await supabase.from('pedidos_itens').delete().eq('pedido_id',p.id); await supabase.from('pedidos').delete().eq('id',p.id); }} style={{padding:'6px 14px',fontSize:11,borderRadius:8,background:'#7f1d1d',color:'white',border:'none',fontWeight:600,cursor:'pointer'}}>🗑</button>
                  {p.status==='confirmado'&&(
                    <button onClick={()=>openChecklist(p)} style={{padding:'6px 14px',fontSize:11,borderRadius:8,background:'var(--green)',color:'white',border:'none',fontWeight:600}}>&#10003; Mark delivered</button>
                  )}
                </div>
              </div>
            )
          })
      }

      {checklistPedido&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:'var(--bg2)',borderRadius:16,padding:'28px 28px 24px',width:'100%',maxWidth:480,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <div style={{fontSize:16,fontWeight:800,color:'var(--navy)',marginBottom:4}}>Delivery checklist</div>
            <div style={{fontSize:12,color:'var(--text3)',marginBottom:20}}>{checklistPedido.bars?.nome} &mdash; check each item before confirming</div>
            {(checklistPedido.pedidos_itens||[]).map(it=>(
              <div key={it.id} onClick={()=>setCheckedItems(prev=>({...prev,[it.id]:!prev[it.id]}))}
                style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:10,marginBottom:8,cursor:'pointer',
                  background:checkedItems[it.id]?'#f0fdf4':'var(--bg3)',
                  border:checkedItems[it.id]?'1.5px solid var(--green)':'1.5px solid var(--border)',transition:'all 0.15s'}}>
                <div style={{width:22,height:22,borderRadius:6,flexShrink:0,
                  background:checkedItems[it.id]?'var(--green)':'var(--bg2)',
                  border:checkedItems[it.id]?'none':'2px solid var(--border)',
                  display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:13,fontWeight:700}}>
                  {checkedItems[it.id]?'\u2713':''}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600}}>{it.produtos?.nome}</div>
                  <div style={{fontSize:11,color:'var(--text3)'}}>Qty: {it.qtd} &times; &yen;{(it.preco_unitario||0).toLocaleString()}</div>
                </div>
                <div style={{fontWeight:700,fontSize:13}}>&yen;{((it.preco_unitario||0)*it.qtd).toLocaleString()}</div>
              </div>
            ))}
            <div style={{background:'var(--navy)',borderRadius:10,padding:'12px 16px',display:'flex',justifyContent:'space-between',marginTop:12,marginBottom:20}}>
              <span style={{color:'rgba(255,255,255,0.6)',fontSize:13}}>Total</span>
              <span style={{color:'var(--gold)',fontWeight:800,fontSize:15}}>&yen;{Math.round(checklistPedido.total_estimado).toLocaleString()}</span>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>{setChecklistPedido(null);setCheckedItems({})}} style={{flex:1,padding:'11px',borderRadius:10,border:'1px solid var(--border)',background:'transparent',fontSize:13,cursor:'pointer'}}>Cancel</button>
              <button onClick={confirmDelivery} style={{flex:2,padding:'11px',borderRadius:10,border:'none',
                background:Object.values(checkedItems).every(v=>v)?'var(--green)':'var(--border)',
                color:Object.values(checkedItems).every(v=>v)?'white':'var(--text3)',
                fontSize:13,fontWeight:700,cursor:'pointer'}}>
                {Object.values(checkedItems).filter(v=>v).length}/{Object.values(checkedItems).length} checked &mdash; Confirm delivery
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
