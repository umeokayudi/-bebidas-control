import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtYen, Spinner } from './utils'
import { useI18n } from '../lib/i18n'
import HourlyBars from './HourlyBars'
import { scoreCastRoster } from '../lib/castScore'
import { tokyoMonthKey, tokyoNightKey } from '../lib/tokyo'

function statusLabel(t, status) {
  if (status === 'below_be') return t('cast.belowBe')
  if (status === 'hit_goal') return t('cast.hitGoal')
  if (status === 'covering') return t('cast.covering')
  if (status === 'to_goal') return t('cast.toGoal')
  return t('cast.openLane')
}

export default function CastScoreTab({ bar, compact = false, salesHint, agentsHint }) {
  const { t } = useI18n()
  const [agents, setAgents] = useState(agentsHint || [])
  const [sales, setSales] = useState(salesHint || [])
  const [goals, setGoals] = useState({})
  const [pick, setPick] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [draft, setDraft] = useState({ night: '', month: '', breakeven: '' })

  const nightKey = tokyoNightKey()
  const monthKey = tokyoMonthKey()

  async function load() {
    setLoading(true)
    const [aR, sR, mR] = await Promise.all([
      supabase.from('drink_back_agents').select('*').eq('bar_id', bar.id).order('nome'),
      supabase.from('pos_vendas').select('id,total,data,criado_em,metodo_pagamento,drink_back_agent_id,obs').eq('bar_id', bar.id).gte('data', `${monthKey}-01`),
      supabase.from('bar_hq_meta').select('cast_goals').eq('bar_id', bar.id).maybeSingle(),
    ])
    setAgents(aR.data || agentsHint || [])
    setSales(sR.data || salesHint || [])
    setGoals(mR.data?.cast_goals || {})
    setLoading(false)
  }

  useEffect(() => { load() }, [bar.id, monthKey])

  const board = useMemo(
    () => scoreCastRoster(agents, sales, { nightKey, monthKey, goals }),
    [agents, sales, nightKey, monthKey, goals],
  )
  const people = board.people
  const selected = people.find(p => p.id === pick) || people[0] || null

  useEffect(() => {
    if (!selected) return
    setDraft({
      night: selected.goal.night ? String(selected.goal.night) : '',
      month: selected.goal.month ? String(selected.goal.month) : '',
      breakeven: selected.goal.breakeven ? String(selected.goal.breakeven) : '',
    })
  }, [selected?.id, selected?.goal.night, selected?.goal.month, selected?.goal.breakeven])

  async function saveGoals() {
    if (!selected) return
    setBusy(true)
    setMsg('')
    const next = {
      night: Math.round(+draft.night || 0),
      month: Math.round(+draft.month || 0),
      breakeven: Math.round(+draft.breakeven || 0),
    }
    await supabase.from('drink_back_agents').update({
      meta_noite: next.night,
      meta_mes: next.month,
      breakeven: next.breakeven,
    }).eq('id', selected.id)
    const merged = { ...goals, [selected.id]: next }
    const { data: meta } = await supabase.from('bar_hq_meta').select('id,cast_goals').eq('bar_id', bar.id).maybeSingle()
    if (meta?.id) await supabase.from('bar_hq_meta').update({ cast_goals: merged }).eq('id', meta.id)
    else await supabase.from('bar_hq_meta').insert({ id: bar.id, bar_id: bar.id, cast_goals: merged })
    setGoals(merged)
    setAgents(list => list.map(a => a.id === selected.id ? { ...a, meta_noite: next.night, meta_mes: next.month, breakeven: next.breakeven } : a))
    setMsg(t('common.success'))
    setBusy(false)
  }

  const hourly = selected ? selected.night.nightHours : board.all.night.nightHours

  if (loading) return <Spinner text={t('cast.loading')} />

  return (
    <div className={`fade-in portal-page cast-page${compact ? ' is-compact' : ''}`}>
      {!compact && (
        <>
          <div className="hq-title">{t('cast.title')}</div>
          <div className="hq-sub">{t('cast.subtitle')}</div>
        </>
      )}
      {compact && <div className="hq-panel-title">{t('cast.title')}</div>}
      <div className="hq-panel-hint">{t('cast.hint')}</div>

      <div className="hq-kpis">
        <div><b>{fmtYen(board.all.night.total)}</b><span>{t('cast.nightAll')}</span></div>
        <div><b>{fmtYen(board.all.taggedNight.total)}</b><span>{t('cast.nightTagged')}</span></div>
        <div><b>{fmtYen(board.all.month.total)}</b><span>{t('cast.monthAll')}</span></div>
        <div><b>{people.length}</b><span>{t('cast.people')}</span></div>
      </div>

      <div className="cast-grid">
        {people.length === 0 && <div className="hq-empty">{t('cast.empty')}</div>}
        {people.map(p => (
          <button
            key={p.id}
            type="button"
            className={`cast-card${selected?.id === p.id ? ' is-on' : ''}${p.lane.status === 'below_be' ? ' is-warn' : ''}${p.lane.status === 'hit_goal' ? ' is-ok' : ''}`}
            onClick={() => setPick(p.id)}
          >
            <div className="cast-name">{p.nome}</div>
            <div className="cast-yen">{fmtYen(p.night.total)}</div>
            <div className="cast-meta">{t('cast.tickets', { count: p.night.count })} · {t('atomicPos.commissionShort', { pct: p.comissao_pct })}</div>
            <div className={`cast-lane is-${p.lane.status}`}>{statusLabel(t, p.lane.status)}</div>
            <div className="cast-split">
              <span>{t('cast.monthShort')} {fmtYen(p.month.total)}</span>
              <span>{t('cast.beShort')} {p.goal.breakeven ? fmtYen(p.goal.breakeven) : '—'}</span>
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <div className="hq-panel cast-detail">
          <div className="hq-panel-title">{selected.nome}</div>
          <div className="hq-panel-hint">{t('cast.personHint')}</div>
          <div className="hq-kpis">
            <div><b>{fmtYen(selected.night.total)}</b><span>{t('cast.nightRev')}</span></div>
            <div><b>{fmtYen(selected.night.ticketMedio)}</b><span>{t('atomicPos.avgTicket')}</span></div>
            <div><b>{fmtYen(selected.night.commission)}</b><span>{t('atomicPos.commission')}</span></div>
            <div><b>{selected.night.peakHour?.total ? selected.night.peakHour.label : '—'}</b><span>{t('atomicPos.peakHour')}</span></div>
            <div><b>{fmtYen(selected.month.total)}</b><span>{t('cast.monthRev')}</span></div>
            <div><b>{selected.lane.be.has ? fmtYen(selected.lane.be.gap) : '—'}</b><span>{t('cast.vsBe')}</span></div>
          </div>
          <div className="cast-pay">
            {['cash', 'card', 'paypay'].map(k => (
              <span key={k}>{t(`cast.pay.${k}`)} {fmtYen(selected.night.pay[k])}</span>
            ))}
          </div>
          <div className="hq-panel-title" style={{ marginTop: 16 }}>{t('cast.hourlyNight')}</div>
          <HourlyBars data={hourly} height={90} className="is-night" />

          {!compact && (
            <div className="cast-goals">
              <div className="hq-panel-title">{t('cast.goalsTitle')}</div>
              <div className="hq-rent-row">
                <label>{t('cast.goalNight')}<input type="number" min="0" step="1000" value={draft.night} onChange={e => setDraft(d => ({ ...d, night: e.target.value }))} /></label>
                <label>{t('cast.goalMonth')}<input type="number" min="0" step="1000" value={draft.month} onChange={e => setDraft(d => ({ ...d, month: e.target.value }))} /></label>
                <label>{t('cast.breakeven')}<input type="number" min="0" step="1000" value={draft.breakeven} onChange={e => setDraft(d => ({ ...d, breakeven: e.target.value }))} /></label>
        <button type="button" className="btn-primary" data-cast-save disabled={busy} onClick={saveGoals}>{t('cast.saveGoals')}</button>
              </div>
              {selected.lane.night.has && (
                <div className="cast-progress">
                  <div className="cast-progress-bar" style={{ width: `${Math.min(100, selected.lane.night.pct)}%` }} />
                  <span>{t('cast.goalPct', { pct: selected.lane.night.pct })}</span>
                </div>
              )}
              {msg && <div className="sundry-msg">{msg}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
