/**
 * Módulo 5 — Serviços integrados (limpeza pesada e manutenção).
 * Central de chamados: agendamento, fila priorizada e histórico.
 */

import { useMemo, useState } from 'react'
import { fmtYen, fmtDate } from '../utils'
import { useI18n } from '../../lib/i18n'
import {
  RECORRENCIAS,
  SERVICE_PRIORIDADES,
  SERVICE_TIPOS,
  buildRecurrence,
  daysUntil,
  isOpen,
  isOverdue,
  nextStatus,
  sortOrders,
  summarize,
} from '../../lib/serviceOrders'
import { createRecurrence, saveServiceOrder, updateServiceStatus } from '../../lib/posData'
import { Banner, Card, EmptyState, Field, Pill, StatGrid, StatTile } from './posUi'

const EMPTY_ORDER = {
  tipo: 'limpeza',
  titulo: '',
  descricao: '',
  prioridade: 'normal',
  agendado_para: '',
  recorrencia: 'nenhuma',
  fornecedor_nome: '',
  custo_estimado: '',
}

const PRIORIDADE_TONE = { urgente: 'red', alta: 'amber', normal: 'blue', baixa: 'neutral' }
const STATUS_TONE = {
  aberto: 'amber',
  agendado: 'blue',
  em_andamento: 'gold',
  concluido: 'green',
  cancelado: 'neutral',
}

