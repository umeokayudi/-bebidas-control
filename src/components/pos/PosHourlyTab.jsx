import { fmtYen } from '../utils'
import { idleHours, idleHourSuggestions, operatingHours } from '../../lib/posEngine'
import { useI18n } from '../../lib/i18n'

export default function PosHourlyTab({ buckets, lang }) {
  const { t } = useI18n()
  const max = Math.max(1, ...buckets.map(b => b.total))
  const ops = new Set(operatingHours({ openHour: 18, closeHour: 6 }))
  const idle = idleHours(buckets, { openHour: 18, closeHour: 6, thresholdRatio: 0.45 })
  const tips = idleHourSuggestions(idle, { lang })
  const nightTotal = buckets.filter(b => ops.has(b.hour)).reduce((a, b) => a + b.total, 0)
  const nightCount = buckets.filter(b => ops.has(b.hour)).reduce((a, b) => a + b.count, 0)
  const ticket = nightCount ? Math.round(nightTotal / nightCount) : 0

  return (
    <div className="pos-hourly">
      <div className="pos-kpi-row">
        <div className="pos-kpi"><span>{t('atomicPos.today')}</span><strong>{fmtYen(nightTotal)}</strong></div>
        <div className="pos-kpi"><span>{t('atomicPos.avgTicket')}</span><strong>{fmtYen(ticket)}</strong></div>
        <div className="pos-kpi"><span>{t('atomicPos.salesCount', { count: nightCount })}</span><strong>{nightCount}</strong></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{t('atomicPos.hourlyTitle')}</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>{t('atomicPos.hourlySub')}</div>
        <div className="pos-hour-chart">
          {buckets.map(b => {
            const h = Math.max(b.total > 0 ? 8 : 3, (b.total / max) * 120)
            const inOps = ops.has(b.hour)
            const isIdle = idle.some(i => i.hour === b.hour)
            return (
              <div key={b.hour} className="pos-hour-col" title={`${b.label} · ${fmtYen(b.total)} · ${b.count}`}>
                <div className="pos-hour-val">{b.total ? Math.round(b.total / 1000) + 'k' : ''}</div>
                <div
                  className="pos-hour-bar"
                  style={{
                    height: h,
                    opacity: inOps ? 1 : 0.25,
                    background: isIdle ? 'var(--amber)' : 'var(--navy)',
                  }}
                />
                <div className="pos-hour-label">{String(b.hour).padStart(2, '0')}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card">
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{t('atomicPos.idleTitle')}</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>{t('atomicPos.idleSub')}</div>
        {idle.length > 0 && (
          <div style={{ fontSize: 13, marginBottom: 12, color: 'var(--amber)' }}>
            {idle.map(h => h.label).join(' · ')}
          </div>
        )}
        <div className="pos-idle-grid">
          {tips.map(tip => (
            <div key={tip.title} className="pos-idle-card">
              <div style={{ fontWeight: 800, marginBottom: 6 }}>{tip.title}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{tip.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
