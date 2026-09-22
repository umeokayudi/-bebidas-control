import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { staffFetch } from '../lib/apiAuth'
import { fmtYen } from './utils'
import { useI18n } from '../lib/i18n'
import { callGeminiChat } from '../lib/ai'
import { fetchHqSnapshot } from '../lib/hqSnapshot'
import { setDoorHash } from '../lib/barDoors'
import {
  LIVE_POLL_MS,
  LIVE_PUNCH_LOOKBACK_MS,
  buildLivePulse,
  buildStaffCutSystem,
  localStaffCutAnswer,
  saleClockLabel,
} from '../lib/livePulse'

export async function fetchLivePulseInputs(barId) {
  const to = new Date().toISOString()
  const from = new Date(Date.now() - LIVE_PUNCH_LOOKBACK_MS).toISOString()
  const [salesR, clockR, teamR] = await Promise.all([
    supabase.from('pos_vendas').select('id,total,data,criado_em,metodo_pagamento,obs').eq('bar_id', barId).order('criado_em', { ascending: false }).limit(250),
    staffFetch(`/api/time-clock?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then(r => r.json()).catch(() => ({ punches: [] })),
    staffFetch('/api/bar-staff').then(r => r.json()).catch(() => ({ staff: [] })),
  ])
  let tickets = []
  if (salesR.error) {
    try {
      const snap = await fetchHqSnapshot()
      tickets = snap?.pos?.tickets || []
    } catch {
      tickets = []
    }
  } else {
    tickets = salesR.data || []
  }
  return {
    tickets,
    punches: clockR.punches || [],
    staff: teamR.staff || [],
  }
}

export function useLivePulse(bar, { intervalMs = LIVE_POLL_MS } = {}) {
  const [pulse, setPulse] = useState(null)
  const [err, setErr] = useState('')
  const [at, setAt] = useState(null)

  async function load() {
    if (!bar?.id) return
    try {
      const input = await fetchLivePulseInputs(bar.id)
      setPulse(buildLivePulse(input))
      setAt(new Date().toISOString())
      setErr('')
    } catch (e) {
      setErr(e.message || 'live')
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, intervalMs)
    return () => clearInterval(id)
  }, [bar?.id, intervalMs])

  return { pulse, err, at, reload: load }
}

function CutCards({ pulse, t }) {
  const cuts = (pulse?.cuts || []).filter(c => c.kind !== 'none')
  if (!cuts.length || pulse?.color === 'idle') return null
  return (
    <div className="live-cuts">
      <div className="live-cuts-title">{t('portal.live.cutsTitle')}</div>
      <div className="live-cuts-row">
        {cuts.map(c => (
          <div key={c.id} className={`live-cut is-${c.afterColor} is-${c.kind}`}>
            <div className="live-cut-name">
              {c.kind === 'keep' || c.kind === 'none'
                ? t('portal.live.keep')
                : t('portal.live.sendHome', { names: c.names.join(', ') || '—' })}
            </div>
            {c.savedYen > 0 && <div className="live-cut-saved">{t('portal.live.saved', { amount: fmtYen(c.savedYen) })}</div>}
            <div className="live-cut-after">{t('portal.live.after', { amount: fmtYen(c.afterBurn) })}</div>
            <div className="live-cut-flag">
              {c.kind === 'keep'
                ? (pulse.color === 'blue' ? t('portal.live.blue') : t('portal.live.idle'))
                : c.afterColor === 'blue' ? t('portal.live.covers') : t('portal.live.stillRed')}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function GeminiCutBox({ pulse, compact = false }) {
  const { t, lang } = useI18n()
  const [text, setText] = useState('')
  const [via, setVia] = useState('local')
  const [busy, setBusy] = useState(false)

  async function ask() {
    if (!pulse || busy) return
    const local = localStaffCutAnswer(pulse, lang)
    setText(local)
    setVia('local')
    setBusy(true)
    try {
      const api = await Promise.race([
        callGeminiChat({
          messages: [{ role: 'user', content: lang === 'ja' ? 'この時間、誰を帰しますか？' : 'Who can I send home this hour?' }],
          system: buildStaffCutSystem(pulse, lang),
          temperature: 0.2,
          maxOutputTokens: 500,
        }),
        new Promise(resolve => setTimeout(() => resolve(null), 4000)),
      ])
      if (api && !/^Error:/i.test(api) && api !== 'No response') {
        setVia('api')
        setText(String(api).replace(/\*\*/g, ''))
      }
    } catch {
      // stay on local heuristic
    }
    setBusy(false)
  }

  return (
    <div className={`live-ai${compact ? ' is-compact' : ''}`}>
      <div className="live-ai-row">
        <button type="button" className="btn-primary" disabled={busy || !pulse} onClick={ask} data-live-gemini>
          {busy ? t('portal.live.asking') : t('portal.live.askGemini')}
        </button>
        {text && (
          <span className={`hq-ai-via hq-ai-via-${via === 'api' ? 'api' : 'local'}`}>
            {via === 'api' ? t('portal.live.viaGemini') : t('portal.live.viaLocal')}
          </span>
        )}
      </div>
      {(text || busy) && (
        <div className="live-ai-text" data-live-gemini-text>
          {text || t('portal.live.asking')}
        </div>
      )}
    </div>
  )
}

export default function LivePulseBand({ bar, compact = false, onTab }) {
  const { t } = useI18n()
  const { pulse, err } = useLivePulse(bar)
  if (!pulse) {
    return (
      <section className="live-pulse is-loading" aria-busy="true" aria-label={t('portal.live.title')}>
        <div className="live-pulse-kicker">{t('portal.live.title')}</div>
        <div className="live-pulse-hint">{t('portal.live.hint')}</div>
      </section>
    )
  }
  const color = pulse.color
  return (
    <section className={`live-pulse is-${color}${compact ? ' is-compact' : ''}`} data-live-pulse={color} aria-label={t('portal.live.title')}>
      <div className="live-pulse-head">
        <div>
          <div className="live-pulse-kicker">{t('portal.live.title')} · {pulse.hourLabel}</div>
          <div className="live-pulse-hint">{t('portal.live.hint')}</div>
        </div>
        <div className={`live-flag is-${color}`} data-live-flag={color}>
          {color === 'blue' ? t('portal.live.blue') : color === 'red' ? t('portal.live.red') : t('portal.live.idle')}
        </div>
      </div>
      <div className="live-pulse-grid">
        <div className="live-stat">
          <div className="live-stat-k">{t('portal.live.lastSale')}</div>
          <div className="live-stat-v" data-live-last>
            {pulse.lastSale ? fmtYen(pulse.lastSale.total) : t('portal.live.noSale')}
          </div>
          <div className="live-stat-h">
            {pulse.lastSale
              ? `${saleClockLabel(pulse.lastSale.at)}${pulse.lastSale.method ? ` · ${pulse.lastSale.method}` : ''}`
              : t('portal.live.notBooks')}
          </div>
        </div>
        <div className="live-stat">
          <div className="live-stat-k">{t('portal.live.tonight')}</div>
          <div className="live-stat-v" data-live-tonight>{fmtYen(pulse.tonightTill)}</div>
          <div className="live-stat-h">{t('portal.home.kpiTickets', { count: pulse.tonightCount })}</div>
        </div>
        <div className="live-stat">
          <div className="live-stat-k">{t('portal.live.hourTill')}</div>
          <div className="live-stat-v" data-live-hour-till>{fmtYen(pulse.hourTill)}</div>
          <div className="live-stat-h">{t('portal.home.kpiTickets', { count: pulse.hourCount })}</div>
        </div>
        <div className="live-stat">
          <div className="live-stat-k">{t('portal.live.hourWages')}</div>
          <div className="live-stat-v" data-live-hour-burn>{fmtYen(pulse.hourWageBurn)}</div>
          <div className="live-stat-h">{t('portal.live.staffOn', { count: pulse.openCount })}{pulse.openStaff.some(s => s.late) ? ` · ${t('portal.live.late')}` : ''}</div>
        </div>
      </div>
      <div className={`live-pulse-status is-${color}`}>
        {color === 'blue' ? t('portal.live.blueHint') : color === 'red' ? t('portal.live.redHint') : t('portal.live.idleHint')}
        {color !== 'idle' && (
          <span> · {color === 'blue' ? t('portal.live.gapBlue', { amount: fmtYen(pulse.gap) }) : t('portal.live.gapRed', { amount: fmtYen(Math.abs(pulse.gap)) })}</span>
        )}
      </div>
      {err && <div className="live-pulse-err">{err}</div>}
      <CutCards pulse={pulse} t={t} />
      <div className="live-pulse-actions">
        <GeminiCutBox pulse={pulse} compact={compact} />
        <div className="live-pulse-links">
          <button type="button" onClick={() => setDoorHash('live')} data-live-open-watch>{t('portal.live.openWatch')}</button>
          <button type="button" onClick={() => setDoorHash('make')}>{t('auth.openDrinksBoard')}</button>
          {onTab && <button type="button" onClick={() => onTab('ponto')}>{t('portal.hq.linkClock')}</button>}
        </div>
      </div>
    </section>
  )
}

export function LiveWatchKiosk({ bar, onHq, onTill, onMake, onLock }) {
  const { t } = useI18n()
  const { pulse } = useLivePulse(bar)
  const color = pulse?.color || 'idle'
  return (
    <div className={`app-shell is-till-kiosk is-live-kiosk is-${color}`}>
      <header className="till-kiosk-bar">
        <div>
          <div className="till-kiosk-name">{bar.nome}</div>
          <div className="till-kiosk-lane">{t('auth.laneLive')}</div>
        </div>
        <div className="till-kiosk-actions">
          {onMake && <button type="button" onClick={onMake}>{t('auth.openDrinksBoard')}</button>}
          {onHq && <button type="button" onClick={onHq}>{t('auth.openHq')}</button>}
          {onTill && <button type="button" onClick={onTill}>{t('auth.openTillTablet')}</button>}
          {onLock && <button type="button" onClick={onLock}>{t('atomicPos.lockTill')}</button>}
        </div>
      </header>
      <main className="app-main app-main-wide till-kiosk-main live-watch">
        {!pulse ? (
          <div className="live-pulse is-loading">{t('portal.live.title')}</div>
        ) : (
          <>
            <div className={`live-watch-hero is-${color}`}>
              <div className={`live-flag is-${color} is-xl`} data-live-flag={color}>
                {color === 'blue' ? t('portal.live.blue') : color === 'red' ? t('portal.live.red') : t('portal.live.idle')}
              </div>
              <div className="live-watch-hour">{pulse.hourLabel} · {t('portal.live.thisHour')}</div>
              <div className="live-watch-last" data-live-last>
                {pulse.lastSale ? fmtYen(pulse.lastSale.total) : t('portal.live.noSale')}
              </div>
              <div className="live-watch-last-h">
                {t('portal.live.lastSale')}
                {pulse.lastSale ? ` · ${saleClockLabel(pulse.lastSale.at)}` : ''}
              </div>
            </div>
            <div className="live-watch-nums">
              <div className="live-watch-card">
                <div className="live-stat-k">{t('portal.live.tonight')}</div>
                <div className="live-stat-v" data-live-tonight>{fmtYen(pulse.tonightTill)}</div>
                <div className="live-stat-h">{t('portal.home.kpiTickets', { count: pulse.tonightCount })}</div>
              </div>
              <div className="live-watch-card">
                <div className="live-stat-k">{t('portal.live.hourTill')}</div>
                <div className="live-stat-v" data-live-hour-till>{fmtYen(pulse.hourTill)}</div>
                <div className="live-stat-h">{t('portal.home.kpiTickets', { count: pulse.hourCount })}</div>
              </div>
              <div className={`live-watch-card is-${color}`}>
                <div className="live-stat-k">{t('portal.live.hourWages')}</div>
                <div className="live-stat-v" data-live-hour-burn>{fmtYen(pulse.hourWageBurn)}</div>
                <div className="live-stat-h">{t('portal.live.staffOn', { count: pulse.openCount })}</div>
              </div>
            </div>
            <p className="live-pulse-hint">{t('portal.live.notBooks')}</p>
            {pulse.openStaff.length > 0 && (
              <ul className="live-roster">
                {pulse.openStaff.map(s => (
                  <li key={s.staff_id}>
                    <strong>{s.nome}</strong>
                    <span>{s.cargo || '—'}</span>
                    <span>{fmtYen(s.hourlyBurn)}/h</span>
                  </li>
                ))}
              </ul>
            )}
            <CutCards pulse={pulse} t={t} />
            <GeminiCutBox pulse={pulse} />
          </>
        )}
      </main>
    </div>
  )
}
