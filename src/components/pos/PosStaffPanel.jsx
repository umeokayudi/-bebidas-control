/**
 * Módulo 3 — Staff, custos e salários.
 * Cadastro, escala de turnos e o custo real de mão de obra do mês,
 * cruzado com o faturamento do POS e com o pico de movimento.
 */

import { useMemo, useState } from 'react'
import { fmtYen } from '../utils'
import { useI18n } from '../../lib/i18n'
import {
  CARGOS,
  TIPOS_PAGAMENTO,
  coverageAlerts,
  monthlyPayroll,
  payrollSummary,
  shiftCoverage,
  shiftHours,
} from '../../lib/barStaff'
import { buildHourlyBuckets, hourLabel, operatingHours } from '../../lib/posHourly'
import { deleteTurno, saveStaff, saveTurno } from '../../lib/posData'
import { Banner, Card, EmptyState, Field, Pill, StatGrid, StatTile } from './posUi'

const EMPTY_MEMBER = {
  nome: '',
  cargo: 'Bartender',
  tipo_pagamento: 'mensal',
  salario_base: '',
  comissao_pct: '0',
  telefone: '',
  ativo: true,
}

export default function PosStaffPanel({ bar, config, staffData, monthSales, mes, onRefresh }) {
  const { t } = useI18n()
  const [form, setForm] = useState(EMPTY_MEMBER)
  const [editing, setEditing] = useState(null)
  const [turnoForm, setTurnoForm] = useState({
    staff_id: '',
    data: new Date().toISOString().slice(0, 10),
    hora_inicio: String(config?.hora_abertura ?? 18),
    hora_fim: '2',
    status: 'escalado',
  })
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const staff = staffData?.staff || []
  const turnos = staffData?.turnos || []

  const faturamentoMes = (monthSales || []).reduce((a, v) => a + (+v.total || 0), 0)
  const payroll = useMemo(() => monthlyPayroll(staff, turnos, monthSales, { mes }), [staff, turnos, monthSales, mes])
  const summary = useMemo(() => payrollSummary(payroll, faturamentoMes), [payroll, faturamentoMes])

  const hours = useMemo(
    () => operatingHours(config?.hora_abertura, config?.hora_fechamento),
    [config]
  )
  const buckets = useMemo(
    () => buildHourlyBuckets(monthSales, { openHour: config?.hora_abertura, closeHour: config?.hora_fechamento }),
    [monthSales, config]
  )
  const coverage = useMemo(() => shiftCoverage(turnos, hours), [turnos, hours])
  const alerts = useMemo(() => coverageAlerts(coverage, buckets), [coverage, buckets])
  const maxCover = Math.max(1, ...coverage.map(c => c.staff))

  const hoje = new Date().toISOString().slice(0, 10)
  const turnosHoje = turnos.filter(tr => tr.data === hoje)
  const staffById = new Map(staff.map(s => [s.id, s]))

  function startEdit(member) {
    setEditing(member.id)
    setForm({
      nome: member.nome || '',
      cargo: member.cargo || 'Bartender',
      tipo_pagamento: member.tipo_pagamento || 'mensal',
      salario_base: String(member.salario_base ?? ''),
      comissao_pct: String(member.comissao_pct ?? 0),
      telefone: member.telefone || '',
      ativo: member.ativo !== false,
    })
  }

  function cancelEdit() {
    setEditing(null)
    setForm(EMPTY_MEMBER)
  }

  async function submitMember() {
    if (!form.nome.trim()) return setFeedback({ tone: 'red', text: t('pos.common.nameRequired') })
    setBusy(true)
    try {
      await saveStaff(bar.id, { ...form, id: editing })
      setFeedback({ tone: 'green', text: t('pos.staff.saved') })
      cancelEdit()
      onRefresh?.()
    } catch (e) {
      setFeedback({ tone: 'red', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function toggleAtivo(member) {
    setBusy(true)
    try {
      await saveStaff(bar.id, { ...member, ativo: member.ativo === false })
      onRefresh?.()
    } catch (e) {
      setFeedback({ tone: 'red', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function submitTurno() {
    if (!turnoForm.staff_id) return setFeedback({ tone: 'red', text: t('pos.staff.pickMember') })
    setBusy(true)
    try {
      await saveTurno(bar.id, turnoForm)
      setFeedback({ tone: 'green', text: t('pos.staff.shiftSaved') })
      onRefresh?.()
    } catch (e) {
      setFeedback({ tone: 'red', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function removeTurno(id) {
    setBusy(true)
    try {
      await deleteTurno(id)
      onRefresh?.()
    } catch (e) {
      setFeedback({ tone: 'red', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {feedback && <Banner tone={feedback.tone === 'green' ? 'green' : 'red'}>{feedback.text}</Banner>}

      <StatGrid>
        <StatTile label={t('pos.staff.team')} value={summary.funcionarios} sub={t('pos.staff.hoursScheduled', { hours: summary.horas })} />
        <StatTile label={t('pos.staff.fixedCost')} value={fmtYen(summary.custoFixo)} />
        <StatTile label={t('pos.staff.commissions')} value={fmtYen(summary.comissoes)} color="var(--gold)" />
        <StatTile label={t('pos.staff.totalCost')} value={fmtYen(summary.custoTotal)} color="var(--red)" />
        <StatTile
          label={t('pos.staff.costRatio')}
          value={`${summary.custoPct}%`}
          sub={t('pos.staff.costRatioSub', { revenue: fmtYen(summary.faturamento) })}
          color={summary.custoPct === 0 ? 'var(--text3)' : summary.custoPct <= 30 ? 'var(--green)' : summary.custoPct <= 45 ? 'var(--amber)' : 'var(--red)'}
        />
      </StatGrid>

      {alerts.length > 0 && (
        <Banner tone="amber" title={t('pos.staff.alertTitle')}>
          {alerts.slice(0, 4).map(a => (
            <div key={`${a.hora}-${a.tipo}`}>
              {hourLabel(a.hora)} · {t(a.tipo === 'falta_staff' ? 'pos.staff.alertShort' : 'pos.staff.alertIdle', {
                staff: a.staff,
                amount: fmtYen(a.faturamento),
              })}
            </div>
          ))}
        </Banner>
      )}

      <Card title={t('pos.staff.payrollTitle')} sub={t('pos.staff.payrollSub', { month: mes })}>
        {payroll.length === 0 ? (
          <EmptyState icon="👥" text={t('pos.staff.noStaff')} />
        ) : (
          <div className="pos-table-wrap">
            <table className="pos-table">
              <thead>
                <tr>
                  <th>{t('pos.common.name')}</th>
                  <th>{t('pos.staff.role')}</th>
                  <th>{t('pos.staff.payType')}</th>
                  <th>{t('pos.staff.shifts')}</th>
                  <th>{t('pos.staff.hours')}</th>
                  <th>{t('pos.staff.fixedCost')}</th>
                  <th>{t('pos.staff.commissions')}</th>
                  <th>{t('pos.staff.totalCost')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {payroll.map(r => (
                  <tr key={r.id} style={{ opacity: r.ativo ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 700 }}>{r.nome}</td>
                    <td style={{ color: 'var(--text2)' }}>{r.cargo}</td>
                    <td><Pill tone="neutral">{t(`pos.staff.payTypes.${r.tipo_pagamento}`)}</Pill></td>
                    <td>{r.dias}</td>
                    <td>{r.horas}h</td>
                    <td>{fmtYen(r.custoFixo)}</td>
                    <td style={{ color: 'var(--gold)' }}>{fmtYen(r.comissao)}</td>
                    <td style={{ fontWeight: 800 }}>{fmtYen(r.custoTotal)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="pos-btn-sm" onClick={() => startEdit(staffById.get(r.id) || r)}>
                        {t('pos.common.edit')}
                      </button>
                      <button type="button" className="pos-btn-sm" disabled={busy} onClick={() => toggleAtivo(staffById.get(r.id) || r)} style={{ marginLeft: 6 }}>
                        {r.ativo ? t('pos.common.deactivate') : t('pos.common.reactivate')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="pos-grid-2">
        <Card title={editing ? t('pos.staff.editMember') : t('pos.staff.newMember')}>
          <Field label={t('pos.common.name')}>
            <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
          </Field>
          <div className="pos-grid-2">
            <Field label={t('pos.staff.role')}>
              <select value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })}>
                {CARGOS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={t('pos.staff.payType')}>
              <select value={form.tipo_pagamento} onChange={e => setForm({ ...form, tipo_pagamento: e.target.value })}>
                {TIPOS_PAGAMENTO.map(tp => <option key={tp} value={tp}>{t(`pos.staff.payTypes.${tp}`)}</option>)}
              </select>
            </Field>
          </div>
          <div className="pos-grid-2">
            <Field
              label={t('pos.staff.baseSalary')}
              hint={t(`pos.staff.baseHint.${form.tipo_pagamento}`)}
            >
              <input type="number" min="0" value={form.salario_base} onChange={e => setForm({ ...form, salario_base: e.target.value })} />
            </Field>
            <Field label={t('pos.staff.commissionPct')} hint={t('pos.staff.commissionHint')}>
              <input type="number" min="0" max="100" value={form.comissao_pct} onChange={e => setForm({ ...form, comissao_pct: e.target.value })} />
            </Field>
          </div>
          <Field label={t('pos.common.phone')}>
            <input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} />
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-primary" disabled={busy} onClick={submitMember} style={{ flex: 1, padding: 12, borderRadius: 11 }}>
              {busy ? t('common.saving') : editing ? t('pos.common.save') : t('pos.staff.addMember')}
            </button>
            {editing && (
              <button type="button" className="pos-btn-sm" onClick={cancelEdit} style={{ padding: '12px 16px' }}>
                {t('pos.common.cancel')}
              </button>
            )}
          </div>
        </Card>

        <Card title={t('pos.staff.scheduleTitle')} sub={t('pos.staff.scheduleSub')}>
          <Field label={t('pos.staff.member')}>
            <select value={turnoForm.staff_id} onChange={e => setTurnoForm({ ...turnoForm, staff_id: e.target.value })}>
              <option value="">{t('pos.common.select')}</option>
              {staff.filter(s => s.ativo !== false).map(s => (
                <option key={s.id} value={s.id}>{s.nome} · {s.cargo}</option>
              ))}
            </select>
          </Field>
          <div className="pos-grid-3">
            <Field label={t('pos.common.date')}>
              <input type="date" value={turnoForm.data} onChange={e => setTurnoForm({ ...turnoForm, data: e.target.value })} />
            </Field>
            <Field label={t('pos.staff.from')}>
              <select value={turnoForm.hora_inicio} onChange={e => setTurnoForm({ ...turnoForm, hora_inicio: e.target.value })}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
            </Field>
            <Field label={t('pos.staff.to')}>
              <select value={turnoForm.hora_fim} onChange={e => setTurnoForm({ ...turnoForm, hora_fim: e.target.value })}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
            </Field>
          </div>
          <button type="button" className="btn-primary" disabled={busy} onClick={submitTurno} style={{ width: '100%', padding: 12, borderRadius: 11, marginBottom: 14 }}>
            {busy ? t('common.saving') : t('pos.staff.addShift')}
          </button>

          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text2)', marginBottom: 8 }}>
            {t('pos.staff.todayShifts')}
          </div>
          {turnosHoje.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('pos.staff.noShiftsToday')}</div>
          ) : (
            turnosHoje.map(tr => (
              <div key={tr.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <span>
                  <strong>{staffById.get(tr.staff_id)?.nome || '—'}</strong>
                  {' · '}{hourLabel(tr.hora_inicio)}–{hourLabel(tr.hora_fim)} ({shiftHours(tr)}h)
                </span>
                <button type="button" className="pos-btn-sm danger" disabled={busy} onClick={() => removeTurno(tr.id)}>
                  {t('pos.common.remove')}
                </button>
              </div>
            ))
          )}
        </Card>
      </div>

      <Card title={t('pos.staff.coverageTitle')} sub={t('pos.staff.coverageSub')}>
        {coverage.every(c => c.staff === 0) ? (
          <EmptyState icon="🕒" text={t('pos.staff.coverageEmpty')} />
        ) : (
          <div className="pos-hourbars" style={{ height: 126 }}>
            {coverage.map(c => (
              <div key={c.hora} className="pos-hourbar">
                <div className="pos-hourbar-tip">{hourLabel(c.hora)} · {t('pos.staff.peopleCount', { count: c.staff })}</div>
                <div
                  className="pos-hourbar-fill"
                  style={{
                    height: `${Math.max(3, (c.staff / maxCover) * 90)}px`,
                    background: c.staff === 0 ? 'var(--border2)' : 'var(--navy)',
                  }}
                />
                <div className="pos-hourbar-label">{String(c.hora).padStart(2, '0')}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
