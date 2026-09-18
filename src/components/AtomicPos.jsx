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
  buildHourlyBuckets,
  analyzePeakAndIdleHours,
} from '../lib/atomicPos'
import { useI18n } from '../lib/i18n'

const SUB_TAB_IDS = [
  { id: 'checkout', key: 'tabCheckout', icon: '🧾' },
  { id: 'analytics', key: 'tabAnalytics', icon: '📊' },
  { id: 'drinkback', key: 'tabDrinkBack', icon: '💃' },
  { id: 'staff', key: 'tabStaff', icon: '👥' },
  { id: 'services', key: 'tabServices', icon: '🧹' },
  { id: 'reorder', key: 'tabReorder', icon: '📦' },
  { id: 'prices', key: 'tabPrices', icon: '🍹' },
  { id: 'vip', key: 'tabVip', icon: '⭐' },
  { id: 'discounts', key: 'tabDiscounts', icon: '🏷️' },
]

function SetupBanner({ onRefresh }) {
  const { t } = useI18n()
  const [setup, setSetup] = useState(null)
  useEffect(() => { fetchPosSetupStatus().then(setSetup) }, [])
  if (setup?.ready || setup?.tables?.pos_vendas === 'ok') return null
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

// ── 1. CHECKOUT (CAIXA RÁPIDO DO BAR) ──────────────────────────────────────────
function PosCheckoutTab({ bar, drinks, shots, discountCodes, vipMembers, staffList, promotersList, onSale }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [cart, setCart] = useState([])
  const [search, setSearch] = useState('')
  const [priceType, setPriceType] = useState('regular')
  const [codeInput, setCodeInput] = useState('')
  const [activeCode, setActiveCode] = useState(null)
  const [vipId, setVipId] = useState('')
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [selectedPromoterId, setSelectedPromoterId] = useState('')
  const [payMethod, setPayMethod] = useState('Cash')
  const [saving, setSaving] = useState(false)
  const [reorderNotification, setReorderNotification] = useState(null)

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

  // Cálculo da comissão de drink back para promoter selecionada
  const selectedPromoter = useMemo(() => {
    return (promotersList || []).find(p => p.id === selectedPromoterId)
  }, [promotersList, selectedPromoterId])

  const comissaoDrinkBackTotal = useMemo(() => {
    if (!selectedPromoter || !cart.length) return 0
    return cart.reduce((acc, it) => {
      const fixa = Number(selectedPromoter.comissao_drink_fixa || 0) * it.qtd
      const pct = Math.round((it.preco_unitario * it.qtd) * (Number(selectedPromoter.comissao_pct || 0) / 100))
      return acc + (fixa > 0 ? fixa : pct)
    }, 0)
  }, [selectedPromoter, cart])

  async function completeSale() {
    if (!cart.length) return
    setSaving(true)
    setReorderNotification(null)

    const subtotal = cart.reduce((a, it) => a + (it.preco_lista || it.preco_unitario) * it.qtd, 0)
    const total = cartTotal(cart)
    const desconto = subtotal - total
    const tipo = priceType === 'vip' || vipId ? 'vip' : activeCode ? 'desconto' : 'balcao'

    const now = new Date()
    const horaAtual = now.toTimeString().slice(0, 8)

    const { data: venda, error } = await supabase.from('pos_vendas').insert({
      bar_id: bar.id,
      data: todayKey(),
      hora: horaAtual,
      subtotal,
      desconto_total: desconto,
      total,
      metodo_pagamento: payMethod,
      tipo,
      vip_member_id: vipId || null,
      discount_code_id: activeCode?.id || null,
      staff_id: selectedStaffId || null,
      drink_back_agent_id: selectedPromoterId || null,
      comissao_drink_back: comissaoDrinkBackTotal,
      criado_por: user?.id,
    }).select().single()

    if (error) { alert(error.message); setSaving(false); return }

    await supabase.from('pos_vendas_itens').insert(
      cart.map(it => {
        let comissaoItem = 0
        if (selectedPromoter) {
          const fixa = Number(selectedPromoter.comissao_drink_fixa || 0) * it.qtd
          const pct = Math.round((it.preco_unitario * it.qtd) * (Number(selectedPromoter.comissao_pct || 0) / 100))
          comissaoItem = fixa > 0 ? fixa : pct
        }
        return {
          pos_venda_id: venda.id,
          drink_menu_id: it.drink_menu_id,
          produto_id: it.produto_id,
          nome: it.nome,
          qtd: it.qtd,
          preco_unitario: it.preco_unitario,
          preco_lista: it.preco_lista,
          tipo_preco: it.tipo_preco,
          desconto_valor: it.desconto_valor || 0,
          drink_back_agent_id: selectedPromoterId || null,
          comissao_item: comissaoItem,
        }
      })
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

    // Baixa de estoque pós-venda via endpoint de reposição automática
    try {
      const itemsToDeduct = cart.filter(c => c.produto_id).map(c => ({
        produto_id: c.produto_id,
        qtd: c.qtd,
        nome: c.nome,
      }))
      if (itemsToDeduct.length > 0) {
        const res = await fetch('/api/pos-reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bar_id: bar.id,
            items: itemsToDeduct,
          }),
        })
        const resData = await res.json()
        if (resData?.triggered_reorder && resData?.alerts?.length > 0) {
          setReorderNotification(resData.alerts)
        }
      }
    } catch {
      // Ignora falhas de endpoint para não travar a venda
    }

    setCart([])
    setActiveCode(null)
    setCodeInput('')
    setSaving(false)
    onSale?.()
    alert(t('atomicPos.saleRegistered', { amount: fmtYen(total) }))
  }

  return (
    <div>
      {reorderNotification && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12, padding: 14, marginBottom: 16, color: '#991b1b', fontSize: 13 }}>
          <strong>⚠️ Alerta de Estoque Baixo / Reposição Gerada:</strong>
          <div style={{ marginTop: 6 }}>
            {reorderNotification.map(a => (
              <span key={a.produto_id} style={{ display: 'inline-block', marginRight: 12, fontWeight: 600 }}>
                {a.nome}: Restam {a.stock_atual} un (mínimo {a.minimo}) → Reposição sugerida: {a.qtd_sugerida} un
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        <div>
          {/* Seletor de Staff e Promoter Drink Back */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                👤 {t('atomicPos.staffMember')}
              </label>
              <select value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)} style={{ width: '100%' }}>
                <option value="">{t('atomicPos.selectPlaceholder')}</option>
                {(staffList || []).filter(s => s.ativo).map(s => (
                  <option key={s.id} value={s.id}>{s.nome} ({s.cargo})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                💃 {t('atomicPos.promoter')}
              </label>
              <select value={selectedPromoterId} onChange={e => setSelectedPromoterId(e.target.value)} style={{ width: '100%' }}>
                <option value="">{t('atomicPos.selectPlaceholder')}</option>
                {(promotersList || []).filter(p => p.ativo).map(p => (
                  <option key={p.id} value={p.id}>{p.nome} ({p.regiao || 'Tokyo'})</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {['regular', 'vip', 'codigo'].map(pt => (
              <button key={pt} onClick={() => { setPriceType(pt); if (pt !== 'codigo') setActiveCode(null) }} style={{
                padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: priceType === pt ? 'var(--navy)' : 'var(--bg3)',
                color: priceType === pt ? '#fff' : 'var(--text2)', border: 'none',
              }}>
                {pt === 'regular' ? t('atomicPos.regularPrice') : pt === 'vip' ? t('atomicPos.vipPrice') : t('atomicPos.discountCode')}
              </button>
            ))}
          </div>

          {priceType === 'codigo' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input placeholder={t('atomicPos.codePlaceholder')} value={codeInput} onChange={e => setCodeInput(e.target.value.toUpperCase())} style={{ flex: 1 }} />
              <button className="btn-primary" onClick={applyCode} style={{ padding: '8px 16px' }}>{t('atomicPos.apply')}</button>
              {activeCode && <span style={{ fontSize: 12, color: 'var(--green)', alignSelf: 'center' }}>✓ {activeCode.codigo}</span>}
            </div>
          )}

          {priceType === 'vip' && (
            <select value={vipId} onChange={e => setVipId(e.target.value)} style={{ width: '100%', marginBottom: 12 }}>
              <option value="">{t('atomicPos.vipMemberOptional')}</option>
              {(vipMembers || []).filter(v => v.ativo).map(v => (
                <option key={v.id} value={v.id}>{v.nome}{v.codigo ? ` · ${v.codigo}` : ''}</option>
              ))}
            </select>
          )}

          <input placeholder={t('atomicPos.searchDrinks')} value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />

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
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>{t('atomicPos.cart')}</div>
          {cart.length === 0 ? <div style={{ color: 'var(--text3)', fontSize: 13 }}>{t('atomicPos.tapToAdd')}</div> : (
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

              <div style={{ marginTop: 14, paddingTop: 10, borderTop: '2px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text2)' }}>
                  <span>Subtotal:</span>
                  <span>{fmtYen(cart.reduce((a, it) => a + (it.preco_lista || it.preco_unitario) * it.qtd, 0))}</span>
                </div>
                {comissaoDrinkBackTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--gold)', marginTop: 4, fontWeight: 600 }}>
                    <span>💃 Comissão Drink Back:</span>
                    <span>{fmtYen(comissaoDrinkBackTotal)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>
                  <span>Total:</span>
                  <span>{fmtYen(cartTotal(cart))}</span>
                </div>
              </div>

              <select value={payMethod} onChange={e => setPayMethod(e.target.value)} style={{ width: '100%', marginTop: 12 }}>
                {['Cash', 'Credit card', 'Debit card', 'PayPay', 'Transfer'].map(m => <option key={m}>{m}</option>)}
              </select>
              <button className="btn-primary" onClick={completeSale} disabled={saving} style={{ width: '100%', marginTop: 12, padding: 12, borderRadius: 12 }}>
                {saving ? t('common.saving') : t('atomicPos.registerPosSale')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 2. FATURAMENTO POR HORA & OCIOSIDADE ───────────────────────────────────────
function PosHourlyAnalyticsTab({ bar, onAddPromotion }) {
  const [sales, setSales] = useState([])
  const [filterPeriod, setFilterPeriod] = useState('today')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSales()
  }, [bar, filterPeriod])

  async function loadSales() {
    setLoading(true)
    let query = supabase.from('pos_vendas').select('*').eq('bar_id', bar.id)
    if (filterPeriod === 'today') {
      query = query.eq('data', todayKey())
    } else if (filterPeriod === '7days') {
      const d = new Date()
      d.setDate(d.getDate() - 7)
      query = query.gte('data', d.toISOString().slice(0, 10))
    }
    const { data } = await query.order('hora', { ascending: true })
    setSales(data || [])
    setLoading(false)
  }

  const buckets = useMemo(() => buildHourlyBuckets(sales), [sales])
  const analysis = useMemo(() => analyzePeakAndIdleHours(buckets), [buckets])
  const totalRevenue = useMemo(() => sales.reduce((acc, s) => acc + (+s.total || 0), 0), [sales])
  const ticketMedioGeral = sales.length > 0 ? Math.round(totalRevenue / sales.length) : 0
  const maxBucketVal = Math.max(...buckets.map(b => b.total), 1)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Faturamento por Hora & Análise de Ociosidade</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
            Identifique horários de pico e ative promoções em horários de menor movimento
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['today', 'Hoje'], ['7days', 'Últimos 7 dias'], ['all', 'Tudo']].map(([val, label]) => (
            <button key={val} onClick={() => setFilterPeriod(val)} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: filterPeriod === val ? 'var(--navy)' : 'var(--bg2)',
              color: filterPeriod === val ? 'white' : 'var(--text2)',
              border: '1px solid var(--border)', cursor: 'pointer'
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase' }}>Faturamento</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)', marginTop: 4 }}>{fmtYen(totalRevenue)}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{sales.length} vendas</div>
        </div>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase' }}>Ticket Médio</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--navy)', marginTop: 4 }}>{fmtYen(ticketMedioGeral)}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>por comanda</div>
        </div>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase' }}>🔥 Horário de Pico</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gold)', marginTop: 4 }}>
            {analysis.peakHour ? `${analysis.peakHour.label} (${fmtYen(analysis.peakHour.total)})` : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>maior faturamento</div>
        </div>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase' }}>💤 Horários Ociosos</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--amber)', marginTop: 4 }}>
            {analysis.idleHours?.length ? `${analysis.idleHours.map(h => h.label).join(', ')}` : 'Nenhum'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>oportunidade promo</div>
        </div>
      </div>

      {/* Gráfico de Barras Hora a Hora */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Distribuição do Faturamento por Faixa Horária</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 160, paddingBottom: 24, position: 'relative' }}>
          {buckets.map(b => {
            const hPct = Math.max(4, Math.round((b.total / maxBucketVal) * 120))
            const isPeak = analysis.peakHour?.hour === b.hour
            const isIdle = analysis.idleHours?.some(ih => ih.hour === b.hour)
            return (
              <div key={b.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: isPeak ? 'var(--gold)' : 'var(--text3)' }}>
                  {b.total > 0 ? fmtYen(b.total) : ''}
                </div>
                <div style={{
                  width: '100%', height: hPct, borderRadius: 4,
                  background: isPeak ? 'var(--gold)' : isIdle ? 'var(--bg4)' : 'var(--navy)',
                  transition: 'height 0.3s'
                }} />
                <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 600 }}>{b.label}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Monetização de Horários Ociosos */}
      <div style={{ background: 'linear-gradient(135deg, rgba(193,156,86,0.1) 0%, rgba(0,16,40,0.05) 100%)', border: '1px solid var(--gold)', borderRadius: 16, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>💡 Monetização de Horários Ociosos</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4, maxWidth: 580, lineHeight: 1.5 }}>
              Os horários <strong>{analysis.idleHours?.map(h => h.label).join(', ') || 'iniciais'}</strong> apresentam menor volume de clientes.
              Crie uma promoção de Happy Hour automática (ex: 20% off ou dose dupla) para atrair público antes do horário de pico.
            </div>
          </div>
          <button
            className="btn-primary"
            onClick={() => onAddPromotion?.({
              codigo: generateDiscountCode('HAPPY'),
              descricao: 'Happy Hour Horário Ocioso (18h-20h)',
              tipo: 'percent',
              valor: '20',
            })}
            style={{ padding: '10px 18px', borderRadius: 10, fontSize: 12 }}
          >
            🏷️ Criar Código Happy Hour
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 3. GESTÃO DE DRINK BACK (PROMOTERS / HOSTESSES) ────────────────────────────
function PosDrinkBackTab({ bar, promotersList, onRefresh }) {
  const [promoters, setPromoters] = useState(promotersList || [])
  const [salesWithPromoters, setSalesWithPromoters] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ nome: '', apelido: '', regiao: 'Tokyo', telefone: '', chave_pix_ou_conta: '', comissao_drink_fixa: 500, comissao_pct: 10, metas_mensal_drinks: 50 })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadPromotersData()
  }, [bar])

  async function loadPromotersData() {
    const [{ data: pr }, { data: sl }] = await Promise.all([
      supabase.from('drink_back_agents').select('*').eq('bar_id', bar.id).order('nome'),
      supabase.from('pos_vendas').select('id, data, hora, total, drink_back_agent_id, comissao_drink_back').eq('bar_id', bar.id).not('drink_back_agent_id', 'is', null)
    ])
    setPromoters(pr || [])
    setSalesWithPromoters(sl || [])
  }

  async function savePromoter() {
    if (!form.nome) return alert('Nome é obrigatório')
    setSaving(true)
    await supabase.from('drink_back_agents').insert({
      bar_id: bar.id,
      nome: form.nome,
      apelido: form.apelido || null,
      regiao: form.regiao || 'Tokyo',
      telefone: form.telefone || null,
      chave_pix_ou_conta: form.chave_pix_ou_conta || null,
      comissao_drink_fixa: +form.comissao_drink_fixa || 0,
      comissao_pct: +form.comissao_pct || 0,
      metas_mensal_drinks: +form.metas_mensal_drinks || 50,
      ativo: true,
    })
    setSaving(false)
    setShowModal(false)
    setForm({ nome: '', apelido: '', regiao: 'Tokyo', telefone: '', chave_pix_ou_conta: '', comissao_drink_fixa: 500, comissao_pct: 10, metas_mensal_drinks: 50 })
    loadPromotersData()
    onRefresh?.()
  }

  const promoterStats = useMemo(() => {
    const stats = {}
    promoters.forEach(p => {
      stats[p.id] = { ...p, totalVendas: 0, totalComissao: 0, qtdVendas: 0 }
    })
    salesWithPromoters.forEach(s => {
      if (stats[s.drink_back_agent_id]) {
        stats[s.drink_back_agent_id].totalVendas += (+s.total || 0)
        stats[s.drink_back_agent_id].totalComissao += (+s.comissao_drink_back || 0)
        stats[s.drink_back_agent_id].qtdVendas += 1
      }
    })
    return Object.values(stats).sort((a, b) => b.totalComissao - a.totalComissao)
  }, [promoters, salesWithPromoters])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Gestão de Drink Back (Promoters & Hostesses)</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
            Mapeamento regional, comissões automáticas por venda e controle de metas
          </div>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)} style={{ padding: '8px 16px' }}>
          + Cadastrar Promoter
        </button>
      </div>

      {showModal && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Nova Promoter / Hostess</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
            <input placeholder="Nome *" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
            <input placeholder="Apelido / Nome artístico" value={form.apelido} onChange={e => setForm({ ...form, apelido: e.target.value })} />
            <select value={form.regiao} onChange={e => setForm({ ...form, regiao: e.target.value })}>
              {['Tokyo', 'Roppongi', 'Shinjuku', 'Shibuya', 'Ginza', 'Ikebukuro', 'Outro'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <input placeholder="Telefone" value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} />
            <input placeholder="Comissão fixa por drink (¥)" type="number" value={form.comissao_drink_fixa} onChange={e => setForm({ ...form, comissao_drink_fixa: e.target.value })} />
            <input placeholder="Meta mensal (drinks)" type="number" value={form.metas_mensal_drinks} onChange={e => setForm({ ...form, metas_mensal_drinks: e.target.value })} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }}>Cancelar</button>
            <button className="btn-primary" onClick={savePromoter} disabled={saving}>Salvar</button>
          </div>
        </div>
      )}

      {promoterStats.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Nenhuma promoter cadastrada ainda.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {promoterStats.map(p => {
            const metaPct = Math.min(100, Math.round((p.qtdVendas / (p.metas_mensal_drinks || 1)) * 100))
            return (
              <div key={p.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{p.nome} {p.apelido && <span style={{ color: 'var(--text2)', fontSize: 13 }}>({p.apelido})</span>}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>📍 {p.regiao}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 12, background: 'rgba(193,156,86,0.15)', color: 'var(--gold)' }}>
                    ¥{p.comissao_drink_fixa}/drink
                  </span>
                </div>

                <div style={{ margin: '14px 0', padding: '10px', background: 'var(--bg3)', borderRadius: 10, display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase' }}>Vendas POS</div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{p.qtdVendas} pedidos</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase' }}>Comissão a Pagar</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--green)' }}>{fmtYen(p.totalComissao)}</div>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>
                    <span>Meta: {p.qtdVendas}/{p.metas_mensal_drinks} drinks</span>
                    <span style={{ fontWeight: 700 }}>{metaPct}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${metaPct}%`, background: 'var(--gold)', borderRadius: 3 }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── 4. GESTÃO DE STAFF, CUSTOS E TURNOS ────────────────────────────────────────
function PosStaffTab({ bar, staffList, onRefresh }) {
  const [staff, setStaff] = useState(staffList || [])
  const [turnos, setTurnos] = useState([])
  const [showStaffForm, setShowStaffForm] = useState(false)
  const [showShiftForm, setShowShiftForm] = useState(false)
  const [staffForm, setStaffForm] = useState({ nome: '', cargo: 'Bartender', telefone: '', email: '', salario_base: '', comissao_pct: '' })
  const [shiftForm, setShiftForm] = useState({ staff_id: '', data: todayKey(), hora_inicio: '18:00', hora_fim: '02:00', status: 'agendado', valor_turno: '10000', notas: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadStaffData()
  }, [bar])

  async function loadStaffData() {
    const [{ data: st }, { data: tu }] = await Promise.all([
      supabase.from('bar_staff').select('*').eq('bar_id', bar.id).order('nome'),
      supabase.from('staff_turnos').select('*, bar_staff(nome, cargo)').eq('bar_id', bar.id).order('data', { ascending: false }).limit(30)
    ])
    setStaff(st || [])
    setTurnos(tu || [])
  }

  async function saveStaff() {
    if (!staffForm.nome) return alert('Nome é obrigatório')
    setSaving(true)
    await supabase.from('bar_staff').insert({
      bar_id: bar.id,
      nome: staffForm.nome,
      cargo: staffForm.cargo || 'Bartender',
      telefone: staffForm.telefone || null,
      email: staffForm.email || null,
      salario_base: +staffForm.salario_base || 0,
      comissao_pct: +staffForm.comissao_pct || 0,
      ativo: true,
    })
    setSaving(false)
    setShowStaffForm(false)
    setStaffForm({ nome: '', cargo: 'Bartender', telefone: '', email: '', salario_base: '', comissao_pct: '' })
    loadStaffData()
    onRefresh?.()
  }

  async function saveShift() {
    if (!shiftForm.staff_id) return alert('Selecione o funcionário')
    setSaving(true)
    await supabase.from('staff_turnos').insert({
      bar_id: bar.id,
      staff_id: shiftForm.staff_id,
      data: shiftForm.data,
      hora_inicio: shiftForm.hora_inicio,
      hora_fim: shiftForm.hora_fim,
      status: shiftForm.status,
      valor_turno: +shiftForm.valor_turno || 0,
      notas: shiftForm.notas || null,
    })
    setSaving(false)
    setShowShiftForm(false)
    loadStaffData()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Gestão de Staff, Custos e Escalas</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
            Controle da equipe do bar, escalas de trabalho e custos operacionais
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowShiftForm(true)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer' }}>
            📅 + Agendar Turno
          </button>
          <button className="btn-primary" onClick={() => setShowStaffForm(true)} style={{ padding: '8px 16px' }}>
            👤 + Novo Funcionário
          </button>
        </div>
      </div>

      {showStaffForm && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Novo Membro da Equipe</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
            <input placeholder="Nome *" value={staffForm.nome} onChange={e => setStaffForm({ ...staffForm, nome: e.target.value })} />
            <select value={staffForm.cargo} onChange={e => setStaffForm({ ...staffForm, cargo: e.target.value })}>
              {['Bartender', 'Caixa', 'Garçom', 'Gerente', 'Segurança', 'Cozinha', 'Outro'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input placeholder="Telefone" value={staffForm.telefone} onChange={e => setStaffForm({ ...staffForm, telefone: e.target.value })} />
            <input placeholder="Salário base mensal (¥)" type="number" value={staffForm.salario_base} onChange={e => setStaffForm({ ...staffForm, salario_base: e.target.value })} />
            <input placeholder="Comissão vendas (%)" type="number" value={staffForm.comissao_pct} onChange={e => setStaffForm({ ...staffForm, comissao_pct: e.target.value })} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setShowStaffForm(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }}>Cancelar</button>
            <button className="btn-primary" onClick={saveStaff} disabled={saving}>Salvar Funcionário</button>
          </div>
        </div>
      )}

      {showShiftForm && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Agendar Turno de Trabalho</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
            <select value={shiftForm.staff_id} onChange={e => setShiftForm({ ...shiftForm, staff_id: e.target.value })}>
              <option value="">Selecione o funcionário...</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.nome} ({s.cargo})</option>)}
            </select>
            <input type="date" value={shiftForm.data} onChange={e => setShiftForm({ ...shiftForm, data: e.target.value })} />
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="time" value={shiftForm.hora_inicio} onChange={e => setShiftForm({ ...shiftForm, hora_inicio: e.target.value })} />
              <input type="time" value={shiftForm.hora_fim} onChange={e => setShiftForm({ ...shiftForm, hora_fim: e.target.value })} />
            </div>
            <input placeholder="Valor do turno / diária (¥)" type="number" value={shiftForm.valor_turno} onChange={e => setShiftForm({ ...shiftForm, valor_turno: e.target.value })} />
            <select value={shiftForm.status} onChange={e => setShiftForm({ ...shiftForm, status: e.target.value })}>
              <option value="agendado">Agendado</option>
              <option value="presente">Presente</option>
              <option value="concluido">Concluído</option>
              <option value="falta">Falta</option>
            </select>
            <input placeholder="Notas (ex: fechamento)" value={shiftForm.notas} onChange={e => setShiftForm({ ...shiftForm, notas: e.target.value })} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setShowShiftForm(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }}>Cancelar</button>
            <button className="btn-primary" onClick={saveShift} disabled={saving}>Confirmar Turno</button>
          </div>
        </div>
      )}

      {/* Tabela de Staff */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Equipe ({staff.length})</div>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text2)', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Nome</th>
              <th>Cargo</th>
              <th>Telefone</th>
              <th>Salário Base</th>
              <th>Comissão</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {staff.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 8, fontWeight: 600 }}>{s.nome}</td>
                <td><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: 'var(--bg3)' }}>{s.cargo}</span></td>
                <td style={{ color: 'var(--text2)' }}>{s.telefone || '—'}</td>
                <td>{s.salario_base > 0 ? fmtYen(s.salario_base) : 'Diária'}</td>
                <td>{s.comissao_pct > 0 ? `${s.comissao_pct}%` : '—'}</td>
                <td><span style={{ color: 'var(--green)', fontSize: 11, fontWeight: 700 }}>● Ativo</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Escala Recente */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Escala de Turnos Recentes</div>
        {turnos.length === 0 ? <div style={{ color: 'var(--text3)', fontSize: 13 }}>Nenhum turno cadastrado.</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {turnos.map(t => (
              <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--bg3)' }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{t.bar_staff?.nome}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>{t.bar_staff?.cargo} · {fmtDate(t.data)}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginTop: 6 }}>
                  ⏰ {t.hora_inicio} - {t.hora_fim}
                </div>
                <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700, marginTop: 4 }}>
                  Diária: {fmtYen(t.valor_turno)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 5. SERVIÇOS INTEGRADOS (LIMPEZA & MANUTENÇÃO) ──────────────────────────────
function PosServicesTab({ bar }) {
  const [orders, setOrders] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    tipo: 'limpeza',
    titulo: 'Limpeza Pesada de Cozinha e Sanitização',
    descricao: '',
    prioridade: 'media',
    data_agendada: todayKey(),
    hora_agendada: '09:00',
    valor_estimado: '25000',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadServices()
  }, [bar])

  async function loadServices() {
    const { data } = await supabase.from('service_orders').select('*').eq('bar_id', bar.id).order('criado_em', { ascending: false })
    setOrders(data || [])
  }

  async function createServiceOrder() {
    if (!form.titulo) return alert('Título é obrigatório')
    setSaving(true)
    await supabase.from('service_orders').insert({
      bar_id: bar.id,
      tipo: form.tipo,
      titulo: form.titulo,
      descricao: form.descricao || null,
      prioridade: form.prioridade,
      status: 'solicitado',
      data_agendada: form.data_agendada || null,
      hora_agendada: form.hora_agendada || null,
      valor_estimado: +form.valor_estimado || 0,
    })
    setSaving(false)
    setShowModal(false)
    loadServices()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Serviços Integrados (Limpeza & Manutenção Preventiva)</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
            Agende limpezas especializadas para bares, manutenção de chopeira e refrigeração
          </div>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)} style={{ padding: '8px 16px' }}>
          🧹 + Solicitar Serviço
        </button>
      </div>

      {showModal && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Nova Ordem de Serviço</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
            <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
              <option value="limpeza">Limpeza Profissional Pesada</option>
              <option value="chopeira">Sanitização e Bicos de Chopp</option>
              <option value="manutencao">Manutenção Refrigeração/Balcão</option>
              <option value="eletrica">Elétrica & Iluminação</option>
              <option value="outro">Outro Serviço</option>
            </select>
            <input placeholder="Título do serviço *" value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} />
            <select value={form.prioridade} onChange={e => setForm({ ...form, prioridade: e.target.value })}>
              <option value="baixa">Prioridade Baixa</option>
              <option value="media">Prioridade Média</option>
              <option value="alta">Prioridade Alta</option>
              <option value="urgente">🚨 Urgente</option>
            </select>
            <input type="date" value={form.data_agendada} onChange={e => setForm({ ...form, data_agendada: e.target.value })} />
            <input type="time" value={form.hora_agendada} onChange={e => setForm({ ...form, hora_agendada: e.target.value })} />
            <input placeholder="Valor estimado (¥)" type="number" value={form.valor_estimado} onChange={e => setForm({ ...form, valor_estimado: e.target.value })} />
          </div>
          <textarea
            placeholder="Detalhes ou observações para a equipe de manutenção..."
            value={form.descricao}
            onChange={e => setForm({ ...form, descricao: e.target.value })}
            style={{ width: '100%', minHeight: 60, marginBottom: 12 }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }}>Cancelar</button>
            <button className="btn-primary" onClick={createServiceOrder} disabled={saving}>Enviar Solicitação</button>
          </div>
        </div>
      )}

      {orders.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Nenhum serviço solicitado até o momento.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {orders.map(o => (
            <div key={o.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: 'var(--bg3)', textTransform: 'uppercase' }}>{o.tipo}</span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{o.titulo}</span>
                  {o.prioridade === 'urgente' && <span style={{ fontSize: 10, background: '#fee2e2', color: '#b91c1c', padding: '2px 6px', borderRadius: 6, fontWeight: 700 }}>🚨 Urgente</span>}
                </div>
                {o.descricao && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{o.descricao}</div>}
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  Agendado para: <strong>{fmtDate(o.data_agendada)} às {o.hora_agendada || '09:00'}</strong>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>{fmtYen(o.valor_estimado)}</div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12, background: o.status === 'concluido' ? '#dcfce7' : '#fef3c7', color: o.status === 'concluido' ? '#15803d' : '#b45309', display: 'inline-block', marginTop: 4 }}>
                  {o.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 6. ESTOQUE INTELIGENTE & REPOSIÇÃO JBM ─────────────────────────────────────
function PosReorderTab({ bar }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [ordering, setOrdering] = useState(false)

  useEffect(() => {
    loadReorderData()
  }, [bar])

  async function loadReorderData() {
    setLoading(true)
    try {
      const res = await fetch(`/api/pos-reorder?bar_id=${bar.id}`)
      const json = await res.json()
      setData(json)
      setWebhookUrl(json?.settings?.webhook_url || '')
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  async function saveSettings() {
    setSavingSettings(true)
    try {
      await fetch('/api/pos-reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'saveSettings',
          bar_id: bar.id,
          settings: { webhook_url: webhookUrl, auto_order_jbm: true },
        }),
      })
      alert('Configurações salvas!')
    } catch {
      alert('Erro ao salvar')
    }
    setSavingSettings(false)
  }

  async function createJbmOrder(items) {
    if (!items?.length) return
    setOrdering(true)
    try {
      const res = await fetch('/api/pos-reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createJbmOrder',
          bar_id: bar.id,
          order_items: items.map(it => ({
            produto_id: it.id,
            qtd: it.qtd_sugerida,
            preco_unitario: it.preco_venda || 0,
          })),
        }),
      })
      const json = await res.json()
      if (json.ok) {
        alert(`Pedido gerado com sucesso para a JBM Drinks! Total estimado: ${fmtYen(json.total)}`)
        loadReorderData()
      } else {
        alert(json.error || 'Erro ao gerar pedido')
      }
    } catch (e) {
      alert(e.message)
    }
    setOrdering(false)
  }

  if (loading) return <Spinner text="Carregando estoque..." />

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Estoque Inteligente & Reposição Automática de Bebidas</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
            Baixas automáticas no POS, alerta de nível mínimo e gatilho de compra direto para a JBM Drinks
          </div>
        </div>
        {data?.low_stock_products?.length > 0 && (
          <button
            className="btn-primary"
            onClick={() => createJbmOrder(data.low_stock_products)}
            disabled={ordering}
            style={{ padding: '8px 16px' }}
          >
            🛒 Repor Todos com JBM ({data.low_stock_products.length})
          </button>
        )}
      </div>

      {/* Alerta de Produtos com Estoque Baixo */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          {data?.low_stock_products?.length > 0 ? (
            <span style={{ color: 'var(--red)' }}>⚠️ {data.low_stock_products.length} itens precisam de reposição</span>
          ) : (
            <span style={{ color: 'var(--green)' }}>✅ Todos os produtos estão com estoque regular</span>
          )}
        </div>

        {data?.low_stock_products?.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {data.low_stock_products.map(p => (
              <div key={p.id} style={{ border: '1px solid #fca5a5', background: '#fef2f2', borderRadius: 12, padding: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#991b1b' }}>{p.nome}</div>
                <div style={{ fontSize: 11, color: '#7f1d1d', marginTop: 2 }}>{p.categoria} · {p.volume_ml}ml</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12 }}>
                  <span>Estoque atual: <strong>{p.stock_atual}</strong></span>
                  <span>Mínimo: <strong>{p.minimo}</strong></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>Sugerido: {p.qtd_sugerida} un</span>
                  <button
                    onClick={() => createJbmOrder([p])}
                    disabled={ordering}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'var(--navy)', color: 'white', border: 'none', cursor: 'pointer' }}
                  >
                    Pedir JBM
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Configuração de Webhook de Reposição (ex: Make.com) */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Webhook de Reposição Automática (Make.com / ERP)</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>
          Quando o estoque atingir o nível mínimo no POS, o sistema dispara um payload JSON para o seu Webhook com os dados do Bar, SKU e quantidade sugerida.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            placeholder="https://hook.make.com/..."
            value={webhookUrl}
            onChange={e => setWebhookUrl(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn-primary" onClick={saveSettings} disabled={savingSettings} style={{ padding: '8px 20px' }}>
            Salvar Webhook
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 7. PREÇOS (MENU + SHOTS) ──────────────────────────────────────────────────
function PosPricesTab({ bar, drinks, onRefresh }) {
  const [priceMode, setPriceMode] = useState('menu')
  const [produtos, setProdutos] = useState([])
  const [pricing, setPricing] = useState({})
  const [form, setForm] = useState({ nome: '', categoria: 'Cocktail', preco_venda: '', custo: '', preco_desconto: '500' })
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
    setForm({ nome: '', categoria: 'Cocktail', preco_venda: '', custo: '', preco_desconto: '500' })
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
        {[['menu', 'Drinks / Cardápio'], ['shots', 'Shots (garrafa JBM)']].map(([id, label]) => (
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
            <SectionTitle>Preço de doses de garrafas JBM</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8 }}>
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

// ── 8. MEMBROS VIP ────────────────────────────────────────────────────────────
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

      {mode === 'register' && (
        <div className="card" style={{ maxWidth: 440 }}>
          <SectionTitle>Registrar drink VIP</SectionTitle>
          <select value={usageForm.vip_member_id} onChange={e => setUsageForm({ ...usageForm, vip_member_id: e.target.value })} style={{ width: '100%', marginBottom: 12 }}>
            <option value="">Selecione o membro...</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.nome}{m.codigo ? ` · ${m.codigo}` : ''}</option>)}
          </select>
          <select value={usageForm.drink_menu_id} onChange={e => setUsageForm({ ...usageForm, drink_menu_id: e.target.value })} style={{ width: '100%', marginBottom: 12 }}>
            <option value="">Selecione o drink...</option>
            {drinks.map(d => <option key={d.id} value={d.id}>{d.nome} ({fmtYen(d.preco_desconto || 500)})</option>)}
          </select>
          <input type="number" placeholder="Quantidade" value={usageForm.qtd} onChange={e => setUsageForm({ ...usageForm, qtd: e.target.value })} style={{ width: '100%', marginBottom: 12 }} />
          <button className="btn-primary" onClick={registerUsage} disabled={saving} style={{ width: '100%', padding: 12 }}>Registrar</button>
        </div>
      )}

      {mode === 'members' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <SectionTitle>Novo membro VIP</SectionTitle>
            <input placeholder="Nome" value={memberForm.nome} onChange={e => setMemberForm({ ...memberForm, nome: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
            <input placeholder="Código do cartão (opcional)" value={memberForm.codigo} onChange={e => setMemberForm({ ...memberForm, codigo: e.target.value })} style={{ width: '100%', marginBottom: 12 }} />
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

// ── 9. CÓDIGOS DE DESCONTO ────────────────────────────────────────────────────
function PosDiscountTab({ bar, drinks, initialPromotion, onUpdate }) {
  const [codes, setCodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    codigo: initialPromotion?.codigo || generateDiscountCode(),
    descricao: initialPromotion?.descricao || '',
    tipo: initialPromotion?.tipo || 'percent',
    valor: initialPromotion?.valor || '10',
    max_usos: '',
    valido_ate: '',
    drink_menu_id: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (initialPromotion) {
      setForm(prev => ({
        ...prev,
        codigo: initialPromotion.codigo,
        descricao: initialPromotion.descricao,
        tipo: initialPromotion.tipo || 'percent',
        valor: initialPromotion.valor || '20',
      }))
    }
  }, [initialPromotion])

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

// ── MAIN PANEL ────────────────────────────────────────────────────────────────
export default function AtomicPosPanel({ bar }) {
  const { t } = useI18n()
  const [subTab, setSubTab] = useState('checkout')
  const [ready, setReady] = useState(null)
  const [drinks, setDrinks] = useState([])
  const [shots, setShots] = useState([])
  const [discountCodes, setDiscountCodes] = useState([])
  const [vipMembers, setVipMembers] = useState([])
  const [staffList, setStaffList] = useState([])
  const [promotersList, setPromotersList] = useState([])
  const [todaySales, setTodaySales] = useState({ count: 0, total: 0 })
  const [initialPromotion, setInitialPromotion] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { init() }, [bar])

  async function init() {
    setLoading(true)
    const schema = await checkPosSchema(supabase)
    setReady(schema.ready)

    const [dR, sR, cR, vR, pR, stR, prR] = await Promise.all([
      supabase.from('drink_menu').select('*').eq('bar_id', bar.id).order('nome'),
      supabase.from('bar_pricing').select('*, produtos(nome,categoria,preco_venda)').eq('bar_id', bar.id),
      schema.ready ? supabase.from('discount_codes').select('*').eq('bar_id', bar.id).eq('ativo', true) : { data: [] },
      schema.ready ? supabase.from('vip_members').select('*').eq('bar_id', bar.id).eq('ativo', true) : { data: [] },
      schema.ready ? supabase.from('pos_vendas').select('total').eq('bar_id', bar.id).eq('data', todayKey()) : { data: [] },
      schema.ready ? supabase.from('bar_staff').select('*').eq('bar_id', bar.id).eq('ativo', true) : { data: [] },
      schema.ready ? supabase.from('drink_back_agents').select('*').eq('bar_id', bar.id).eq('ativo', true) : { data: [] },
    ])
    setDrinks(dR.data || [])
    setShots(sR.data || [])
    setDiscountCodes(cR.data || [])
    setVipMembers(vR.data || [])
    setStaffList(stR.data || [])
    setPromotersList(prR.data || [])
    const sales = pR.data || []
    setTodaySales({ count: sales.length, total: sales.reduce((a, s) => a + (+s.total || 0), 0) })
    setLoading(false)
  }

  function handleAddPromotion(promo) {
    setInitialPromotion(promo)
    setSubTab('discounts')
  }

  if (loading) return <Spinner text={t('atomicPos.loading')} />

  return (
    <div className="fade-in">
      <SetupBanner onRefresh={init} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{t('atomicPos.title')}</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
            {t('atomicPos.subtitle')}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase' }}>{t('atomicPos.today')}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>{fmtYen(todaySales.total)}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>{t('atomicPos.salesCount', { count: todaySales.count })}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {SUB_TAB_IDS.map(tab => (
          <button key={tab.id} onClick={() => setSubTab(tab.id)} style={{
            padding: '9px 16px', borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: subTab === tab.id ? 'var(--navy)' : 'var(--bg2)',
            color: subTab === tab.id ? '#fff' : 'var(--text2)',
            border: subTab === tab.id ? 'none' : '1px solid var(--border)',
          }}>
            {tab.icon} {t(`atomicPos.${tab.key}`)}
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
          {subTab === 'checkout' && (
            <PosCheckoutTab
              bar={bar}
              drinks={drinks}
              shots={shots}
              discountCodes={discountCodes}
              vipMembers={vipMembers}
              staffList={staffList}
              promotersList={promotersList}
              onSale={init}
            />
          )}
          {subTab === 'analytics' && <PosHourlyAnalyticsTab bar={bar} onAddPromotion={handleAddPromotion} />}
          {subTab === 'drinkback' && <PosDrinkBackTab bar={bar} promotersList={promotersList} onRefresh={init} />}
          {subTab === 'staff' && <PosStaffTab bar={bar} staffList={staffList} onRefresh={init} />}
          {subTab === 'services' && <PosServicesTab bar={bar} />}
          {subTab === 'reorder' && <PosReorderTab bar={bar} />}
          {subTab === 'prices' && <PosPricesTab bar={bar} drinks={drinks} onRefresh={init} />}
          {subTab === 'vip' && <PosVipTab bar={bar} drinks={drinks} onUpdate={init} />}
          {subTab === 'discounts' && <PosDiscountTab bar={bar} drinks={drinks} initialPromotion={initialPromotion} onUpdate={init} />}
        </>
      )}
    </div>
  )
}
