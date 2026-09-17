import { useState, useEffect, useMemo } from 'react'
import { supabase as defaultSupabase } from '../lib/supabase'
import { useAuth } from './Auth'
import { fmtYen, fmtDate, Spinner, SectionTitle } from './utils'
import {
  cartTotal,
  checkPosSchema,
  generateDiscountCode,
  resolveItemPrice,
  todayKey,
  validateDiscountCode,
} from '../lib/atomicPos'
import {
  aggregateHourly,
  completePosSale,
  POS_FORBIDDEN_TABLES,
  stockMovementsFromCart,
} from '../lib/posEngine'
import { useI18n } from '../lib/i18n'
import PosHourlyTab from './pos/PosHourlyTab'
import PosDrinkBackTab from './pos/PosDrinkBackTab'

const SUB_TAB_IDS = [
  { id: 'checkout', key: 'tabCheckout', icon: '🧾' },
  { id: 'hourly', key: 'tabHourly', icon: '🕒' },
  { id: 'drinkback', key: 'tabDrinkBack', icon: '🥂' },
  { id: 'vip', key: 'tabVip', icon: '⭐' },
  { id: 'prices', key: 'tabPrices', icon: '💴' },
  { id: 'discounts', key: 'tabDiscounts', icon: '🏷️' },
]

async function q(builder) {
  try {
    const { data, error } = await builder
    if (error) return []
    return data || []
  } catch {
    return []
  }
}

function SetupBanner({ ready, demo }) {
  const { t } = useI18n()
  if (ready || demo) return null
  return (
    <div className="pos-setup-banner">
      <strong>{t('atomicPos.setupRequired')}</strong>
      <p>{t('atomicPos.setupHint')}</p>
    </div>
  )
}

