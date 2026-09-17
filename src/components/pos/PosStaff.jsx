import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useI18n } from '../../lib/i18n'
import { fmtYen, Spinner } from '../utils'
import { PortalSurface } from '../ui/PageLayout'
import { localDateKey } from '../../lib/posEngine'
import { Field, ModeButtons, PosModal, StatCard, StatGrid } from './PosShared'

const ROLES = ['Bartender', 'Waiter', 'Manager', 'Security', 'DJ', 'Kitchen', 'Cashier', 'Other']
const EMPTY_STAFF = { nome: '', cargo: 'Bartender', salario_base: '', comissao_pct: '0', telefone: '', notas: '' }

function weekStart(dateKey) {
  const d = new Date(`${dateKey}T12:00:00`)
  d.setDate(d.getDate() - d.getDay())
  return d
}

function hoursBetween(ini, fim) {
  const [h1, m1] = String(ini).split(':').map(Number)
  const [h2, m2] = String(fim).split(':').map(Number)
  let mins = (h2 * 60 + (m2 || 0)) - (h1 * 60 + (m1 || 0))
  if (mins <= 0) mins += 24 * 60
  return Math.round((mins / 60) * 10) / 10
}

export default function PosStaff({ bar, data, reload }) {
  const { t, lang } = useI18n()
  const { staff, today, config } = data
  const [mode, setMode] = useState('team')
  const [form, setForm] = useState(EMPTY_STAFF)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [weekOf, setWeekOf] = useState(today)
  const [turnos, setTurnos] = useState(null)
  const [shiftForm, setShiftForm] = useState(null)
  const [monthSales, setMonthSales] = useState([])

  const start = useMemo(() => weekStart(weekOf), [weekOf])
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return localDateKey(d) }), [start])

  useEffect(() => { loadTurnos() }, [bar.id, weekDays[0]])
  useEffect(() => {
    supabase.from('pos_vendas').select('staff_id, total, comissao_staff').eq('bar_id', bar.id).gte('data', `${today.slice(0, 7)}-01`)
      .then(({ data: rows }) => setMonthSales(rows || []))
  }, [bar.id, today])

  async function loadTurnos() {
    const { data: rows } = await supabase.from('bar_turnos').select('*').eq('bar_id', bar.id).gte('data', weekDays[0]).lte('data', weekDays[6]).order('data').order('hora_inicio')
    setTurnos(rows || [])
  }

  async function saveStaff() {
    if (!form.nome.trim()) return
    setSaving(true)
    const payload = {
      bar_id: bar.id, nome: form.nome.trim(), cargo: form.cargo, salario_base: +form.salario_base || 0,
      comissao_pct: +form.comissao_pct || 0, telefone: form.telefone || null, notas: form.notas || null,
    }
    if (editId) await supabase.from('bar_staff').update(payload).eq('id', editId)
    else await supabase.from('bar_staff').insert({ ...payload, ativo: true })
    setSaving(false)
    setShowForm(false)
    setEditId(null)
    setForm(EMPTY_STAFF)
    reload()
  }

  async function toggleActive(s) {
    await supabase.from('bar_staff').update({ ativo: !s.ativo }).eq('id', s.id)
    reload()
  }

  async function saveShift() {
    if (!shiftForm?.staff_id || !shiftForm.data) return
    setSaving(true)
    await supabase.from('bar_turnos').insert({
      bar_id: bar.id, staff_id: shiftForm.staff_id, data: shiftForm.data,
      hora_inicio: shiftForm.hora_inicio, hora_fim: shiftForm.hora_fim, obs: shiftForm.obs || null,
    })
    setSaving(false)
    setShiftForm(null)
    loadTurnos()
  }

  async function deleteShift(id) {
    await supabase.from('bar_turnos').delete().eq('id', id)
    loadTurnos()
  }

  const active = staff.filter(s => s.ativo)
  const payroll = active.reduce((a, s) => a + (+s.salario_base || 0), 0)
  const staffSales = useMemo(() => {
    const m = {}
    for (const v of monthSales) {
      if (!v.staff_id) continue
      const r = (m[v.staff_id] ||= { total: 0, count: 0, comissao: 0 })
      r.total += +v.total || 0; r.count += 1; r.comissao += +v.comissao_staff || 0
    }
    return m
  }, [monthSales])
  const comissoesMes = Object.values(staffSales).reduce((a, r) => a + r.comissao, 0)

  const weekHours = useMemo(() => {
    const m = {}
    for (const tr of turnos || []) m[tr.staff_id] = (m[tr.staff_id] || 0) + hoursBetween(tr.hora_inicio, tr.hora_fim)
    return m
  }, [turnos])

  const dayNames = lang === 'ja' ? ['日', '月', '火', '水', '木', '金', '土'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  function shiftWeek(delta) {
    const d = new Date(start); d.setDate(d.getDate() + delta * 7); setWeekOf(localDateKey(d))
  }

  return (
    <div>
      <StatGrid>
        <StatCard label={t('pos.activeStaffLabel')} value={active.length} sub={t('pos.totalStaff', { count: staff.length })} icon="👥" />
        <StatCard label={t('pos.monthlyPayroll')} value={fmtYen(payroll)} sub={t('pos.baseSalaries')} icon="💰" />
        <StatCard label={t('pos.staffCommissions')} value={fmtYen(comissoesMes)} sub={t('pos.thisMonth')} color="var(--gold)" icon="🎯" />
        <StatCard label={t('pos.weekHours')} value={`${Math.round(Object.values(weekHours).reduce((a, h) => a + h, 0) * 10) / 10}h`} sub={t('pos.scheduledThisWeek')} icon="⏱" />
      </StatGrid>

      <ModeButtons value={mode} onChange={setMode} options={[['team', t('pos.team')], ['schedule', t('pos.schedule')]]} />

      {mode === 'team' && (
        <PortalSurface
          title={t('pos.team')}
          sub={t('pos.teamSub')}
          headerRight={<button className="btn-primary" onClick={() => { setShowForm(true); setEditId(null); setForm(EMPTY_STAFF) }} style={{ padding: '8px 14px', borderRadius: 10 }}>+ {t('pos.addStaff')}</button>}
        >
          {staff.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('pos.noStaff')}</div>}
          <div className="table-scroll">
            {staff.length > 0 && (
              <table style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    {[t('pos.name'), t('pos.role'), t('pos.baseSalary'), t('pos.commissionPct'), t('pos.salesMonth'), t('pos.commissionMonth'), t('pos.hoursWeek'), ''].map((h, i) => (
                      <th key={i} style={{ textAlign: i === 0 || i === 1 ? 'left' : 'right', padding: 6, fontSize: 11, color: 'var(--text2)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staff.map(s => {
                    const st = staffSales[s.id] || { total: 0, count: 0, comissao: 0 }
                    return (
                      <tr key={s.id} style={{ borderTop: '1px solid var(--border)', opacity: s.ativo ? 1 : 0.5 }}>
                        <td style={{ padding: 6, fontWeight: 600 }}>{s.nome}{s.telefone && <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 400 }}>{s.telefone}</div>}</td>
                        <td style={{ padding: 6 }}>{s.cargo}</td>
                        <td style={{ padding: 6, textAlign: 'right' }}>{fmtYen(s.salario_base)}</td>
                        <td style={{ padding: 6, textAlign: 'right' }}>{+s.comissao_pct || 0}%</td>
                        <td style={{ padding: 6, textAlign: 'right' }}>{fmtYen(st.total)} <span style={{ color: 'var(--text2)', fontSize: 11 }}>({st.count})</span></td>
                        <td style={{ padding: 6, textAlign: 'right', color: 'var(--gold)', fontWeight: 600 }}>{fmtYen(st.comissao)}</td>
                        <td style={{ padding: 6, textAlign: 'right' }}>{weekHours[s.id] ? `${weekHours[s.id]}h` : '—'}</td>
                        <td style={{ padding: 6, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button onClick={() => { setEditId(s.id); setForm({ nome: s.nome, cargo: s.cargo, salario_base: s.salario_base, comissao_pct: s.comissao_pct, telefone: s.telefone || '', notas: s.notas || '' }); setShowForm(true) }} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6 }}>{t('common.edit')}</button>
                          <button onClick={() => toggleActive(s)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, marginLeft: 4 }}>{s.ativo ? t('pos.deactivate') : t('pos.activate')}</button>
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

      {mode === 'schedule' && (
        <PortalSurface
          title={t('pos.schedule')}
          sub={`${weekDays[0]} → ${weekDays[6]} · ${t('pos.openingRange', { open: config.hora_abre, close: config.hora_fecha })}`}
          headerRight={(
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={() => shiftWeek(-1)} style={{ padding: '6px 10px', borderRadius: 8 }}>‹</button>
              <button onClick={() => setWeekOf(today)} style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12 }}>{t('pos.thisWeek')}</button>
              <button onClick={() => shiftWeek(1)} style={{ padding: '6px 10px', borderRadius: 8 }}>›</button>
              <button className="btn-primary" onClick={() => setShiftForm({ staff_id: active[0]?.id || '', data: today, hora_inicio: config.hora_abre, hora_fim: config.hora_fecha, obs: '' })} disabled={!active.length} style={{ padding: '6px 12px', borderRadius: 8 }}>+ {t('pos.addShift')}</button>
            </div>
          )}
        >
          {!turnos ? <Spinner /> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(110px,1fr))', gap: 6, overflowX: 'auto' }}>
              {weekDays.map((dk, i) => {
                const list = turnos.filter(tr => tr.data === dk)
                const isToday = dk === today
                return (
                  <div key={dk} style={{ background: isToday ? 'rgba(193,156,86,0.1)' : 'var(--bg3)', border: isToday ? '1px solid var(--gold)' : '1px solid transparent', borderRadius: 10, padding: 8, minHeight: 90 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>{dayNames[i]} <span style={{ color: 'var(--text2)', fontWeight: 400 }}>{dk.slice(5)}</span></div>
                    {list.map(tr => {
                      const s = staff.find(x => x.id === tr.staff_id)
                      return (
                        <div key={tr.id} style={{ background: 'var(--bg2)', borderRadius: 8, padding: '6px 8px', marginBottom: 4, fontSize: 11, border: '1px solid var(--border)' }}>
                          <div style={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s?.nome || '?'}</span>
                            <button onClick={() => deleteShift(tr.id)} style={{ border: 'none', background: 'none', color: 'var(--red)', cursor: 'pointer', padding: 0, fontSize: 11 }}>✕</button>
                          </div>
                          <div style={{ color: 'var(--text2)' }}>{String(tr.hora_inicio).slice(0, 5)}–{String(tr.hora_fim).slice(0, 5)} · {hoursBetween(tr.hora_inicio, tr.hora_fim)}h</div>
                        </div>
                      )
                    })}
                    <button onClick={() => setShiftForm({ staff_id: active[0]?.id || '', data: dk, hora_inicio: config.hora_abre, hora_fim: config.hora_fecha, obs: '' })} disabled={!active.length}
                      style={{ width: '100%', fontSize: 10, padding: 4, borderRadius: 6, marginTop: 2, border: '1px dashed var(--border2)', background: 'transparent' }}>+</button>
                  </div>
                )
              })}
            </div>
          )}
        </PortalSurface>
      )}

      <PosModal open={showForm} title={editId ? t('pos.editStaff') : t('pos.addStaff')} onClose={() => setShowForm(false)}>
        <Field label={t('pos.name')}><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} autoFocus /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label={t('pos.role')}>
            <select value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })}>{ROLES.map(r => <option key={r}>{r}</option>)}</select>
          </Field>
          <Field label={t('pos.phone')}><input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} /></Field>
          <Field label={t('pos.baseSalary')}><input type="number" min="0" value={form.salario_base} onChange={e => setForm({ ...form, salario_base: e.target.value })} /></Field>
          <Field label={t('pos.commissionPct')}><input type="number" min="0" step="0.5" value={form.comissao_pct} onChange={e => setForm({ ...form, comissao_pct: e.target.value })} /></Field>
        </div>
        <Field label={t('common.notes')}><input value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} /></Field>
        <button className="btn-primary" onClick={saveStaff} disabled={saving || !form.nome.trim()} style={{ width: '100%', padding: 11, borderRadius: 10 }}>{saving ? t('common.saving') : t('common.save')}</button>
      </PosModal>

      <PosModal open={!!shiftForm} title={t('pos.addShift')} onClose={() => setShiftForm(null)} width={360}>
        {shiftForm && (
          <>
            <Field label={t('pos.staffMember')}>
              <select value={shiftForm.staff_id} onChange={e => setShiftForm({ ...shiftForm, staff_id: e.target.value })}>
                {active.map(s => <option key={s.id} value={s.id}>{s.nome} · {s.cargo}</option>)}
              </select>
            </Field>
            <Field label={t('common.date')}><input type="date" value={shiftForm.data} onChange={e => setShiftForm({ ...shiftForm, data: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label={t('pos.shiftStart')}><input type="time" value={shiftForm.hora_inicio} onChange={e => setShiftForm({ ...shiftForm, hora_inicio: e.target.value })} /></Field>
              <Field label={t('pos.shiftEnd')}><input type="time" value={shiftForm.hora_fim} onChange={e => setShiftForm({ ...shiftForm, hora_fim: e.target.value })} /></Field>
            </div>
            <Field label={t('common.notes')}><input value={shiftForm.obs} onChange={e => setShiftForm({ ...shiftForm, obs: e.target.value })} /></Field>
            <button className="btn-primary" onClick={saveShift} disabled={saving} style={{ width: '100%', padding: 11, borderRadius: 10 }}>{saving ? t('common.saving') : t('common.save')}</button>
          </>
        )}
      </PosModal>
    </div>
  )
}
