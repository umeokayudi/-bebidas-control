import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './Auth'
import { fmtYen, Spinner } from './utils'
import { staffFetch } from '../lib/apiAuth'
import { filterSupplierVendas } from './utils'
import { filterJbmDrinksFaturas } from '../lib/barPortal'
import { monthlyAccountSummary } from '../lib/clientAnalytics'
import { tokyoMonthKey, recentMonthKeys, isMonthKey } from '../lib/tokyo'
import { payrollFromPunches, monthRange, localHoursPay } from '../lib/timeClock'
import { splitCostBooks } from '../lib/costBooks'
import { costAccessForRole } from '../lib/access'
import { fetchHqSnapshot, saveHqRent } from '../lib/hqSnapshot'
import { WRITTEN_LOGINS } from '../lib/barLanes'
import { useI18n } from '../lib/i18n'
import HqAiDock from './HqAiDock'

const ACTIONS = [
  { id: 'pos', icon: '🧾', labelKey: 'portal.hq.linkPos' },
  { id: 'ponto', icon: '🕒', labelKey: 'portal.hq.linkClock' },
  { id: 'equipe', icon: '👥', labelKey: 'portal.hq.linkTeam' },
  { id: 'clientes', icon: '🥂', labelKey: 'nav.portalGuests' },
  { id: 'espacos', icon: '🪑', labelKey: 'nav.portalSpaces' },
  { id: 'pedidos', icon: '🛒', labelKey: 'portal.hq.linkOrders' },
  { id: 'faturas', icon: '💳', labelKey: 'portal.hq.linkJbm' },
  { id: 'estoque', icon: '📊', labelKey: 'nav.portalInventory' },
]

function BookCard({ kicker, value, hint, tone = 'navy', active, onClick }) {
  const tones = {
    navy: { bg: 'linear-gradient(135deg, var(--navy) 0%, #002855 100%)', color: 'white', hint: 'rgba(255,255,255,0.75)', border: 'none' },
    light: { bg: 'var(--bg2)', color: 'var(--navy)', hint: 'var(--text2)', border: '1px solid var(--border)' },
    green: { bg: 'var(--bg2)', color: 'var(--green)', hint: 'var(--text2)', border: '1px solid rgba(52,199,89,0.25)' },
    amber: { bg: 'var(--bg2)', color: 'var(--amber)', hint: 'var(--text2)', border: '1px solid rgba(255,159,10,0.28)' },
  }
  const s = tones[tone] || tones.navy
  return (
    <button
      type="button"
      onClick={onClick}
      className={`hq-book${active ? ' is-on' : ''}`}
      style={{ background: s.bg, color: s.color, border: s.border }}
    >
      <div className="easy-dash-kicker">{kicker}</div>
      <div className="easy-dash-value" style={{ marginTop: 8 }}>{value}</div>
      {hint && <div className="easy-dash-hint" style={{ color: s.hint }}>{hint}</div>}
    </button>
  )
}

export function CostBooksHero({ books, access, selected = 'all', onSelect }) {
  const { t } = useI18n()
  const pick = id => onSelect?.(selected === id ? 'all' : id)
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 }}>
        {t('portal.costs.neverMix')}
      </div>
      <div className="hq-books">
        {access.posTill && (
          <BookCard kicker={t('portal.costs.posTill')} value={fmtYen(books.pos.amount)} hint={t('portal.costs.posTillHint')} tone="light" active={selected === 'pos'} onClick={() => pick('pos')} />
        )}
        {access.jbmBill && (
          <BookCard kicker={t('portal.costs.jbmBill')} value={fmtYen(books.jbm.amount)} hint={t('portal.costs.jbmBillHint')} tone="navy" active={selected === 'jbm'} onClick={() => pick('jbm')} />
        )}
        {access.staffWages && (
          <BookCard kicker={t('portal.costs.staffWages')} value={fmtYen(books.staff.amount)} hint={t('portal.costs.staffWagesHint')} tone="green" active={selected === 'staff'} onClick={() => pick('staff')} />
        )}
        {access.rent && books.rent && (
          <BookCard kicker={t('portal.costs.rent')} value={fmtYen(books.rent.amount)} hint={t('portal.costs.rentHint')} tone="amber" active={selected === 'rent'} onClick={() => pick('rent')} />
        )}
      </div>
    </div>
  )
}

