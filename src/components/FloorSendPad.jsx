import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './Auth'
import { useI18n } from '../lib/i18n'
import { tokyoNightKey } from '../lib/tokyo.js'
import { floorOrderPayload, floorOrderReady, floorSlipsTonight, FLOOR_TABLE } from '../lib/floorOrder.js'
import DeviceStrip from './DeviceStrip'

export default function FloorSendPad({ bar, role, onTill, onMake, onLive, onHq, onLock }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [drinks, setDrinks] = useState([])
  const [agents, setAgents] = useState([])
  const [spaces, setSpaces] = useState([])
  const [cart, setCart] = useState([])
  const [agentId, setAgentId] = useState('')
  const [spaceId, setSpaceId] = useState('')
  const [note, setNote] = useState('')
  const [cat, setCat] = useState('all')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')
  const [err, setErr] = useState('')
  const [slips, setSlips] = useState([])
  const [ready, setReady] = useState(false)
  const night = tokyoNightKey()

  async function loadMenu() {
    if (!bar?.id) return
    const [dR, pR, aR, sR, oR] = await Promise.all([
      supabase.from('drink_menu').select('id,nome,categoria,preco_venda').eq('bar_id', bar.id).order('nome'),
      supabase.from('bar_pricing').select('produto_id,preco_drink,produtos(nome,categoria)').eq('bar_id', bar.id),
      supabase.from('drink_back_agents').select('id,nome,ativo').eq('bar_id', bar.id).eq('ativo', true),
      supabase.from('bar_spaces').select('id,nome,tipo,zona,ordem,ativo').eq('bar_id', bar.id).eq('ativo', true).order('ordem'),
      supabase.from(FLOOR_TABLE).select('*').eq('bar_id', bar.id).eq('night_key', night).order('criado_em', { ascending: false }).limit(20),
    ])
    const menu = (dR.error ? [] : (dR.data || [])).map(d => ({
      key: `d-${d.id}`,
      drink_menu_id: d.id,
      produto_id: null,
      nome: d.nome,
      categoria: d.categoria || '',
    }))
    const shots = (pR.error ? [] : (pR.data || [])).map(s => ({
      key: `p-${s.produto_id}`,
      drink_menu_id: null,
      produto_id: s.produto_id,
      nome: s.produtos?.nome || 'Shot',
      categoria: s.produtos?.categoria || 'Shot',
    }))
    const seen = new Set()
    const catalog = [...menu, ...shots].filter(d => {
      const k = d.nome.toLowerCase()
      if (!d.nome || seen.has(k)) return false
      seen.add(k)
      return true
    })
    setDrinks(catalog)
    setAgents(aR.error ? [] : (aR.data || []))
    setSpaces(sR.error ? [] : (sR.data || []))
    setSlips(floorSlipsTonight(oR.error ? [] : (oR.data || []), night))
    setReady(true)
  }

  useEffect(() => { loadMenu() }, [bar?.id, night])

  const cats = useMemo(() => [...new Set(drinks.map(d => d.categoria).filter(Boolean))], [drinks])
  const visible = drinks.filter(d => cat === 'all' || d.categoria === cat)
  const agent = agents.find(a => a.id === agentId)
  const space = spaces.find(s => s.id === spaceId)
  const drinkCount = cart.reduce((a, it) => a + it.qtd, 0)

  function addDrink(d) {
    setErr('')
    setFlash('')
    setCart(prev => {
      const ex = prev.find(x => x.key === d.key)
      if (ex) return prev.map(x => x.key === d.key ? { ...x, qtd: x.qtd + 1 } : x)
      return [...prev, {
        key: d.key,
        drink_menu_id: d.drink_menu_id,
        produto_id: d.produto_id,
        nome: d.nome,
        qtd: 1,
      }]
    })
  }

  function bump(key, delta) {
    setCart(prev => prev
      .map(x => x.key === key ? { ...x, qtd: x.qtd + delta } : x)
      .filter(x => x.qtd > 0))
  }

  async function send() {
    const payload = floorOrderPayload({
      barId: bar.id,
      nightKey: night,
      spaceId,
      spaceNome: space?.nome || '',
      cast: agent?.nome || '',
      castId: agentId,
      note,
      items: cart,
      sentBy: user?.id || null,
    })
    if (!floorOrderReady(payload)) {
      setErr(t('portal.floor.empty'))
      return
    }
    setBusy(true)
    setErr('')
    const { data, error } = await supabase.from(FLOOR_TABLE).insert(payload).select('*').single()
    setBusy(false)
    if (error) {
      setErr(error.message || t('portal.floor.empty'))
      return
    }
    setCart([])
    setNote('')
    setFlash(t('portal.floor.sent'))
    if (data) setSlips(prev => [data, ...prev].slice(0, 12))
  }

  return (
    <div className="app-shell is-till-kiosk is-send-kiosk" data-send-pad="1">
      <header className="send-top">
        <div>
          <div className="till-kiosk-name">{bar.nome}</div>
          <div className="till-kiosk-lane">{t('auth.laneSend')} · {t('portal.floor.hint')}</div>
        </div>
        <DeviceStrip
          role={role}
          current="send"
          compact
          onPick={id => {
            if (id === 'pos') onTill?.()
            else if (id === 'make') onMake?.()
            else if (id === 'live') onLive?.()
            else if (id === 'gerente') onHq?.()
          }}
        />
        {onLock && <button type="button" className="send-lock" onClick={onLock}>{t('atomicPos.lockTill')}</button>}
      </header>

      <main className="send-stage">
        <p className="send-not-charge">{t('portal.floor.notCharge')}</p>
        <div className="send-chips" aria-label={t('atomicPos.castSpaceLabel')}>
          {agents.map(a => (
            <button
              key={a.id}
              type="button"
              className={`send-chip${agentId === a.id ? ' is-on' : ''}`}
              onClick={() => setAgentId(agentId === a.id ? '' : a.id)}
            >💃 {a.nome}</button>
          ))}
          {spaces.map(s => (
            <button
              key={s.id}
              type="button"
              className={`send-chip${spaceId === s.id ? ' is-on' : ''}`}
              onClick={() => setSpaceId(spaceId === s.id ? '' : s.id)}
            >🪑 {s.nome}</button>
          ))}
        </div>
        <input
          className="send-note"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={t('portal.floor.notePh')}
          maxLength={120}
          aria-label={t('portal.floor.note')}
        />
        {cats.length > 0 && (
          <div className="send-chips">
            <button type="button" className={`send-chip${cat === 'all' ? ' is-on' : ''}`} onClick={() => setCat('all')}>{t('atomicPos.allDrinks')}</button>
            {cats.map(c => (
              <button key={c} type="button" className={`send-chip${cat === c ? ' is-on' : ''}`} onClick={() => setCat(c)}>{c}</button>
            ))}
          </div>
        )}
        <div className="send-grid">
          {!ready && <div className="send-empty">{t('common.loading')}</div>}
          {ready && visible.length === 0 && (
            <div className="send-empty">{t('atomicPos.noMenuYet')}</div>
          )}
          {visible.map(d => {
            const inCart = cart.find(x => x.key === d.key)
            return (
              <button
                key={d.key}
                type="button"
                className={`send-tile${inCart ? ' is-on' : ''}`}
                data-send-drink={d.nome}
                onClick={() => addDrink(d)}
              >
                {inCart && <span className="send-tile-qty">{inCart.qtd}</span>}
                <span className="send-tile-name">{d.nome}</span>
              </button>
            )
          })}
        </div>
        {slips.length > 0 && (
          <aside className="send-tonight" aria-label={t('portal.floor.tonight')}>
            <div className="send-tonight-k">{t('portal.floor.tonight')}</div>
            {slips.slice(0, 4).map(s => (
              <div key={s.id} className="send-slip">
                {(s.items || []).map(it => `${it.qtd}× ${it.nome}`).join(' · ')}
                {s.space_nome ? ` · ${s.space_nome}` : ''}
                {s.cast ? ` · ${s.cast}` : ''}
              </div>
            ))}
          </aside>
        )}
      </main>

      <footer className="send-dock">
        {err && <div className="send-err">{err}</div>}
        {flash && <div className="send-ok" data-send-ok>{flash}</div>}
        <div className="send-cart">
          {cart.length === 0 ? t('portal.floor.cartEmpty') : cart.map(it => (
            <button key={it.key} type="button" className="send-cart-item" onClick={() => bump(it.key, -1)}>
              {it.qtd}× {it.nome}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="send-go"
          data-send-go
          disabled={busy || drinkCount < 1}
          onClick={send}
        >
          {busy ? t('portal.floor.sending') : t('portal.floor.send')}
          {drinkCount > 0 ? ` · ${drinkCount}` : ''}
        </button>
      </footer>
    </div>
  )
}
