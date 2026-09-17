import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../Auth'
import { useI18n } from '../../lib/i18n'
import { fmtYen, fmtDate, Spinner } from '../utils'
import { PortalSurface } from '../ui/PageLayout'
import { Field, ModeButtons, StatCard, StatGrid } from './PosShared'

export default function PosVip({ bar, data, reload }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const { drinks, vipMembers, today } = data
  const [usages, setUsages] = useState(null)
  const [mode, setMode] = useState('register')
  const [memberForm, setMemberForm] = useState({ nome: '', codigo: '', tier: 'standard', notas: '' })
  const [usageForm, setUsageForm] = useState({ vip_member_id: '', drink_menu_id: '', qtd: 1, obs: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [bar.id])

  async function load() {
    const { data: rows } = await supabase.from('vip_usages').select('*, vip_members(nome)').eq('bar_id', bar.id).order('criado_em', { ascending: false }).limit(60)
    setUsages(rows || [])
  }

  async function saveMember() {
    if (!memberForm.nome.trim()) return
    setSaving(true)
    await supabase.from('vip_members').insert({ bar_id: bar.id, ...memberForm, nome: memberForm.nome.trim(), codigo: memberForm.codigo || null, ativo: true })
    setMemberForm({ nome: '', codigo: '', tier: 'standard', notas: '' })
    setSaving(false)
    reload()
  }

  async function toggleMember(m) {
    await supabase.from('vip_members').update({ ativo: !m.ativo }).eq('id', m.id)
    reload()
  }

  async function registerUsage() {
    if (!usageForm.vip_member_id || !usageForm.drink_menu_id) return
    const drink = drinks.find(d => d.id === usageForm.drink_menu_id)
    if (!drink) return
    setSaving(true)
    await supabase.from('vip_usages').insert({
      bar_id: bar.id, vip_member_id: usageForm.vip_member_id, drink_menu_id: drink.id, nome: drink.nome,
      qtd: +usageForm.qtd || 1, preco_aplicado: drink.preco_desconto || 500, preco_lista: drink.preco_venda,
      tipo: 'vip', obs: usageForm.obs || null, criado_por: user?.id || null,
    })
    setUsageForm({ vip_member_id: '', drink_menu_id: '', qtd: 1, obs: '' })
    setSaving(false)
    load()
  }

  if (!usages) return <Spinner text={t('pos.loading')} />

  const monthUsages = usages.filter(u => u.criado_em?.startsWith(today.slice(0, 7)))
  const monthTotal = monthUsages.reduce((a, u) => a + (+u.preco_aplicado || 0) * (+u.qtd || 1), 0)
  const active = vipMembers.filter(m => m.ativo)

  return (
    <div>
      <StatGrid>
        <StatCard label={t('pos.vipMembers')} value={active.length} icon="⭐" />
        <StatCard label={t('pos.vipUsesMonth')} value={monthUsages.length} />
        <StatCard label={t('pos.vipTotalMonth')} value={fmtYen(monthTotal)} color="var(--gold)" />
      </StatGrid>

      <ModeButtons value={mode} onChange={setMode} options={[['register', t('pos.registerUse')], ['members', t('pos.members')], ['history', t('common.history')]]} />

      {mode === 'register' && (
        <PortalSurface title={t('pos.registerVipUse')} sub={t('pos.registerVipUseSub')} style={{ maxWidth: 520 }}>
          <Field label={t('pos.member')}>
            <select value={usageForm.vip_member_id} onChange={e => setUsageForm({ ...usageForm, vip_member_id: e.target.value })}>
              <option value="">{t('pos.selectPlaceholder')}</option>
              {active.map(m => <option key={m.id} value={m.id}>{m.nome}{m.codigo ? ` · ${m.codigo}` : ''}</option>)}
            </select>
          </Field>
          <Field label={t('pos.drink')}>
            <select value={usageForm.drink_menu_id} onChange={e => setUsageForm({ ...usageForm, drink_menu_id: e.target.value })}>
              <option value="">{t('pos.selectPlaceholder')}</option>
              {drinks.map(d => <option key={d.id} value={d.id}>{d.nome} — VIP {fmtYen(d.preco_desconto || 500)}</option>)}
            </select>
          </Field>
          <Field label={t('common.qty')}><input type="number" min="1" value={usageForm.qtd} onChange={e => setUsageForm({ ...usageForm, qtd: e.target.value })} /></Field>
          <button className="btn-primary" onClick={registerUsage} disabled={saving || !usageForm.vip_member_id || !usageForm.drink_menu_id} style={{ width: '100%', padding: 11, borderRadius: 10 }}>{saving ? '…' : t('pos.registerVipUse')}</button>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 8 }}>{t('pos.vipCheckoutHint')}</div>
        </PortalSurface>
      )}

      {mode === 'members' && (
        <div className="grid2" style={{ alignItems: 'start' }}>
          <PortalSurface title={t('pos.newMember')}>
            <Field label={t('pos.name')}><input value={memberForm.nome} onChange={e => setMemberForm({ ...memberForm, nome: e.target.value })} /></Field>
            <Field label={t('pos.cardCodeOptional')}><input value={memberForm.codigo} onChange={e => setMemberForm({ ...memberForm, codigo: e.target.value })} /></Field>
            <Field label={t('pos.tier')}>
              <select value={memberForm.tier} onChange={e => setMemberForm({ ...memberForm, tier: e.target.value })}>
                {['standard', 'gold', 'platinum'].map(tier => <option key={tier}>{tier}</option>)}
              </select>
            </Field>
            <button className="btn-primary" onClick={saveMember} disabled={saving || !memberForm.nome.trim()} style={{ width: '100%', padding: 10, borderRadius: 10 }}>{t('pos.addMember')}</button>
          </PortalSurface>
          <PortalSurface title={t('pos.members')} sub={`${active.length}/${vipMembers.length}`}>
            {vipMembers.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('common.empty')}</div>}
            {vipMembers.map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13, opacity: m.ativo ? 1 : 0.5 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{m.nome} <span style={{ fontSize: 10, color: 'var(--gold)', textTransform: 'uppercase' }}>{m.tier}</span></div>
                  {m.codigo && <div style={{ fontSize: 11, color: 'var(--text2)' }}>{t('pos.codeLabel', { code: m.codigo })}</div>}
                </div>
                <button onClick={() => toggleMember(m)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6 }}>{m.ativo ? t('pos.deactivate') : t('pos.activate')}</button>
              </div>
            ))}
          </PortalSurface>
        </div>
      )}

      {mode === 'history' && (
        <PortalSurface title={t('common.history')}>
          {usages.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('common.empty')}</div>}
          {usages.map(u => (
            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <div>
                <strong>{u.vip_members?.nome || 'VIP'}</strong> — {u.nome} ×{u.qtd}
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>{fmtDate(u.criado_em?.slice(0, 10))}{u.pos_venda_id ? ` · ${t('pos.viaCheckout')}` : ''}</div>
              </div>
              <div style={{ fontWeight: 700 }}>{fmtYen((u.preco_aplicado || 0) * (u.qtd || 1))}</div>
            </div>
          ))}
        </PortalSurface>
      )}
    </div>
  )
}