export function BarCommandActions({ onTab }) {
  const { t } = useI18n()
  return (
    <div className="hq-actions">
      {ACTIONS.map(a => (
        <button key={a.id} type="button" className="hq-action" data-hq-action={a.id} onClick={() => onTab?.(a.id)}>
          <span className="hq-action-icon">{a.icon}</span>
          <span>{t(a.labelKey)}</span>
        </button>
      ))}
    </div>
  )
}

export async function loadCostBooks(barId, monthKey) {
  const mes = isMonthKey(monthKey) ? monthKey : tokyoMonthKey()
  try {
    const hq = await fetchHqSnapshot(mes)
    if (hq?.books) return hq.books
  } catch {
    // fall through
  }
  const range = monthRange(`${mes}-01`)
  const [vR, fR, posR, clockR, teamR, rentR] = await Promise.all([
    supabase.from('vendas').select('*').eq('bar_id', barId),
    supabase.from('faturas').select('*').eq('bar_id', barId),
    supabase.from('pos_vendas').select('total,data').eq('bar_id', barId),
    staffFetch(`/api/time-clock?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`).then(r => r.json()).catch(() => ({ punches: [] })),
    staffFetch('/api/bar-staff').then(r => r.json()).catch(() => ({ staff: [] })),
    supabase.from('bar_overhead').select('kind,month_key,amount').eq('bar_id', barId).eq('kind', 'rent').eq('month_key', mes),
  ])
  const vendas = filterSupplierVendas(vR.data || [])
  const faturas = filterJbmDrinksFaturas(fR.data || [])
  const account = monthlyAccountSummary(vendas, faturas, mes)
  const posMonthTotal = (posR.data || [])
    .filter(s => String(s.data || '').startsWith(mes))
    .reduce((a, s) => a + (+s.total || 0), 0)
  const payroll = payrollFromPunches(clockR.punches || [], teamR.staff || [], range)
  const staffMonthPay = payroll.reduce((a, r) => a + (+r.pay || 0), 0)
  const rentMonth = (rentR.data || []).reduce((a, r) => a + (+r.amount || 0), 0)
  return splitCostBooks({ posMonthTotal, jbmMonthBill: account.contaMes, staffMonthPay, rentMonth })
}

function HoursCalculator() {
  const { t } = useI18n()
  const [hours, setHours] = useState('8')
  const [lateHours, setLateHours] = useState('2')
  const [rate, setRate] = useState(String(WRITTEN_LOGINS.funcionario.salario_hora))
  const result = localHoursPay({ hours, lateHours, rate })
  return (
    <div className="hq-panel">
      <div className="hq-panel-title">{t('portal.hq.calcTitle')}</div>
      <div className="hq-panel-hint">{t('portal.hq.hoursHint')}</div>
      <div className="hq-calc-grid">
        <label>{t('portal.hq.calcHours')}<input type="number" min="0" step="0.25" value={hours} onChange={e => setHours(e.target.value)} /></label>
        <label>{t('portal.hq.calcLate')}<input type="number" min="0" step="0.25" value={lateHours} onChange={e => setLateHours(e.target.value)} /></label>
        <label>{t('portal.hq.calcRate')}<input type="number" min="0" step="50" value={rate} onChange={e => setRate(e.target.value)} /></label>
      </div>
      <div className="hq-calc-pay">{t('portal.hq.calcPay')}: {fmtYen(result.pay)}</div>
    </div>
  )
}

