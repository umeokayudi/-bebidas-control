import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './Auth'
import { fmtYen, fmtDate, Spinner, SectionTitle } from './utils'
import {
  applyDiscount,
  cartTotal,
  checkPosSchema,
  fetchPosSetupStatus,
  generateDiscountCode,
  resolveItemPrice,
  todayKey,
  validateDiscountCode,
} from '../lib/atomicPos'

const SUB_TABS = [
  { id: 'checkout', label: 'Balcão', icon: '🧾' },
  { id: 'vip', label: 'VIP', icon: '⭐' },
  { id: 'prices', label: 'Preços', icon: '💴' },
  { id: 'discounts', label: 'Descontos', icon: '🏷️' },
]

function SetupBanner({ onRefresh }) {
  const [setup, setSetup] = useState(null)
  useEffect(() => { fetchPosSetupStatus().then(setSetup) }, [])
  if (setup?.ready || setup?.tables?.pos_vendas === 'ok') return null
  return (
    <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 12, padding: 16, marginBottom: 20, fontSize: 13 }}>
      <strong>⚙️ Setup POS necessário</strong>
      <p style={{ margin: '8px 0', color: '#92400e' }}>
        Execute <code>ATOMIC_POS_SCHEMA.sql</code> no Supabase SQL Editor ou rode{' '}
        <code>POST /api/fix-atomic-june</code> com <code>action: setupPos</code> e <code>confirm: atomic-pos-2026</code>
      </p>
      <button onClick={onRefresh} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12 }}>Verificar novamente</button>
    </div>
  )
}

