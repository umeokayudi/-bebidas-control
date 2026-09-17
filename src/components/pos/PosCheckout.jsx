import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../Auth'
import { useI18n } from '../../lib/i18n'
import { fmtYen } from '../utils'
import { PortalAlert } from '../ui/PageLayout'
import {
  PAY_METHODS, cartTotal, cartSubtotal, drinkBackCommission, registerPosSale,
  resolveItemPrice, runAutoReorder, validateDiscountCode, buildStockMovements,
} from '../../lib/posEngine'
import { fmtQty } from './PosShared'

export default function PosCheckout({ bar, data, reload, onTab }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const { drinks, shots, discountCodes, vipMembers, staff, agents, produtosById, pricingByProd, ingredientesByDrink, config } = data

  const [cart, setCart] = useState([])
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [priceType, setPriceType] = useState('regular')
  const [codeInput, setCodeInput] = useState('')
  const [activeCode, setActiveCode] = useState(null)
  const [vipId, setVipId] = useState('')
  const [staffId, setStaffId] = useState('')
  const [agentId, setAgentId] = useState('')
  const [mesa, setMesa] = useState('')
  const [payMethod, setPayMethod] = useState('Cash')
  const [saving, setSaving] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [err, setErr] = useState('')

  const ctx = { produtosById, pricingByProd, ingredientesByDrink }

  const catalog = useMemo(() => {
    const menuItems = (drinks || []).map(d => ({
      key: `d-${d.id}`, id: d.id, kind: 'drink', drink_menu_id: d.id, produto_id: null,
      nome: d.nome, categoria: d.categoria || 'Custom',
      preco_venda: +d.preco_venda || 0, preco_desconto: d.preco_desconto, custo_unitario: +d.custo || 0,
      hasStock: (ingredientesByDrink[d.id] || []).length > 0,
    }))
    const shotItems = (shots || []).map(s => {
      const prod = s.produtos || produtosById[s.produto_id] || {}
      const per = +s.drinks_por_garrafa || 16
      return {
        key: `p-${s.produto_id}`, id: s.produto_id, kind: 'shot', drink_menu_id: null, produto_id: s.produto_id,
        nome: prod.nome || 'Shot', categoria: 'Shot',
        preco_venda: +s.preco_drink || 0, preco_desconto: Math.round((+s.preco_drink || 0) * 0.5),
        custo_unitario: prod.preco_venda ? Math.round(prod.preco_venda / per) : 0,
        hasStock: true,
      }
    })
    return [...menuItems, ...shotItems]
  }, [drinks, shots, produtosById, ingredientesByDrink])

  const categories = useMemo(() => [...new Set(catalog.map(c => c.categoria))].sort(), [catalog])

  const filtered = catalog.filter(it => {
    if (catFilter && it.categoria !== catFilter) return false
    if (!search) return true
    const s = search.toLowerCase()
    return it.nome.toLowerCase().includes(s) || it.categoria.toLowerCase().includes(s)
  })

  const activeStaff = staff.find(s => s.id === staffId) || null
  const activeAgent = agents.find(a => a.id === agentId) || null
  const effectivePriceType = priceType === 'codigo' ? 'regular' : priceType

  function applyCode() {
    const code = (discountCodes || []).find(c => c.codigo.toUpperCase() === codeInput.trim().toUpperCase())
    if (!code) { setErr(t('pos.codeNotFound')); return }
    const v = validateDiscountCode(code)
    if (!v.ok) { setErr(t(`pos.codeError.${v.error}`)); return }
    setErr('')
    setActiveCode(code)
    setPriceType('codigo')
  }

  function addToCart(item) {
    const pricing = resolveItemPrice(item, effectivePriceType, activeCode)
    setCart(prev => {
      const ex = prev.find(x => x.key === item.key && x.tipo_preco === pricing.tipo_preco)
      if (ex) return prev.map(x => x === ex ? { ...x, qtd: x.qtd + 1 } : x)
      return [...prev, {
        key: item.key, kind: item.kind, drink_menu_id: item.drink_menu_id, produto_id: item.produto_id,
        nome: item.nome, qtd: 1, custo_unitario: item.custo_unitario, ...pricing,
      }]
    })
  }

  function changeQty(i, delta) {
    setCart(c => c.map((x, j) => j === i ? { ...x, qtd: Math.max(1, x.qtd + delta) } : x))
  }

  async function completeSale() {
    if (!cart.length || saving) return
    setSaving(true)
    setErr('')
    try {
      const result = await registerPosSale(supabase, {
        bar, user, cart, payMethod, vipId: priceType === 'vip' ? vipId : null, activeCode,
        staff: activeStaff, agent: activeAgent, mesa, config, ctx,
      })
      const affected = result.movimentos.map(m => m.produto_id)
      let reorder = null
      if (affected.length) {
        try {
          reorder = await runAutoReorder(supabase, { bar, user, config, produtoIds: affected, posVendaId: result.venda.id })
        } catch (e) {
          reorder = { error: e.message }
        }
      }
      setLastResult({ total: cartTotal(cart), movimentos: result.movimentos, reorder, comissaoDb: result.comissaoDb })
      setCart([])
      setActiveCode(null)
      setCodeInput('')
      setMesa('')
      reload()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const subtotal = cartSubtotal(cart)
  const total = cartTotal(cart)
  const preview = buildStockMovements(cart, ctx)
  const comissaoPreview = drinkBackCommission(activeAgent, cart)

  return (
    <div className="pos-checkout-grid">
      <div>
        {lastResult && (
          <PortalAlert variant="green">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{t('pos.saleRegistered', { amount: fmtYen(lastResult.total) })}</div>
                {lastResult.movimentos.length > 0 && (
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    {t('pos.stockDeducted')}: {lastResult.movimentos.map(m => `${produtosById[m.produto_id]?.nome || m.produto_id.slice(0, 6)} −${fmtQty(m.qtd)}`).join(' · ')}
                  </div>
                )}
                {lastResult.comissaoDb > 0 && <div style={{ fontSize: 12, marginTop: 2 }}>{t('pos.commissionRegistered', { amount: fmtYen(lastResult.comissaoDb) })}</div>}
                {lastResult.reorder?.candidates?.length > 0 && (
                  <div style={{ fontSize: 12, marginTop: 6, fontWeight: 600 }}>
                    🔁 {t('pos.reorderTriggered', { count: lastResult.reorder.candidates.length })}
                    {lastResult.reorder.pedido && <> · {t('pos.reorderOrderCreated')}</>}
                    {lastResult.reorder.webhook?.sent && <> · {t('pos.webhookSent')}</>}
                    <button onClick={() => onTab('stock')} style={{ marginLeft: 8, fontSize: 11, padding: '2px 10px', borderRadius: 8 }}>{t('pos.viewStock')}</button>
                  </div>
                )}
              </div>
              <button onClick={() => setLastResult(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, alignSelf: 'flex-start' }}>✕</button>
            </div>
          </PortalAlert>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {['regular', 'vip', 'codigo'].map(pt => (
            <button key={pt} onClick={() => { setPriceType(pt); if (pt !== 'codigo') setActiveCode(null); if (pt !== 'vip') setVipId('') }} style={{
              padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: priceType === pt ? 'var(--navy)' : 'var(--bg3)', color: priceType === pt ? '#fff' : 'var(--text2)', border: 'none',
            }}>
              {pt === 'regular' ? t('pos.regularPrice') : pt === 'vip' ? t('pos.vipPrice') : t('pos.discountCode')}
            </button>
          ))}
        </div>

        {priceType === 'codigo' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input placeholder={t('pos.codePlaceholder')} value={codeInput} onChange={e => setCodeInput(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && applyCode()} style={{ flex: 1 }} />
            <button className="btn-primary" onClick={applyCode} style={{ padding: '8px 16px' }}>{t('pos.apply')}</button>
            {activeCode && <span style={{ fontSize: 12, color: 'var(--green)', alignSelf: 'center', fontWeight: 700 }}>✓ {activeCode.codigo}</span>}
          </div>
        )}

        {priceType === 'vip' && (
          <select value={vipId} onChange={e => setVipId(e.target.value)} style={{ width: '100%', marginBottom: 12 }}>
            <option value="">{t('pos.vipMemberOptional')}</option>
            {(vipMembers || []).filter(v => v.ativo).map(v => (
              <option key={v.id} value={v.id}>{v.nome}{v.codigo ? ` · ${v.codigo}` : ''}</option>
            ))}
          </select>
        )}

        {err && <PortalAlert variant="red"><div style={{ fontSize: 13 }}>{err}</div></PortalAlert>}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input placeholder={t('pos.searchDrinks')} value={search} onChange={e => setSearch(e.target.value)} style={{ flex: '1 1 200px' }} />
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ width: 'auto' }}>
            <option value="">{t('pos.allCategories')}</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {catalog.length === 0 && (
          <PortalAlert variant="amber">
            <div style={{ fontSize: 13 }}>{t('pos.emptyCatalog')} <button onClick={() => onTab('prices')} style={{ marginLeft: 8, fontSize: 11, padding: '2px 10px', borderRadius: 8 }}>{t('pos.tabPrices')}</button></div>
          </PortalAlert>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 8, maxHeight: 460, overflowY: 'auto' }}>
          {filtered.map(item => {
            const p = resolveItemPrice(item, effectivePriceType, activeCode)
            return (
              <button key={item.key} onClick={() => addToCart(item)} className="pos-item-btn" style={{
                textAlign: 'left', padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{item.nome}</div>
                <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>{item.categoria}{item.kind === 'drink' && !item.hasStock ? ' · ⚠︎' : ''}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', marginTop: 6 }}>{fmtYen(p.preco)}</div>
                {p.preco_lista > p.preco && <div style={{ fontSize: 10, color: 'var(--text3)', textDecoration: 'line-through' }}>{fmtYen(p.preco_lista)}</div>}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 16, position: 'sticky', top: 0, alignSelf: 'start' }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>{t('pos.cart')}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div>
            <label className="form-label">{t('pos.staffMember')}</label>
            <select value={staffId} onChange={e => setStaffId(e.target.value)} style={{ width: '100%' }}>
              <option value="">—</option>
              {staff.filter(s => s.ativo).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">{t('pos.drinkBackAgent')}</label>
            <select value={agentId} onChange={e => setAgentId(e.target.value)} style={{ width: '100%' }}>
              <option value="">—</option>
              {agents.filter(a => a.ativo).map(a => <option key={a.id} value={a.id}>{a.apelido || a.nome}</option>)}
            </select>
          </div>
        </div>
        <input placeholder={t('pos.tablePlaceholder')} value={mesa} onChange={e => setMesa(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />

        {cart.length === 0 ? <div style={{ color: 'var(--text3)', fontSize: 13 }}>{t('pos.tapToAdd')}</div> : (
          <>
            {cart.map((it, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13, gap: 6 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.nome}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>{t(`pos.priceType.${it.tipo_preco}`)} × {it.qtd}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => changeQty(i, -1)} style={{ width: 24, height: 24, borderRadius: 6, padding: 0 }}>−</button>
                  <span style={{ minWidth: 16, textAlign: 'center' }}>{it.qtd}</span>
                  <button onClick={() => changeQty(i, 1)} style={{ width: 24, height: 24, borderRadius: 6, padding: 0 }}>+</button>
                  <strong style={{ minWidth: 60, textAlign: 'right' }}>{fmtYen(it.preco_unitario * it.qtd)}</strong>
                  <button onClick={() => setCart(c => c.filter((_, j) => j !== i))} style={{ color: 'var(--red)', border: 'none', background: 'none', cursor: 'pointer', padding: '0 4px' }}>✕</button>
                </div>
              </div>
            ))}

            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text2)', display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('common.subtotal')}</span><span>{fmtYen(subtotal)}</span>
            </div>
            {subtotal > total && (
              <div style={{ fontSize: 12, color: 'var(--green)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{t('pos.discount')}</span><span>−{fmtYen(subtotal - total)}</span>
              </div>
            )}
            {comissaoPreview > 0 && (
              <div style={{ fontSize: 12, color: 'var(--gold)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{t('pos.drinkBackCommission')}</span><span>{fmtYen(comissaoPreview)}</span>
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: 20, fontWeight: 800, textAlign: 'right' }}>{fmtYen(total)}</div>

            {preview.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text2)', background: 'var(--bg3)', borderRadius: 8, padding: '6px 10px' }}>
                📦 {t('pos.stockPreview')}: {preview.map(m => `${produtosById[m.produto_id]?.nome || '?'} −${fmtQty(m.qtd)}`).join(' · ')}
              </div>
            )}

            <select value={payMethod} onChange={e => setPayMethod(e.target.value)} style={{ width: '100%', marginTop: 12 }}>
              {PAY_METHODS.map(m => <option key={m}>{m}</option>)}
            </select>
            <button className="btn-primary" onClick={completeSale} disabled={saving} style={{ width: '100%', marginTop: 12, padding: 12, borderRadius: 12 }}>
              {saving ? t('common.saving') : t('pos.registerPosSale')}
            </button>
            <button onClick={() => setCart([])} style={{ width: '100%', marginTop: 8, padding: 8, borderRadius: 10, fontSize: 12 }}>{t('pos.clearCart')}</button>
          </>
        )}
      </div>
    </div>
  )
}
