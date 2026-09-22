import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { tokyoNightKey } from '../lib/tokyo.js'
import { MAKE_POLL_MS, MAKE_WINDOW_MS, buildDrinkBoard, padSeq, clockLabel } from '../lib/drinkBoard.js'
import DeviceStrip from './DeviceStrip'

export function useDrinkBoard(bar, { intervalMs = MAKE_POLL_MS } = {}) {
  const [board, setBoard] = useState(null)
  const [err, setErr] = useState('')

  async function load() {
    if (!bar?.id) return
    try {
      const night = tokyoNightKey()
      const [salesR, itemsR, spacesR, floorR] = await Promise.all([
        supabase.from('pos_vendas').select('id,total,data,criado_em,obs,space_id').eq('bar_id', bar.id).order('criado_em', { ascending: true }).limit(220),
        supabase.from('pos_vendas_itens').select('pos_venda_id,nome,qtd,tipo_preco').limit(900),
        supabase.from('bar_spaces').select('id,nome').eq('bar_id', bar.id),
        supabase.from('bar_floor_orders').select('*').eq('bar_id', bar.id).eq('night_key', night).order('criado_em', { ascending: true }).limit(80),
      ])
      const tickets = salesR.error ? [] : (salesR.data || [])
      const items = itemsR.error ? [] : (itemsR.data || [])
      const spaces = spacesR.error ? [] : (spacesR.data || [])
      const floorOrders = floorR.error ? [] : (floorR.data || [])
      setBoard(buildDrinkBoard({ tickets, items, spaces, floorOrders, nightKey: night, windowMs: MAKE_WINDOW_MS }))
      setErr('')
    } catch (e) {
      setErr(e.message || 'make')
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, intervalMs)
    return () => clearInterval(id)
  }, [bar?.id, intervalMs])

  return { board, err, reload: load }
}

function PourLines({ pours, size = 'lg' }) {
  return (
    <ul className={`make-pours is-${size}`}>
      {(pours || []).map((p, i) => (
        <li key={`${p.nome}-${i}`}>
          <span className="make-qty" data-make-qty={p.qtd}>{p.qtd}</span>
          <span className="make-drink">{p.nome}</span>
        </li>
      ))}
    </ul>
  )
}

export default function DrinkMakeKiosk({ bar, role, onHq, onTill, onLive, onSend, onLock }) {
  const { t } = useI18n()
  const { board } = useDrinkBoard(bar)
  const prevId = useRef('')
  const [fresh, setFresh] = useState(false)
  const [clock, setClock] = useState(() => clockLabel(new Date()))

  useEffect(() => {
    const id = setInterval(() => setClock(clockLabel(new Date())), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = board?.current?.id || ''
    if (id && id !== prevId.current) {
      if (prevId.current) setFresh(true)
      prevId.current = id
    }
  }, [board?.current?.id])

  useEffect(() => {
    if (!fresh) return
    const tmr = setTimeout(() => setFresh(false), 8000)
    return () => clearTimeout(tmr)
  }, [fresh])

  const current = board?.current
  const waiting = !board || board.waiting

  return (
    <div className={`app-shell is-till-kiosk is-make-kiosk${waiting ? ' is-wait' : ''}${fresh ? ' is-fresh' : ''}`} data-make-board={waiting ? 'wait' : 'now'}>
      <header className="make-top" aria-label={t('auth.laneMake')}>
        <div>
          <div className="till-kiosk-name">{bar.nome}</div>
          <div className="till-kiosk-lane">{t('auth.laneMake')} · {t('portal.make.noTouch')}</div>
        </div>
        <div className="make-clock" data-make-clock>{clock}</div>
        <div className="till-kiosk-actions make-top-actions">
          <DeviceStrip
            role={role}
            current="make"
            compact
            dim
            onPick={id => {
              if (id === 'pos') onTill?.()
              else if (id === 'send') onSend?.()
              else if (id === 'live') onLive?.()
              else if (id === 'gerente') onHq?.()
            }}
          />
          {onLock && <button type="button" onClick={onLock}>{t('atomicPos.lockTill')}</button>}
        </div>
      </header>
      <main className="make-stage" aria-live="polite">
        {waiting ? (
          <div className="make-wait">
            <div className="make-kicker">{t('portal.make.waiting')}</div>
            <div className="make-seq" data-make-seq={board?.lastSeq || '00'}>{board?.lastSeq || '00'}</div>
            <div className="make-wait-h">{t('portal.make.waitingHint', { count: board?.tonightCount || 0 })}</div>
          </div>
        ) : (
          <div className="make-now">
            <div className="make-kicker" data-make-source={current.source || 'till'}>
              {t('portal.make.now')} · {current.clock}
              {current.space ? ` · ${current.space}` : ''}
              {current.cast ? ` · ${current.cast}` : ''}
              {current.source === 'phone' ? ` · ${t('auth.laneSend')}` : ''}
            </div>
            <div className="make-seq" data-make-seq={current.seqLabel}>{current.seqLabel}</div>
            <PourLines pours={current.pours} size="xl" />
            {current.note ? <div className="make-note">{current.note}</div> : null}
          </div>
        )}
        {(board?.next || []).length > 0 && (
          <aside className="make-next" aria-label={t('portal.make.next')}>
            <div className="make-next-k">{t('portal.make.next')}</div>
            <div className="make-next-row">
              {board.next.slice(0, 4).map(tkt => (
                <div key={tkt.id} className="make-next-card">
                  <div className="make-next-seq">{padSeq(tkt.seq)}</div>
                  <PourLines pours={tkt.pours} size="md" />
                </div>
              ))}
            </div>
          </aside>
        )}
      </main>
    </div>
  )
}
