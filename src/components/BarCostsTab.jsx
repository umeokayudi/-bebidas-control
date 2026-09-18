import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './Auth'
import { fmtYen, Spinner } from './utils'
import { staffFetch } from '../lib/apiAuth'
import { filterSupplierVendas } from './utils'
import { filterJbmDrinksFaturas } from '../lib/barPortal'
import { monthlyAccountSummary } from '../lib/clientAnalytics'
import { tokyoMonthKey } from '../lib/tokyo'
import { payrollFromPunches, monthRange, localHoursPay } from '../lib/timeClock'
import { splitCostBooks } from '../lib/costBooks'
import { costAccessForRole } from '../lib/access'
import { fetchHqSnapshot, saveHqRent } from '../lib/hqSnapshot'
import { WRITTEN_LOGINS } from '../lib/barLanes'
import { useI18n } from '../lib/i18n'
import PortalClienteAI from './PortalClienteAI'

function BookCard({ kicker, value, hint, tone = 'navy' }) {
  const tones = {
    navy: { bg: 'linear-gradient(135deg, var(--navy) 0%, #002855 100%)', color: 'white', hint: 'rgba(255,255,255,0.75)' },
    light: { bg: 'var(--bg2)', color: 'var(--navy)', hint: 'var(--text2)', border: '1px solid var(--border)' },
    green: { bg: 'var(--bg2)', color: 'var(--green)', hint: 'var(--text2)', border: '1px solid rgba(52,199,89,0.25)' },
    amber: { bg: 'var(--bg2)', color: 'var(--amber)', hint: 'var(--text2)', border: '1px solid rgba(255,159,10,0.28)' },
  }
  const s = tones[tone] || tones.navy
  return (
    <div style={{
      background: s.bg, color: s.color, border: s.border || 'none',
      borderRadius: 20, padding: '22px 24px', minHeight: 140,
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.8 }}>{kicker}</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8, letterSpacing: -0.6 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, marginTop: 8, color: s.hint, lineHeight: 1.45 }}>{hint}</div>}
    </div>
  )
}

export function CostBooksHero({ books, access }) {
  const { t } = useI18n()
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5,
      }}>
        {t('portal.costs.neverMix')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        {access.posTill && (
          <BookCard
            kicker={t('portal.costs.posTill')}
            value={fmtYen(books.pos.amount)}
            hint={t('portal.costs.posTillHint')}
            tone="light"
          />
        )}
        {access.jbmBill && (
          <BookCard
            kicker={t('portal.costs.jbmBill')}
            value={fmtYen(books.jbm.amount)}
            hint={t('portal.costs.jbmBillHint')}
            tone="navy"
          />
        )}
        {access.staffWages && (
          <BookCard
            kicker={t('portal.costs.staffWages')}
            value={fmtYen(books.staff.amount)}
            hint={t('portal.costs.staffWagesHint')}
            tone="green"
          />
        )}
        {access.rent && books.rent && (
          <BookCard
            kicker={t('portal.costs.rent')}
            value={fmtYen(books.rent.amount)}
            hint={t('portal.costs.rentHint')}
            tone="amber"
          />
        )}
      </div>
    </div>
  )
}

export async function loadCostBooks(barId) {
  try {
    const hq = await fetchHqSnapshot()
    if (hq?.books) return hq.books
  } catch {
    // fall through to local reads — still never mix ledgers
  }
  const mes = tokyoMonthKey()
  const range = monthRange()
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
  return splitCostBooks({
    posMonthTotal,
    jbmMonthBill: account.contaMes,
    staffMonthPay,
    rentMonth,
  })
}

function WrittenLoginCard({ title, login, sees }) {
  const { t } = useI18n()
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 18,
    }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.45 }}>{sees}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' }}>{t('auth.writtenEmail')}</div>
      <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, fontWeight: 700, margin: '2px 0 10px' }}>{login.email}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' }}>{t('auth.writtenPassword')}</div>
      <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, fontWeight: 700, margin: '2px 0 10px' }}>{login.password}</div>
      {login.pin && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' }}>{t('auth.writtenPin')}</div>
          <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, fontWeight: 700, marginTop: 2 }}>{login.pin}</div>
        </>
      )}
    </div>
  )
}

