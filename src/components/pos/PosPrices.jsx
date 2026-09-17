import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useI18n } from '../../lib/i18n'
import { fmtYen } from '../utils'
import { PortalSurface } from '../ui/PageLayout'
import { DEFAULT_BOTTLE_ML, DEFAULT_DRINKS_PER_BOTTLE } from '../../lib/posEngine'
import { Field, ModeButtons, PosModal, StatCard, StatGrid, fmtQty } from './PosShared'

const CATS = ['Custom', 'Cocktail', 'Highball', 'Shots', 'Beer', 'Wine', 'Champagne', 'Soft Drinks', 'Food', 'Bottle', 'Premium']
const EMPTY = { nome: '', categoria: 'Cocktail', preco_venda: '', custo: '', preco_desconto: '500', copo: '', notas: '' }

export default function PosPrices({ bar, data, reload }) {
  const { t } = useI18n()
  const { drinks, shots, produtos, produtosById, ingredientesByDrink } = data
  const [mode, setMode] = useState('menu')
  const [form, setForm] = useState(EMPTY)
  const [ings, setIngs] = useState([])
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [shotForm, setShotForm] = useState({ produto_id: '', drinks: String(DEFAULT_DRINKS_PER_BOTTLE), preco: '' })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const catalog = useMemo(() => Object.values(produtosById).filter(p => p.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome)), [produtosById])

  const autoCost = useMemo(() => ings.reduce((sum, i) => {
    const p = produtosById[i.produto_id]
    if (!p || !i.ml) return sum
    const perMl = (+p.preco_venda || 0) / (+p.volume_ml || DEFAULT_BOTTLE_ML)
    return sum + Math.round(perMl * +i.ml)
  }, 0), [ings, produtosById])

  function startNew() {
    setEditId(null); setForm(EMPTY); setIngs([]); setShowForm(true)
  }

  function startEdit(d) {
    setEditId(d.id)
    setForm({ nome: d.nome, categoria: d.categoria || 'Custom', preco_venda: d.preco_venda, custo: d.custo ?? '', preco_desconto: d.preco_desconto ?? 500, copo: d.copo || '', notas: d.notas || '' })
    setIngs((ingredientesByDrink[d.id] || []).map(i => ({ produto_id: i.produto_id, ml: i.ml })))
    setShowForm(true)
  }

  async function saveDrink() {
    if (!form.nome.trim() || !form.preco_venda) return
    setSaving(true)
    const custo = autoCost > 0 ? autoCost : (+form.custo || 0)
    const preco = +form.preco_venda || 0
    const receita = ings.filter(i => i.produto_id && i.ml).map(i => `${produtosById[i.produto_id]?.nome || '?'} ${i.ml}ml`).join(' + ')
    const payload = {
      bar_id: bar.id, nome: form.nome.trim(), categoria: form.categoria, preco_venda: preco, custo,
      margem: preco > 0 ? (preco - custo) / preco : 0, preco_desconto: +form.preco_desconto || 500,
      copo: form.copo || null, notas: form.notas || null, receita: receita || null, custom: true,
    }
    let id = editId
    if (editId) {
      await supabase.from('drink_menu').update(payload).eq('id', editId)
    } else {
      const { data: row } = await supabase.from('drink_menu').insert(payload).select().single()
      id = row?.id
    }
    if (id) {
      await supabase.from('drink_menu_ingredientes').delete().eq('drink_menu_id', id)
      const rows = ings.filter(i => i.produto_id && +i.ml > 0).map(i => ({ drink_menu_id: id, produto_id: i.produto_id, ml: +i.ml }))
      if (rows.length) await supabase.from('drink_menu_ingredientes').insert(rows)
    }
    setSaving(false)
    setShowForm(false)
    setEditId(null)
    reload()
  }

  async function deleteDrink(d) {
    if (!confirm(t('pos.confirmDeleteDrink', { name: d.nome }))) return
    await supabase.from('drink_menu').delete().eq('id', d.id)
    reload()
  }

  async function saveShot() {
    if (!shotForm.produto_id || !shotForm.preco) return
    setSaving(true)
    await supabase.from('bar_pricing').upsert({
      bar_id: bar.id, produto_id: shotForm.produto_id,
      drinks_por_garrafa: +shotForm.drinks || DEFAULT_DRINKS_PER_BOTTLE, preco_drink: +shotForm.preco,
    }, { onConflict: 'bar_id,produto_id' })
    setShotForm({ produto_id: '', drinks: String(DEFAULT_DRINKS_PER_BOTTLE), preco: '' })
    setSaving(false)
    reload()
  }

  async function deleteShot(s) {
    await supabase.from('bar_pricing').delete().eq('id', s.id)
    reload()
  }

  const filteredDrinks = drinks.filter(d => !search || d.nome.toLowerCase().includes(search.toLowerCase()) || (d.categoria || '').toLowerCase().includes(search.toLowerCase()))
  const avgMargin = drinks.length ? Math.round(drinks.reduce((a, d) => a + (+d.margem || 0), 0) / drinks.length * 100) : 0
  const withRecipe = drinks.filter(d => (ingredientesByDrink[d.id] || []).length > 0).length

  return (
    <div>
      <StatGrid>
        <StatCard label={t('pos.menuItems')} value={drinks.length} sub={t('pos.withRecipe', { count: withRecipe })} icon="🍹" />
        <StatCard label={t('pos.shotsPriced')} value={shots.length} sub={t('pos.shotsSub')} icon="🥃" />
        <StatCard label={t('pos.avgMargin')} value={`${avgMargin}%`} color={avgMargin >= 70 ? 'var(--green)' : 'var(--amber)'} />
      </StatGrid>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <ModeButtons value={mode} onChange={setMode} options={[['menu', t('pos.menuDrinks')], ['shots', t('pos.shotsBottle')]]} />
        {mode === 'menu' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} style={{ width: 160 }} />
            <button className="btn-primary" onClick={startNew} style={{ padding: '8px 14px', borderRadius: 10 }}>+ {t('pos.addDrink')}</button>
          </div>
        )}
      </div>

      {mode === 'menu' && (
        <PortalSurface title={t('pos.menuDrinks')} sub={t('pos.menuDrinksSub')}>
          {filteredDrinks.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('pos.noDrinks')}</div>}
          <div className="table-scroll">
            {filteredDrinks.length > 0 && (
              <table style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    {[t('pos.drink'), t('pos.recipe'), t('pos.price'), t('pos.vipPrice'), t('pos.cost'), t('pos.margin'), ''].map((h, i) => (
                      <th key={i} style={{ textAlign: i < 2 ? 'left' : 'right', padding: 6, fontSize: 11, color: 'var(--text2)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredDrinks.map(d => {
                    const ing = ingredientesByDrink[d.id] || []
                    return (
                      <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: 6, fontWeight: 600 }}>{d.nome}<div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 400 }}>{d.categoria}</div></td>
                        <td style={{ padding: 6, fontSize: 11, color: ing.length ? 'var(--text2)' : 'var(--amber)' }}>
                          {ing.length ? ing.map(i => `${produtosById[i.produto_id]?.nome || '?'} ${fmtQty(i.ml)}ml`).join(' + ') : `⚠︎ ${t('pos.noRecipeStock')}`}
                        </td>
                        <td style={{ padding: 6, textAlign: 'right', fontWeight: 700 }}>{fmtYen(d.preco_venda)}</td>
                        <td style={{ padding: 6, textAlign: 'right', color: 'var(--gold)' }}>{fmtYen(d.preco_desconto || 500)}</td>
                        <td style={{ padding: 6, textAlign: 'right' }}>{fmtYen(d.custo)}</td>
                        <td style={{ padding: 6, textAlign: 'right', color: (d.margem || 0) >= 0.7 ? 'var(--green)' : 'var(--amber)' }}>{Math.round((d.margem || 0) * 100)}%</td>
                        <td style={{ padding: 6, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button onClick={() => startEdit(d)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6 }}>{t('common.edit')}</button>
                          <button onClick={() => deleteDrink(d)} className="btn-danger" style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, marginLeft: 4 }}>🗑</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </PortalSurface>
      )}

      {mode === 'shots' && (
        <PortalSurface title={t('pos.shotsBottle')} sub={t('pos.shotsBottleSub')}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 16, alignItems: 'end' }}>
            <Field label={t('pos.jbmProduct')} style={{ marginBottom: 0 }}>
              <select value={shotForm.produto_id} onChange={e => setShotForm({ ...shotForm, produto_id: e.target.value })}>
                <option value="">{t('pos.selectPlaceholder')}</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}{p.volume_ml ? ` · ${p.volume_ml}ml` : ''} — {fmtYen(p.preco_venda)}</option>)}
              </select>
            </Field>
            <Field label={t('pos.drinksPerBottle')} style={{ marginBottom: 0 }}><input type="number" min="1" value={shotForm.drinks} onChange={e => setShotForm({ ...shotForm, drinks: e.target.value })} /></Field>
            <Field label={t('pos.pricePerDrink')} style={{ marginBottom: 0 }}><input type="number" min="0" value={shotForm.preco} onChange={e => setShotForm({ ...shotForm, preco: e.target.value })} /></Field>
            <button className="btn-primary" onClick={saveShot} disabled={saving || !shotForm.produto_id || !shotForm.preco} style={{ padding: '9px 14px' }}>{t('common.save')}</button>
          </div>
          {shots.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('common.empty')}</div>}
          {shots.map(s => {
            const p = s.produtos || produtosById[s.produto_id] || {}
            const costPerDrink = p.preco_venda ? Math.round(p.preco_venda / (+s.drinks_por_garrafa || DEFAULT_DRINKS_PER_BOTTLE)) : 0
            const margin = s.preco_drink ? Math.round(((s.preco_drink - costPerDrink) / s.preco_drink) * 100) : 0
            return (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.nome || '?'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>{s.drinks_por_garrafa} {t('pos.drinksPerBottleShort')} · {t('pos.costPerDrink', { amount: fmtYen(costPerDrink) })} · {margin}%</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <strong>{fmtYen(s.preco_drink)}</strong>
                  <button onClick={() => setShotForm({ produto_id: s.produto_id, drinks: String(s.drinks_por_garrafa), preco: String(s.preco_drink) })} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6 }}>{t('common.edit')}</button>
                  <button onClick={() => deleteShot(s)} className="btn-danger" style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6 }}>🗑</button>
                </div>
              </div>
            )
          })}
        </PortalSurface>
      )}

      <PosModal open={showForm} title={editId ? t('pos.editDrink') : t('pos.addDrink')} onClose={() => setShowForm(false)} width={520}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
          <Field label={t('pos.name')}><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} autoFocus /></Field>
          <Field label={t('pos.category')}>
            <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
              {[...new Set([...CATS, ...drinks.map(d => d.categoria).filter(Boolean)])].map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <Field label={t('pos.price')}><input type="number" min="0" value={form.preco_venda} onChange={e => setForm({ ...form, preco_venda: e.target.value })} /></Field>
          <Field label={t('pos.vipPrice')}><input type="number" min="0" value={form.preco_desconto} onChange={e => setForm({ ...form, preco_desconto: e.target.value })} /></Field>
          <Field label={autoCost > 0 ? t('pos.costAuto') : t('pos.cost')}><input type="number" min="0" value={autoCost > 0 ? autoCost : form.custo} disabled={autoCost > 0} onChange={e => setForm({ ...form, custo: e.target.value })} /></Field>
        </div>

        <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{t('pos.recipeIngredients')}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>{t('pos.recipeIngredientsSub')}</div>
            </div>
            <button type="button" onClick={() => setIngs([...ings, { produto_id: '', ml: '30' }])} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8 }}>+ {t('pos.addIngredient')}</button>
          </div>
          {ings.map((ing, idx) => {
            const p = produtosById[ing.produto_id]
            const perMl = p ? (+p.preco_venda || 0) / (+p.volume_ml || DEFAULT_BOTTLE_ML) : 0
            return (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 70px 28px', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <select value={ing.produto_id} onChange={e => { const a = [...ings]; a[idx] = { ...a[idx], produto_id: e.target.value }; setIngs(a) }} style={{ fontSize: 12 }}>
                  <option value="">{t('pos.selectPlaceholder')}</option>
                  {catalog.map(c => <option key={c.id} value={c.id}>{c.nome}{c.volume_ml ? ` · ${c.volume_ml}ml` : ''}</option>)}
                </select>
                <input type="number" min="0" step="5" value={ing.ml} onChange={e => { const a = [...ings]; a[idx] = { ...a[idx], ml: e.target.value }; setIngs(a) }} placeholder="ml" style={{ fontSize: 12 }} />
                <span style={{ fontSize: 11, textAlign: 'right', color: 'var(--text2)' }}>{p && ing.ml ? fmtYen(Math.round(perMl * +ing.ml)) : '—'}</span>
                <button type="button" onClick={() => setIngs(ings.filter((_, i) => i !== idx))} style={{ padding: 4, border: 'none', background: 'transparent', color: 'var(--red)', cursor: 'pointer' }}>✕</button>
              </div>
            )
          })}
          {ings.length === 0 && <div style={{ fontSize: 11, color: 'var(--amber)' }}>⚠︎ {t('pos.noRecipeStock')}</div>}
        </div>

        {form.preco_venda > 0 && (
          <div style={{ fontSize: 12, marginBottom: 10, display: 'flex', gap: 16 }}>
            <span>{t('pos.margin')}: <strong style={{ color: 'var(--green)' }}>{Math.round(((+form.preco_venda - (autoCost || +form.custo || 0)) / +form.preco_venda) * 100)}%</strong></span>
            <span>{t('pos.profitPerDrink')}: <strong>{fmtYen(+form.preco_venda - (autoCost || +form.custo || 0))}</strong></span>
          </div>
        )}
        <button className="btn-primary" onClick={saveDrink} disabled={saving || !form.nome.trim() || !form.preco_venda} style={{ width: '100%', padding: 11, borderRadius: 10 }}>{saving ? t('common.saving') : t('common.save')}</button>
      </PosModal>
    </div>
  )
}
