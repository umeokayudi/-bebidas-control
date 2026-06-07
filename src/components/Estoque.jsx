import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './Auth'
import { fmtYen, fmtDate, Spinner, Empty, SectionTitle, Badge } from './utils'

export default function EstoqueTab() {
  const { user, perfil } = useAuth()
  const [produtos,    setProdutos]    = useState([])
  const [movimentos,  setMovimentos]  = useState([])
  const [bars,        setBars]        = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [filterBar,   setFilterBar]   = useState('')
  const [filterProd,  setFilterProd]  = useState('')

  // Open bottle form
  const [formProdId,  setFormProdId]  = useState('')
  const [formBarId,   setFormBarId]   = useState('')
  const [formQtd,     setFormQtd]     = useState(1)
  const [formObs,     setFormObs]     = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [pR, mR, bR] = await Promise.all([
      supabase.from('produtos').select('*').eq('ativo', true).order('categoria').order('nome'),
      supabase.from('estoque_movimentos').select('*, produtos(nome,categoria,custo,preco_venda), bars(nome), perfis(nome)')
        .order('criado_em', { ascending: false }).limit(100),
      supabase.from('bars').select('*').order('nome'),
    ])
    setProdutos(pR.data || [])
    setMovimentos(mR.data || [])
    setBars(bR.data || [])
    if (bR.data && bR.data.length > 0 && !formBarId) setFormBarId(bR.data[0].id)
    if (pR.data && pR.data.length > 0 && !formProdId) setFormProdId(pR.data[0].id)
    setLoading(false)
  }

  // Calculate current stock per product
  const stockMap = {}
  movimentos.forEach(m => {
    const pid = m.produto_id
    if (!stockMap[pid]) stockMap[pid] = 0
    if (m.tipo === 'entrada') stockMap[pid] += m.qtd
    if (m.tipo === 'saida')   stockMap[pid] -= m.qtd
  })

  // Stock from purchases (compras create "entrada" movements)
  const stockList = produtos.map(p => ({
    ...p,
    estoque: stockMap[p.id] || 0,
    movs: movimentos.filter(m => m.produto_id === p.id)
  }))

  async function openBottle() {
    if (!formProdId || !formBarId || formQtd <= 0) return
    setSaving(true)
    await supabase.from('estoque_movimentos').insert({
      produto_id: formProdId,
      bar_id: formBarId,
      tipo: 'saida',
      qtd: formQtd,
      obs: formObs || 'Bottle opened',
      criado_por: user.id
    })
    // Update produto estoque_atual
    const prod = produtos.find(p => p.id === formProdId)
    if (prod) {
      await supabase.from('produtos').update({
        estoque_atual: Math.max(0, (prod.estoque_atual || 0) - formQtd)
      }).eq('id', formProdId)
    }
    setSaving(false)
    setFormObs('')
    setFormQtd(1)
    setShowForm(false)
    loadAll()
  }

  const filtered = movimentos.filter(m => {
    if (filterBar  && m.bar_id !== filterBar) return false
    if (filterProd && m.produto_id !== filterProd) return false
    return true
  })

  const lowStock = stockList.filter(p => p.estoque > 0 && p.estoque <= 3)
  const outStock  = stockList.filter(p => p.estoque <= 0)

  if (loading) return <Spinner text="Loading inventory..." />

  return (
    <div className="fade-in">

      {/* Alerts */}
      {outStock.length > 0 && (
        <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:12,
          padding:'12px 16px', marginBottom:12, display:'flex', gap:10, alignItems:'center' }}>
          <span style={{ fontSize:18 }}>🚨</span>
          <div>
            <div style={{ fontWeight:700, color:'#b91c1c', fontSize:13 }}>Out of stock</div>
            <div style={{ fontSize:12, color:'#b91c1c' }}>
              {outStock.map(p => p.nome).join(', ')}
            </div>
          </div>
        </div>
      )}
      {lowStock.length > 0 && (
        <div style={{ background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:12,
          padding:'12px 16px', marginBottom:12, display:'flex', gap:10, alignItems:'center' }}>
          <span style={{ fontSize:18 }}>⚠️</span>
          <div>
            <div style={{ fontWeight:700, color:'#92400e', fontSize:13 }}>Low stock</div>
            <div style={{ fontSize:12, color:'#b45309' }}>
              {lowStock.map(p => p.nome + ' (' + p.estoque + ' left)').join(', ')}
            </div>
          </div>
        </div>
      )}

      {/* Open bottle button */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <SectionTitle>Inventory</SectionTitle>
        <button className="btn-primary" onClick={() => setShowForm(x => !x)}
          style={{ padding:'9px 18px', borderRadius:10 }}>
          {showForm ? 'Cancel' : '🍾 Open bottle'}
        </button>
      </div>

      {/* Open bottle form */}
      {showForm && (
        <div className="card" style={{ marginBottom:16, border:'2px solid rgba(193,156,86,0.3)' }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:16 }}>Register opened bottle</div>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <label className="form-label">Product</label>
              <select value={formProdId} onChange={e => setFormProdId(e.target.value)}>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Bar</label>
              <select value={formBarId} onChange={e => setFormBarId(e.target.value)}>
                {bars.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Qty</label>
              <input type="number" min="0.1" step="0.1" value={formQtd}
                onChange={e => setFormQtd(+e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <label className="form-label">Notes (optional)</label>
            <input type="text" value={formObs} onChange={e => setFormObs(e.target.value)}
              placeholder="Ex: opened for Atomic table 5..." />
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            <button className="btn-primary" onClick={openBottle} disabled={saving}>
              {saving ? 'Saving...' : 'Register opening'}
            </button>
          </div>
        </div>
      )}

      {/* Stock levels */}
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>Stock levels</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:8 }}>
          {stockList.filter(p => p.estoque > 0 || p.estoque_atual > 0).map(p => {
            const stock = p.estoque || p.estoque_atual || 0
            const status = stock <= 0 ? 'out' : stock <= 3 ? 'low' : 'ok'
            const colors = { out:'var(--red)', low:'var(--amber)', ok:'var(--green)' }
            return (
              <div key={p.id} style={{
                border:'1px solid var(--border)', borderRadius:10,
                padding:'12px 14px', background:'var(--bg2)'
              }}>
                <div style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>{p.nome}</div>
                <div style={{ fontSize:11, color:'var(--text2)', marginBottom:8 }}>{p.categoria}</div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:18, fontWeight:800, color:colors[status] }}>{stock}</span>
                  <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:20,
                    background:status==='ok'?'#f0fdf4':status==='low'?'#fffbeb':'#fef2f2',
                    color:colors[status]
                  }}>
                    {status === 'ok' ? 'In stock' : status === 'low' ? 'Low' : 'Out'}
                  </span>
                </div>
              </div>
            )
          })}
          {stockList.filter(p => p.estoque > 0 || p.estoque_atual > 0).length === 0 && (
            <div style={{ gridColumn:'1/-1' }}>
              <Empty text="No stock data yet. Stock is added when purchases are registered." />
            </div>
          )}
        </div>
      </div>

      {/* Movement history */}
      <div className="card">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div style={{ fontSize:13, fontWeight:700 }}>Movement history</div>
          <div style={{ display:'flex', gap:8 }}>
            <select value={filterBar} onChange={e => setFilterBar(e.target.value)} style={{ width:'auto', fontSize:12 }}>
              <option value="">All bars</option>
              {bars.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
            <select value={filterProd} onChange={e => setFilterProd(e.target.value)} style={{ width:'auto', fontSize:12 }}>
              <option value="">All products</option>
              {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
        </div>
        {filtered.length === 0 ? <Empty text="No movements yet" /> : (
          <table>
            <thead>
              <tr><th>Date</th><th>Product</th><th>Bar</th><th>Type</th><th>Qty</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.id}>
                  <td style={{ fontSize:12 }}>{fmtDate(m.criado_em?.slice(0,10))}</td>
                  <td style={{ fontWeight:500, fontSize:12 }}>{m.produtos?.nome}</td>
                  <td style={{ fontSize:12, color:'var(--text2)' }}>{m.bars?.nome || '—'}</td>
                  <td>
                    <span style={{
                      fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20,
                      background: m.tipo==='entrada' ? '#f0fdf4' : '#fff7ed',
                      color: m.tipo==='entrada' ? 'var(--green)' : 'var(--amber)'
                    }}>
                      {m.tipo === 'entrada' ? '↑ In' : '↓ Out'}
                    </span>
                  </td>
                  <td style={{ fontWeight:700 }}>{m.qtd}</td>
                  <td style={{ fontSize:12, color:'var(--text2)' }}>{m.obs || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