function SourcePill({ ok, label, detail }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 800 }}>
        <span style={{ color: ok ? 'var(--green)' : 'var(--red)' }}>{ok ? '●' : '○'}</span>{' '}{label}
      </div>
      {detail && <div style={{ fontSize: 11, color: 'var(--text2)' }}>{detail}</div>}
    </div>
  )
}

function HoursCalculator() {
  const { t } = useI18n()
  const [hours, setHours] = useState('8')
  const [lateHours, setLateHours] = useState('2')
  const [rate, setRate] = useState(String(WRITTEN_LOGINS.funcionario.salario_hora))
  const result = localHoursPay({ hours, lateHours, rate })
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{t('portal.hq.calcTitle')}</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.45 }}>{t('portal.hq.hoursHint')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)' }}>
          {t('portal.hq.calcHours')}
          <input type="number" min="0" step="0.25" value={hours} onChange={e => setHours(e.target.value)} style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8 }} />
        </label>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)' }}>
          {t('portal.hq.calcLate')}
          <input type="number" min="0" step="0.25" value={lateHours} onChange={e => setLateHours(e.target.value)} style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8 }} />
        </label>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)' }}>
          {t('portal.hq.calcRate')}
          <input type="number" min="0" step="50" value={rate} onChange={e => setRate(e.target.value)} style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8 }} />
        </label>
      </div>
      <div style={{ marginTop: 14, fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>
        {t('portal.hq.calcPay')}: {fmtYen(result.pay)}
      </div>
    </div>
  )
}

