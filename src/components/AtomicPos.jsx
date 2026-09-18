import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './Auth'
import { fmtYen, fmtDate, Spinner, SectionTitle } from './utils'
import {
  cartTotal,
  checkPosSchema,
  computeDayMetrics,
  findLowStockProducts,
  buildStockMap,
  generateDiscountCode,
  resolveItemPrice,
  todayKey,
  validateDiscountCode,
  pricingMapFromShots,
  isRestockPedido,
  commitPosSale,
  lineUnitPrice,
} from '../lib/atomicPos'
import { syncPosStockAndReorder } from '../lib/posSupply'
import { isSupplierProduct } from './utils'
import { includedTaxBreakdown } from '../lib/consumptionTax'
import { tokyoMonthKey } from '../lib/tokyo'
import { useI18n } from '../lib/i18n'
import { matchCheckoutVisit, spacesByZone, activeKeeps } from '../lib/barCrm'

const SUB_TAB_IDS = [
  { id: 'dashboard', key: 'tabDashboard', icon: '📊' },
  { id: 'checkout', key: 'tabCheckout', icon: '🧾' },
  { id: 'vip', key: 'tabVip', icon: '⭐' },
  { id: 'drinkback', key: 'tabDrinkBack', icon: '💃' },
  { id: 'prices', key: 'tabPrices', icon: '💴' },
  { id: 'discounts', key: 'tabDiscounts', icon: '🏷️' },
]

function SetupBanner({ onRefresh }) {
  const { t } = useI18n()
  const [setup, setSetup] = useState(null)
  useEffect(() => { checkPosSchema(supabase).then(setSetup) }, [])
  if (!setup || setup.ready) return null
  return (
    <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 12, padding: 16, marginBottom: 20, fontSize: 13 }}>
      <strong>{t('atomicPos.setupRequired')}</strong>
      <p style={{ margin: '8px 0', color: '#92400e' }}>
        {t('atomicPos.setupHint')}
      </p>
      <button onClick={onRefresh} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12 }}>{t('atomicPos.checkAgain')}</button>
    </div>
  )
}