// ── CHECKOUT ──────────────────────────────────────────────────────────────────
function PosCheckoutTab({ bar, drinks, shots, discountCodes, vipMembers, onSale }) {
  const { user } = useAuth()
  const [cart, setCart] = useState([])
  const [search, setSearch] = useState('')
  const [priceType, setPriceType] = useState('regular')
  const [codeInput, setCodeInput] = useState('')
  const [activeCode, setActiveCode] = useState(null)
  const [vipId, setVipId] = useState('')
  const [payMethod, setPayMethod] = useState('Cash')
  const [saving, setSaving] = useState(false)

  const catalog = useMemo(() => {
    const menuItems = (drinks || []).map(d => ({
      key: `d-${d.id}`,
      id: d.id,
      kind: 'drink',
      nome: d.nome,
      categoria: d.categoria,
      preco_venda: d.preco_venda,
      preco_desconto: d.preco_desconto,
      custo: d.custo,
    }))
    const shotItems = (shots || []).map(s => ({
      key: `p-${s.produto_id}`,
      id: s.produto_id,
      kind: 'shot',
      nome: s.produtos?.nome || s.nome || 'Shot',
      categoria: s.produtos?.categoria || 'Shot',
      preco_venda: s.preco_drink,
      preco_desconto: Math.round(s.preco_drink * 0.5),
    }))
    return [...menuItems, ...shotItems]
  }, [drinks, shots])

  const filtered = catalog.filter(it => {
    if (!search) return true
    const s = search.toLowerCase()
    return it.nome.toLowerCase().includes(s) || it.categoria.toLowerCase().includes(s)
  })

  function applyCode() {
    const code = discountCodes.find(c => c.codigo.toUpperCase() === codeInput.trim().toUpperCase())
    if (!code) return alert('Código não encontrado')
    const v = validateDiscountCode(code)
    if (!v.ok) return alert(v.error)
    setActiveCode(code)
    setPriceType('codigo')
  }

  function addToCart(item) {
    const pricing = resolveItemPrice(item, priceType === 'codigo' ? 'regular' : priceType, activeCode)
    setCart(prev => {
      const ex = prev.find(x => x.key === item.key && x.tipo_preco === pricing.tipo_preco)
      if (ex) return prev.map(x => x.key === item.key && x.tipo_preco === pricing.tipo_preco ? { ...x, qtd: x.qtd + 1 } : x)
      return [...prev, {
        key: item.key,
        kind: item.kind,
        drink_menu_id: item.kind === 'drink' ? item.id : null,
        produto_id: item.kind === 'shot' ? item.id : null,
        nome: item.nome,
        qtd: 1,
        ...pricing,
      }]
    })
  }

  async function completeSale() {
    if (!cart.length) return
    setSaving(true)
    const subtotal = cart.reduce((a, it) => a + (it.preco_lista || it.preco_unitario) * it.qtd, 0)
    const total = cartTotal(cart)
    const desconto = subtotal - total
    const tipo = priceType === 'vip' || vipId ? 'vip' : activeCode ? 'desconto' : 'balcao'

    const { data: venda, error } = await supabase.from('pos_vendas').insert({
      bar_id: bar.id,
      data: todayKey(),
      subtotal,
      desconto_total: desconto,
      total,
      metodo_pagamento: payMethod,
      tipo,
      vip_member_id: vipId || null,
      discount_code_id: activeCode?.id || null,
      criado_por: user?.id,
    }).select().single()

    if (error) { alert(error.message); setSaving(false); return }

    await supabase.from('pos_vendas_itens').insert(
      cart.map(it => ({
        pos_venda_id: venda.id,
        drink_menu_id: it.drink_menu_id,
        produto_id: it.produto_id,
        nome: it.nome,
        qtd: it.qtd,
        preco_unitario: it.preco_unitario,
        preco_lista: it.preco_lista,
        tipo_preco: it.tipo_preco,
        desconto_valor: it.desconto_valor || 0,
      }))
    )

    if (activeCode) {
      await supabase.from('discount_codes').update({ usos_atual: (activeCode.usos_atual || 0) + 1 }).eq('id', activeCode.id)
      await supabase.from('discount_usages').insert({
        bar_id: bar.id,
        discount_code_id: activeCode.id,
        pos_venda_id: venda.id,
        valor_desconto: desconto,
      })
    }

    if (vipId) {
      for (const it of cart) {
        await supabase.from('vip_usages').insert({
          bar_id: bar.id,
          vip_member_id: vipId,
          drink_menu_id: it.drink_menu_id,
          produto_id: it.produto_id,
          nome: it.nome,
          qtd: it.qtd,
          preco_aplicado: it.preco_unitario,
          preco_lista: it.preco_lista,
          tipo: 'vip',
          pos_venda_id: venda.id,
          criado_por: user?.id,
        })
      }
    }

    setCart([])
    setActiveCode(null)
    setCodeInput('')
    setSaving(false)
    onSale?.()
    alert(`Venda registrada: ${fmtYen(total)}`)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {['regular', 'vip', 'codigo'].map(t => (
            <button key={t} onClick={() => { setPriceType(t); if (t !== 'codigo') setActiveCode(null) }} style={{
              padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: priceType === t ? 'var(--navy)' : 'var(--bg3)',
              color: priceType === t ? '#fff' : 'var(--text2)', border: 'none',
            }}>
              {t === 'regular' ? 'Preço normal' : t === 'vip' ? 'Preço VIP' : 'Código desconto'}
            </button>
          ))}
        </div>

        {priceType === 'codigo' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input placeholder="Código ex: ATOMIC-XXXXXX" value={codeInput} onChange={e => setCodeInput(e.target.value.toUpperCase())} style={{ flex: 1 }} />
            <button className="btn-primary" onClick={applyCode} style={{ padding: '8px 16px' }}>Aplicar</button>
            {activeCode && <span style={{ fontSize: 12, color: 'var(--green)', alignSelf: 'center' }}>✓ {activeCode.codigo}</span>}
          </div>
        )}

        {priceType === 'vip' && (
          <select value={vipId} onChange={e => setVipId(e.target.value)} style={{ width: '100%', marginBottom: 12 }}>
            <option value="">Membro VIP (opcional)</option>
            {(vipMembers || []).filter(v => v.ativo).map(v => (
              <option key={v.id} value={v.id}>{v.nome}{v.codigo ? ` · ${v.codigo}` : ''}</option>
            ))}
          </select>
        )}

        <input placeholder="Buscar drink ou shot..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
          {filtered.map(item => {
            const p = resolveItemPrice(item, priceType === 'codigo' ? 'regular' : priceType, activeCode)
            return (
              <button key={item.key} onClick={() => addToCart(item)} style={{
                textAlign: 'left', padding: 12, borderRadius: 12, border: '1px solid var(--border)',
                background: 'var(--bg2)', cursor: 'pointer',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{item.nome}</div>
                <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>{item.categoria}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', marginTop: 6 }}>{fmtYen(p.preco)}</div>
                {p.preco_lista > p.preco && <div style={{ fontSize: 10, color: 'var(--text3)', textDecoration: 'line-through' }}>{fmtYen(p.preco_lista)}</div>}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 16, position: 'sticky', top: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>Carrinho</div>
        {cart.length === 0 ? <div style={{ color: 'var(--text3)', fontSize: 13 }}>Toque nos itens para adicionar</div> : (
          <>
            {cart.map((it, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{it.nome}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>{it.tipo_preco} × {it.qtd}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => setCart(c => c.map((x, j) => j === i ? { ...x, qtd: Math.max(1, x.qtd - 1) } : x))} style={{ width: 24, height: 24, borderRadius: 6 }}>−</button>
                  <span>{it.qtd}</span>
                  <button onClick={() => setCart(c => c.map((x, j) => j === i ? { ...x, qtd: x.qtd + 1 } : x))} style={{ width: 24, height: 24, borderRadius: 6 }}>+</button>
                  <strong style={{ minWidth: 60, textAlign: 'right' }}>{fmtYen(it.preco_unitario * it.qtd)}</strong>
                  <button onClick={() => setCart(c => c.filter((_, j) => j !== i))} style={{ color: 'var(--red)', border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 12, fontSize: 18, fontWeight: 800, textAlign: 'right' }}>{fmtYen(cartTotal(cart))}</div>
            <select value={payMethod} onChange={e => setPayMethod(e.target.value)} style={{ width: '100%', marginTop: 12 }}>
              {['Cash', 'Credit card', 'Debit card', 'PayPay', 'Transfer'].map(m => <option key={m}>{m}</option>)}
            </select>
            <button className="btn-primary" onClick={completeSale} disabled={saving} style={{ width: '100%', marginTop: 12, padding: 12, borderRadius: 12 }}>
              {saving ? 'Salvando...' : '✓ Registrar venda POS'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── VIP ───────────────────────────────────────────────────────────────────────
function PosVipTab({ bar, drinks, onUpdate }) {
  const { user } = useAuth()
  const [members, setMembers] = useState([])
  const [usages, setUsages] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('register')
  const [memberForm, setMemberForm] = useState({ nome: '', codigo: '', tier: 'standard', notas: '' })
  const [usageForm, setUsageForm] = useState({ vip_member_id: '', drink_menu_id: '', qtd: 1, obs: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [bar])

  async function load() {
    setLoading(true)
    const [mR, uR] = await Promise.all([
      supabase.from('vip_members').select('*').eq('bar_id', bar.id).order('nome'),
      supabase.from('vip_usages').select('*, vip_members(nome)').eq('bar_id', bar.id).order('criado_em', { ascending: false }).limit(40),
    ])
    setMembers(mR.data || [])
    setUsages(uR.data || [])
    setLoading(false)
  }

  async function saveMember() {
    if (!memberForm.nome) return alert('Nome obrigatório')
    setSaving(true)
    await supabase.from('vip_members').insert({ bar_id: bar.id, ...memberForm, codigo: memberForm.codigo || null })
    setMemberForm({ nome: '', codigo: '', tier: 'standard', notas: '' })
    setSaving(false)
    load()
    onUpdate?.()
  }

  async function registerUsage() {
    if (!usageForm.vip_member_id || !usageForm.drink_menu_id) return alert('Selecione membro e drink')
    const drink = drinks.find(d => d.id === usageForm.drink_menu_id)
    if (!drink) return
    setSaving(true)
    const preco = drink.preco_desconto || 500
    await supabase.from('vip_usages').insert({
      bar_id: bar.id,
      vip_member_id: usageForm.vip_member_id,
      drink_menu_id: drink.id,
      nome: drink.nome,
      qtd: +usageForm.qtd || 1,
      preco_aplicado: preco,
      preco_lista: drink.preco_venda,
      tipo: 'vip',
      obs: usageForm.obs,
      criado_por: user?.id,
    })
    setUsageForm({ vip_member_id: '', drink_menu_id: '', qtd: 1, obs: '' })
    setSaving(false)
    load()
  }

  if (loading) return <Spinner text="Carregando VIP..." />

  const monthUsages = usages.filter(u => u.criado_em?.startsWith(new Date().toISOString().slice(0, 7)))
  const monthTotal = monthUsages.reduce((a, u) => a + (+u.preco_aplicado || 0) * (+u.qtd || 1), 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['register', 'Registrar uso'], ['members', 'Membros'], ['history', 'Histórico']].map(([id, label]) => (
          <button key={id} onClick={() => setMode(id)} style={{
            padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
            background: mode === id ? 'var(--navy)' : 'var(--bg3)', color: mode === id ? '#fff' : 'var(--text2)', border: 'none',
          }}>{label}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
        <StatCard label="Membros VIP" value={members.filter(m => m.ativo).length} />
        <StatCard label="Usos este mês" value={monthUsages.length} />
        <StatCard label="Total VIP mês" value={fmtYen(monthTotal)} />
      </div>

      {mode === 'register' && (
        <div className="card" style={{ maxWidth: 480 }}>
          <SectionTitle>Registrar uso VIP</SectionTitle>
          <label className="form-label">Membro</label>
          <select value={usageForm.vip_member_id} onChange={e => setUsageForm({ ...usageForm, vip_member_id: e.target.value })} style={{ width: '100%', marginBottom: 12 }}>
            <option value="">Selecione...</option>
            {members.filter(m => m.ativo).map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
          <label className="form-label">Drink</label>
          <select value={usageForm.drink_menu_id} onChange={e => setUsageForm({ ...usageForm, drink_menu_id: e.target.value })} style={{ width: '100%', marginBottom: 12 }}>
            <option value="">Selecione...</option>
            {drinks.map(d => <option key={d.id} value={d.id}>{d.nome} — VIP {fmtYen(d.preco_desconto || 500)}</option>)}
          </select>
          <label className="form-label">Quantidade</label>
          <input type="number" min="1" value={usageForm.qtd} onChange={e => setUsageForm({ ...usageForm, qtd: e.target.value })} style={{ width: '100%', marginBottom: 12 }} />
          <button className="btn-primary" onClick={registerUsage} disabled={saving} style={{ width: '100%', padding: 12 }}>{saving ? '...' : 'Registrar uso VIP'}</button>
        </div>
      )}

      {mode === 'members' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <SectionTitle>Novo membro</SectionTitle>
            <input placeholder="Nome" value={memberForm.nome} onChange={e => setMemberForm({ ...memberForm, nome: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
            <input placeholder="Código cartão (opcional)" value={memberForm.codigo} onChange={e => setMemberForm({ ...memberForm, codigo: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
            <button className="btn-primary" onClick={saveMember} disabled={saving} style={{ width: '100%', padding: 10 }}>Adicionar membro</button>
          </div>
          <div>
            {members.map(m => (
              <div key={m.id} className="card" style={{ marginBottom: 8, padding: 14 }}>
                <div style={{ fontWeight: 700 }}>{m.nome}</div>
                {m.codigo && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Código: {m.codigo}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === 'history' && (
        <div>
          {usages.map(u => (
            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <div>
                <strong>{u.vip_members?.nome || 'VIP'}</strong> — {u.nome} ×{u.qtd}
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>{fmtDate(u.criado_em?.slice(0, 10))}</div>
              </div>
              <div style={{ fontWeight: 700 }}>{fmtYen((u.preco_aplicado || 0) * (u.qtd || 1))}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── PRICES (menu + shots) ─────────────────────────────────────────────────────
function PosPricesTab({ bar, drinks, onRefresh }) {
  const [priceMode, setPriceMode] = useState('menu')
  const [produtos, setProdutos] = useState([])
  const [pricing, setPricing] = useState({})
  const [form, setForm] = useState({ nome: '', categoria: 'Custom', preco_venda: '', custo: '', preco_desconto: '500' })
  const [shotForm, setShotForm] = useState({ produto_id: '', drinks: '16', preco: '' })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('produtos_public').select('*').eq('ativo', true).order('nome').then(({ data }) => setProdutos(data || []))
    supabase.from('bar_pricing').select('*, produtos(nome,categoria,preco_venda)').eq('bar_id', bar.id).then(({ data }) => {
      const m = {}
      ;(data || []).forEach(p => { m[p.produto_id] = p })
      setPricing(m)
    })
  }, [bar, drinks])

  async function saveDrink() {
    if (!form.nome || !form.preco_venda) return
    setSaving(true)
    const custo = +form.custo || 0
    const payload = {
      bar_id: bar.id,
      nome: form.nome,
      categoria: form.categoria,
      preco_venda: +form.preco_venda,
      custo,
      margem: form.preco_venda > 0 ? (+form.preco_venda - custo) / +form.preco_venda : 0,
      preco_desconto: +form.preco_desconto || 500,
      custom: true,
    }
    if (editId) await supabase.from('drink_menu').update(payload).eq('id', editId)
    else await supabase.from('drink_menu').insert(payload)
    setForm({ nome: '', categoria: 'Custom', preco_venda: '', custo: '', preco_desconto: '500' })
    setEditId(null)
    setSaving(false)
    onRefresh()
  }

  async function saveShot() {
    if (!shotForm.produto_id || !shotForm.preco) return
    setSaving(true)
    await supabase.from('bar_pricing').upsert({
      bar_id: bar.id,
      produto_id: shotForm.produto_id,
      drinks_por_garrafa: +shotForm.drinks || 16,
      preco_drink: +shotForm.preco,
    }, { onConflict: 'bar_id,produto_id' })
    setShotForm({ produto_id: '', drinks: '16', preco: '' })
    setSaving(false)
    onRefresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['menu', 'Drinks / Menu'], ['shots', 'Shots (garrafa)']].map(([id, label]) => (
          <button key={id} onClick={() => setPriceMode(id)} style={{
            padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
            background: priceMode === id ? 'var(--navy)' : 'var(--bg3)', color: priceMode === id ? '#fff' : 'var(--text2)', border: 'none',
          }}>{label}</button>
        ))}
      </div>

      {priceMode === 'menu' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <SectionTitle>{editId ? 'Editar drink' : 'Novo drink'}</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 8 }}>
              <input placeholder="Nome" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
              <input placeholder="Preço ¥" type="number" value={form.preco_venda} onChange={e => setForm({ ...form, preco_venda: e.target.value })} />
              <input placeholder="Custo ¥" type="number" value={form.custo} onChange={e => setForm({ ...form, custo: e.target.value })} />
              <input placeholder="VIP ¥" type="number" value={form.preco_desconto} onChange={e => setForm({ ...form, preco_desconto: e.target.value })} />
              <button className="btn-primary" onClick={saveDrink} disabled={saving}>{editId ? 'Salvar' : 'Adicionar'}</button>
            </div>
          </div>
          <table style={{ width: '100%', fontSize: 13 }}>
            <thead><tr>{['Drink', 'Preço', 'VIP', 'Margem', ''].map(h => <th key={h} style={{ textAlign: 'left', padding: 8 }}>{h}</th>)}</tr></thead>
            <tbody>
              {drinks.map(d => (
                <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 8 }}>{d.nome}</td>
                  <td>{fmtYen(d.preco_venda)}</td>
                  <td style={{ color: 'var(--gold)' }}>{fmtYen(d.preco_desconto || 500)}</td>
                  <td>{Math.round((d.margem || 0) * 100)}%</td>
                  <td><button onClick={() => { setEditId(d.id); setForm({ nome: d.nome, categoria: d.categoria, preco_venda: d.preco_venda, custo: d.custo, preco_desconto: d.preco_desconto || 500 }) }} style={{ fontSize: 11 }}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {priceMode === 'shots' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8 }}>
              <select value={shotForm.produto_id} onChange={e => setShotForm({ ...shotForm, produto_id: e.target.value })}>
                <option value="">Produto JBM...</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <input placeholder="Drinks/garrafa" type="number" value={shotForm.drinks} onChange={e => setShotForm({ ...shotForm, drinks: e.target.value })} />
              <input placeholder="Preço/drink ¥" type="number" value={shotForm.preco} onChange={e => setShotForm({ ...shotForm, preco: e.target.value })} />
              <button className="btn-primary" onClick={saveShot} disabled={saving}>Salvar</button>
            </div>
          </div>
          {Object.values(pricing).map(p => (
            <div key={p.produto_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span>{p.produtos?.nome}</span>
              <span>{p.drinks_por_garrafa} drinks · {fmtYen(p.preco_drink)}/drink</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ── DISCOUNT CODES ────────────────────────────────────────────────────────────
function PosDiscountTab({ bar, drinks, onUpdate }) {
  const [codes, setCodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    codigo: generateDiscountCode(),
    descricao: '',
    tipo: 'percent',
    valor: '10',
    max_usos: '',
    valido_ate: '',
    drink_menu_id: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [bar])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('discount_codes').select('*').eq('bar_id', bar.id).order('criado_em', { ascending: false })
    setCodes(data || [])
    setLoading(false)
  }

  async function saveCode() {
    if (!form.codigo || !form.valor) return
    setSaving(true)
    await supabase.from('discount_codes').insert({
      bar_id: bar.id,
      codigo: form.codigo.toUpperCase(),
      descricao: form.descricao,
      tipo: form.tipo,
      valor: +form.valor,
      max_usos: form.max_usos ? +form.max_usos : null,
      valido_ate: form.valido_ate || null,
      drink_menu_id: form.drink_menu_id || null,
      ativo: true,
    })
    setForm({ ...form, codigo: generateDiscountCode(), descricao: '', valor: '10' })
    setSaving(false)
    load()
    onUpdate?.()
  }

  async function toggleCode(id, ativo) {
    await supabase.from('discount_codes').update({ ativo: !ativo }).eq('id', id)
    load()
  }

  if (loading) return <Spinner />

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div className="card">
        <SectionTitle>Criar código de desconto</SectionTitle>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value.toUpperCase() })} style={{ flex: 1 }} />
          <button onClick={() => setForm({ ...form, codigo: generateDiscountCode() })} style={{ padding: '8px 12px', fontSize: 11 }}>Gerar</button>
        </div>
        <input placeholder="Descrição" value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
            <option value="percent">Percentual (%)</option>
            <option value="fixed">Valor fixo (¥)</option>
          </select>
          <input type="number" placeholder="Valor" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} />
        </div>
        <select value={form.drink_menu_id} onChange={e => setForm({ ...form, drink_menu_id: e.target.value })} style={{ width: '100%', marginBottom: 8 }}>
          <option value="">Todos os drinks</option>
          {drinks.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
        </select>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <input type="number" placeholder="Máx. usos" value={form.max_usos} onChange={e => setForm({ ...form, max_usos: e.target.value })} />
          <input type="date" value={form.valido_ate} onChange={e => setForm({ ...form, valido_ate: e.target.value })} />
        </div>
        <button className="btn-primary" onClick={saveCode} disabled={saving} style={{ width: '100%', padding: 12 }}>Criar código</button>
      </div>
      <div>
        {codes.map(c => (
          <div key={c.id} className="card" style={{ marginBottom: 8, padding: 14, opacity: c.ativo ? 1 : 0.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: 1 }}>{c.codigo}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {c.tipo === 'percent' ? `${c.valor}% off` : fmtYen(c.valor)} · usos {c.usos_atual || 0}{c.max_usos ? `/${c.max_usos}` : ''}
                </div>
              </div>
              <button onClick={() => toggleCode(c.id, c.ativo)} style={{ fontSize: 11 }}>{c.ativo ? 'Desativar' : 'Ativar'}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{value}</div>
    </div>
  )
}

// ── MAIN PANEL ────────────────────────────────────────────────────────────────
export default function AtomicPosPanel({ bar }) {
  const [subTab, setSubTab] = useState('checkout')
  const [ready, setReady] = useState(null)
  const [drinks, setDrinks] = useState([])
  const [shots, setShots] = useState([])
  const [discountCodes, setDiscountCodes] = useState([])
  const [vipMembers, setVipMembers] = useState([])
  const [todaySales, setTodaySales] = useState({ count: 0, total: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => { init() }, [bar])

  async function init() {
    setLoading(true)
    const schema = await checkPosSchema(supabase)
    setReady(schema.ready)

    const [dR, sR, cR, vR, pR] = await Promise.all([
      supabase.from('drink_menu').select('*').eq('bar_id', bar.id).order('nome'),
      supabase.from('bar_pricing').select('*, produtos(nome,categoria,preco_venda)').eq('bar_id', bar.id),
      schema.ready ? supabase.from('discount_codes').select('*').eq('bar_id', bar.id).eq('ativo', true) : { data: [] },
      schema.ready ? supabase.from('vip_members').select('*').eq('bar_id', bar.id).eq('ativo', true) : { data: [] },
      schema.ready ? supabase.from('pos_vendas').select('total').eq('bar_id', bar.id).eq('data', todayKey()) : { data: [] },
    ])
    setDrinks(dR.data || [])
    setShots(sR.data || [])
    setDiscountCodes(cR.data || [])
    setVipMembers(vR.data || [])
    const sales = pR.data || []
    setTodaySales({ count: sales.length, total: sales.reduce((a, s) => a + (+s.total || 0), 0) })
    setLoading(false)
  }

  if (loading) return <Spinner text="Carregando POS..." />

  return (
    <div className="fade-in">
      <SetupBanner onRefresh={init} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>POS Atomic</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
            Balcão, VIP, preços e códigos de desconto
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase' }}>Hoje</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>{fmtYen(todaySales.total)}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>{todaySales.count} vendas</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} style={{
            padding: '10px 18px', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: subTab === t.id ? 'var(--navy)' : 'var(--bg2)',
            color: subTab === t.id ? '#fff' : 'var(--text2)',
            border: subTab === t.id ? 'none' : '1px solid var(--border)',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {!ready && subTab === 'checkout' && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>
          Configure as tabelas POS antes de registrar vendas no balcão.
        </div>
      )}

      {(ready || subTab !== 'checkout') && (
        <>
          {subTab === 'checkout' && ready && (
            <PosCheckoutTab bar={bar} drinks={drinks} shots={shots} discountCodes={discountCodes} vipMembers={vipMembers} onSale={init} />
          )}
          {subTab === 'vip' && <PosVipTab bar={bar} drinks={drinks} onUpdate={init} />}
          {subTab === 'prices' && <PosPricesTab bar={bar} drinks={drinks} onRefresh={init} />}
          {subTab === 'discounts' && <PosDiscountTab bar={bar} drinks={drinks} onUpdate={init} />}
        </>
      )}
    </div>
  )
}