export default function BarCostsTab({ bar, onTab }) {
  const { perfil } = useAuth()
  const { t } = useI18n()
  const access = costAccessForRole(perfil?.role)
  const [hq, setHq] = useState(null)
  const [books, setBooks] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [rentAmount, setRentAmount] = useState('')
  const [rentNote, setRentNote] = useState('')
  const [rentMsg, setRentMsg] = useState('')

  async function load(force = false) {
    setErr('')
    try {
      const snap = force
        ? await staffFetch('/api/bar/hq-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(async r => {
          const j = await r.json()
          if (!r.ok) throw new Error(j.error || 'Sync failed')
          return j
        })
        : await fetchHqSnapshot()
      setHq(snap)
      setBooks(snap.books)
      setRentAmount(String(snap.rent?.amount ?? ''))
      setRentNote(snap.rent?.note || '')
    } catch (e) {
      try {
        const fallback = await loadCostBooks(bar.id)
        setBooks(fallback)
        setErr(e.message)
      } catch (e2) {
        setErr(e2.message)
      }
    }
  }

  useEffect(() => {
    let cancelled = false
    load().catch(e => { if (!cancelled) setErr(e.message) })
    return () => { cancelled = true }
  }, [bar.id])

  async function syncNow() {
    setBusy(true)
    await load(true)
    setBusy(false)
  }

  async function saveRent() {
    setRentMsg('')
    setBusy(true)
    try {
      const snap = await saveHqRent({ amount: rentAmount, note: rentNote, month_key: hq?.mes })
      setHq(snap)
      setBooks(snap.books)
      setRentMsg(t('common.success'))
    } catch (e) {
      setRentMsg(e.message)
    }
    setBusy(false)
  }

  if (!books && !err) return <Spinner text={t('portal.costs.loading')} />

  const payroll = hq?.payroll || []

  return (
    <div className="fade-in portal-page" style={{ maxWidth: 1080 }}>
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>{t('portal.costs.title')}</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 16px' }}>{t('portal.costs.subtitle')}</div>
      {err && <div style={{ color: 'var(--red)', marginBottom: 16 }}>{err}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>
          {hq?.syncedAt ? t('portal.hq.synced', { time: new Date(hq.syncedAt).toLocaleString() }) : t('portal.hq.syncHint')}
        </div>
        <button type="button" onClick={syncNow} disabled={busy} className="btn-primary" style={{ padding: '8px 14px', borderRadius: 10, fontSize: 12 }}>
          {busy ? t('common.wait') : `🔄 ${t('portal.hq.syncNow')}`}
        </button>
      </div>

      {hq?.sources && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 18 }}>
          <SourcePill ok={hq.sources.pos?.ok} label={t('portal.hq.sourcePos')} detail={`${hq.sources.pos?.sales || 0} · ${hq.sources.pos?.via || ''}`} />
          <SourcePill ok={hq.sources.jbm?.ok} label={t('portal.hq.sourceJbm')} detail={`${hq.sources.jbm?.vendas || 0} / ${hq.sources.jbm?.pedidos || 0} / ${hq.sources.jbm?.faturas || 0}`} />
          <SourcePill ok={hq.sources.clock?.ok} label={t('portal.hq.sourceClock')} detail={`${hq.hoursTotal || 0}h · ${hq.sources.clock?.punches || 0}`} />
          <SourcePill ok={hq.sources.rent?.ok} label={t('portal.hq.sourceRent')} detail={fmtYen(hq.rent?.amount || 0)} />
        </div>
      )}

      {books && <CostBooksHero books={books} access={access} />}

      <div style={{ fontSize: 16, fontWeight: 800, margin: '4px 0 8px' }}>{t('portal.hq.hoursTitle')}</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>{t('portal.hq.hoursHint')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 22 }}>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
          {!payroll.length ? (
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>{t('clock.noHours')}</div>
          ) : (
            <div className="table-scroll">
              <table style={{ width: '100%', fontSize: 13 }}>
                <thead>
                  <tr>
                    {[t('clock.colName'), t('clock.colHours'), t('portal.hq.colLate'), t('clock.colPay')].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: 8 }}>{h}</th>
                    ))}
                  </tr>
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
        <HoursCalculator />
      </div>

      {access.rent && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginBottom: 22 }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{t('portal.hq.rentTitle')}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>{t('portal.costs.rentHint')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end' }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)' }}>
              {t('portal.hq.rentAmount')}
              <input type="number" min="0" step="1000" value={rentAmount} onChange={e => setRentAmount(e.target.value)} style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8 }} />
            </label>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)' }}>
              {t('common.notes')}
              <input value={rentNote} onChange={e => setRentNote(e.target.value)} style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8 }} />
            </label>
            <button type="button" className="btn-primary" disabled={busy} onClick={saveRent} style={{ padding: '10px 14px', borderRadius: 10, fontSize: 12 }}>
              {t('portal.hq.rentSave')}
            </button>
          </div>
          {rentMsg && <div style={{ marginTop: 10, fontSize: 12, color: rentMsg === t('common.success') ? 'var(--green)' : 'var(--red)' }}>{rentMsg}</div>}
        </div>
      )}

      <div style={{ fontSize: 16, fontWeight: 800, margin: '4px 0 12px' }}>{t('portal.hq.linksTitle')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        {[
          { id: 'pos', label: t('portal.hq.linkPos') },
          { id: 'ponto', label: t('portal.hq.linkClock') },
          { id: 'equipe', label: t('portal.hq.linkTeam') },
          { id: 'faturas', label: t('portal.hq.linkJbm') },
          { id: 'pedidos', label: t('portal.hq.linkOrders') },
          { id: 'ia', label: t('nav.portalAi') },
        ].map(link => (
          <button
            key={link.id}
            type="button"
            onClick={() => onTab?.(link.id)}
            style={{ padding: '8px 14px', borderRadius: 20, border: '1px solid var(--border)', background: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            {link.label}
          </button>
        ))}
      </div>

      <PortalClienteAI bar={bar} initialSnapshot={hq} />

      <div style={{ fontSize: 16, fontWeight: 800, margin: '28px 0 12px' }}>{t('portal.costs.loginsTitle')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <WrittenLoginCard
          title={t('portal.costs.loginPos')}
          login={WRITTEN_LOGINS.pos}
          sees={t('auth.doorPosHint')}
        />
        <WrittenLoginCard
          title={t('portal.costs.loginGerente')}
          login={WRITTEN_LOGINS.gerente}
          sees={t('auth.doorGerenteHint')}
        />
        <WrittenLoginCard
          title={t('portal.costs.loginStaff')}
          login={WRITTEN_LOGINS.funcionario}
          sees={t('auth.doorStaffHint')}
        />
      </div>
    </div>
  )
}
