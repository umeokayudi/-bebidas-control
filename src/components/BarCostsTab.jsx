import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './Auth'
import { fmtYen, Spinner } from './utils'
import { staffFetch } from '../lib/apiAuth'
import { filterSupplierVendas } from './utils'
import { filterJbmDrinksFaturas } from '../lib/barPortal'
import { monthlyAccountSummary } from '../lib/clientAnalytics'
import { tokyoMonthKey } from '../lib/tokyo'
import { payrollFromPunches, monthRange } from '../lib/timeClock'
import { splitCostBooks } from '../lib/costBooks'
import { costAccessForRole } from '../lib/access'
import { WRITTEN_LOGINS } from '../lib/barLanes'
import { useI18n } from '../lib/i18n'

function BookCard({ kicker, value, hint, tone = 'navy' }) {
  const tones = {
    navy: { bg: 'linear-gradient(135deg, var(--navy) 0%, #002855 100%)', color: 'white', hint: 'rgba(255,255,255,0.75)' },
    light: { bg: 'var(--bg2)', color: 'var(--navy)', hint: 'var(--text2)', border: '1px solid var(--border)' },
    green: { bg: 'var(--bg2)', color: 'var(--green)', hint: 'var(--text2)', border: '1px solid rgba(52,199,89,0.25)' },
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
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
      </div>
    </div>
  )
}

export async function loadCostBooks(barId) {
  const mes = tokyoMonthKey()
  const range = monthRange()
  const [vR, fR, posR, clockR, teamR] = await Promise.all([
    supabase.from('vendas').select('*').eq('bar_id', barId),
    supabase.from('faturas').select('*').eq('bar_id', barId),
    supabase.from('pos_vendas').select('total,data').eq('bar_id', barId),
    staffFetch(`/api/time-clock?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`).then(r => r.json()).catch(() => ({ punches: [] })),
    staffFetch('/api/bar-staff').then(r => r.json()).catch(() => ({ staff: [] })),
  ])
  const vendas = filterSupplierVendas(vR.data || [])
  const faturas = filterJbmDrinksFaturas(fR.data || [])
  const account = monthlyAccountSummary(vendas, faturas, mes)
  const posMonthTotal = (posR.data || [])
    .filter(s => String(s.data || '').startsWith(mes))
    .reduce((a, s) => a + (+s.total || 0), 0)
  const payroll = payrollFromPunches(clockR.punches || [], teamR.staff || [], range)
  const staffMonthPay = payroll.reduce((a, r) => a + (+r.pay || 0), 0)
  return splitCostBooks({
    posMonthTotal,
    jbmMonthBill: account.contaMes,
    staffMonthPay,
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

export default function BarCostsTab({ bar }) {
  const { perfil } = useAuth()
  const { t } = useI18n()
  const access = costAccessForRole(perfil?.role)
  const [books, setBooks] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    loadCostBooks(bar.id)
      .then(b => { if (!cancelled) setBooks(b) })
      .catch(e => { if (!cancelled) setErr(e.message) })
    return () => { cancelled = true }
  }, [bar.id])

  if (!books && !err) return <Spinner text={t('portal.costs.loading')} />

  return (
    <div className="fade-in portal-page" style={{ maxWidth: 1000 }}>
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>{t('portal.costs.title')}</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 20px' }}>{t('portal.costs.subtitle')}</div>
      {err && <div style={{ color: 'var(--red)', marginBottom: 16 }}>{err}</div>}
      {books && <CostBooksHero books={books} access={access} />}

      <div style={{ fontSize: 16, fontWeight: 800, margin: '8px 0 12px' }}>{t('portal.costs.loginsTitle')}</div>
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
