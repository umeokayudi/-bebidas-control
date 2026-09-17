/**
 * Módulo 1 — Caixa do bar.
 *
 * Lança drinks/shots, aplica VIP e códigos de desconto, atribui a venda
 * ao atendente e à promoter de drink back, e grava tudo em `pos_vendas`.
 * Depois da venda a baixa de estoque roda e, se a automação estiver
 * ligada, a reposição dispara.
 */

import { useMemo, useState } from 'react'
import { fmtYen } from '../utils'
import { useI18n } from '../../lib/i18n'
import { resolveItemPrice, validateDiscountCode } from '../../lib/atomicPos'
import { registerPosSale, runReorderCheck } from '../../lib/posData'
import { Banner, Card, EmptyState, Field, Pill } from './posUi'

const PAY_METHODS = ['Cash', 'Credit card', 'Debit card', 'PayPay', 'Transfer']

function buildCatalog(catalog, stockByProduto) {
  const drinks = (catalog?.drinks || []).map(d => {
    const receita = catalog?.recipesByDrink?.[d.id] || []
    const faltando = receita.filter(ing => (stockByProduto?.[ing.produto_id] ?? 0) <= 0)
    return {
      key: `d-${d.id}`,
      id: d.id,
      kind: 'drink',
      nome: d.nome,
      categoria: d.categoria || 'Menu',
      preco_venda: +d.preco_venda || 0,
      preco_desconto: +d.preco_desconto || 0,
      custo: +d.custo || 0,
      receitaCount: receita.length,
      semEstoque: receita.length > 0 && faltando.length > 0,
    }
  })

  const shots = (catalog?.shots || []).map(s => ({
    key: `p-${s.produto_id}`,
    id: s.produto_id,
    kind: 'shot',
    nome: s.produtos?.nome || 'Shot',
    categoria: s.produtos?.categoria || 'Shot',
    preco_venda: +s.preco_drink || 0,
    preco_desconto: Math.round((+s.preco_drink || 0) * 0.5),
    custo: s.drinks_por_garrafa > 0 ? Math.round((+s.produtos?.preco_venda || 0) / s.drinks_por_garrafa) : 0,
    estoque: stockByProduto?.[s.produto_id] ?? null,
    semEstoque: (stockByProduto?.[s.produto_id] ?? 1) <= 0,
  }))

  return [...drinks, ...shots]
}