export default function BarCostsTab({ bar, onTab }) {
  const { perfil } = useAuth()
  const { t, lang } = useI18n()
  const access = costAccessForRole(perfil?.role)
  const months = recentMonthKeys(4)
  const [month, setMonth] = useState(tokyoMonthKey())
  const [book, setBook] = useState('all')
  const [staffFilter, setStaffFilter] = useState('all')
  const [hq, setHq] = useState(null)
  const [books, setBooks] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [rentAmount, setRentAmount] = useState('')
  const [rentNote, setRentNote] = useState('')
  const [rentMsg, setRentMsg] = useState('')
  const [showLogins, setShowLogins] = useState(false)

  async function load(force = false, mes = month) {
    setErr('')
    try {
      const snap = force
        ? await staffFetch('/api/bar/hq-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month: mes }),
        }).then(async r => {
          const j = await r.json()
          if (!r.ok) throw new Error(j.error || 'Sync failed')
          return j
        })
        : await fetchHqSnapshot(mes)
      setHq(snap)
      setBooks(snap.books)
      setRentAmount(String(snap.rent?.amount ?? ''))
      setRentNote(snap.rent?.note || '')
    } catch (e) {
      try {
        const fallback = await loadCostBooks(bar.id, mes)
        setBooks(fallback)
        setErr(e.message)
      } catch (e2) {
        setErr(e2.message)
      }
    }
  }

  useEffect(() => {
    let cancelled = false
    load(false, month).catch(e => { if (!cancelled) setErr(e.message) })
    return () => { cancelled = true }
  }, [bar.id, month])

  async function syncNow() {
    setBusy(true)
    await load(true, month)
    setBusy(false)
  }

  async function saveRent() {
    setRentMsg('')
    setBusy(true)
    try {
      const snap = await saveHqRent({ amount: rentAmount, note: rentNote, month_key: month })
      setHq(snap)
      setBooks(snap.books)
      setRentMsg(t('common.success'))
    } catch (e) {
      setRentMsg(e.message)
    }
    setBusy(false)
  }

  if (!books && !err) return <Spinner text={t('portal.costs.loading')} />

  const payroll = (hq?.payroll || []).filter(r => staffFilter === 'all' || r.staff_id === staffFilter)
  const monthLabel = d => {
    const [y, m] = String(d).split('-')
    const names = t('months.short') || []
    return `${names[+m - 1] || m} ${y}`
  }
  const show = id => book === 'all' || book === id

  return (
    <div className="fade-in portal-page hq-dash">
      <div className="hq-top">
        <div>
          <div className="hq-title">{t('portal.costs.title')}</div>
          <div className="hq-sub">{t('portal.costs.subtitle')}</div>
        </div>
        <button type="button" onClick={syncNow} disabled={busy} className="btn-primary hq-sync">
          {busy ? t('common.wait') : `🔄 ${t('portal.hq.syncNow')}`}
        </button>
      </div>
      {err && <div style={{ color: 'var(--red)', marginBottom: 12 }}>{err}</div>}

      <div className="hq-filters">
        <span className="hq-filter-label">{t('portal.hq.filterSpecify')}</span>
        <span className="hq-filter-label">{t('portal.hq.filterMonth')}</span>
        {months.map(m => (
          <button key={m} type="button" className={`hq-chip${month === m ? ' is-on' : ''}`} onClick={() => setMonth(m)}>{monthLabel(m)}</button>
        ))}
        <span className="hq-filter-label">{t('portal.hq.filterBook')}</span>
        {[
          ['all', t('portal.hq.bookAll'), true],
          ['pos', t('portal.costs.posTill'), access.posTill],
          ['jbm', t('portal.costs.jbmBill'), access.jbmBill],
          ['staff', t('portal.costs.staffWages'), access.staffWages],
          ['rent', t('portal.costs.rent'), access.rent],
        ].filter(row => row[2]).map(([id, label]) => (
          <button key={id} type="button" className={`hq-chip${book === id ? ' is-on' : ''}`} onClick={() => setBook(id)}>{label}</button>
        ))}
      </div>

      <div className="hq-actions-label">{t('portal.hq.actionsTitle')}</div>
      <BarCommandActions onTab={onTab} />

      {hq?.sources && (
        <div className="hq-sources">
          <span className={`hq-src${hq.sources.pos?.ok ? ' ok' : ' bad'}`}>● {t('portal.hq.sourcePos')} · {hq.sources.pos?.sales || 0}</span>
          <span className={`hq-src${hq.sources.jbm?.ok ? ' ok' : ' bad'}`}>● {t('portal.hq.sourceJbm')} · {hq.sources.jbm?.vendas || 0}/{hq.sources.jbm?.pedidos || 0}</span>
          <span className={`hq-src${hq.sources.clock?.ok ? ' ok' : ' bad'}`}>● {t('portal.hq.sourceClock')} · {hq.hoursTotal || 0}h</span>
          <span className={`hq-src${hq.sources.rent?.ok ? ' ok' : ' bad'}`}>● {t('portal.hq.sourceRent')}</span>
          {hq.syncedAt && <span className="hq-src muted">{t('portal.hq.synced', { time: new Date(hq.syncedAt).toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US') })}</span>}
        </div>
      )}

      {books && <CostBooksHero books={books} access={access} selected={book} onSelect={setBook} />}

      {books && book !== 'all' && !(books[book]?.amount) && (
        <div className="hq-empty" style={{ marginBottom: 12 }}>{t('portal.hq.emptyMonth')}</div>
      )}

      <div className="hq-layout">
        <div>
          {show('staff') && (
            <div className="hq-panel">
              <div className="hq-panel-row">
                <div>
                  <div className="hq-panel-title">{t('portal.hq.hoursTitle')}</div>
                  <div className="hq-panel-hint">{t('portal.hq.hoursHint')}</div>
                </div>
                <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)}>
                  <option value="all">{t('portal.hq.staffAll')}</option>
                  {(hq?.payroll || []).map(r => <option key={r.staff_id} value={r.staff_id}>{r.nome}</option>)}
                </select>
              </div>
              {!payroll.length ? (
                <div className="hq-empty">{t('clock.noHours')}</div>
              ) : (
                <div className="table-scroll">
                  <table style={{ width: '100%', fontSize: 13 }}>
                    <thead>
                      <tr>{[t('clock.colName'), t('clock.colHours'), t('portal.hq.colLate'), t('clock.colPay')].map(h => <th key={h} style={{ textAlign: 'left', padding: 8 }}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {payroll.map(r => (
                        <tr key={r.staff_id} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: 8, fontWeight: 700 }}>{r.nome}<div style={{ fontSize: 11, color: 'var(--text2)' }}>{r.cargo} · {fmtYen(r.salario_hora)}/h</div></td>
                          <td>{Number(r.hours || 0).toFixed(2)}h</td>
                          <td>{Number(r.lateHours || 0).toFixed(2)}h</td>
                          <td style={{ fontWeight: 800 }}>{fmtYen(r.pay)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {show('staff') && <HoursCalculator />}
          {show('rent') && access.rent && (
            <div className="hq-panel">
              <div className="hq-panel-title">{t('portal.hq.rentTitle')}</div>
              <div className="hq-panel-hint">{t('portal.costs.rentHint')}</div>
              <div className="hq-rent-row">
                <label>{t('portal.hq.rentAmount')}<input type="number" min="0" step="1000" value={rentAmount} onChange={e => setRentAmount(e.target.value)} /></label>
                <label>{t('common.notes')}<input value={rentNote} onChange={e => setRentNote(e.target.value)} /></label>
                <button type="button" className="btn-primary" disabled={busy} onClick={saveRent}>{t('portal.hq.rentSave')}</button>
              </div>
              {rentMsg && <div style={{ marginTop: 10, fontSize: 12, color: rentMsg === t('common.success') ? 'var(--green)' : 'var(--red)' }}>{rentMsg}</div>}
            </div>
          )}
          {show('jbm') && hq?.jbm && (
            <div className="hq-panel">
              <div className="hq-panel-title">{t('portal.hq.sourceJbm')}</div>
              <div className="hq-kpis">
                <div><b>{fmtYen(hq.jbm.totalPendente)}</b><span>{t('portal.pending')}</span></div>
                <div><b>{hq.jbm.faturasAtraso || 0}</b><span>{t('portal.overdue')}</span></div>
                <div><b>{(hq.jbm.pedidosRecentes || []).length}</b><span>{t('nav.portalOrders')}</span></div>
              </div>
              <button type="button" className="hq-chip" onClick={() => onTab?.('faturas')}>{t('portal.hq.linkJbm')}</button>
            </div>
          )}
          {show('pos') && hq?.pos && (
            <div className="hq-panel">
              <div className="hq-panel-title">{t('portal.costs.posTill')}</div>
              <div className="hq-kpis">
                <div><b>{fmtYen(hq.pos.till)}</b><span>{t('portal.hq.filterMonth')}</span></div>
                <div><b>{hq.pos.salesCount || 0}</b><span>{t('atomicPos.tabCheckout')}</span></div>
              </div>
              <button type="button" className="hq-chip" onClick={() => onTab?.('pos')}>{t('portal.hq.linkPos')}</button>
            </div>
          )}
        </div>
        <HqAiDock snapshot={hq} />
      </div>

      <button type="button" className="easy-dash-more" onClick={() => setShowLogins(v => !v)}>
        {showLogins ? t('portal.hq.hideLogins') : t('portal.costs.loginsTitle')}
      </button>
      {showLogins && (
        <div className="hq-logins">
          {[['pos', WRITTEN_LOGINS.pos, t('portal.costs.loginPos'), t('auth.doorPosHint')],
            ['gerente', WRITTEN_LOGINS.gerente, t('portal.costs.loginGerente'), t('auth.doorGerenteHint')],
            ['staff', WRITTEN_LOGINS.funcionario, t('portal.costs.loginStaff'), t('auth.doorStaffHint')]].map(([k, login, title, sees]) => (
            <div key={k} className="hq-panel">
              <div className="hq-panel-title">{title}</div>
              <div className="hq-panel-hint">{sees}</div>
              <div className="hq-mono">{login.email}</div>
              <div className="hq-mono">{login.password}</div>
              {login.pin && <div className="hq-mono">PIN {login.pin}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
