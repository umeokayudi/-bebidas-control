import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ensureVendaFromPedido, findVendaForPedido, findVendaKeysForPedidos, pedidoSaleDate, billingPeriodForDate } from '../lib/pedidoVenda'
import { useAuth } from './Auth'
import { fmtYen, Badge, Spinner, Empty, DelBtn, CATEGORIAS, filterSupplierVendas, PedidoItemChip } from './utils'
import { SupplierCostHint } from './SupplierPriceCheck'
import { AdminPage, PortalSurface } from './ui/PageLayout'

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
    if (!confirm('Remover produto?')) return
    await supabase.from('produtos').update({ ativo: false }).eq('id', id)
    load()
  }

  function startEdit(p) {
    setEditId(p.id)
    setForm({ nome:p.nome, categoria:p.categoria, custo:p.custo, preco_venda:p.preco_venda })
  }

  return (
    <AdminPage title="Produtos" subtitle="Catálogo JBM — custo e preço ao bar">
      <PortalSurface title={editId ? 'Editar produto' : 'Novo produto'} style={{ marginBottom: 16 }}>
        <div className="grid4" style={{ marginBottom:12, alignItems:'end' }}>
          <div style={{ gridColumn:'span 1' }}>
            <label className="form-label">Nome</label>
            <input type="text" value={form.nome} onChange={e=>setF('nome',e.target.value)} placeholder="Ex: Asahi 500ml" />
          </div>
          <div>
            <label className="form-label">Categoria</label>
            <select value={form.categoria} onChange={e=>setF('categoria',e.target.value)}>
              {CATEGORIAS.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Custo (¥)</label>
            <input type="number" value={form.custo} onChange={e=>setF('custo',+e.target.value)} />
          </div>
          <div>
            <label className="form-label">Preço de venda (¥)</label>
            <input type="number" value={form.preco_venda} onChange={e=>setF('preco_venda',+e.target.value)} />
          </div>
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          {editId && <button onClick={()=>{setEditId(null);setForm({nome:'',categoria:'Cerveja',custo:0,preco_venda:0})}}>Cancelar</button>}
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner"/>Salvando...</> : editId?'Salvar edição':'Adicionar produto'}
          </button>
        </div>
      </PortalSurface>

      <PortalSurface>
        {loading ? <Spinner /> : produtos.length===0 ? <Empty text="Nenhum produto" /> : (
          <table>
            <thead><tr><th>Produto</th><th>Categoria</th><th>Custo</th><th>Venda</th><th>Margem</th><th></th></tr></thead>
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
      </PortalSurface>
    </AdminPage>
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
    setBars(b||[]); setSales(filterSupplierVendas(v||[]))
    setLoading(false)
  }

  async function add() {
    if (!nome) return
    await supabase.from('bars').insert({ nome, cor })
    setName(''); setColor('#185FA5'); load()
  }

  async function del(id) {
    if (!confirm('Remover bar?')) return
    await supabase.from('bars').delete().eq('id', id)
    load()
  }

  return (
    <AdminPage title="Bares" subtitle="Clientes e receita por bar">
      <PortalSurface title="Adicionar bar / cliente" style={{ marginBottom: 16 }}>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 60px auto', gap:10, alignItems:'end' }}>
          <div><label className="form-label">Nome</label>
            <input type="text" value={nome} onChange={e=>setName(e.target.value)} placeholder="Nome do bar" /></div>
          <div><label className="form-label">Cor</label>
            <input type="color" value={cor} onChange={e=>setColor(e.target.value)} style={{ height:38, padding:'2px 4px' }} /></div>
          <button className="btn-primary" onClick={add}>Adicionar</button>
        </div>
      </PortalSurface>
      <PortalSurface>
        {loading ? <Spinner /> : bars.length===0 ? <Empty text="Nenhum bar cadastrado" /> : (
          <table>
            <thead><tr><th>Bar</th><th>Cor</th><th>Vendas</th><th>Receita total</th><th></th></tr></thead>
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
      </PortalSurface>
    </AdminPage>
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
  const [editPw, setEditPw] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [creating, setCreating] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => { load() }, [])

  async function loadUsers() {
    const res = await fetch('/api/admin-user')
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to load users')
    return json.users || []
  }

  async function load() {
    setLoading(true)
    setErr('')
    try {
      const [{ data: b }, u] = await Promise.all([
        supabase.from('bars').select('id,nome').order('nome'),
        loadUsers().catch(async () => {
          const { data: fallback } = await supabase.from('perfis').select('*').order('nome')
          return fallback || []
        }),
      ])
      setBars(b || [])
      setUsers(u || [])
    } catch (e) {
      setErr(e.message)
    }
    setLoading(false)
  }

  async function saveEdit(id) {
    if (form.role === 'cliente' && !form.bar_id) {
      setErr('Select a bar for client accounts')
      return
    }
    setSaving(true)
    setErr('')
    try {
      const res = await fetch('/api/admin-user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          nome: form.nome,
          email: form.email,
          role: form.role,
          bar_id: form.role === 'cliente' ? form.bar_id : null,
          password: editPw || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Update failed')
      setMsg('User updated')
      setEditId(null)
      setEditPw('')
      load()
      setTimeout(() => setMsg(''), 4000)
    } catch (e) {
      setErr(e.message)
    }
    setSaving(false)
  }

  async function deleteUser(id) {
    if (!confirm('Delete profile only? Login remains in Supabase Auth — disable there if needed.')) return
    await supabase.from('perfis').delete().eq('id', id)
    load()
  }

  function startEdit(u) {
    setEditId(u.id)
    setEditPw('')
    setForm({
      nome: u.nome || '',
      email: u.email || '',
      role: u.role === 'funcionario' ? 'staff' : (u.role || 'cliente'),
      bar_id: u.bar_id || '',
    })
  }

  const roleColor = { admin:'var(--gold)', staff:'var(--navy)', funcionario:'var(--navy)', cliente:'var(--green)' }
  const roleLabel = r => ({ admin:'Admin', staff:'Staff', funcionario:'Staff', cliente:'Cliente' }[r] || r)

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:200,color:'var(--text2)'}}><span className="spinner"/>Carregando...</div>

  return (
    <AdminPage
      title="Usuários"
      subtitle="Acesso admin, staff e portal do cliente"
      actions={
        <button className="btn-primary" style={{fontSize:12,padding:'8px 16px'}} onClick={()=>{ setShowNew(v=>!v); setErr('') }}>+ Novo usuário</button>
      }
    >

      {err && <div style={{background:'#fef2f2',color:'#b91c1c',border:'1px solid #fecaca',borderRadius:8,padding:'10px 16px',marginBottom:16,fontSize:13}}>{err}</div>}
      {msg && <div style={{background:'var(--green-bg)',color:'var(--green)',borderRadius:8,padding:'10px 16px',marginBottom:16,fontSize:13}}>{msg}</div>}

      {bars.length === 0 && (
        <div style={{background:'#FDF3E0',border:'1px solid #f0d080',borderRadius:8,padding:'12px 16px',marginBottom:16,fontSize:13,color:'#8A5A00'}}>
          Nenhum bar cadastrado. Vá em <strong>Bares</strong> e adicione um bar antes de criar logins de cliente.
        </div>
      )}

      {showNew && (
        <PortalSurface title="Criar login do portal" sub="Para Atomic ou qualquer bar — função Cliente + selecione o bar" style={{marginBottom:20,background:'var(--bg2)',border:'1px solid rgba(193,156,86,0.2)'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
            <input className="input" placeholder="Nome completo" value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})}/>
            <input className="input" placeholder="Email" type="email" value={newEmail} onChange={e=>setNewEmail(e.target.value)}/>
            <input className="input" placeholder="Senha (mín. 6)" type="password" value={newPw} onChange={e=>setNewPw(e.target.value)}/>
            <select className="input" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
              <option value="admin">Admin</option>
              <option value="staff">Staff</option>
              <option value="cliente">Cliente (portal do bar)</option>
            </select>
            {form.role === 'cliente' && (
              <select className="input" value={form.bar_id} onChange={e=>setForm({...form,bar_id:e.target.value})} style={{ gridColumn:'span 2' }}>
                <option value="">— Selecione o bar (obrigatório) —</option>
                {bars.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}
              </select>
            )}
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn-primary" style={{fontSize:12,padding:'8px 16px'}} disabled={creating||!newEmail||!newPw||!form.nome||(form.role==='cliente'&&!form.bar_id)}
              onClick={async()=>{
                setCreating(true)
                setErr('')
                try {
                  const res = await fetch('/api/admin-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: newEmail, password: newPw, nome: form.nome, role: form.role, bar_id: form.bar_id || null })
                  })
                  const json = await res.json()
                  if (!res.ok) throw new Error(json.error || 'Create failed')
                  setMsg('Usuário criado: ' + newEmail)
                  setShowNew(false); setNewEmail(''); setNewPw('')
                  setForm({ nome:'', email:'', role:'cliente', bar_id:'' })
                  load()
                  setTimeout(()=>setMsg(''),4000)
                } catch(e) { setErr(e.message) }
                setCreating(false)
              }}>
              {creating ? 'Criando...' : 'Criar login'}
            </button>
            <button onClick={()=>setShowNew(false)} style={{fontSize:12,padding:'8px 16px',background:'var(--bg3)',border:'none',borderRadius:8,cursor:'pointer',color:'var(--text2)'}}>Cancelar</button>
          </div>
        </PortalSurface>
      )}

      <PortalSurface style={{padding:0,overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr style={{background:'var(--bg2)',borderBottom:'1px solid var(--border)'}}>
              {['Nome','Email','Função','Bar','Status','Ações'].map(h=>(
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
                    <td style={{padding:'8px 14px'}}><input className="input" type="email" style={{padding:'4px 8px',fontSize:12,width:'100%'}} value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="Change login email"/></td>
                    <td style={{padding:'8px 14px'}}>
                      <select className="input" style={{padding:'4px 8px',fontSize:12}} value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
                        <option value="admin">Admin</option>
                        <option value="staff">Staff</option>
                        <option value="cliente">Cliente</option>
                      </select>
                    </td>
                    <td style={{padding:'8px 14px'}}>
                      <select className="input" style={{padding:'4px 8px',fontSize:12}} value={form.bar_id} onChange={e=>setForm({...form,bar_id:e.target.value})} disabled={form.role !== 'cliente'}>
                        <option value="">—</option>
                        {bars.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}
                      </select>
                    </td>
                    <td style={{padding:'8px 14px'}}>
                      <input className="input" type="password" style={{padding:'4px 8px',fontSize:11,width:'100%'}} value={editPw} onChange={e=>setEditPw(e.target.value)} placeholder="Nova senha (opcional)"/>
                    </td>
                    <td style={{padding:'8px 14px'}}>
                      <div style={{display:'flex',gap:6}}>
                        <button className="btn-primary" style={{fontSize:11,padding:'4px 10px'}} disabled={saving} onClick={()=>saveEdit(u.id)}>{saving?'...':'Salvar'}</button>
                        <button onClick={()=>{setEditId(null);setEditPw('')}} style={{fontSize:11,padding:'4px 10px',background:'var(--bg3)',border:'none',borderRadius:6,cursor:'pointer'}}>Cancelar</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{padding:'10px 14px',fontSize:13,fontWeight:600}}>{u.nome||'—'}</td>
                    <td style={{padding:'10px 14px',fontSize:12,color:'var(--text2)'}}>{u.email||'—'}</td>
                    <td style={{padding:'10px 14px'}}>
                      <span style={{fontSize:11,fontWeight:700,padding:'3px 8px',borderRadius:20,background:`${roleColor[u.role]||'#ccc'}20`,color:roleColor[u.role]||'#666',textTransform:'uppercase',letterSpacing:'0.04em'}}>{roleLabel(u.role)}</span>
                    </td>
                    <td style={{padding:'10px 14px',fontSize:12,color:'var(--text2)'}}>{bars.find(b=>b.id===u.bar_id)?.nome||'—'}</td>
                    <td style={{padding:'10px 14px',fontSize:11}}>
                      {u.role === 'cliente' && !u.bar_id
                        ? <span style={{color:'var(--red)',fontWeight:600}}>Sem bar vinculado</span>
                        : <span style={{color:'var(--green)'}}>OK</span>}
                    </td>
                    <td style={{padding:'10px 14px'}}>
                      <div style={{display:'flex',gap:6}}>
                        <button onClick={()=>startEdit(u)} style={{fontSize:11,padding:'4px 10px',background:'var(--navy)',color:'white',border:'none',borderRadius:6,cursor:'pointer'}}>Editar</button>
                        <button onClick={()=>deleteUser(u.id)} style={{fontSize:11,padding:'4px 10px',background:'var(--red)',color:'white',border:'none',borderRadius:6,cursor:'pointer'}}>Excluir</button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {users.length===0 && <div style={{padding:32,textAlign:'center',color:'var(--text3)',fontSize:13}}>Nenhum usuário encontrado</div>}
      </PortalSurface>

      <div style={{marginTop:16,fontSize:12,color:'var(--text2)',lineHeight:1.6}}>
        <strong>Configuração:</strong> adicione <code>SUPABASE_SERVICE_ROLE_KEY</code> nas variáveis de ambiente da Vercel (Supabase → Settings → API → service_role).
        Execute <code>USUARIOS_SQL.sql</code> uma vez no Supabase se a coluna email estiver faltando.
      </div>
    </AdminPage>
  )
}

export function PedidosAdminTab() {
  const [pedidos,setPedidos]=useState([])
  const [loading,setLoading]=useState(true)
  const [filterStatus,setFilterStatus]=useState('')
  const [checklistPedido,setChecklistPedido]=useState(null)
  const [checkedItems,setCheckedItems]=useState({})
  const [missingVenda,setMissingVenda]=useState({})
  const [repairing,setRepairing]=useState(null)
  const [supplierByProdId,setSupplierByProdId]=useState(new Map())
  const [supplierByProdName,setSupplierByProdName]=useState(new Map())

  const PEDIDOS_SELECT = '*, pedidos_itens(*, produtos(nome,custo,preco_venda,categoria,volume_ml)), bars(nome)'

  useEffect(()=>{ load() },[])
  useEffect(()=>{
    supabase.from('fornecedor_precos').select('produto_id, preco, produtos(id,nome), fornecedores(nome)')
      .then(({ data }) => {
        const list = data || []
        const byId = new Map()
        const byName = new Map()
        for (const p of list) {
          if (p.produto_id) byId.set(p.produto_id, p)
          const n = p.produtos?.nome
          if (n) byName.set(n.toLowerCase(), p)
        }
        setSupplierByProdId(byId)
        setSupplierByProdName(byName)
      })
  },[])

  async function fetchPedidoCompleto(id) {
    const { data, error } = await supabase
      .from('pedidos')
      .select('*, pedidos_itens(*, produtos(nome,custo,preco_venda,categoria,volume_ml)), bars(nome)')
      .eq('id', id)
      .single()
    if (error) throw new Error(error.message)
    return data
  }

  async function markMissingVendas(list) {
    const entregues = (list || []).filter(p => p.status === 'entregue')
    const vendaKeys = await findVendaKeysForPedidos(supabase, entregues)
    const miss = {}
    for (const p of entregues) {
      if (!vendaKeys.has(String(p.id).slice(0, 8).toLowerCase())) miss[p.id] = true
    }
    setMissingVenda(miss)
  }

  async function load(){
    const since = new Date()
    since.setMonth(since.getMonth() - 6)
    const sinceStr = since.toISOString().slice(0, 10)

    const { data: p } = await supabase
      .from('pedidos')
      .select(PEDIDOS_SELECT)
      .or(`data_entrega_prevista.gte.${sinceStr},criado_em.gte.${sinceStr}T00:00:00`)
      .order('criado_em', { ascending: false })
      .limit(80)

    const list = p || []
    setPedidos(list)
    await markMissingVendas(list)
    setLoading(false)
  }

  async function registerVendaForPedido(pedido) {
    const fresh = await fetchPedidoCompleto(pedido.id)
    const { venda } = await ensureVendaFromPedido(supabase, fresh)
    if (!venda) throw new Error('Não foi possível criar a venda')
    return venda
  }

  async function repairVenda(pedido) {
    setRepairing(pedido.id)
    try {
      const venda = await registerVendaForPedido(pedido)
      alert(`Venda registrada: ¥${Math.round(venda.total || 0).toLocaleString()} em ${venda.data}`)
      await load()
    } catch (e) {
      alert('Erro ao registrar venda: ' + e.message)
    } finally {
      setRepairing(null)
    }
  }

  async function updateStatus(id,status){
    if(status==='entregue'){
      const pedido=pedidos.find(p=>p.id===id)
      if(!pedido) return
      try {
        const venda = await registerVendaForPedido(pedido)
        await supabase.from('pedidos').update({status}).eq('id',id)
        await supabase.from('notificacoes').insert({
          user_id:pedido.criado_por,tipo:'pedido_entregue',
          titulo:'Order delivered',
          mensagem:'Delivered. Total: \u00a5'+Math.round(pedido.total_estimado).toLocaleString()
        }).catch(()=>{})
        const saleDate = pedidoSaleDate(pedido)
        const { periodStart, periodEnd, dueDate } = billingPeriodForDate(saleDate)
        await supabase.from('faturas').insert({
          bar_id: pedido.bar_id,
          venda_id: venda?.id || null,
          valor: pedido.total_estimado,
          status: 'pendente',
          data_emissao: saleDate,
          data_vencimento: dueDate,
          periodo_inicio: periodStart,
          periodo_fim: periodEnd,
        }).catch((e)=>{ console.error('auto-fatura error:', e) })
      } catch (e) {
        alert('Erro ao registrar venda: ' + e.message)
        return
      }
    } else {
      await supabase.from('pedidos').update({status}).eq('id',id)
    }
    if(status==='confirmado'){
      const pedido=pedidos.find(p=>p.id===id)
      if(pedido) await supabase.from('notificacoes').insert({
        user_id:pedido.criado_por,tipo:'pedido_confirmado',
        titulo:'Order confirmed',mensagem:'Your order is being prepared.'
      }).catch(()=>{})
    }
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
    try {
      const venda = await registerVendaForPedido(pedido)
      await supabase.from("pedidos").update({status:"entregue"}).eq("id",id)
      await supabase.from("notificacoes").insert({user_id:pedido.criado_por,tipo:"pedido_entregue",titulo:"Order delivered",mensagem:`Delivered · ¥${Math.round(venda.total||0).toLocaleString()} · ${venda.data}`}).catch(()=>{})

      const saleDate = pedidoSaleDate(pedido)
      const { periodStart, periodEnd, dueDate } = billingPeriodForDate(saleDate)
      try {
        const { data: existingFatura } = await supabase.from('faturas')
          .select('*').eq('bar_id', pedido.bar_id).eq('periodo_inicio', periodStart).eq('periodo_fim', periodEnd).single()
        if (existingFatura) {
          await supabase.from('faturas').update({ total: existingFatura.total + pedido.total_estimado }).eq('id', existingFatura.id)
        } else {
          await supabase.from('faturas').insert({
            bar_id: pedido.bar_id,
            periodo_inicio: periodStart,
            periodo_fim: periodEnd,
            vencimento: dueDate,
            data_vencimento: dueDate,
            total: pedido.total_estimado,
            valor: pedido.total_estimado,
            pago: 0,
            status: 'pendente',
            notas: 'Auto-generated',
            venda_id: venda?.id || null,
          })
        }
      } catch (e) { console.error('Invoice auto-create failed:', e) }
      alert(`Entrega OK · Venda ¥${Math.round(venda.total || 0).toLocaleString('ja-JP')} registrada em ${venda.data}`)
    } catch (e) {
      alert('Erro ao registrar venda: ' + e.message)
    }
    load()
  }

  const STATUS_MAP={
    pendente:{label:'Pendente',color:'#8A5A00',bg:'#FDF3E0'},
    confirmado:{label:'Confirmado',color:'#1A4E8A',bg:'#EAF0FA'},
    entregue:{label:'Entregue',color:'#1A7A5E',bg:'#EAF5F0'},
    cancelado:{label:'Cancelado',color:'#C0392B',bg:'#FBEAEA'},
  }
  const filtered=filterStatus?pedidos.filter(p=>p.status===filterStatus):pedidos
  const pendentes=pedidos.filter(p=>p.status==='pendente').length
  const missingCount=Object.keys(missingVenda).length

  return(
    <AdminPage
      title="Pedidos"
      subtitle="Pedidos dos bars — confirmação e entrega"
      actions={
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          {missingCount>0&&(
            <button onClick={async()=>{
              if(!confirm(`Registrar vendas para ${missingCount} pedido(s) entregue(s)?`)) return
              for(const p of pedidos.filter(x=>missingVenda[x.id])) await repairVenda(p)
            }} style={{padding:'8px 14px',fontSize:11,borderRadius:8,background:'var(--red)',color:'white',border:'none',fontWeight:700,cursor:'pointer'}}>
              Sincronizar vendas faltantes
            </button>
          )}
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{width:'auto'}}>
            <option value="">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="confirmado">Confirmado</option>
            <option value="entregue">Entregue</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
      }
    >
      {(pendentes>0||missingCount>0)&&(
        <div style={{marginBottom:16}}>
          {pendentes>0&&<div style={{fontSize:12,color:'var(--red)',marginTop:2}}>{pendentes} pedido(s) aguardando confirmação</div>}
          {missingCount>0&&<div style={{fontSize:12,color:'var(--red)',marginTop:2,fontWeight:600}}>{missingCount} pedido(s) entregue(s) sem venda registrada</div>}
        </div>
      )}

      {loading
        ? <div style={{color:'var(--text2)',fontSize:13}}>Carregando...</div>
        : filtered.length===0
          ? <div style={{color:'var(--text3)',textAlign:'center',padding:'40px 0'}}>Nenhum pedido</div>
          : filtered.map(p=>{
            const s=STATUS_MAP[p.status]||STATUS_MAP.pendente
            return(
              <PortalSurface key={p.id} style={{marginBottom:12,borderLeft:p.status==='pendente'?'3px solid var(--gold)':'3px solid var(--border)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14}}>{p.bars?.nome} &mdash; {pedidoSaleDate(p)}</div>
                    {p.data_entrega_prevista && p.data_pedido && p.data_entrega_prevista !== p.data_pedido && (
                      <div style={{fontSize:11,color:'var(--text3)'}}>Pedido registrado: {p.data_pedido}</div>
                    )}
                    {p.data_entrega_prevista&&<div style={{fontSize:12,color:'var(--text3)'}}>Entrega: {p.data_entrega_prevista}</div>}
                    {p.obs&&<div style={{fontSize:12,color:'var(--text2)',marginTop:2}}>{p.obs}</div>}
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontWeight:700}}>&yen;{Math.round(p.total_estimado).toLocaleString()}</span>
                    <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20,background:s.bg,color:s.color}}>{s.label}</span>
                  </div>
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:12}}>
                  {(p.pedidos_itens||[]).map(it=>(
                    <PedidoItemChip
                      key={it.id}
                      nome={it.produtos?.nome || '?'}
                      qtd={it.qtd}
                      precoUnitario={it.preco_unitario}
                      custoUnitario={it.produtos?.custo}
                    />
                  ))}
                </div>
                {missingVenda[p.id]&&(
                  <div style={{marginBottom:12,padding:'10px 14px',borderRadius:10,background:'#FBEAEA',border:'1px solid #f5c6c6',fontSize:12,color:'#7f1d1d'}}>
                    ⚠️ Venda não registrada em Vendas / Dashboard.
                    <button onClick={()=>repairVenda(p)} disabled={repairing===p.id}
                      style={{marginLeft:10,padding:'4px 10px',fontSize:11,borderRadius:6,background:'#7f1d1d',color:'white',border:'none',fontWeight:700,cursor:'pointer'}}>
                      {repairing===p.id?'Registrando...':'Registrar venda agora'}
                    </button>
                  </div>
                )}
                <div style={{display:'flex',gap:8}}>
                  {p.status==='pendente'&&<>
                    <button onClick={()=>updateStatus(p.id,'confirmado')} style={{padding:'6px 14px',fontSize:11,borderRadius:8,background:'var(--navy)',color:'var(--gold)',border:'none',fontWeight:600}}>Confirmar</button>
                    <button onClick={()=>updateStatus(p.id,'cancelado')} className="btn-danger" style={{padding:'6px 14px',fontSize:11,borderRadius:8}}>Cancelar</button>
                  </>}
                  <button onClick={async()=>{ if(!confirm('Excluir este pedido?'))return; setPedidos(prev=>prev.filter(x=>x.id!==p.id)); await supabase.from('pedidos_itens').delete().eq('pedido_id',p.id); const {data:v}=await supabase.from('vendas').select('id').eq('obs','Auto: order '+p.id.slice(0,8)).maybeSingle(); if(v){await supabase.from('vendas_itens').delete().eq('venda_id',v.id); await supabase.from('vendas').delete().eq('id',v.id);} await supabase.from('faturas').delete().eq('venda_id',p.id); await supabase.from('pedidos').delete().eq('id',p.id); }} style={{padding:'6px 14px',fontSize:11,borderRadius:8,background:'#7f1d1d',color:'white',border:'none',fontWeight:600,cursor:'pointer'}}>🗑</button>
                  {p.status==='confirmado'&&(
                    <button onClick={()=>openChecklist(p)} style={{padding:'6px 14px',fontSize:11,borderRadius:8,background:'var(--green)',color:'white',border:'none',fontWeight:600}}>&#10003; Marcar entregue</button>
                  )}
                </div>
              </PortalSurface>
            )
          })
      }

      {checklistPedido&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:'var(--bg2)',borderRadius:16,padding:'28px 28px 24px',width:'100%',maxWidth:480,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <div style={{fontSize:16,fontWeight:800,color:'var(--navy)',marginBottom:4}}>Checklist de entrega</div>
            <div style={{fontSize:12,color:'var(--text3)',marginBottom:20}}>{checklistPedido.bars?.nome} &mdash; marque cada item antes de confirmar</div>
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
                  <div style={{fontSize:11,color:'var(--text3)'}}>Qtd: {it.qtd} &times; &yen;{(it.preco_unitario||0).toLocaleString()}</div>
                  <SupplierCostHint
                    produtoId={it.produto_id}
                    produtoNome={it.produtos?.nome}
                    byProductId={supplierByProdId}
                    byProductName={supplierByProdName}
                  />
                </div>
                <div style={{fontWeight:700,fontSize:13}}>&yen;{((it.preco_unitario||0)*it.qtd).toLocaleString()}</div>
              </div>
            ))}
            <div style={{background:'var(--navy)',borderRadius:10,padding:'12px 16px',display:'flex',justifyContent:'space-between',marginTop:12,marginBottom:20}}>
              <span style={{color:'rgba(255,255,255,0.6)',fontSize:13}}>Total</span>
              <span style={{color:'var(--gold)',fontWeight:800,fontSize:15}}>&yen;{Math.round(checklistPedido.total_estimado).toLocaleString()}</span>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>{setChecklistPedido(null);setCheckedItems({})}} style={{flex:1,padding:'11px',borderRadius:10,border:'1px solid var(--border)',background:'transparent',fontSize:13,cursor:'pointer'}}>Cancelar</button>
              <button onClick={confirmDelivery} style={{flex:2,padding:'11px',borderRadius:10,border:'none',
                background:Object.values(checkedItems).every(v=>v)?'var(--green)':'var(--border)',
                color:Object.values(checkedItems).every(v=>v)?'white':'var(--text3)',
                fontSize:13,fontWeight:700,cursor:'pointer'}}>
                {Object.values(checkedItems).filter(v=>v).length}/{Object.values(checkedItems).length} marcados &mdash; Confirmar entrega
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPage>
  )
}