export default function PosCheckout({ bar, catalog, config, stockByProduto, userId, onSale }) {
  const { t } = useI18n()
  const [cart, setCart] = useState([])
  const [search, setSearch] = useState('')
  const [priceType, setPriceType] = useState('regular')
  const [codeInput, setCodeInput] = useState('')
  const [activeCode, setActiveCode] = useState(null)
  const [vipId, setVipId] = useState('')
  const [staffId, setStaffId] = useState('')
  const [agentId, setAgentId] = useState('')
  const [payMethod, setPayMethod] = useState('Cash')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const items = useMemo(() => buildCatalog(catalog, stockByProduto), [catalog, stockByProduto])

  const filtered = useMemo(() => {
    if (!search) return items
    const s = search.toLowerCase()
    return items.filter(it => it.nome.toLowerCase().includes(s) || it.categoria.toLowerCase().includes(s))
  }, [items, search])

  const subtotal = cart.reduce((a, it) => a + (it.preco_lista || it.preco_unitario) * it.qtd, 0)
  const total = cart.reduce((a, it) => a + it.preco_unitario * it.qtd, 0)
  const desconto = Math.max(0, subtotal - total)
  const agent = (catalog?.agents || []).find(a => a.id === agentId)
  const comissaoPct = agent
    ? (agent.comissao_pct ?? config?.drink_back_comissao_pct ?? 0)
    : 0
  const comissaoPrevista = Math.round((total * comissaoPct) / 100)

  function applyCode() {
    const code = (catalog?.discountCodes || []).find(
      c => c.codigo.toUpperCase() === codeInput.trim().toUpperCase()
    )
    if (!code) return setFeedback({ tone: 'red', text: t('pos.checkout.codeNotFound') })
    const check = validateDiscountCode(code)
    if (!check.ok) return setFeedback({ tone: 'red', text: check.error })
    setActiveCode(code)
    setFeedback({ tone: 'green', text: t('pos.checkout.codeApplied', { code: code.codigo }) })
  }

  function clearCode() {
    setActiveCode(null)
    setCodeInput('')
  }

  function addToCart(item) {
    const pricing = resolveItemPrice(item, priceType === 'vip' ? 'vip' : 'regular', activeCode)
    setCart(prev => {
      const existing = prev.find(x => x.key === item.key && x.tipo_preco === pricing.tipo_preco)
      if (existing) {
        return prev.map(x =>
          x.key === item.key && x.tipo_preco === pricing.tipo_preco ? { ...x, qtd: x.qtd + 1 } : x
        )
      }
      return [...prev, {
        key: item.key,
        kind: item.kind,
        drink_menu_id: item.kind === 'drink' ? item.id : null,
        produto_id: item.kind === 'shot' ? item.id : null,
        nome: item.nome,
        qtd: 1,
        custo: item.custo || 0,
        preco_unitario: pricing.preco,
        preco_lista: pricing.preco_lista,
        tipo_preco: pricing.tipo_preco,
        desconto_valor: pricing.desconto_valor,
      }]
    })
  }

  function changeQty(index, delta) {
    setCart(prev => prev
      .map((x, i) => (i === index ? { ...x, qtd: x.qtd + delta } : x))
      .filter(x => x.qtd > 0))
  }

  function resetSale() {
    setCart([])
    clearCode()
    setVipId('')
    setAgentId('')
    setPriceType('regular')
  }

  async function completeSale() {
    if (!cart.length) return
    setSaving(true)
    setFeedback(null)
    try {
      const result = await registerPosSale({
        bar,
        cart,
        catalog,
        config,
        payMethod,
        vipMemberId: vipId || null,
        staffId: staffId || null,
        agentId: agentId || null,
        discountCode: activeCode,
        userId,
      })

      const parts = [t('pos.checkout.saleDone', { amount: fmtYen(result.total) })]
      if (result.consumo.length) {
        parts.push(t('pos.checkout.stockMoved', { count: result.consumo.length }))
      }
      if (result.comissao) {
        parts.push(t('pos.checkout.commissionLogged', { amount: fmtYen(result.comissao.comissao_valor) }))
      }

      let reorder = null
      try {
        reorder = await runReorderCheck({
          bar,
          config,
          produtoIds: result.consumo.map(c => c.produto_id),
        })
      } catch {
        parts.push(t('pos.checkout.reorderFailed'))
      }
      if (reorder?.itens?.length) {
        parts.push(t('pos.checkout.reorderFired', { count: reorder.itens.length }))
      }
      if (result.warnings.length) parts.push(result.warnings.join(' · '))

      setFeedback({ tone: result.warnings.length ? 'amber' : 'green', text: parts.join(' · ') })
      resetSale()
      onSale?.(result)
    } catch (e) {
      setFeedback({ tone: 'red', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  const priceModes = [
    ['regular', t('pos.checkout.regular')],
    ['vip', t('pos.checkout.vip')],
    ['codigo', t('pos.checkout.code')],
  ]

  return (
    <div>
      {feedback && (
        <Banner tone={feedback.tone === 'green' ? 'green' : feedback.tone === 'red' ? 'red' : 'amber'}>
          {feedback.text}
        </Banner>
      )}

      <div className="pos-checkout">
        <div>
          <Card>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {priceModes.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`portal-pill-btn${priceType === id ? ' active' : ''}`}
                  onClick={() => { setPriceType(id); if (id !== 'codigo') clearCode() }}
                >
                  {label}
                </button>
              ))}
            </div>

            {priceType === 'codigo' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <input
                  placeholder={t('pos.checkout.codePlaceholder')}
                  value={codeInput}
                  onChange={e => setCodeInput(e.target.value.toUpperCase())}
                  style={{ flex: 1, minWidth: 160 }}
                />
                <button type="button" className="btn-primary" onClick={applyCode} style={{ padding: '8px 16px' }}>
                  {t('pos.checkout.apply')}
                </button>
                {activeCode && (
                  <button type="button" className="pos-btn-sm danger" onClick={clearCode}>
                    {t('pos.checkout.removeCode')}
                  </button>
                )}
              </div>
            )}

            <div className="pos-grid-3">
              {priceType === 'vip' && (
                <Field label={t('pos.checkout.vipMember')}>
                  <select value={vipId} onChange={e => setVipId(e.target.value)}>
                    <option value="">{t('pos.common.optional')}</option>
                    {(catalog?.vipMembers || []).map(v => (
                      <option key={v.id} value={v.id}>{v.nome}{v.codigo ? ` · ${v.codigo}` : ''}</option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label={t('pos.checkout.attendant')}>
                <select value={staffId} onChange={e => setStaffId(e.target.value)}>
                  <option value="">{t('pos.common.optional')}</option>
                  {(catalog?.staff || []).map(s => (
                    <option key={s.id} value={s.id}>{s.nome} · {s.cargo}</option>
                  ))}
                </select>
              </Field>
              <Field
                label={t('pos.checkout.drinkBackAgent')}
                hint={agent ? t('pos.checkout.commissionPreview', { pct: comissaoPct, amount: fmtYen(comissaoPrevista) }) : undefined}
              >
                <select value={agentId} onChange={e => setAgentId(e.target.value)}>
                  <option value="">{t('pos.common.none')}</option>
                  {(catalog?.agents || []).map(a => (
                    <option key={a.id} value={a.id}>{a.nome}{a.regiao ? ` · ${a.regiao}` : ''}</option>
                  ))}
                </select>
              </Field>
            </div>

            <input
              placeholder={t('pos.checkout.search')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', margin: '4px 0 14px' }}
            />

            {filtered.length === 0 ? (
              <EmptyState icon="🍹" text={t('pos.checkout.noCatalog')} />
            ) : (
              <div className="pos-catalog">
                {filtered.map(item => {
                  const p = resolveItemPrice(item, priceType === 'vip' ? 'vip' : 'regular', activeCode)
                  return (
                    <button key={item.key} type="button" className="pos-catalog-item" onClick={() => addToCart(item)}>
                      <div className="pos-catalog-name">{item.nome}</div>
                      <div className="pos-catalog-cat">{item.categoria}</div>
                      <div className="pos-catalog-price">{fmtYen(p.preco)}</div>
                      {p.preco_lista > p.preco && (
                        <div className="pos-catalog-strike">{fmtYen(p.preco_lista)}</div>
                      )}
                      {item.semEstoque && (
                        <div className="pos-catalog-stock" style={{ color: 'var(--red)' }}>
                          {t('pos.checkout.outOfStock')}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="pos-cart">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{t('pos.checkout.cart')}</div>
            {cart.length > 0 && (
              <button type="button" className="pos-btn-sm danger" onClick={() => setCart([])}>
                {t('pos.common.clear')}
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="pos-empty" style={{ padding: '24px 8px' }}>{t('pos.checkout.tapToAdd')}</div>
          ) : (
            <>
              {cart.map((it, i) => (
                <div key={`${it.key}-${it.tipo_preco}`} className="pos-cart-line">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{it.nome}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                      {fmtYen(it.preco_unitario)} · <Pill tone={it.tipo_preco === 'regular' ? 'neutral' : 'gold'}>{it.tipo_preco}</Pill>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <button type="button" className="pos-qty-btn" onClick={() => changeQty(i, -1)}>−</button>
                    <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 700 }}>{it.qtd}</span>
                    <button type="button" className="pos-qty-btn" onClick={() => changeQty(i, 1)}>+</button>
                    <strong style={{ minWidth: 62, textAlign: 'right' }}>{fmtYen(it.preco_unitario * it.qtd)}</strong>
                  </div>
                </div>
              ))}

              {desconto > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--green)', marginTop: 10, fontWeight: 700 }}>
                  <span>{t('pos.checkout.discount')}</span>
                  <span>−{fmtYen(desconto)}</span>
                </div>
              )}

              <div className="pos-cart-total">
                <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text2)', fontWeight: 700 }}>
                  {t('pos.common.total')}
                </span>
                <span className="pos-cart-total-value">{fmtYen(total)}</span>
              </div>

              <Field label={t('pos.checkout.payMethod')}>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  {PAY_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>

              <button
                type="button"
                className="btn-primary"
                onClick={completeSale}
                disabled={saving}
                style={{ width: '100%', padding: 14, borderRadius: 12, fontSize: 14 }}
              >
                {saving ? t('common.saving') : t('pos.checkout.register')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