export default function PosServicesPanel({ bar, orders, userId, onRefresh }) {
  const { t } = useI18n()
  const [form, setForm] = useState(EMPTY_ORDER)
  const [editing, setEditing] = useState(null)
  const [showDone, setShowDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const list = orders || []
  const summary = useMemo(() => summarize(list), [list])
  const sorted = useMemo(() => sortOrders(list), [list])
  const visible = showDone ? sorted : sorted.filter(isOpen)

  function startEdit(order) {
    setEditing(order.id)
    setForm({
      tipo: order.tipo || 'limpeza',
      titulo: order.titulo || '',
      descricao: order.descricao || '',
      prioridade: order.prioridade || 'normal',
      agendado_para: order.agendado_para || '',
      recorrencia: order.recorrencia || 'nenhuma',
      fornecedor_nome: order.fornecedor_nome || '',
      custo_estimado: String(order.custo_estimado ?? ''),
    })
  }

  function cancelEdit() {
    setEditing(null)
    setForm(EMPTY_ORDER)
  }

  async function submit() {
    if (!form.titulo.trim()) return setFeedback({ tone: 'red', text: t('pos.services.titleRequired') })
    setBusy(true)
    try {
      await saveServiceOrder(bar.id, { ...form, id: editing }, userId)
      setFeedback({ tone: 'green', text: t('pos.services.saved') })
      cancelEdit()
      onRefresh?.()
    } catch (e) {
      setFeedback({ tone: 'red', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function advance(order) {
    const next = nextStatus(order.status)
    setBusy(true)
    try {
      await updateServiceStatus(order, next)
      if (next === 'concluido') {
        const recurrence = buildRecurrence(order)
        if (recurrence) {
          await createRecurrence(recurrence)
          setFeedback({ tone: 'green', text: t('pos.services.recurrenceCreated', { date: recurrence.agendado_para }) })
        }
      }
      onRefresh?.()
    } catch (e) {
      setFeedback({ tone: 'red', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function cancel(order) {
    setBusy(true)
    try {
      await updateServiceStatus(order, 'cancelado')
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
        <StatTile label={t('pos.services.open')} value={summary.abertos} />
        <StatTile label={t('pos.services.late')} value={summary.atrasados} color={summary.atrasados > 0 ? 'var(--red)' : 'var(--green)'} />
        <StatTile label={t('pos.services.thisWeek')} value={summary.agendadosSemana} color="var(--blue)" />
        <StatTile label={t('pos.services.openCost')} value={fmtYen(summary.custoAberto)} sub={t('pos.services.doneCost', { amount: fmtYen(summary.custoConcluido) })} />
        <StatTile
          label={t('pos.services.byType')}
          value={`${summary.porTipo.limpeza || 0} / ${summary.porTipo.manutencao || 0}`}
          sub={t('pos.services.byTypeSub')}
        />
      </StatGrid>

      {summary.atrasados > 0 && (
        <Banner tone="red" title={t('pos.services.lateTitle', { count: summary.atrasados })}>
          {sorted.filter(o => isOverdue(o)).slice(0, 4).map(o => o.titulo).join(' · ')}
        </Banner>
      )}

      <div className="pos-grid-2">
        <Card title={editing ? t('pos.services.editOrder') : t('pos.services.newOrder')} sub={t('pos.services.formSub')}>
          <div className="pos-grid-2">
            <Field label={t('pos.services.type')}>
              <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                {SERVICE_TIPOS.map(tp => <option key={tp} value={tp}>{t(`pos.services.types.${tp}`)}</option>)}
              </select>
            </Field>
            <Field label={t('pos.services.priority')}>
              <select value={form.prioridade} onChange={e => setForm({ ...form, prioridade: e.target.value })}>
                {SERVICE_PRIORIDADES.map(p => <option key={p} value={p}>{t(`pos.services.priorities.${p}`)}</option>)}
              </select>
            </Field>
          </div>
          <Field label={t('pos.services.titleField')}>
            <input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder={t('pos.services.titlePlaceholder')} />
          </Field>
          <Field label={t('pos.services.description')}>
            <textarea rows="2" value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} />
          </Field>
          <div className="pos-grid-2">
            <Field label={t('pos.services.scheduledFor')}>
              <input type="date" value={form.agendado_para} onChange={e => setForm({ ...form, agendado_para: e.target.value })} />
            </Field>
            <Field label={t('pos.services.recurrence')} hint={t('pos.services.recurrenceHint')}>
              <select value={form.recorrencia} onChange={e => setForm({ ...form, recorrencia: e.target.value })}>
                {RECORRENCIAS.map(r => <option key={r} value={r}>{t(`pos.services.recurrences.${r}`)}</option>)}
              </select>
            </Field>
          </div>
          <div className="pos-grid-2">
            <Field label={t('pos.services.provider')}>
              <input value={form.fornecedor_nome} onChange={e => setForm({ ...form, fornecedor_nome: e.target.value })} />
            </Field>
            <Field label={t('pos.services.estimatedCost')}>
              <input type="number" min="0" value={form.custo_estimado} onChange={e => setForm({ ...form, custo_estimado: e.target.value })} />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-primary" disabled={busy} onClick={submit} style={{ flex: 1, padding: 12, borderRadius: 11 }}>
              {busy ? t('common.saving') : editing ? t('pos.common.save') : t('pos.services.addOrder')}
            </button>
            {editing && (
              <button type="button" className="pos-btn-sm" onClick={cancelEdit} style={{ padding: '12px 16px' }}>
                {t('pos.common.cancel')}
              </button>
            )}
          </div>
        </Card>

        <Card
          title={t('pos.services.queueTitle')}
          sub={t('pos.services.queueSub')}
          headerRight={(
            <button type="button" className="pos-btn-sm" onClick={() => setShowDone(v => !v)}>
              {showDone ? t('pos.services.hideDone') : t('pos.services.showDone')}
            </button>
          )}
        >
          {visible.length === 0 ? (
            <EmptyState icon="🧹" text={t('pos.services.empty')} />
          ) : (
            visible.map(o => {
              const dias = daysUntil(o)
              const late = isOverdue(o)
              return (
                <div key={o.id} className="pos-row" style={late ? { borderColor: 'rgba(160,41,28,0.35)' } : undefined}>
                  <div className="pos-row-main">
                    <div className="pos-row-title">
                      {t(`pos.services.types.${o.tipo}`)} · {o.titulo}
                    </div>
                    <div className="pos-row-sub">
                      {o.agendado_para
                        ? `${fmtDate(o.agendado_para)}${dias != null && isOpen(o) ? ` · ${late ? t('pos.services.overdueBy', { days: Math.abs(dias) }) : t('pos.services.inDays', { days: dias })}` : ''}`
                        : t('pos.services.noDate')}
                      {o.fornecedor_nome ? ` · ${o.fornecedor_nome}` : ''}
                      {+o.custo_estimado > 0 ? ` · ${fmtYen(o.custo_estimado)}` : ''}
                    </div>
                  </div>
                  <Pill tone={PRIORIDADE_TONE[o.prioridade] || 'neutral'}>{t(`pos.services.priorities.${o.prioridade}`)}</Pill>
                  <Pill tone={STATUS_TONE[o.status] || 'neutral'}>{t(`pos.services.statuses.${o.status}`)}</Pill>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {isOpen(o) && (
                      <button type="button" className="pos-btn-sm" disabled={busy} onClick={() => advance(o)}>
                        {t(`pos.services.advance.${nextStatus(o.status)}`)}
                      </button>
                    )}
                    <button type="button" className="pos-btn-sm" onClick={() => startEdit(o)}>
                      {t('pos.common.edit')}
                    </button>
                    {isOpen(o) && (
                      <button type="button" className="pos-btn-sm danger" disabled={busy} onClick={() => cancel(o)}>
                        {t('pos.common.cancel')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </Card>
      </div>
    </div>
  )
}
