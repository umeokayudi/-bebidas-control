import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../Auth'
import { useI18n } from '../../lib/i18n'
import { fmtYen, fmtDate, Spinner } from '../utils'
import { PortalSurface } from '../ui/PageLayout'
import { Field, ModeButtons, PosModal, StatCard, StatGrid, StatusPill, Pill } from './PosShared'

const STATUSES = ['aberto', 'agendado', 'em_andamento', 'concluido', 'cancelado']
const OPEN = ['aberto', 'agendado', 'em_andamento']
const NEXT = { aberto: ['agendado', 'em_andamento', 'cancelado'], agendado: ['em_andamento', 'concluido', 'cancelado'], em_andamento: ['concluido', 'cancelado'], concluido: [], cancelado: ['aberto'] }
const EMPTY = { tipo: 'limpeza', titulo: '', descricao: '', prioridade: 'media', data_agendada: '', hora_agendada: '', fornecedor: 'KuriPuro', custo: '', recorrencia: 'nenhuma' }

export default function PosServices({ bar, data }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const { today } = data
  const [orders, setOrders] = useState(null)
  const [filter, setFilter] = useState('open')
  const [form, setForm] = useState(EMPTY)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [detail, setDetail] = useState(null)
  const [eventos, setEventos] = useState([])
  const [note, setNote] = useState('')

  useEffect(() => { load() }, [bar.id])

  async function load() {
    const { data: rows } = await supabase.from('service_orders').select('*').eq('bar_id', bar.id).order('criado_em', { ascending: false }).limit(200)
    setOrders(rows || [])
  }

  async function openDetail(o) {
    setDetail(o)
    setNote('')
    const { data: ev } = await supabase.from('service_order_eventos').select('*').eq('service_order_id', o.id).order('criado_em', { ascending: false })
    setEventos(ev || [])
  }

  async function save() {
    if (!form.titulo.trim()) return
    setSaving(true)
    const status = form.data_agendada ? 'agendado' : 'aberto'
    const { data: row, error } = await supabase.from('service_orders').insert({
      bar_id: bar.id, tipo: form.tipo, titulo: form.titulo.trim(), descricao: form.descricao || null, prioridade: form.prioridade,
      status, data_agendada: form.data_agendada || null, hora_agendada: form.hora_agendada || null,
      fornecedor: form.fornecedor || null, custo: +form.custo || 0, recorrencia: form.recorrencia, criado_por: user?.id || null,
    }).select().single()
    if (!error && row) {
      await supabase.from('service_order_eventos').insert({ service_order_id: row.id, status, nota: t('pos.serviceCreated'), criado_por: user?.id || null })
    }
    setSaving(false)
    setShowForm(false)
    setForm(EMPTY)
    load()
  }

  async function changeStatus(o, status) {
    const patch = { status }
    if (status === 'concluido') patch.concluido_em = new Date().toISOString()
    await supabase.from('service_orders').update(patch).eq('id', o.id)
    await supabase.from('service_order_eventos').insert({ service_order_id: o.id, status, nota: note || null, criado_por: user?.id || null })
    if (status === 'concluido' && o.recorrencia && o.recorrencia !== 'nenhuma' && o.data_agendada) {
      const d = new Date(`${o.data_agendada}T12:00:00`)
      if (o.recorrencia === 'semanal') d.setDate(d.getDate() + 7)
      else d.setMonth(d.getMonth() + 1)
      await supabase.from('service_orders').insert({
        bar_id: bar.id, tipo: o.tipo, titulo: o.titulo, descricao: o.descricao, prioridade: o.prioridade, status: 'agendado',
        data_agendada: d.toISOString().slice(0, 10), hora_agendada: o.hora_agendada, fornecedor: o.fornecedor, custo: o.custo,
        recorrencia: o.recorrencia, criado_por: user?.id || null,
      })
    }
    setNote('')
    const updated = { ...o, ...patch }
    setDetail(updated)
    const { data: ev } = await supabase.from('service_order_eventos').select('*').eq('service_order_id', o.id).order('criado_em', { ascending: false })
    setEventos(ev || [])
    load()
  }

  async function addNote(o) {
    if (!note.trim()) return
    await supabase.from('service_order_eventos').insert({ service_order_id: o.id, status: o.status, nota: note.trim(), criado_por: user?.id || null })
    setNote('')
    const { data: ev } = await supabase.from('service_order_eventos').select('*').eq('service_order_id', o.id).order('criado_em', { ascending: false })
    setEventos(ev || [])
  }

  const list = useMemo(() => (orders || []).filter(o => {
    if (filter === 'open') return OPEN.includes(o.status)
    if (filter === 'done') return o.status === 'concluido' || o.status === 'cancelado'
    return true
  }), [orders, filter])

  const open = (orders || []).filter(o => OPEN.includes(o.status))
  const overdue = open.filter(o => o.data_agendada && o.data_agendada < today)
  const monthCost = (orders || []).filter(o => o.status === 'concluido' && (o.concluido_em || '').startsWith(today.slice(0, 7))).reduce((a, o) => a + (+o.custo || 0), 0)
  const upcoming = open.filter(o => o.data_agendada && o.data_agendada >= today).sort((a, b) => a.data_agendada.localeCompare(b.data_agendada))[0]

  const prioColor = { alta: '#c0392b', media: '#8A5A00', baixa: 'var(--text2)' }

  if (!orders) return <Spinner text={t('pos.loading')} />

  return (
    <div>
      <StatGrid>
        <StatCard label={t('pos.openTickets')} value={open.length} sub={t('pos.overdueTickets', { count: overdue.length })} color={overdue.length ? '#c0392b' : 'var(--navy)'} icon="🎫" />
        <StatCard label={t('pos.nextService')} value={upcoming ? fmtDate(upcoming.data_agendada) : '—'} sub={upcoming ? `${upcoming.tipo === 'limpeza' ? '🧹' : '🔧'} ${upcoming.titulo}` : t('pos.nothingScheduled')} icon="📅" />
        <StatCard label={t('pos.servicesCostMonth')} value={fmtYen(monthCost)} sub={t('pos.completedThisMonth')} icon="💸" />
        <StatCard label={t('pos.cleaning')} value={open.filter(o => o.tipo === 'limpeza').length} sub={t('pos.maintenanceOpen', { count: open.filter(o => o.tipo === 'manutencao').length })} icon="🧹" />
      </StatGrid>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <ModeButtons value={filter} onChange={setFilter} options={[['open', t('pos.filterOpen')], ['done', t('pos.filterDone')], ['all', t('common.all')]]} />
        <button className="btn-primary" onClick={() => { setForm(EMPTY); setShowForm(true) }} style={{ padding: '8px 14px', borderRadius: 10, marginBottom: 16 }}>+ {t('pos.newTicket')}</button>
      </div>

      <PortalSurface title={t('pos.ticketCenter')} sub={t('pos.ticketCenterSub')}>
        {list.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('pos.noTickets')}</div> : list.map(o => (
          <div key={o.id} onClick={() => openDetail(o)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{o.tipo === 'limpeza' ? '🧹' : '🔧'} {o.titulo} <span style={{ fontSize: 10, color: prioColor[o.prioridade], fontWeight: 700, marginLeft: 6 }}>● {t(`pos.priority.${o.prioridade}`)}</span></div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                {o.fornecedor && <span>{o.fornecedor} · </span>}
                {o.data_agendada ? <span style={{ color: o.data_agendada < today && OPEN.includes(o.status) ? '#c0392b' : undefined }}>{fmtDate(o.data_agendada)}{o.hora_agendada ? ` ${String(o.hora_agendada).slice(0, 5)}` : ''}</span> : t('pos.notScheduled')}
                {o.recorrencia && o.recorrencia !== 'nenhuma' && <span> · 🔁 {t(`pos.recurrence.${o.recorrencia}`)}</span>}
                {+o.custo > 0 && <span> · {fmtYen(o.custo)}</span>}
              </div>
            </div>
            <StatusPill status={o.status} label={t(`pos.serviceStatus.${o.status}`)} />
          </div>
        ))}
      </PortalSurface>

      <PosModal open={showForm} title={t('pos.newTicket')} onClose={() => setShowForm(false)} width={460}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label={t('pos.serviceType')}>
            <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value, fornecedor: e.target.value === 'limpeza' ? 'KuriPuro' : '' })}>
              <option value="limpeza">🧹 {t('pos.cleaning')}</option>
              <option value="manutencao">🔧 {t('pos.maintenance')}</option>
            </select>
          </Field>
          <Field label={t('pos.priorityLabel')}>
            <select value={form.prioridade} onChange={e => setForm({ ...form, prioridade: e.target.value })}>
              {['baixa', 'media', 'alta'].map(p => <option key={p} value={p}>{t(`pos.priority.${p}`)}</option>)}
            </select>
          </Field>
        </div>
        <Field label={t('pos.ticketTitle')}><input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder={t('pos.ticketTitlePlaceholder')} autoFocus /></Field>
        <Field label={t('pos.description')}><textarea rows={3} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} style={{ width: '100%' }} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label={t('pos.scheduledDate')}><input type="date" value={form.data_agendada} onChange={e => setForm({ ...form, data_agendada: e.target.value })} /></Field>
          <Field label={t('pos.scheduledTime')}><input type="time" value={form.hora_agendada} onChange={e => setForm({ ...form, hora_agendada: e.target.value })} /></Field>
          <Field label={t('pos.provider')}><input value={form.fornecedor} onChange={e => setForm({ ...form, fornecedor: e.target.value })} /></Field>
          <Field label={t('pos.estimatedCost')}><input type="number" min="0" value={form.custo} onChange={e => setForm({ ...form, custo: e.target.value })} /></Field>
          <Field label={t('pos.recurrenceLabel')}>
            <select value={form.recorrencia} onChange={e => setForm({ ...form, recorrencia: e.target.value })}>
              {['nenhuma', 'semanal', 'mensal'].map(r => <option key={r} value={r}>{t(`pos.recurrence.${r}`)}</option>)}
            </select>
          </Field>
        </div>
        <button className="btn-primary" onClick={save} disabled={saving || !form.titulo.trim()} style={{ width: '100%', padding: 11, borderRadius: 10 }}>{saving ? t('common.saving') : t('pos.openTicket')}</button>
      </PosModal>

      <PosModal open={!!detail} title={detail ? `${detail.tipo === 'limpeza' ? '🧹' : '🔧'} ${detail.titulo}` : ''} onClose={() => setDetail(null)} width={520}>
        {detail && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <StatusPill status={detail.status} label={t(`pos.serviceStatus.${detail.status}`)} />
              <Pill color={prioColor[detail.prioridade]}>{t(`pos.priority.${detail.prioridade}`)}</Pill>
              {detail.fornecedor && <Pill>{detail.fornecedor}</Pill>}
              {detail.data_agendada && <Pill>{fmtDate(detail.data_agendada)}{detail.hora_agendada ? ` ${String(detail.hora_agendada).slice(0, 5)}` : ''}</Pill>}
              {+detail.custo > 0 && <Pill>{fmtYen(detail.custo)}</Pill>}
            </div>
            {detail.descricao && <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12, whiteSpace: 'pre-wrap' }}>{detail.descricao}</div>}

            <Field label={t('pos.noteLabel')}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder={t('pos.notePlaceholder')} style={{ flex: 1 }} />
                <button onClick={() => addNote(detail)} disabled={!note.trim()} style={{ padding: '8px 12px' }}>+</button>
              </div>
            </Field>
            {NEXT[detail.status]?.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                {NEXT[detail.status].map(s => (
                  <button key={s} className={s === 'concluido' ? 'btn-primary' : undefined} onClick={() => changeStatus(detail, s)} style={{ fontSize: 12, padding: '7px 12px', borderRadius: 8 }}>
                    → {t(`pos.serviceStatus.${s}`)}
                  </button>
                ))}
              </div>
            )}

            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 6 }}>{t('pos.serviceHistory')}</div>
            {eventos.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>—</div> : eventos.map(ev => (
              <div key={ev.id} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <span style={{ color: 'var(--text2)', whiteSpace: 'nowrap' }}>{new Date(ev.criado_em).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                <StatusPill status={ev.status} label={t(`pos.serviceStatus.${ev.status}`)} />
                <span>{ev.nota}</span>
              </div>
            ))}
          </>
        )}
      </PosModal>
    </div>
  )
}
