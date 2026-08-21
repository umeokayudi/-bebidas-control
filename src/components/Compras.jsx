import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './Auth'
import {
  fmtYen, fmtDate, monthKey, monthLabel,
  MetricCard, Badge, Spinner, Empty, SectionTitle, DelBtn,
  PAGAMENTOS, analyzeReceipt
} from './utils'
import PurchaseCashflowAdvisor from './PurchaseCashflowAdvisor'

export default function ComprasTab() {
  const { user } = useAuth()
  const [compras, setCompras] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [fornecedores, setFornecedores] = useState([])
  const [scanning, setScanning] = useState(false)
  const [imgSrc,   setImgSrc]   = useState(null)
  const [scanned,  setScanned]  = useState(null)
  const [filterMonth, setFilterMonth] = useState('')
  const [form, setForm] = useState(defaultForm())

  function defaultForm() {
    return {
      data: new Date().toISOString().slice(0,10),
      fornecedor: '', pagamento: 'Dinheiro',
      pontos_ganhos: 0, desconto_pontos: 0, tipo_ponto: '', data_pagamento: '', foto_url: '',
      subtotal: 0, total_pago: 0, obs: '',
      itens: []
    }
  }

  useEffect(() => { load(); loadFornecedores() }, [])
  async function loadFornecedores() {
    const { data } = await supabase.from('fornecedores').select('id,nome,pagamento,prazo_entrega_dias,pontos_pct').order('nome')
    setFornecedores(data||[])
  }

  const selectedSupplier = fornecedores.find(f => f.nome === form.fornecedor)
  const purchaseTotal = (+form.total_pago || +form.subtotal || 0) - (+form.desconto_pontos || 0)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('compras')
      .select('*, compras_itens(*)')
      .order('data', { ascending: false })
    setCompras(data || [])
    setLoading(false)
  }

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const months = [...new Set(compras.map(c => monthKey(c.data)))].sort().reverse()
  const filtered = filterMonth ? compras.filter(c => monthKey(c.data) === filterMonth) : compras

  const totalCusto    = filtered.reduce((a,c) => a + (+c.total_real||0), 0)
  const totalDesconto = filtered.reduce((a,c) => a + (+c.desconto_pontos||0), 0)
  const totalPontos   = filtered.reduce((a,c) => a + (+c.pontos_ganhos||0), 0)

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      setImgSrc(ev.target.result)
      setScanning(true); setScanned(null)
      const b64 = ev.target.result.split(',')[1]
      const result = await analyzeReceipt(b64, file.type || 'image/jpeg')
      setScanning(false)
      if (result) {
        setScanned(result)
        setForm(f => ({
          ...f,
          data:            result.data        || f.data,
          fornecedor:      result.fornecedor   || f.fornecedor,
          pagamento:       result.pagamento    || f.pagamento,
          pontos_ganhos:   result.pontos_ganhos   || 0,
          desconto_pontos: result.desconto_pontos  || 0,
          subtotal:        result.subtotal     || 0,
          total_pago:      result.total_pago   || 0,
          itens: (result.itens || []).map(it => ({
            nome: it.nome, qtd: it.qtd || 1, custo_unitario: it.custo_unitario || 0
          }))
        }))
      }
    }
    reader.readAsDataURL(file)
  }

  async function saveCompra() {
    if (!form.fornecedor) return alert('Informe o fornecedor')
    setSaving(true)
    const total_real = (+form.total_pago || +form.subtotal) - (+form.desconto_pontos || 0)
    const { data: compra, error } = await supabase.from('compras').insert({
      data:            form.data,
      fornecedor:      form.fornecedor,
      pagamento:       form.pagamento,
      subtotal:        +form.subtotal,
      desconto_pontos: +form.desconto_pontos,
      total_pago:      +form.total_pago,
      total_real,
      pontos_ganhos:   +form.pontos_ganhos,
      tipo_ponto:      form.tipo_ponto||null,
      data_pagamento:  form.data_pagamento||null,
      foto_url:        form.foto_url||null,
      obs:             form.obs,
      criado_por:      user.id
    }).select().single()

    if (!error && form.itens.length > 0) {
      await supabase.from('compras_itens').insert(
        form.itens.map(it => ({ compra_id: compra.id, ...it }))
      )
      // Atualiza custo dos produtos correspondentes
      for (const it of form.itens) {
        const { data: prods } = await supabase
          .from('produtos')
          .select('id, nome')
          .ilike('nome', `%${it.nome.split(' ')[0]}%`)
        if (prods?.length) {
          await supabase.from('produtos')
            .update({ custo: it.custo_unitario })
            .eq('id', prods[0].id)
        }
      }
    }
    // Auto cashflow entry
    const hoje = form.data_pagamento || form.data
    if (hoje) {
      await supabase.from('caixa_movimentos').insert({
        tipo: 'saida',
        valor: total_real,
        descricao: 'Compra: ' + form.fornecedor,
        metodo: form.pagamento,
        data: hoje
      }).catch(()=>{})
    }
    setSaving(false)
    setForm(defaultForm()); setImgSrc(null); setScanned(null)
    load()
  }

  async function deleteCompra(id) {
    if (!confirm('Remover esta compra?')) return
    await supabase.from('compras').delete().eq('id', id)
    load()
  }

  return (
    <div className="fade-in">
      {/* SCAN */}
      <div className="card">
        <SectionTitle>📷 Scan receipt</SectionTitle>
        <div
          onClick={() => document.getElementById('fileCompra').click()}
          style={{
            border: '1.5px dashed var(--border2)', borderRadius: 12,
            padding: '24px 16px', textAlign: 'center', cursor: 'pointer',
            transition: 'background 0.15s'
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {imgSrc
            ? <img src={imgSrc} alt="nota" style={{ maxHeight: 160, maxWidth: '100%', borderRadius: 8 }} />
            : <>
                <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Tap to select receipt photo</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                  AI extracts supplier, items, payment and points automatically
                </div>
              </>
          }
          <input type="file" id="fileCompra" accept="image/*,.pdf,application/pdf" style={{ display: 'none' }} onChange={handleFile} />
        </div>
        {scanning && <div style={{ marginTop: 12 }}><Spinner text="Analisando com IA..." /></div>}
        {scanned && (
          <div style={{
            marginTop: 12, background: 'var(--bg3)', borderRadius: 8,
            padding: '10px 14px', fontSize: 13
          }}>
            ✅ <strong>{scanned.fornecedor}</strong>
            {' · '}{scanned.itens?.length || 0} itens
            {' · '}{fmtYen(scanned.total_pago || 0)} pago
            {scanned.desconto_pontos > 0 && ` · desconto pontos: ${fmtYen(scanned.desconto_pontos)}`}
          </div>
        )}
      </div>

      {/* FORM */}
      <div className="card">
        <SectionTitle>Register purchase</SectionTitle>
        <div className="grid3" style={{ marginBottom: 12 }}>
          <div><label className="form-label">Data</label>
            <input type="date" value={form.data} onChange={e=>setF('data',e.target.value)} /></div>
          <div><label className="form-label">Supplier</label>
            <select value={form.fornecedor} onChange={e=>setF('fornecedor',e.target.value)}>
              <option value="">— Select supplier —</option>
              {fornecedores.map(f=><option key={f.id} value={f.nome}>{f.nome}</option>)}
            </select></div>
          <div><label className="form-label">Pagamento</label>
            <select value={form.pagamento} onChange={e=>setF('pagamento',e.target.value)}>
              {PAGAMENTOS.map(p => <option key={p}>{p}</option>)}
            </select></div>
        </div>
        <div className="grid4" style={{ marginBottom: 12 }}>
          <div><label className="form-label">Subtotal (¥)</label>
            <input type="number" value={form.subtotal} onChange={e=>setF('subtotal',e.target.value)} /></div>
          <div><label className="form-label">Desconto pontos (¥)</label>
            <input type="number" value={form.desconto_pontos} onChange={e=>setF('desconto_pontos',e.target.value)} /></div>
          <div><label className="form-label">Total pago (¥)</label>
            <input type="number" value={form.total_pago} onChange={e=>setF('total_pago',e.target.value)} /></div>
          <div><label className="form-label">Pontos ganhos</label>
            <input type="number" value={form.pontos_ganhos} onChange={e=>setF('pontos_ganhos',e.target.value)} /></div>
          <div><label className="form-label">Tipo de ponto</label>
            <select value={form.tipo_ponto} onChange={e=>setF('tipo_ponto',e.target.value)}>
              <option value="">Nenhum</option>
              <option value="T-Point">T-Point</option>
              <option value="Rakuten">Rakuten</option>
              <option value="Waon">Waon</option>
              <option value="Nanaco">Nanaco</option>
              <option value="PayPay">PayPay</option>
              <option value="Outro">Outro</option>
            </select></div>
          <div><label className="form-label">Data de pagamento</label>
            <input type="date" value={form.data_pagamento} onChange={e=>setF('data_pagamento',e.target.value)} /></div>
        </div>
        <div style={{marginBottom:12}}>
          <label className="form-label">Foto do recibo</label>
          <input type="file" accept="image/*,.pdf,application/pdf" onChange={async e=>{
            const file = e.target.files[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = ev => setF('foto_url', ev.target.result)
            reader.readAsDataURL(file)
          }} />
          {form.foto_url && <img src={form.foto_url} style={{marginTop:8,maxWidth:200,borderRadius:8}} alt="recibo"/>}
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="form-label">Observação</label>
          <input type="text" value={form.obs} onChange={e=>setF('obs',e.target.value)} placeholder="Optional" />
        </div>

        {/* Itens */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 8 }}>
            <label className="form-label" style={{ margin:0 }}>Itens da nota</label>
            <button style={{ padding:'4px 10px', fontSize:11 }}
              onClick={() => setF('itens', [...form.itens, { nome:'', qtd:1, custo_unitario:0 }])}>
              + Item
            </button>
          </div>
          {form.itens.map((it, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'2fr 80px 120px 36px', gap:6, marginBottom:6 }}>
              <input type="text" value={it.nome} placeholder="Produto" onChange={e=>{
                const a=[...form.itens]; a[i]={...a[i],nome:e.target.value}; setF('itens',a)
              }}/>
              <input type="number" value={it.qtd} placeholder="Qtd" onChange={e=>{
                const a=[...form.itens]; a[i]={...a[i],qtd:+e.target.value}; setF('itens',a)
              }}/>
              <input type="number" value={it.custo_unitario} placeholder="Custo unit." onChange={e=>{
                const a=[...form.itens]; a[i]={...a[i],custo_unitario:+e.target.value}; setF('itens',a)
              }}/>
              <button onClick={()=>setF('itens',form.itens.filter((_,j)=>j!==i))}
                style={{ padding:0, fontSize:14 }}>✕</button>
            </div>
          ))}
        </div>

        <PurchaseCashflowAdvisor
          purchaseAmount={purchaseTotal}
          supplierName={form.fornecedor}
          supplierPayment={selectedSupplier?.pagamento || form.pagamento}
          deliveryDays={selectedSupplier?.prazo_entrega_dias || 1}
          pointsPct={selectedSupplier?.pontos_pct || 0}
          productName={form.itens?.[0]?.nome || ''}
          qtd={form.itens?.reduce((a, it) => a + (+it.qtd || 0), 0) || 1}
        />

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:16 }}>
          <div style={{ fontSize:14 }}>
            Real cost: <strong style={{ color:'var(--blue)' }}>
              {fmtYen(purchaseTotal)}
            </strong>
          </div>
          <button className="btn-primary" onClick={saveCompra} disabled={saving}>
            {saving ? <><span className="spinner" />Saving...</> : 'Save purchase'}
          </button>
        </div>
      </div>

      {/* HISTÓRICO */}
      <div className="card">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <SectionTitle style={{ margin:0 }}>Purchase history</SectionTitle>
          <select value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} style={{ width:'auto' }}>
            <option value="">All months</option>
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>

        <div className="grid4" style={{ marginBottom:16 }}>
          <MetricCard label="Custo total" value={fmtYen(totalCusto)} color="var(--red)" />
          <MetricCard label="Desc. pontos" value={fmtYen(totalDesconto)} color="var(--green)" />
          <MetricCard label="Custo real" value={fmtYen(totalCusto)} color="var(--blue)" />
          <MetricCard label="Pts acumulados" value={totalPontos.toLocaleString()} />
        </div>

        {loading ? <Spinner /> : filtered.length === 0 ? <Empty text="No purchases registrada" /> : (
          <table>
            <thead>
              <tr>
                <th>Data</th><th>Supplier</th><th>Pagamento</th>
                <th>Subtotal</th><th>Desc. Pontos</th><th>Custo Real</th>
                <th>Pts</th><th>Itens</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td style={{ whiteSpace:'nowrap' }}>{fmtDate(c.data)}</td>
                  <td style={{ fontWeight:500 }}>{c.fornecedor}</td>
                  <td><Badge color="var(--blue)">{c.pagamento}</Badge></td>
                  <td>{fmtYen(c.subtotal)}</td>
                  <td style={{ color:'var(--green)' }}>
                    {+c.desconto_pontos > 0 ? `-${fmtYen(c.desconto_pontos)}` : '—'}
                  </td>
                  <td style={{ fontWeight:700 }}>{fmtYen(c.total_real)}</td>
                  <td>{+c.pontos_ganhos > 0 ? `+${c.pontos_ganhos}${c.tipo_ponto?' ('+c.tipo_ponto+')':''}` : '—'}</td>
                  <td>{c.data_pagamento ? fmtDate(c.data_pagamento) : '—'}</td>
                  <td>{c.foto_url ? <a href={c.foto_url} target="_blank" style={{fontSize:11}}>📷</a> : '—'}</td>
                  <td>{(c.compras_itens || []).length}</td>
                  <td><DelBtn onClick={() => deleteCompra(c.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
