import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useI18n } from '../../lib/i18n'
import { fmtYen, Spinner } from '../utils'
import { PortalSurface } from '../ui/PageLayout'
import { generateDiscountCode, hourlyReport, idleSuggestions, localDateKey, savePosConfig, weekdayReport } from '../../lib/posEngine'
import { HourBars, ModeButtons, StatCard, StatGrid, Field } from './PosShared'

const PERIODS = ['today', '7d', '30d', 'month']

function periodRange(period, today) {
  const end = new Date(`${today}T12:00:00`)
  const start = new Date(end)
  if (period === '7d') start.setDate(start.getDate() - 6)
  else if (period === '30d') start.setDate(start.getDate() - 29)
  else if (period === 'month') start.setDate(1)
  return { from: localDateKey(start), to: today }
}

export default function PosHourly({ bar, data, reload, onTab }) {
  const { t, lang } = useI18n()
  const { config, today } = data
  const [period, setPeriod] = useState('7d')
  const [vendas, setVendas] = useState(null)
  const [hours, setHours] = useState({ abre: config.hora_abre, fecha: config.hora_fecha })
  const [savingHours, setSavingHours] = useState(false)
  const [msg, setMsg] = useState('')

  const range = useMemo(() => periodRange(period, today), [period, today])

  useEffect(() => {
    setVendas(null)
    supabase.from('pos_vendas')
      .select('id, total, custo_total, criado_em, data, metodo_pagamento, tipo')
      .eq('bar_id', bar.id).gte('data', range.from).lte('data', range.to)
      .then(({ data: rows }) => setVendas(rows || []))
  }, [bar.id, range.from, range.to])

  const report = useMemo(() => hourlyReport(vendas || [], config), [vendas, config])
  const weekdays = useMemo(() => weekdayReport(vendas || []), [vendas])
  const suggestions = useMemo(() => idleSuggestions(report), [report])
  const days = useMemo(() => new Set((vendas || []).map(v => v.data)).size || 1, [vendas])

  const weekdayNames = lang === 'ja'
    ? ['日', '月', '火', '水', '木', '金', '土']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  async function saveHours() {
    setSavingHours(true)
    try {
      await savePosConfig(supabase, bar.id, { hora_abre: hours.abre, hora_fecha: hours.fecha })
      setMsg(t('pos.saved'))
      reload()
    } catch (e) { setMsg(e.message) } finally { setSavingHours(false) }
  }

  async function createHappyHour(s) {
    const codigo = generateDiscountCode('HAPPY')
    const { error } = await supabase.from('discount_codes').insert({
      bar_id: bar.id, codigo, tipo: 'percent', valor: s.discount || 30, ativo: true,
      descricao: t('pos.happyHourDesc', { range: s.range }),
    })
    setMsg(error ? error.message : t('pos.happyHourCreated', { code: codigo }))
    if (!error) reload()
  }

  if (!vendas) return <Spinner text={t('pos.loading')} />

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <ModeButtons value={period} onChange={setPeriod} options={PERIODS.map(p => [p, t(`pos.period.${p}`)])} />
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>{range.from} → {range.to}</div>
      </div>

      <StatGrid>
        <StatCard label={t('pos.revenue')} value={fmtYen(report.total)} sub={t('pos.salesCount', { count: report.count })} color="var(--green)" />
        <StatCard label={t('pos.avgTicket')} value={fmtYen(report.ticket)} />
        <StatCard label={t('pos.avgPerDay')} value={fmtYen(Math.round(report.total / days))} sub={t('pos.daysWithSales', { count: days })} />
        <StatCard label={t('pos.peakHours')} value={report.peak.length ? report.peak.slice(0, 2).map(r => r.label).join(', ') : '—'} sub={report.peak[0] ? fmtYen(report.peak[0].total) : ''} color="var(--gold)" />
        <StatCard label={t('pos.idleHours')} value={report.idle.length ? report.idle.map(r => r.label).join(', ') : '—'} sub={t('pos.idleSub')} color="#c0392b" />
      </StatGrid>

      <PortalSurface title={t('pos.hourlyChart')} sub={t('pos.hourlyChartSub')}>
        {report.count === 0 ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('pos.noSalesPeriod')}</div> : (
          <>
            <HourBars rows={report.rows} height={110} />
            <div className="table-scroll" style={{ marginTop: 16 }}>
              <table style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 6 }}>{t('pos.hour')}</th>
                    <th style={{ textAlign: 'right', padding: 6 }}>{t('pos.revenue')}</th>
                    <th style={{ textAlign: 'right', padding: 6 }}>{t('pos.sales')}</th>
                    <th style={{ textAlign: 'right', padding: 6 }}>{t('pos.avgTicket')}</th>
                    <th style={{ textAlign: 'right', padding: 6 }}>%</th>
                    <th style={{ textAlign: 'right', padding: 6 }}>{t('pos.margin')}</th>
                    <th style={{ padding: 6 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map(r => (
                    <tr key={r.hour} style={{ borderTop: '1px solid var(--border)', background: r.isPeak ? 'rgba(193,156,86,0.08)' : r.isIdle ? 'rgba(192,57,43,0.06)' : undefined }}>
                      <td style={{ padding: 6, fontWeight: 700 }}>{r.label}</td>
                      <td style={{ padding: 6, textAlign: 'right', fontWeight: 600 }}>{fmtYen(r.total)}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{r.count}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{r.count ? fmtYen(r.ticket) : '—'}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{r.pct}%</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{r.count ? `${r.margem}%` : '—'}</td>
                      <td style={{ padding: 6, fontSize: 11 }}>{r.isPeak ? `🔥 ${t('pos.peak')}` : r.isIdle ? `💤 ${t('pos.idle')}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </PortalSurface>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <PortalSurface title={t('pos.idleMonetization')} sub={t('pos.idleMonetizationSub')}>
          {msg && <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600, marginBottom: 8 }}>{msg}</div>}
          {suggestions.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('pos.noIdle')}</div> : suggestions.map(s => (
            <div key={s.type} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{t(`pos.suggestion.${s.type}.title`, { range: s.range })}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{t(`pos.suggestion.${s.type}.desc`, { range: s.range, discount: s.discount })}</div>
              {s.type === 'happyHour' && (
                <button className="btn-primary" onClick={() => createHappyHour(s)} style={{ marginTop: 6, fontSize: 11, padding: '5px 12px', borderRadius: 8 }}>
                  {t('pos.createHappyHourCode', { discount: s.discount })}
                </button>
              )}
              {s.type === 'staffing' && (
                <button onClick={() => onTab('staff')} style={{ marginTop: 6, fontSize: 11, padding: '5px 12px', borderRadius: 8 }}>{t('pos.tabStaff')} →</button>
              )}
            </div>
          ))}
        </PortalSurface>

        <div>
          <PortalSurface title={t('pos.byWeekday')}>
            {weekdays.map(w => (
              <div key={w.weekday} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, padding: '4px 0' }}>
                <span style={{ width: 28, fontWeight: 700 }}>{weekdayNames[w.weekday]}</span>
                <div style={{ flex: 1, height: 8, background: 'var(--bg3)', borderRadius: 4 }}>
                  <div style={{ width: `${w.pct}%`, height: '100%', background: 'var(--navy)', borderRadius: 4 }} />
                </div>
                <span style={{ width: 80, textAlign: 'right', fontWeight: 600 }}>{fmtYen(w.total)}</span>
                <span style={{ width: 30, textAlign: 'right', color: 'var(--text2)' }}>{w.count}×</span>
              </div>
            ))}
          </PortalSurface>

          <PortalSurface title={t('pos.openingHours')} sub={t('pos.openingHoursSub')}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
              <Field label={t('pos.opens')} style={{ marginBottom: 0 }}><input type="time" value={hours.abre} onChange={e => setHours({ ...hours, abre: e.target.value })} /></Field>
              <Field label={t('pos.closes')} style={{ marginBottom: 0 }}><input type="time" value={hours.fecha} onChange={e => setHours({ ...hours, fecha: e.target.value })} /></Field>
              <button className="btn-primary" onClick={saveHours} disabled={savingHours} style={{ padding: '9px 14px' }}>{savingHours ? '…' : t('common.save')}</button>
            </div>
          </PortalSurface>
        </div>
      </div>
    </div>
  )
}