// ── CHECKOUT ──────────────────────────────────────────────────────────────────
function PosCheckoutTab({ bar, drinks, shots, discountCodes, vipMembers, drinkBackAgents, onSale }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [cart, setCart] = useState([])
  const [search, setSearch] = useState('')
  const [priceType, setPriceType] = useState('regular')
  const [codeInput, setCodeInput] = useState('')
  const [activeCode, setActiveCode] = useState(null)
  const [vipId, setVipId] = useState('')
  const [agentId, setAgentId] = useState('')
  const [spaceId, setSpaceId] = useState('')
  const [guestId, setGuestId] = useState('')
  const [ticketNote, setTicketNote] = useState('')
  const [addCastOpen, setAddCastOpen] = useState(false)
  const [newCastName, setNewCastName] = useState('')
  const [spaces, setSpaces] = useState([])
  const [guests, setGuests] = useState([])
  const [visits, setVisits] = useState([])
  const [keeps, setKeeps] = useState([])
  const [agents, setAgents] = useState(drinkBackAgents || [])
  const [payMethod, setPayMethod] = useState('Cash')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setAgents(drinkBackAgents || []) }, [drinkBackAgents])

  useEffect(() => {
    Promise.all([
      supabase.from('bar_spaces').select('id,nome,tipo,zona,ordem,ativo').eq('bar_id', bar.id).eq('ativo', true).order('ordem'),
      supabase.from('bar_guests').select('id,nome,line_id,vip_member_id,preferencias,alergias,ativo').eq('bar_id', bar.id).eq('ativo', true).order('nome'),
      supabase.from('bar_visits').select('id,space_id,guest_id,status').eq('bar_id', bar.id).in('status', ['seated', 'reserved']),
      supabase.from('bar_bottle_keeps').select('id,guest_id,nome,remaining_pct,expires_on,ativo').eq('bar_id', bar.id).eq('ativo', true),
    ]).then(([sR, gR, vR, kR]) => {
      setSpaces(sR.data || [])
      setGuests(gR.data || [])
      setVisits(vR.data || [])
      setKeeps(kR.error ? [] : (kR.data || []))
    }).catch(() => {})
  }, [bar.id])

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
    if (!code) return alert(t('atomicPos.codeNotFound'))
    const v = validateDiscountCode(code)
    if (!v.ok) return alert(t(v.errorKey || 'atomicPos.codeNotFound'))
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
        preco_unitario: pricing.preco,
      }]
    })
  }

  async function completeSale() {
    if (!cart.length) return
    if (priceType === 'vip' && !vipId) return alert(t('atomicPos.vipMemberRequired'))
    setSaving(true)
    const openVisit = matchCheckoutVisit(visits, { spaceId, guestId })
    const guest = guests.find(g => g.id === guestId)
    const result = await commitPosSale(supabase, {
      bar,
      cart,
      payMethod,
      priceType,
      vipId: priceType === 'vip' ? (vipId || guest?.vip_member_id || null) : null,
      activeCode,
      agentId,
      spaceId: spaceId || null,
      guestId: guestId || null,
      visitId: openVisit?.id || null,
      obs: ticketNote,
      userId: user?.id,
      shots,
      syncStock: args => syncPosStockAndReorder(supabase, {
        ...args,
        pricingByProduto: pricingMapFromShots(shots),
        buildStockMap,
        findLowStockProducts,
      }),
    })
    setSaving(false)
    if (!result.ok) {
      return alert(result.errorKey ? t(result.errorKey) : (result.error || t('atomicPos.saleStockFailed')))
    }
    setCart([])
    setActiveCode(null)
    setCodeInput('')
    setAgentId('')
    setSpaceId('')
    setGuestId('')
    setTicketNote('')
    onSale?.()
    const tax = includedTaxBreakdown(result.total)
    const restockNote = result.stock?.pedido
      ? `\n${t('atomicPos.restockSent', { count: result.stock.restockItems?.length || 0 })}`
      : ''
    alert(
      t('atomicPos.saleRegistered', { amount: fmtYen(result.total) })
      + `\n${t('atomicPos.taxIncluded')} ${fmtYen(tax.total)}`
      + `\n${t('atomicPos.consumptionTaxIncluded')} ${fmtYen(tax.tax)}`
      + restockNote
    )
  }

  return (
    <div className="pos-checkout">
      <div>
        <div className="pos-price-row">
          {['regular', 'vip', 'codigo'].map(pt => (
            <button key={pt} className={`pos-chip${priceType === pt ? ' is-on' : ''}`} onClick={() => { setPriceType(pt); if (pt !== 'codigo') setActiveCode(null) }}>
              {pt === 'regular' ? t('atomicPos.regularPrice') : pt === 'vip' ? t('atomicPos.vipPrice') : t('atomicPos.discountCode')}
            </button>
          ))}
        </div>

        {priceType === 'codigo' && (
          <div className="pos-code-row">
            <input placeholder={t('atomicPos.codePlaceholder')} value={codeInput} onChange={e => setCodeInput(e.target.value.toUpperCase())} />
            <button className="btn-primary" onClick={applyCode}>{t('atomicPos.apply')}</button>
            {activeCode && <span className="pos-code-ok">✓ {activeCode.codigo}</span>}
          </div>
        )}

        {priceType === 'vip' && (
          <select value={vipId} onChange={e => setVipId(e.target.value)} className="pos-select">
            <option value="">{t('atomicPos.vipMemberRequired')}</option>
            {(vipMembers || []).filter(v => v.ativo).map(v => (
              <option key={v.id} value={v.id}>{v.nome}{v.codigo ? ` · ${v.codigo}` : ''}</option>
            ))}
          </select>
        )}

        <div className="pos-ticket">
          <div className="pos-ticket-cast">
            <div className="pos-ticket-label">{t('atomicPos.castLabel')}</div>
            <div className="pos-ticket-chips">
              {agents.filter(a => a.ativo !== false).map(a => (
                <button
                  key={a.id}
                  type="button"
                  className={`pos-chip pos-chip-cast${agentId === a.id ? ' is-on' : ''}`}
                  onClick={() => setAgentId(agentId === a.id ? '' : a.id)}
                >💃 {a.nome}</button>
              ))}
              <button type="button" className="pos-chip" onClick={() => setAddCastOpen(v => !v)}>{t('atomicPos.addCast')}</button>
            </div>
            {addCastOpen && (
              <div className="pos-code-row">
                <input value={newCastName} onChange={e => setNewCastName(e.target.value)} placeholder={t('atomicPos.castPlaceholder')} />
                <button type="button" className="btn-primary" onClick={async () => {
                  const nome = newCastName.trim()
                  if (!nome) return
                  const { data, error } = await supabase.from('drink_back_agents').insert({
                    bar_id: bar.id, nome, comissao_pct: 10, ativo: true,
                  }).select('*').single()
                  if (!error && data) {
                    setAgents(prev => [...prev, data])
                    setAgentId(data.id)
                    setNewCastName('')
                    setAddCastOpen(false)
                  } else {
                    alert(error?.message || t('atomicPos.drinkBackSetup'))
                  }
                }}>{t('common.confirm')}</button>
              </div>
            )}
          </div>

          <div className="pos-ticket-label">{t('atomicPos.spaceLabel')}</div>
          <div className="pos-ticket-chips">
            {spaces.length === 0 && <span className="pos-ticket-empty">{t('atomicPos.spaceOptional')}</span>}
            {spacesByZone(spaces).flatMap(z => z.spaces).map(s => {
              const visit = matchCheckoutVisit(visits, { spaceId: s.id })
              const who = visit ? (guests.find(g => g.id === visit.guest_id)?.nome || t('atomicPos.walkIn')) : ''
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`pos-chip${spaceId === s.id ? ' is-on' : ''}`}
                  onClick={() => {
                    const id = spaceId === s.id ? '' : s.id
                    setSpaceId(id)
                    if (id) {
                      const v = matchCheckoutVisit(visits, { spaceId: id })
                      if (v?.guest_id) setGuestId(v.guest_id)
                    }
                  }}
                >{who ? `${s.nome} · ${who}` : s.nome}</button>
              )
            })}
          </div>

          <div className="pos-ticket-label">{t('atomicPos.guestLabel')}</div>
          <select
            value={guestId}
            onChange={e => {
              const id = e.target.value
              setGuestId(id)
              const g = guests.find(x => x.id === id)
              if (g?.vip_member_id && priceType === 'vip') setVipId(g.vip_member_id)
              const visit = matchCheckoutVisit(visits, { guestId: id })
              if (visit?.space_id) setSpaceId(visit.space_id)
            }}
            className="pos-select"
          >
            <option value="">{t('atomicPos.guestOptional')}</option>
            {guests.map(g => <option key={g.id} value={g.id}>{g.nome}{g.line_id ? ` · LINE ${g.line_id}` : ''}</option>)}
          </select>

          {guestId && (() => {
            const g = guests.find(x => x.id === guestId)
            const guestKeeps = activeKeeps(keeps, guestId)
            if (!g && !guestKeeps.length) return null
            return (
              <div className="pos-guest-chip">
                {g?.alergias && <div className="pos-guest-alert">{t('guests.allergies')}: {g.alergias}</div>}
                {g?.preferencias && <div>{t('guests.prefs')}: {g.preferencias}</div>}
                {guestKeeps.map(k => (
                  <div key={k.id}>{t('atomicPos.keepChip', { name: k.nome, pct: k.remaining_pct })}</div>
                ))}
              </div>
            )
          })()}

          <label className="pos-ticket-label" htmlFor="pos-ticket-note">{t('atomicPos.detailsLabel')}</label>
          <textarea
            id="pos-ticket-note"
            className="pos-ticket-note"
            rows={2}
            value={ticketNote}
            onChange={e => setTicketNote(e.target.value)}
            placeholder={t('atomicPos.detailsPlaceholder')}
          />
        </div>

        <input className="pos-search" placeholder={t('atomicPos.searchDrinks')} value={search} onChange={e => setSearch(e.target.value)} />

        <div className="pos-grid">
          {filtered.map(item => {
            const p = resolveItemPrice(item, priceType === 'codigo' ? 'regular' : priceType, activeCode)
            return (
              <button key={item.key} className="pos-tile" onClick={() => addToCart(item)}>
                <div className="pos-tile-name">{item.nome}</div>
                <div className="pos-tile-cat">{item.categoria}</div>
                <div className="pos-tile-price">{fmtYen(p.preco)}</div>
                {p.preco_lista > p.preco && <div className="pos-tile-was">{fmtYen(p.preco_lista)}</div>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="pos-cart">
        <div className="pos-cart-title">{t('atomicPos.cart')}</div>
        {(agentId || spaceId || guestId || ticketNote) && (
          <div className="pos-cart-ticket">
            {agentId && <span>💃 {(agents.find(a => a.id === agentId)?.nome) || 'CAST'}</span>}
            {spaceId && <span>🪑 {(spaces.find(s => s.id === spaceId)?.nome)}</span>}
            {guestId && <span>🥂 {(guests.find(g => g.id === guestId)?.nome)}</span>}
            {ticketNote && <span>{ticketNote}</span>}
          </div>
        )}
        {cart.length === 0 ? <div className="pos-cart-empty">{t('atomicPos.tapToAdd')}</div> : (
          <>
            <div className="pos-cart-list">
              {cart.map((it, i) => (
                <div key={i} className="pos-cart-row">
                  <div>
                    <div className="pos-cart-name">{it.nome}</div>
                    <div className="pos-cart-meta">{it.tipo_preco} × {it.qtd}</div>
                  </div>
                  <div className="pos-cart-qty">
                    <button className="pos-qty" onClick={() => setCart(c => c.map((x, j) => j === i ? { ...x, qtd: Math.max(1, x.qtd - 1) } : x))}>−</button>
                    <span>{it.qtd}</span>
                    <button className="pos-qty" onClick={() => setCart(c => c.map((x, j) => j === i ? { ...x, qtd: x.qtd + 1 } : x))}>+</button>
                    <strong>{fmtYen(lineUnitPrice(it) * it.qtd)}</strong>
                    <button className="pos-qty-del" onClick={() => setCart(c => c.filter((_, j) => j !== i))}>✕</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="pos-cart-total">{fmtYen(cartTotal(cart))}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', margin: '-4px 0 10px' }}>
              {t('atomicPos.taxIncluded')} · {t('atomicPos.consumptionTaxIncluded')} {fmtYen(includedTaxBreakdown(cartTotal(cart)).tax)}
            </div>
            <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="pos-select">
              {['Cash', 'Credit card', 'Debit card', 'PayPay', 'Transfer'].map(m => <option key={m}>{m}</option>)}
            </select>
            <button className="btn-primary pos-pay" onClick={completeSale} disabled={saving || (priceType === 'vip' && !vipId)}>
              {saving ? t('common.saving') : t('atomicPos.registerPosSale')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── VIP ───────────────────────────────────────────────────────────────────────
function PosVipTab({ bar, drinks, onUpdate }) {
  const { t } = useI18n()
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
    if (!memberForm.nome) return alert(t('atomicPos.nameRequired'))
    setSaving(true)
    await supabase.from('vip_members').insert({ bar_id: bar.id, ...memberForm, codigo: memberForm.codigo || null })
    setMemberForm({ nome: '', codigo: '', tier: 'standard', notas: '' })
    setSaving(false)
    load()
    onUpdate?.()
  }

  async function registerUsage() {
    if (!usageForm.vip_member_id || !usageForm.drink_menu_id) return alert(t('atomicPos.selectMemberDrink'))
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

  if (loading) return <Spinner text={t('atomicPos.loadingVip')} />

  const monthUsages = usages.filter(u => u.criado_em && tokyoMonthKey(u.criado_em) === tokyoMonthKey())
  const monthTotal = monthUsages.reduce((a, u) => a + (+u.preco_aplicado || 0) * (+u.qtd || 1), 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['register', t('atomicPos.registerUse')], ['members', t('atomicPos.members')], ['history', t('atomicPos.history')]].map(([id, label]) => (
          <button key={id} onClick={() => setMode(id)} style={{
            padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
            background: mode === id ? 'var(--navy)' : 'var(--bg3)', color: mode === id ? '#fff' : 'var(--text2)', border: 'none',
          }}>{label}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
        <StatCard label={t('atomicPos.vipMembers')} value={members.filter(m => m.ativo).length} />
        <StatCard label={t('atomicPos.usesThisMonth')} value={monthUsages.length} />
        <StatCard label={t('atomicPos.vipMonthTotal')} value={fmtYen(monthTotal)} />
      </div>

      {mode === 'register' && (
        <div className="card" style={{ maxWidth: 480 }}>
          <SectionTitle>{t('atomicPos.registerVipUse')}</SectionTitle>
          <label className="form-label">{t('atomicPos.member')}</label>
          <select value={usageForm.vip_member_id} onChange={e => setUsageForm({ ...usageForm, vip_member_id: e.target.value })} style={{ width: '100%', marginBottom: 12 }}>
            <option value="">{t('atomicPos.selectPlaceholder')}</option>
            {members.filter(m => m.ativo).map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
          <label className="form-label">{t('atomicPos.drink')}</label>
          <select value={usageForm.drink_menu_id} onChange={e => setUsageForm({ ...usageForm, drink_menu_id: e.target.value })} style={{ width: '100%', marginBottom: 12 }}>
            <option value="">{t('atomicPos.selectPlaceholder')}</option>
            {drinks.map(d => <option key={d.id} value={d.id}>{d.nome} — VIP {fmtYen(d.preco_desconto || 500)}</option>)}
          </select>
          <label className="form-label">{t('atomicPos.quantity')}</label>
          <input type="number" min="1" value={usageForm.qtd} onChange={e => setUsageForm({ ...usageForm, qtd: e.target.value })} style={{ width: '100%', marginBottom: 12 }} />
          <button className="btn-primary" onClick={registerUsage} disabled={saving} style={{ width: '100%', padding: 12 }}>{saving ? '...' : t('atomicPos.registerVipUseBtn')}</button>
        </div>
      )}

      {mode === 'members' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <SectionTitle>{t('atomicPos.newMember')}</SectionTitle>
            <input placeholder={t('atomicPos.namePlaceholder')} value={memberForm.nome} onChange={e => setMemberForm({ ...memberForm, nome: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
            <input placeholder={t('atomicPos.cardCodeOptional')} value={memberForm.codigo} onChange={e => setMemberForm({ ...memberForm, codigo: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
            <button className="btn-primary" onClick={saveMember} disabled={saving} style={{ width: '100%', padding: 10 }}>{t('atomicPos.addMember')}</button>
          </div>
          <div>
            {members.map(m => (
              <div key={m.id} className="card" style={{ marginBottom: 8, padding: 14 }}>
                <div style={{ fontWeight: 700 }}>{m.nome}</div>
                {m.codigo && <div style={{ fontSize: 12, color: 'var(--text2)' }}>{t('atomicPos.codeLabel', { code: m.codigo })}</div>}
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
  const { t } = useI18n()
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
        {[['menu', t('atomicPos.menuDrinks')], ['shots', t('atomicPos.shotsBottle')]].map(([id, label]) => (
          <button key={id} onClick={() => setPriceMode(id)} style={{
            padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
            background: priceMode === id ? 'var(--navy)' : 'var(--bg3)', color: priceMode === id ? '#fff' : 'var(--text2)', border: 'none',
          }}>{label}</button>
        ))}
      </div>

      {priceMode === 'menu' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <SectionTitle>{editId ? t('atomicPos.editDrink') : t('atomicPos.newDrink')}</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 8 }}>
              <input placeholder={t('atomicPos.namePlaceholder')} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
              <input placeholder={t('atomicPos.priceYen')} type="number" value={form.preco_venda} onChange={e => setForm({ ...form, preco_venda: e.target.value })} />
              <input placeholder={t('atomicPos.costYen')} type="number" value={form.custo} onChange={e => setForm({ ...form, custo: e.target.value })} />
              <input placeholder={t('atomicPos.vipYen')} type="number" value={form.preco_desconto} onChange={e => setForm({ ...form, preco_desconto: e.target.value })} />
              <button className="btn-primary" onClick={saveDrink} disabled={saving}>{editId ? t('common.save') : t('common.add')}</button>
            </div>
          </div>
          <table style={{ width: '100%', fontSize: 13 }}>
            <thead><tr>{[t('atomicPos.colDrink'), t('atomicPos.colPrice'), t('atomicPos.colVip'), t('atomicPos.colMargin'), ''].map(h => <th key={h || 'x'} style={{ textAlign: 'left', padding: 8 }}>{h}</th>)}</tr></thead>
            <tbody>
              {drinks.map(d => (
                <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 8 }}>{d.nome}</td>
                  <td>{fmtYen(d.preco_venda)}</td>
                  <td style={{ color: 'var(--gold)' }}>{fmtYen(d.preco_desconto || 500)}</td>
                  <td>{Math.round((d.margem || 0) * 100)}%</td>
                  <td><button onClick={() => { setEditId(d.id); setForm({ nome: d.nome, categoria: d.categoria, preco_venda: d.preco_venda, custo: d.custo, preco_desconto: d.preco_desconto || 500 }) }} style={{ fontSize: 11 }}>{t('common.edit')}</button></td>
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
                <option value="">{t('atomicPos.jbmProduct')}</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <input placeholder={t('atomicPos.drinksPerBottle')} type="number" value={shotForm.drinks} onChange={e => setShotForm({ ...shotForm, drinks: e.target.value })} />
              <input placeholder={t('atomicPos.pricePerDrink')} type="number" value={shotForm.preco} onChange={e => setShotForm({ ...shotForm, preco: e.target.value })} />
              <button className="btn-primary" onClick={saveShot} disabled={saving}>{t('common.save')}</button>
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
  const { t } = useI18n()
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
        <SectionTitle>{t('atomicPos.createDiscount')}</SectionTitle>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value.toUpperCase() })} style={{ flex: 1 }} />
          <button onClick={() => setForm({ ...form, codigo: generateDiscountCode() })} style={{ padding: '8px 12px', fontSize: 11 }}>{t('atomicPos.generate')}</button>
        </div>
        <input placeholder={t('atomicPos.description')} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
            <option value="percent">{t('atomicPos.percentLabel')}</option>
            <option value="fixed">{t('atomicPos.fixedLabel')}</option>
          </select>
          <input type="number" placeholder={t('atomicPos.valuePlaceholder')} value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} />
        </div>
        <select value={form.drink_menu_id} onChange={e => setForm({ ...form, drink_menu_id: e.target.value })} style={{ width: '100%', marginBottom: 8 }}>
          <option value="">{t('atomicPos.allDrinks')}</option>
          {drinks.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
        </select>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <input type="number" placeholder={t('atomicPos.maxUses')} value={form.max_usos} onChange={e => setForm({ ...form, max_usos: e.target.value })} />
          <input type="date" value={form.valido_ate} onChange={e => setForm({ ...form, valido_ate: e.target.value })} />
        </div>
        <button className="btn-primary" onClick={saveCode} disabled={saving} style={{ width: '100%', padding: 12 }}>{t('atomicPos.createCode')}</button>
      </div>
      <div>
        {codes.map(c => (
          <div key={c.id} className="card" style={{ marginBottom: 8, padding: 14, opacity: c.ativo ? 1 : 0.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: 1 }}>{c.codigo}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {c.tipo === 'percent' ? `${c.valor}% off` : fmtYen(c.valor)} · {t('atomicPos.usesLabel')} {c.usos_atual || 0}{c.max_usos ? `/${c.max_usos}` : ''}
                </div>
              </div>
              <button onClick={() => toggleCode(c.id, c.ativo)} style={{ fontSize: 11 }}>{c.ativo ? t('atomicPos.deactivate') : t('atomicPos.activate')}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, color: color || 'inherit' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function HourlyChart({ data, height = 100 }) {
  const { t } = useI18n()
  const activeHours = data.filter(h => h.total > 0 || h.count > 0)
  if (!activeHours.length) return <div style={{ color: 'var(--text3)', fontSize: 13, padding: 20, textAlign: 'center' }}>—</div>
  const max = Math.max(...data.map(d => d.total), 1)
  return (
    <div className="hourly-chart" style={{ height: height + 32 }}>
      {data.map((d, i) => {
        const barH = Math.max(2, (d.total / max) * height)
        const hasData = d.total > 0
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            {hasData && <div style={{ fontSize: 9, color: 'var(--text2)', fontWeight: 600 }}>{fmtYen(d.total)}</div>}
            <div style={{
              width: '100%', maxWidth: 28, height: barH, borderRadius: '4px 4px 0 0',
              background: hasData ? 'var(--navy)' : 'var(--bg3)', opacity: hasData ? 1 : 0.3,
            }} title={`${d.label}: ${fmtYen(d.total)} (${d.count} ${t('atomicPos.salesWord')})`} />
            <div style={{ fontSize: 9, color: 'var(--text3)' }}>{d.label.slice(0, 2)}h</div>
          </div>
        )
      })}
    </div>
  )
}

function PosDashboardTab({ bar, todaySales, salesList, onOrder }) {
  const { t } = useI18n()
  const [lowStock, setLowStock] = useState([])
  const [agentStats, setAgentStats] = useState([])
  const [openRestock, setOpenRestock] = useState([])
  const [loading, setLoading] = useState(true)

  const metrics = useMemo(() => computeDayMetrics(salesList || []), [salesList])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [mR, rR, pR, aR, sR, pedR] = await Promise.all([
        supabase.from('estoque_movimentos').select('produto_id,tipo,qtd').eq('bar_id', bar.id),
        supabase.from('estoque_regras').select('produto_id,minimo').eq('bar_id', bar.id),
        supabase.from('produtos_public').select('id,nome,categoria').eq('ativo', true),
        supabase.from('drink_back_agents').select('id,nome,comissao_pct').eq('bar_id', bar.id).eq('ativo', true),
        supabase.from('pos_vendas').select('total,drink_back_agent_id').eq('bar_id', bar.id).eq('data', todayKey()).not('drink_back_agent_id', 'is', null),
        supabase.from('pedidos').select('id,status,obs,total_estimado,pedidos_itens(produto_id,qtd,produtos(nome))').eq('bar_id', bar.id).in('status', ['pendente', 'confirmado']),
      ])

      const stockMap = buildStockMap(mR.data || [])
      const regras = Object.fromEntries((rR.data || []).map(r => [r.produto_id, r.minimo]))
      const prods = (pR.data || []).filter(isSupplierProduct)
      setLowStock(findLowStockProducts(prods, stockMap, regras))

      const agents = aR.data || []
      const sales = sR.data || []
      const agentMap = {}
      for (const s of sales) {
        if (!s.drink_back_agent_id) continue
        if (!agentMap[s.drink_back_agent_id]) agentMap[s.drink_back_agent_id] = { total: 0, count: 0 }
        agentMap[s.drink_back_agent_id].total += +s.total || 0
        agentMap[s.drink_back_agent_id].count += 1
      }
      setAgentStats(agents.map(a => ({
        ...a,
        vendas: agentMap[a.id]?.count || 0,
        faturamento: agentMap[a.id]?.total || 0,
        comissao: Math.round((agentMap[a.id]?.total || 0) * (+a.comissao_pct || 0) / 100),
      })).filter(a => a.vendas > 0).sort((a, b) => b.faturamento - a.faturamento))

      setOpenRestock((pedR.data || []).filter(isRestockPedido))

      setLoading(false)
    }
    load()
  }, [bar, todaySales])

  return (
    <div className="easy-dash pos-easy-dash">
      <div className="easy-dash-hero">
        <div className="easy-dash-kicker">{t('atomicPos.todayAtCounter')}</div>
        <div className="easy-dash-value" style={{ color: 'var(--green)' }}>{fmtYen(metrics.total)}</div>
        <div className="easy-dash-hint">
          {t('atomicPos.ticketsToday', { count: metrics.count })}
          {' · '}
          {t('atomicPos.avgTicketShort', { amount: fmtYen(metrics.ticketMedio) })}
          {metrics.peakHour?.total > 0 ? ` · ${t('atomicPos.busiestHour')} ${metrics.peakHour.label}` : ''}
        </div>
      </div>

      {openRestock.length === 0 && lowStock.length === 0 && (
        <div className="easy-dash-ok" style={{ marginBottom: 16 }}>{t('atomicPos.stockOk')}</div>
      )}

      {openRestock.length > 0 && (
        <div style={{
          background: 'var(--navy)', borderRadius: 16, padding: '16px 20px', marginBottom: 20,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginBottom: 4 }}>
              {t('atomicPos.restockPending', { count: openRestock.length })}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
              {t('atomicPos.restockPendingHint')}
            </div>
          </div>
          {onOrder && (
            <button onClick={onOrder} style={{
              background: 'white', color: 'var(--navy)', border: 'none', borderRadius: 12,
              padding: '10px 18px', fontWeight: 700, fontSize: 12, cursor: 'pointer',
            }}>
              {t('atomicPos.seeJbmOrders')}
            </button>
          )}
        </div>
      )}

      {lowStock.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg,#ff9500 0%,#ff6b00 100%)',
          borderRadius: 16, padding: '16px 20px', marginBottom: 20,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginBottom: 4 }}>
              {t('atomicPos.lowStockAlert', { count: lowStock.length })}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>
              {lowStock.slice(0, 4).map(p => `${p.nome} (${p.stock}/${p.minimo})`).join(' · ')}
            </div>
          </div>
          {onOrder && (
            <button onClick={onOrder} style={{
              background: 'white', color: '#ff6b00', border: 'none', borderRadius: 12,
              padding: '10px 18px', fontWeight: 700, fontSize: 12, cursor: 'pointer',
            }}>
              {t('atomicPos.reorderJbm')}
            </button>
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <SectionTitle>{t('atomicPos.hourlyRevenue')}</SectionTitle>
        <HourlyChart data={metrics.hourly} />
      </div>

      {agentStats.length > 0 && (
        <div className="card">
          <SectionTitle>{t('atomicPos.drinkBackToday')}</SectionTitle>
          {agentStats.map(a => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <div>
                <strong>{a.nome}</strong>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>{a.vendas} {t('atomicPos.salesWord')} · {t('atomicPos.commissionShort', { pct: a.comissao_pct })}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>{fmtYen(a.faturamento)}</div>
                <div style={{ fontSize: 11, color: 'var(--gold)' }}>{t('atomicPos.commission')} {fmtYen(a.comissao)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && <Spinner />}
    </div>
  )
}

// ── DRINK BACK ────────────────────────────────────────────────────────────────
function PosDrinkBackTab({ bar, onUpdate }) {
  const { t } = useI18n()
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nome: '', regiao: '', comissao_pct: '10', notas: '' })
  const [saving, setSaving] = useState(false)
  const [schemaOk, setSchemaOk] = useState(true)

  useEffect(() => { load() }, [bar])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('drink_back_agents').select('*').eq('bar_id', bar.id).order('nome')
    if (error?.code === 'PGRST205') setSchemaOk(false)
    else { setSchemaOk(true); setAgents(data || []) }
    setLoading(false)
  }

  async function saveAgent() {
    if (!form.nome) return alert(t('atomicPos.nameRequired'))
    setSaving(true)
    const { error } = await supabase.from('drink_back_agents').insert({
      bar_id: bar.id,
      nome: form.nome,
      regiao: form.regiao || null,
      comissao_pct: +form.comissao_pct || 10,
      notas: form.notas || null,
      ativo: true,
    })
    if (error) { alert(error.message); setSaving(false); return }
    setForm({ nome: '', regiao: '', comissao_pct: '10', notas: '' })
    setSaving(false)
    load()
    onUpdate?.()
  }

  async function toggleAgent(id, ativo) {
    await supabase.from('drink_back_agents').update({ ativo: !ativo }).eq('id', id)
    load()
  }

  if (loading) return <Spinner />

  if (!schemaOk) {
    return (
      <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 12, padding: 16, fontSize: 13 }}>
        <strong>{t('atomicPos.drinkBackSetup')}</strong>
        <p style={{ margin: '8px 0', color: '#92400e' }}>{t('atomicPos.drinkBackSetupHint')}</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div className="card">
        <SectionTitle>{t('atomicPos.newAgent')}</SectionTitle>
        <input placeholder={t('atomicPos.agentName')} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
        <input placeholder={t('atomicPos.region')} value={form.regiao} onChange={e => setForm({ ...form, regiao: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
        <input type="number" placeholder={t('atomicPos.commissionPct')} value={form.comissao_pct} onChange={e => setForm({ ...form, comissao_pct: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
        <button className="btn-primary" onClick={saveAgent} disabled={saving} style={{ width: '100%', padding: 12 }}>
          {saving ? t('common.saving') : t('atomicPos.addAgent')}
        </button>
      </div>
      <div>
        {agents.length === 0 ? (
          <div style={{ color: 'var(--text3)', fontSize: 13 }}>{t('atomicPos.noAgents')}</div>
        ) : agents.map(a => (
          <div key={a.id} className="card" style={{ marginBottom: 8, padding: 14, opacity: a.ativo ? 1 : 0.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{a.nome}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {a.regiao || '—'} · {t('atomicPos.commissionShort', { pct: a.comissao_pct })}
                </div>
              </div>
              <button onClick={() => toggleAgent(a.id, a.ativo)} style={{ fontSize: 11 }}>
                {a.ativo ? t('atomicPos.deactivate') : t('atomicPos.activate')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── MAIN PANEL ────────────────────────────────────────────────────────────────
export default function AtomicPosPanel({ bar, onOrder, access = 'owner' }) {
  const { t } = useI18n()
  const [subTab, setSubTab] = useState(access === 'cashier' ? 'checkout' : 'dashboard')
  const tabs = access === 'cashier' ? SUB_TAB_IDS.filter(t => t.id === 'checkout') : SUB_TAB_IDS
  const [ready, setReady] = useState(null)
  const [drinks, setDrinks] = useState([])
  const [shots, setShots] = useState([])
  const [discountCodes, setDiscountCodes] = useState([])
  const [vipMembers, setVipMembers] = useState([])
  const [drinkBackAgents, setDrinkBackAgents] = useState([])
  const [todaySales, setTodaySales] = useState({ count: 0, total: 0 })
  const [salesList, setSalesList] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { init() }, [bar])

  async function init() {
    setLoading(true)
    const schema = await checkPosSchema(supabase)
    setReady(schema.ready)

    const [dR, sR, cR, vR, pR, aR] = await Promise.all([
      supabase.from('drink_menu').select('*').eq('bar_id', bar.id).order('nome'),
      supabase.from('bar_pricing').select('*, produtos(nome,categoria,preco_venda)').eq('bar_id', bar.id),
      schema.ready ? supabase.from('discount_codes').select('*').eq('bar_id', bar.id).eq('ativo', true) : { data: [] },
      schema.ready ? supabase.from('vip_members').select('*').eq('bar_id', bar.id).eq('ativo', true) : { data: [] },
      schema.ready ? supabase.from('pos_vendas').select('total,criado_em,drink_back_agent_id').eq('bar_id', bar.id).eq('data', todayKey()).order('criado_em') : { data: [] },
      schema.ready ? supabase.from('drink_back_agents').select('*').eq('bar_id', bar.id).eq('ativo', true) : { data: [] },
    ])
    setDrinks(dR.data || [])
    setShots(sR.data || [])
    setDiscountCodes(cR.data || [])
    setVipMembers(vR.data || [])
    setDrinkBackAgents(aR.data || [])
    const sales = pR.data || []
    setSalesList(sales)
    setTodaySales({ count: sales.length, total: sales.reduce((a, s) => a + (+s.total || 0), 0) })
    setLoading(false)
  }

  if (loading) return <Spinner text={t('atomicPos.loading')} />

  return (
    <div className={`fade-in pos-shell${access === 'cashier' ? ' pos-kiosk' : ''}`}>
      <SetupBanner onRefresh={init} />

      <div className="pos-head">
        <div>
          <div className="pos-head-title">{t('atomicPos.title')}</div>
          <div className="pos-head-sub">{t('atomicPos.subtitle')}</div>
          {access === 'cashier' && (
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>{t('atomicPos.tillOnly')}</div>
          )}
        </div>
        <div className="pos-head-today">
          <div className="pos-head-label">{t('atomicPos.today')}</div>
          <div className="pos-head-total">{fmtYen(todaySales.total)}</div>
          <div className="pos-head-count">{t('atomicPos.salesCount', { count: todaySales.count })}</div>
        </div>
      </div>

      <div className="pos-subnav">
        {tabs.map(tab => (
          <button key={tab.id} className={`pos-chip${subTab === tab.id ? ' is-on' : ''}`} onClick={() => setSubTab(tab.id)}>
            {tab.icon} {t(`atomicPos.${tab.key}`)}
          </button>
        ))}
      </div>

      {subTab === 'dashboard' && (
        <PosDashboardTab bar={bar} todaySales={todaySales} salesList={salesList} onOrder={onOrder} />
      )}

      {!ready && subTab === 'checkout' && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>
          {t('atomicPos.setupHint')}
        </div>
      )}

      {(ready || subTab !== 'checkout') && subTab !== 'dashboard' && (
        <>
          {subTab === 'checkout' && ready && (
            <PosCheckoutTab
              bar={bar}
              drinks={drinks}
              shots={shots}
              discountCodes={discountCodes}
              vipMembers={vipMembers}
              drinkBackAgents={drinkBackAgents}
              onSale={init}
            />
          )}
          {subTab === 'vip' && <PosVipTab bar={bar} drinks={drinks} onUpdate={init} />}
          {subTab === 'drinkback' && <PosDrinkBackTab bar={bar} onUpdate={init} />}
          {subTab === 'prices' && <PosPricesTab bar={bar} drinks={drinks} onRefresh={init} />}
          {subTab === 'discounts' && <PosDiscountTab bar={bar} drinks={drinks} onUpdate={init} />}
        </>
      )}
    </div>
  )
}