function PosCheckoutTab({
  bar, drinks, shots, discountCodes, vipMembers, drinkBackAgents, openTabs,
  onSale, db, completeSale, demo,
}) {
  const { t } = useI18n()
  const auth = useAuth()
  const user = auth?.user
  const [cart, setCart] = useState([])
  const [search, setSearch] = useState('')
  const [priceType, setPriceType] = useState('regular')
  const [codeInput, setCodeInput] = useState('')
  const [activeCode, setActiveCode] = useState(null)
  const [vipId, setVipId] = useState('')
  const [agentId, setAgentId] = useState('')
  const [mesa, setMesa] = useState('')
  const [payMethod, setPayMethod] = useState('Cash')
  const [saving, setSaving] = useState(false)
  const [cat, setCat] = useState('')
  const [flash, setFlash] = useState('')

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
      preco_desconto: Math.round((s.preco_drink || 0) * 0.5),
      drinks_por_garrafa: s.drinks_por_garrafa,
    }))
    return [...menuItems, ...shotItems]
  }, [drinks, shots])

  const cats = [...new Set(catalog.map(it => it.categoria).filter(Boolean))]
  const filtered = catalog.filter(it => {
    if (cat && it.categoria !== cat) return false
    if (!search) return true
    const s = search.toLowerCase()
    return it.nome.toLowerCase().includes(s) || (it.categoria || '').toLowerCase().includes(s)
  })

  function applyCode() {
    const code = discountCodes.find(c => c.codigo.toUpperCase() === codeInput.trim().toUpperCase())
    if (!code) return alert(t('atomicPos.codeNotFound'))
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
        drinks_por_garrafa: item.drinks_por_garrafa,
        nome: item.nome,
        qtd: 1,
        ...pricing,
      }]
    })
  }

  async function submit(status) {
    if (!cart.length) return
    if (status === 'aberta' && !mesa.trim()) return alert(t('atomicPos.tablePlaceholder'))
    setSaving(true)
    setFlash('')
    try {
      const agent = drinkBackAgents.find(a => a.id === agentId) || null
      const barPricing = {}
      for (const s of shots || []) {
        barPricing[s.produto_id] = { drinks_por_garrafa: s.drinks_por_garrafa, preco_drink: s.preco_drink }
      }
      const input = {
        barId: bar.id,
        cart,
        payMethod,
        status,
        mesa: mesa.trim() || null,
        vipId: vipId || null,
        discountCodeId: activeCode?.id || null,
        discountCode: activeCode,
        drinkBackAgent: agent,
        drinkBackAgentId: agent?.id || null,
        tipo: status === 'aberta' ? 'conta' : (priceType === 'vip' || vipId ? 'vip' : activeCode ? 'desconto' : 'balcao'),
        userId: user?.id,
        barPricing,
      }
      const runner = completeSale || ((payload) => completePosSale(db, payload))
      const result = await runner(input)
      if (result?.reorderAlerts?.length && !demo) {
        for (const alert of result.reorderAlerts) {
          fetch('/api/pos?action=reorderWebhook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...alert, bar_id: bar.id, bar_nome: bar.nome }),
          }).catch(() => {})
        }
      }
      setCart([])
      setActiveCode(null)
      setCodeInput('')
      setMesa('')
      setFlash(status === 'aberta'
        ? t('atomicPos.tabHeld', { name: mesa.trim() })
        : t('atomicPos.saleRegistered', { amount: fmtYen(cartTotal(cart)) }))
      onSale?.()
    } catch (e) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function closeExistingTab(tab) {
    if (!confirm(t('atomicPos.closeTab'))) return
    const items = await q(db.from('pos_vendas_itens').select('*').eq('pos_venda_id', tab.id))
    await db.from('pos_vendas').update({
      status: 'fechada',
      metodo_pagamento: payMethod,
    }).eq('id', tab.id)
    const barPricing = Object.fromEntries((shots || []).map(s => [s.produto_id, s]))
    const moves = stockMovementsFromCart(
      items.map(it => ({
        ...it,
        drinks_por_garrafa: (shots || []).find(s => s.produto_id === it.produto_id)?.drinks_por_garrafa,
      })),
      barPricing,
      { barId: bar.id, userId: user?.id, posVendaId: tab.id }
    )
    if (moves.length) {
      await db.from('estoque_movimentos').insert(moves.map(({ nome, ...row }) => row))
    }
    onSale?.()
  }

  return (
    <div className="pos-checkout">
      {flash && <div className="pos-flash">{flash} · {t('atomicPos.stockDeducted')}</div>}
      <div className="pos-checkout-grid">
        <div>
          <div className="pos-price-toggle">
            {['regular', 'vip', 'codigo'].map(pt => (
              <button key={pt} type="button" onClick={() => { setPriceType(pt); if (pt !== 'codigo') setActiveCode(null) }} className={priceType === pt ? 'active' : ''}>
                {pt === 'regular' ? t('atomicPos.regularPrice') : pt === 'vip' ? t('atomicPos.vipPrice') : t('atomicPos.discountCode')}
              </button>
            ))}
          </div>

          {priceType === 'codigo' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input placeholder={t('atomicPos.codePlaceholder')} value={codeInput} onChange={e => setCodeInput(e.target.value.toUpperCase())} style={{ flex: 1 }} />
              <button className="btn-primary" type="button" onClick={applyCode} style={{ padding: '8px 16px' }}>{t('atomicPos.apply')}</button>
              {activeCode && <span style={{ fontSize: 12, color: 'var(--green)', alignSelf: 'center' }}>✓ {activeCode.codigo}</span>}
            </div>
          )}

          {priceType === 'vip' && (
            <select value={vipId} onChange={e => setVipId(e.target.value)} style={{ width: '100%', marginBottom: 12 }}>
              <option value="">{t('atomicPos.vipMemberOptional')}</option>
              {(vipMembers || []).filter(v => v.ativo !== false).map(v => (
                <option key={v.id} value={v.id}>{v.nome}{v.codigo ? ` · ${v.codigo}` : ''}</option>
              ))}
            </select>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button type="button" className={!cat ? 'pos-cat active' : 'pos-cat'} onClick={() => setCat('')}>{t('common.all')}</button>
            {cats.map(c => (
              <button type="button" key={c} className={cat === c ? 'pos-cat active' : 'pos-cat'} onClick={() => setCat(c)}>{c}</button>
            ))}
          </div>

          <input placeholder={t('atomicPos.searchDrinks')} value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />

          {filtered.length === 0 && <div style={{ color: 'var(--text3)', padding: 24, textAlign: 'center' }}>{t('atomicPos.emptyMenu')}</div>}

          <div className="pos-product-grid">
            {filtered.map(item => {
              const p = resolveItemPrice(item, priceType === 'codigo' ? 'regular' : priceType, activeCode)
              return (
                <button key={item.key} type="button" onClick={() => addToCart(item)} className="pos-product">
                  <div className="pos-product-name">{item.nome}</div>
                  <div className="pos-product-cat">{item.categoria}</div>
                  <div className="pos-product-price">{fmtYen(p.preco_unitario)}</div>
                  {p.preco_lista > p.preco_unitario && <div className="pos-product-list">{fmtYen(p.preco_lista)}</div>}
                </button>
              )
            })}
          </div>
        </div>

        <aside className="pos-cart">
          <div className="pos-cart-title">{t('atomicPos.cart')}</div>
          {cart.length === 0 ? <div style={{ color: 'var(--text3)', fontSize: 13 }}>{t('atomicPos.tapToAdd')}</div> : (
            <>
              {cart.map((it, i) => (
                <div key={i} className="pos-cart-row">
                  <div>
                    <div style={{ fontWeight: 600 }}>{it.nome}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>{it.tipo_preco} × {it.qtd}</div>
                  </div>
                  <div className="pos-cart-qty">
                    <button type="button" onClick={() => setCart(c => c.map((x, j) => j === i ? { ...x, qtd: Math.max(1, x.qtd - 1) } : x))}>−</button>
                    <span>{it.qtd}</span>
                    <button type="button" onClick={() => setCart(c => c.map((x, j) => j === i ? { ...x, qtd: x.qtd + 1 } : x))}>+</button>
                    <strong>{fmtYen((it.preco_unitario || 0) * it.qtd)}</strong>
                    <button type="button" className="pos-cart-x" onClick={() => setCart(c => c.filter((_, j) => j !== i))}>✕</button>
                  </div>
                </div>
              ))}
              <div className="pos-cart-total">{fmtYen(cartTotal(cart))}</div>
              <input placeholder={t('atomicPos.tablePlaceholder')} value={mesa} onChange={e => setMesa(e.target.value)} style={{ width: '100%', marginTop: 12 }} />
              <select value={agentId} onChange={e => setAgentId(e.target.value)} style={{ width: '100%', marginTop: 8 }}>
                <option value="">{t('atomicPos.noDrinkBack')}</option>
                {(drinkBackAgents || []).filter(a => a.ativo !== false).map(a => (
                  <option key={a.id} value={a.id}>{a.nome} · {a.comissao_pct || 0}%</option>
                ))}
              </select>
              <select value={payMethod} onChange={e => setPayMethod(e.target.value)} style={{ width: '100%', marginTop: 8 }}>
                {['Cash', 'Credit card', 'Debit card', 'PayPay', 'Transfer'].map(m => <option key={m}>{m}</option>)}
              </select>
              <button className="btn-primary" type="button" onClick={() => submit('fechada')} disabled={saving} style={{ width: '100%', marginTop: 12, padding: 12, borderRadius: 12 }}>
                {saving ? t('common.saving') : t('atomicPos.payAndClose', { amount: fmtYen(cartTotal(cart)) })}
              </button>
              <button type="button" onClick={() => submit('aberta')} disabled={saving} style={{ width: '100%', marginTop: 8, padding: 10, borderRadius: 12 }}>
                {t('atomicPos.holdTab')}
              </button>
            </>
          )}

          {openTabs?.length > 0 && (
            <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>{t('atomicPos.tabOpenTabs')}</div>
              {openTabs.map(tab => (
                <div key={tab.id} className="pos-open-tab">
                  <div>
                    <strong>{tab.mesa || tab.cliente_nome || 'Tab'}</strong>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>{fmtYen(tab.total)}</div>
                  </div>
                  <button type="button" className="btn-gold" onClick={() => closeExistingTab(tab)}>{t('atomicPos.charge')}</button>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function PosVipTab({ bar, drinks, onUpdate, db }) {
  const auth = useAuth()
  const user = auth?.user
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
      q(db.from('vip_members').select('*').eq('bar_id', bar.id).order('nome')),
      q(db.from('vip_usages').select('*, vip_members(nome)').eq('bar_id', bar.id).order('criado_em', { ascending: false }).limit(40)),
    ])
    setMembers(mR)
    setUsages(uR)
    setLoading(false)
  }

  async function saveMember() {
    if (!memberForm.nome) return alert('Nome obrigatório')
    setSaving(true)
    await db.from('vip_members').insert({ bar_id: bar.id, ...memberForm, codigo: memberForm.codigo || null })
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
    await db.from('vip_usages').insert({
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

  const monthUsages = usages.filter(u => String(u.criado_em || '').startsWith(new Date().toISOString().slice(0, 7)))
  const monthTotal = monthUsages.reduce((a, u) => a + (+u.preco_aplicado || 0) * (+u.qtd || 1), 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['register', 'Registrar uso'], ['members', 'Membros'], ['history', 'Histórico']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setMode(id)} style={{
            padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
            background: mode === id ? 'var(--navy)' : 'var(--bg3)', color: mode === id ? '#fff' : 'var(--text2)', border: 'none',
          }}>{label}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
        <StatCard label="Membros VIP" value={members.filter(m => m.ativo !== false).length} />
        <StatCard label="Usos este mês" value={monthUsages.length} />
        <StatCard label="Total VIP mês" value={fmtYen(monthTotal)} />
      </div>
      {mode === 'register' && (
        <div className="card" style={{ maxWidth: 480 }}>
          <SectionTitle>Registrar uso VIP</SectionTitle>
          <label className="form-label">Membro</label>
          <select value={usageForm.vip_member_id} onChange={e => setUsageForm({ ...usageForm, vip_member_id: e.target.value })} style={{ width: '100%', marginBottom: 12 }}>
            <option value="">Selecione...</option>
            {members.filter(m => m.ativo !== false).map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
          <label className="form-label">Drink</label>
          <select value={usageForm.drink_menu_id} onChange={e => setUsageForm({ ...usageForm, drink_menu_id: e.target.value })} style={{ width: '100%', marginBottom: 12 }}>
            <option value="">Selecione...</option>
            {drinks.map(d => <option key={d.id} value={d.id}>{d.nome} — VIP {fmtYen(d.preco_desconto || 500)}</option>)}
          </select>
          <label className="form-label">Quantidade</label>
          <input type="number" min="1" value={usageForm.qtd} onChange={e => setUsageForm({ ...usageForm, qtd: e.target.value })} style={{ width: '100%', marginBottom: 12 }} />
          <button className="btn-primary" type="button" onClick={registerUsage} disabled={saving} style={{ width: '100%', padding: 12 }}>{saving ? '...' : 'Registrar uso VIP'}</button>
        </div>
      )}
      {mode === 'members' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="pos-split">
          <div className="card">
            <SectionTitle>Novo membro</SectionTitle>
            <input placeholder="Nome" value={memberForm.nome} onChange={e => setMemberForm({ ...memberForm, nome: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
            <input placeholder="Código cartão (opcional)" value={memberForm.codigo} onChange={e => setMemberForm({ ...memberForm, codigo: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
            <button className="btn-primary" type="button" onClick={saveMember} disabled={saving} style={{ width: '100%', padding: 10 }}>Adicionar membro</button>
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
      {mode === 'history' && usages.map(u => (
        <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
          <div>
            <strong>{u.vip_members?.nome || 'VIP'}</strong> — {u.nome} ×{u.qtd}
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>{fmtDate(String(u.criado_em || '').slice(0, 10))}</div>
          </div>
          <div style={{ fontWeight: 700 }}>{fmtYen((u.preco_aplicado || 0) * (u.qtd || 1))}</div>
        </div>
      ))}
    </div>
  )
}

function PosPricesTab({ bar, drinks, onRefresh, db }) {
  const [priceMode, setPriceMode] = useState('menu')
  const [produtos, setProdutos] = useState([])
  const [pricing, setPricing] = useState({})
  const [form, setForm] = useState({ nome: '', categoria: 'Custom', preco_venda: '', custo: '', preco_desconto: '500' })
  const [shotForm, setShotForm] = useState({ produto_id: '', drinks: '16', preco: '' })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    q(db.from('produtos_public').select('*').eq('ativo', true).order('nome')).then(setProdutos)
    q(db.from('bar_pricing').select('*, produtos(nome,categoria,preco_venda)').eq('bar_id', bar.id)).then(data => {
      const m = {}
      data.forEach(p => { m[p.produto_id] = p })
      setPricing(m)
    })
  }, [bar, drinks, db])

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
    if (editId) await db.from('drink_menu').update(payload).eq('id', editId)
    else await db.from('drink_menu').insert(payload)
    setForm({ nome: '', categoria: 'Custom', preco_venda: '', custo: '', preco_desconto: '500' })
    setEditId(null)
    setSaving(false)
    onRefresh()
  }

  async function saveShot() {
    if (!shotForm.produto_id || !shotForm.preco) return
    setSaving(true)
    await db.from('bar_pricing').insert({
      bar_id: bar.id,
      produto_id: shotForm.produto_id,
      drinks_por_garrafa: +shotForm.drinks || 16,
      preco_drink: +shotForm.preco,
    })
    setShotForm({ produto_id: '', drinks: '16', preco: '' })
    setSaving(false)
    onRefresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['menu', 'Drinks / Menu'], ['shots', 'Shots (garrafa)']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setPriceMode(id)} style={{
            padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
            background: priceMode === id ? 'var(--navy)' : 'var(--bg3)', color: priceMode === id ? '#fff' : 'var(--text2)', border: 'none',
          }}>{label}</button>
        ))}
      </div>
      {priceMode === 'menu' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <SectionTitle>{editId ? 'Editar drink' : 'Novo drink'}</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 8 }} className="pos-price-form">
              <input placeholder="Nome" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
              <input placeholder="Preço ¥" type="number" value={form.preco_venda} onChange={e => setForm({ ...form, preco_venda: e.target.value })} />
              <input placeholder="Custo ¥" type="number" value={form.custo} onChange={e => setForm({ ...form, custo: e.target.value })} />
              <input placeholder="VIP ¥" type="number" value={form.preco_desconto} onChange={e => setForm({ ...form, preco_desconto: e.target.value })} />
              <button className="btn-primary" type="button" onClick={saveDrink} disabled={saving}>{editId ? 'Salvar' : 'Adicionar'}</button>
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
                  <td><button type="button" onClick={() => { setEditId(d.id); setForm({ nome: d.nome, categoria: d.categoria, preco_venda: d.preco_venda, custo: d.custo, preco_desconto: d.preco_desconto || 500 }) }} style={{ fontSize: 11 }}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {priceMode === 'shots' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8 }} className="pos-price-form">
              <select value={shotForm.produto_id} onChange={e => setShotForm({ ...shotForm, produto_id: e.target.value })}>
                <option value="">Produto JBM...</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <input placeholder="Drinks/garrafa" type="number" value={shotForm.drinks} onChange={e => setShotForm({ ...shotForm, drinks: e.target.value })} />
              <input placeholder="Preço/drink ¥" type="number" value={shotForm.preco} onChange={e => setShotForm({ ...shotForm, preco: e.target.value })} />
              <button className="btn-primary" type="button" onClick={saveShot} disabled={saving}>Salvar</button>
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

function PosDiscountTab({ bar, drinks, onUpdate, db }) {
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
    setCodes(await q(db.from('discount_codes').select('*').eq('bar_id', bar.id).order('criado_em', { ascending: false })))
    setLoading(false)
  }

  async function saveCode() {
    if (!form.codigo || !form.valor) return
    setSaving(true)
    await db.from('discount_codes').insert({
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
    await db.from('discount_codes').update({ ativo: !ativo }).eq('id', id)
    load()
  }

  if (loading) return <Spinner />

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="pos-split">
      <div className="card">
        <SectionTitle>Criar código de desconto</SectionTitle>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value.toUpperCase() })} style={{ flex: 1 }} />
          <button type="button" onClick={() => setForm({ ...form, codigo: generateDiscountCode() })} style={{ padding: '8px 12px', fontSize: 11 }}>Gerar</button>
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
        <button className="btn-primary" type="button" onClick={saveCode} disabled={saving} style={{ width: '100%', padding: 12 }}>Criar código</button>
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
              <button type="button" onClick={() => toggleCode(c.id, c.ativo)} style={{ fontSize: 11 }}>{c.ativo ? 'Desativar' : 'Ativar'}</button>
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

function ReorderAlerts({ bar, alerts, db, demo, onUpdate, userId }) {
  const { t } = useI18n()
  const open = (alerts || []).filter(a => a.status === 'aberto' || !a.status)
  if (!open.length) return null

  async function sendJbm(row) {
    const { data: pedido, error } = await db.from('pedidos').insert({
      bar_id: bar.id,
      criado_por: userId || null,
      status: 'pendente',
      data_pedido: todayKey(),
      obs: `POS restock: ${row.nome}`,
      total_estimado: 0,
    }).select().single()
    if (error) { window.alert(error.message); return }
    if (row.produto_id && pedido?.id) {
      await db.from('pedidos_itens').insert({
        pedido_id: pedido.id,
        produto_id: row.produto_id,
        qtd: row.suggested_qty,
        preco_unitario: 0,
      })
    }
    if (row.id) await db.from('pos_reorder_alerts').update({ status: 'pedido_enviado', pedido_id: pedido?.id }).eq('id', row.id)
    onUpdate?.()
    window.alert(t('atomicPos.jbmOrderSent'))
  }

  async function ignore(row) {
    if (row.id) await db.from('pos_reorder_alerts').update({ status: 'ignorado' }).eq('id', row.id)
    onUpdate?.()
  }

  return (
    <div className="pos-reorder">
      <div>
        <div style={{ fontWeight: 800 }}>{t('atomicPos.reorderTitle')}</div>
        <div style={{ fontSize: 12, opacity: 0.9 }}>{t('atomicPos.reorderSub')}</div>
        <div style={{ fontSize: 13, marginTop: 8 }}>{open.map(a => `${a.nome} → ${a.suggested_qty}`).join(' · ')}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!demo && open[0] && <button type="button" className="btn-gold" onClick={() => sendJbm(open[0])}>{t('atomicPos.sendJbmOrder')}</button>}
        {open[0] && <button type="button" onClick={() => ignore(open[0])}>{t('atomicPos.ignoreAlert')}</button>}
      </div>
    </div>
  )
}

export default function AtomicPosPanel({ bar, db: dbProp, demo = false, completeSale }) {
  const { t, lang } = useI18n()
  const auth = useAuth()
  const db = dbProp || defaultSupabase
  const [subTab, setSubTab] = useState('checkout')
  const [ready, setReady] = useState(demo)
  const [drinks, setDrinks] = useState([])
  const [shots, setShots] = useState([])
  const [discountCodes, setDiscountCodes] = useState([])
  const [vipMembers, setVipMembers] = useState([])
  const [drinkBackAgents, setDrinkBackAgents] = useState([])
  const [drinkBackUsages, setDrinkBackUsages] = useState([])
  const [openTabs, setOpenTabs] = useState([])
  const [sales, setSales] = useState([])
  const [reorderAlerts, setReorderAlerts] = useState([])
  const [todaySales, setTodaySales] = useState({ count: 0, total: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => { init() }, [bar])

  async function init() {
    setLoading(true)
    const schema = demo ? { ready: true } : await checkPosSchema(db)
    setReady(schema.ready)

    const today = todayKey()
    const [dR, sR, cR, vR, aR, uR, pR, oR, rR] = await Promise.all([
      q(db.from('drink_menu').select('*').eq('bar_id', bar.id).order('nome')),
      q(db.from('bar_pricing').select('*, produtos(nome,categoria,preco_venda)').eq('bar_id', bar.id)),
      q(db.from('discount_codes').select('*').eq('bar_id', bar.id).eq('ativo', true)),
      q(db.from('vip_members').select('*').eq('bar_id', bar.id).eq('ativo', true)),
      q(db.from('drink_back_agents').select('*').eq('bar_id', bar.id)),
      q(db.from('drink_back_usages').select('*').eq('bar_id', bar.id)),
      q(db.from('pos_vendas').select('*').eq('bar_id', bar.id)),
      q(db.from('pos_vendas').select('*').eq('bar_id', bar.id).eq('status', 'aberta')),
      q(db.from('pos_reorder_alerts').select('*').eq('bar_id', bar.id).eq('status', 'aberto')),
    ])
    setDrinks(dR)
    setShots(sR)
    setDiscountCodes(cR)
    setVipMembers(vR)
    setDrinkBackAgents(aR)
    setDrinkBackUsages(uR)
    setSales(pR)
    setOpenTabs(oR)
    setReorderAlerts(rR)
    const closedToday = pR.filter(s => s.data === today && s.status !== 'aberta' && s.status !== 'cancelada')
    setTodaySales({ count: closedToday.length, total: closedToday.reduce((a, s) => a + (+s.total || 0), 0) })
    setLoading(false)
  }

  if (loading) return <Spinner text={t('atomicPos.loading')} />

  const buckets = aggregateHourly(sales)

  return (
    <div className="fade-in pos-root">
      <SetupBanner ready={ready} demo={demo} />
      <div className="pos-isolation">{t('atomicPos.isolationNote')}</div>

      <ReorderAlerts bar={bar} alerts={reorderAlerts} db={db} demo={demo} onUpdate={init} userId={auth?.user?.id} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{t('atomicPos.title')}</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{t('atomicPos.subtitle')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase' }}>{t('atomicPos.today')}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>{fmtYen(todaySales.total)}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>{t('atomicPos.salesCount', { count: todaySales.count })}</div>
        </div>
      </div>

      <div className="pos-subtabs">
        {SUB_TAB_IDS.map(tab => (
          <button key={tab.id} type="button" onClick={() => setSubTab(tab.id)} className={subTab === tab.id ? 'active' : ''}>
            {tab.icon} {t(`atomicPos.${tab.key}`)}
          </button>
        ))}
      </div>

      {!ready && !demo && subTab === 'checkout' && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>
          {t('atomicPos.setupHint')}
        </div>
      )}

      {(ready || demo || subTab !== 'checkout') && (
        <>
          {subTab === 'checkout' && (ready || demo) && (
            <PosCheckoutTab
              bar={bar} drinks={drinks} shots={shots} discountCodes={discountCodes}
              vipMembers={vipMembers} drinkBackAgents={drinkBackAgents} openTabs={openTabs}
              onSale={init} db={db} completeSale={completeSale} demo={demo}
            />
          )}
          {subTab === 'hourly' && <PosHourlyTab buckets={buckets} lang={lang} />}
          {subTab === 'drinkback' && (
            <PosDrinkBackTab
              agents={drinkBackAgents}
              usages={drinkBackUsages}
              saving={false}
              onAdd={async (form) => {
                await db.from('drink_back_agents').insert({ bar_id: bar.id, ...form, ativo: true })
                init()
              }}
            />
          )}
          {subTab === 'vip' && <PosVipTab bar={bar} drinks={drinks} onUpdate={init} db={db} />}
          {subTab === 'prices' && <PosPricesTab bar={bar} drinks={drinks} onRefresh={init} db={db} />}
          {subTab === 'discounts' && <PosDiscountTab bar={bar} drinks={drinks} onUpdate={init} db={db} />}
        </>
      )}
      <div style={{ display: 'none' }} data-jbm-blocked={POS_FORBIDDEN_TABLES.join(',')} />
    </div>
  )
}
