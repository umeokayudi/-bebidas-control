import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useI18n } from '../../lib/i18n'
import { fmtYen, fmtDate } from '../utils'
import { PortalSurface } from '../ui/PageLayout'
import { generateDiscountCode, validateDiscountCode } from '../../lib/posEngine'
import { Field, StatCard, StatGrid, Pill } from './PosShared'

export default function PosDiscounts({ bar, data, reload }) {
  const { t } = useI18n()
  const { drinks, discountCodes } = data
  const [form, setForm] = useState({ codigo: generateDiscountCode(), descricao: '', tipo: 'percent', valor: '10', max_usos: '', valido_ate: '', drink_menu_id: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function saveCode() {
    if (!form.codigo.trim() || !form.valor) return
    setSaving(true)
    setErr('')
    const { error } = await supabase.from('discount_codes').insert({
      bar_id: bar.id, codigo: form.codigo.trim().toUpperCase(), descricao: form.descricao || null, tipo: form.tipo, valor: +form.valor,
      max_usos: form.max_usos ? +form.max_usos : null, valido_ate: form.valido_ate || null, drink_menu_id: form.drink_menu_id || null, ativo: true,
    })
    if (error) setErr(error.message)
    else setForm({ ...form, codigo: generateDiscountCode(), descricao: '', valor: '10', max_usos: '', valido_ate: '' })
    setSaving(false)
    reload()
  }

  async function toggle(c) {
    await supabase.from('discount_codes').update({ ativo: !c.ativo }).eq('id', c.id)
    reload()
  }

  const active = discountCodes.filter(c => validateDiscountCode(c).ok)
  const uses = discountCodes.reduce((a, c) => a + (+c.usos_atual || 0), 0)

  return (
    <div>
      <StatGrid>
        <StatCard label={t('pos.activeCodes')} value={active.length} sub={t('pos.totalCodes', { count: discountCodes.length })} icon="🏷️" />
        <StatCard label={t('pos.totalUses')} value={uses} />
      </StatGrid>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <PortalSurface title={t('pos.createDiscount')} sub={t('pos.createDiscountSub')}>
          <Field label={t('pos.code')}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value.toUpperCase() })} style={{ flex: 1, fontWeight: 700, letterSpacing: 1 }} />
              <button onClick={() => setForm({ ...form, codigo: generateDiscountCode() })} style={{ padding: '8px 12px', fontSize: 11 }}>{t('pos.generate')}</button>
            </div>
          </Field>
          <Field label={t('pos.description')}><input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder={t('pos.descriptionPlaceholder')} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label={t('pos.discountType')}>
              <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                <option value="percent">{t('pos.percentLabel')}</option>
                <option value="fixed">{t('pos.fixedLabel')}</option>
              </select>
            </Field>
            <Field label={t('pos.value')}><input type="number" min="0" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} /></Field>
            <Field label={t('pos.maxUses')}><input type="number" min="1" value={form.max_usos} onChange={e => setForm({ ...form, max_usos: e.target.value })} placeholder="∞" /></Field>
            <Field label={t('pos.validUntil')}><input type="date" value={form.valido_ate} onChange={e => setForm({ ...form, valido_ate: e.target.value })} /></Field>
          </div>
          <Field label={t('pos.appliesTo')}>
            <select value={form.drink_menu_id} onChange={e => setForm({ ...form, drink_menu_id: e.target.value })}>
              <option value="">{t('pos.allDrinks')}</option>
              {drinks.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </Field>
          {err && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>{err}</div>}
          <button className="btn-primary" onClick={saveCode} disabled={saving || !form.codigo.trim() || !form.valor} style={{ width: '100%', padding: 11, borderRadius: 10 }}>{saving ? t('common.saving') : t('pos.createCode')}</button>
        </PortalSurface>

        <PortalSurface title={t('pos.codes')} sub={`${active.length} ${t('pos.activeLower')}`}>
          {discountCodes.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('common.empty')}</div>}
          {discountCodes.map(c => {
            const v = validateDiscountCode(c)
            const drink = c.drink_menu_id ? drinks.find(d => d.id === c.drink_menu_id) : null
            return (
              <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', opacity: c.ativo ? 1 : 0.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: 1, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      {c.codigo}
                      {!v.ok && <Pill color="#7a1d1d" bg="#fdecec">{t(`pos.codeError.${v.error}`)}</Pill>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                      {c.tipo === 'percent' ? `${c.valor}% off` : `${fmtYen(c.valor)} off`} · {t('pos.usesLabel', { used: c.usos_atual || 0, max: c.max_usos ? `/${c.max_usos}` : '' })}
                      {c.valido_ate && <> · {t('pos.until', { date: fmtDate(c.valido_ate) })}</>}
                      {drink && <> · {drink.nome}</>}
                    </div>
                    {c.descricao && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.descricao}</div>}
                  </div>
                  <button onClick={() => toggle(c)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap' }}>{c.ativo ? t('pos.deactivate') : t('pos.activate')}</button>
                </div>
              </div>
            )
          })}
        </PortalSurface>
      </div>
    </div>
  )
}
