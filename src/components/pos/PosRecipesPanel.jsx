/**
 * Receitas do cardápio — o que liga um drink vendido no POS aos produtos
 * JBM que ele consome. Sem receita a venda acontece, mas o estoque não
 * baixa; com receita a baixa é automática a cada venda.
 */

import { useMemo, useState } from 'react'
import { fmtYen } from '../utils'
import { useI18n } from '../../lib/i18n'
import { saveRecipe } from '../../lib/posData'
import { bottlesPerDose } from '../../lib/posStock'
import { Banner, Card, EmptyState, Field, Pill } from './posUi'

export default function PosRecipesPanel({ catalog, inventory, onRefresh }) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(null)
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const drinks = catalog?.drinks || []
  const pricing = catalog?.pricingByProduto || {}
  const produtos = useMemo(
    () => (inventory?.produtos || []).filter(p => pricing[p.id]),
    [inventory, pricing]
  )
  const produtoById = useMemo(
    () => new Map((inventory?.produtos || []).map(p => [p.id, p])),
    [inventory]
  )

  function startEdit(drink) {
    setEditing(drink.id)
    const current = catalog?.recipesByDrink?.[drink.id] || []
    setRows(current.length
      ? current.map(i => ({ produto_id: i.produto_id, doses: String(i.doses ?? 1) }))
      : [{ produto_id: '', doses: '1' }])
  }

  function updateRow(index, patch) {
    setRows(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  async function submit() {
    setBusy(true)
    try {
      await saveRecipe(editing, rows)
      setFeedback({ tone: 'green', text: t('pos.recipes.saved') })
      setEditing(null)
      setRows([])
      onRefresh?.()
    } catch (e) {
      setFeedback({ tone: 'red', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  function recipeCost(recipe) {
    return (recipe || []).reduce((a, ing) => {
      const row = pricing[ing.produto_id]
      const custoGarrafa = +produtoById.get(ing.produto_id)?.preco_venda || 0
      return a + custoGarrafa * bottlesPerDose(row) * (+ing.doses || 1)
    }, 0)
  }

  if (produtos.length === 0) {
    return (
      <Card title={t('pos.recipes.title')} sub={t('pos.recipes.sub')}>
        <EmptyState icon="💴" text={t('pos.recipes.needPricing')} />
      </Card>
    )
  }

  return (
    <div>
      {feedback && <Banner tone={feedback.tone === 'green' ? 'green' : 'red'}>{feedback.text}</Banner>}

      <Card title={t('pos.recipes.title')} sub={t('pos.recipes.sub')}>
        {drinks.length === 0 ? (
          <EmptyState icon="🍹" text={t('pos.recipes.noDrinks')} />
        ) : (
          drinks.map(d => {
            const recipe = catalog?.recipesByDrink?.[d.id] || []
            const custo = Math.round(recipeCost(recipe))
            const margem = d.preco_venda > 0 ? Math.round(((d.preco_venda - custo) / d.preco_venda) * 100) : 0
            return (
              <div key={d.id}>
                <div className="pos-row">
                  <div className="pos-row-main">
                    <div className="pos-row-title">{d.nome}</div>
                    <div className="pos-row-sub">
                      {recipe.length === 0
                        ? t('pos.recipes.noRecipe')
                        : recipe.map(i => `${produtoById.get(i.produto_id)?.nome || '?'} ×${i.doses}`).join(' + ')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 96 }}>
                    <div style={{ fontWeight: 800 }}>{fmtYen(d.preco_venda)}</div>
                    {recipe.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                        {t('pos.recipes.cost', { amount: fmtYen(custo) })}
                      </div>
                    )}
                  </div>
                  {recipe.length > 0
                    ? <Pill tone={margem >= 70 ? 'green' : margem >= 50 ? 'amber' : 'red'}>{margem}%</Pill>
                    : <Pill tone="neutral">{t('pos.recipes.noStockMove')}</Pill>}
                  <button type="button" className="pos-btn-sm" onClick={() => (editing === d.id ? setEditing(null) : startEdit(d))}>
                    {editing === d.id ? t('pos.common.cancel') : t('pos.recipes.edit')}
                  </button>
                </div>

                {editing === d.id && (
                  <div style={{ padding: '14px 16px', border: '1px dashed var(--border2)', borderRadius: 14, marginBottom: 12 }}>
                    {rows.map((row, i) => (
                      <div key={i} className="pos-grid-2" style={{ alignItems: 'end' }}>
                        <Field label={t('pos.recipes.product')}>
                          <select value={row.produto_id} onChange={e => updateRow(i, { produto_id: e.target.value })}>
                            <option value="">{t('pos.common.select')}</option>
                            {produtos.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.nome} · {pricing[p.id]?.drinks_por_garrafa || 0} {t('pos.recipes.perBottle')}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label={t('pos.recipes.doses')} hint={t('pos.recipes.dosesHint')}>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={row.doses}
                              onChange={e => updateRow(i, { doses: e.target.value })}
                            />
                            <button
                              type="button"
                              className="pos-btn-sm danger"
                              onClick={() => setRows(prev => prev.filter((_, j) => j !== i))}
                            >
                              ✕
                            </button>
                          </div>
                        </Field>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <button type="button" className="pos-btn-sm" onClick={() => setRows(prev => [...prev, { produto_id: '', doses: '1' }])}>
                        {t('pos.recipes.addIngredient')}
                      </button>
                      <button type="button" className="btn-primary" disabled={busy} onClick={submit} style={{ padding: '9px 18px', borderRadius: 10 }}>
                        {busy ? t('common.saving') : t('pos.recipes.saveRecipe')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </Card>
    </div>
  )
}
