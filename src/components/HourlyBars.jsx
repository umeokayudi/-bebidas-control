import { fmtYen } from './utils'
import { useI18n } from '../lib/i18n'

export default function HourlyBars({ data, height = 100, className = '' }) {
  const { t } = useI18n()
  const rows = data || []
  const active = rows.filter(h => h.total > 0 || h.count > 0)
  if (!active.length) return <div className="hourly-empty">{t('common.noData')}</div>
  const max = Math.max(...rows.map(d => d.total), 1)
  return (
    <div className={`hourly-chart${className ? ` ${className}` : ''}`} style={{ height: height + 32 }}>
      {rows.map((d, i) => {
        const barH = Math.max(2, (d.total / max) * height)
        const hasData = d.total > 0
        return (
          <div key={`${d.hour}-${i}`} className="hourly-col">
            {hasData && <div className="hourly-amt">{fmtYen(d.total)}</div>}
            <div
              className={`hourly-bar${hasData ? ' is-on' : ''}`}
              style={{ height: barH }}
              title={`${d.label}: ${fmtYen(d.total)} (${d.count} ${t('atomicPos.salesWord')})`}
            />
            <div className="hourly-lbl">{d.label.slice(0, 2)}h</div>
          </div>
        )
      })}
    </div>
  )
}
