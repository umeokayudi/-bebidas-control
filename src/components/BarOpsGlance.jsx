import { fmtYen } from './utils'
import { useI18n } from '../lib/i18n'
import { opsGlanceItems } from '../lib/barOpsGlance'

export default function BarOpsGlance({ glance, onTab }) {
  const { t } = useI18n()
  if (!glance) return null
  const items = opsGlanceItems(glance, t, fmtYen)
  return (
    <div className="ops-kpis" aria-label={t('portal.home.opsTitle')}>
      <div className="ops-kpis-title">{t('portal.home.opsTitle')}</div>
      <div className="ops-kpis-grid">
        {items.map(it => (
          <button
            key={it.id}
            type="button"
            className={`ops-kpi${it.warn ? ' is-warn' : ''}`}
            onClick={() => onTab?.(it.tab)}
          >
            <span className="ops-kpi-kicker">{it.kicker}</span>
            <span className="ops-kpi-value">{it.value}</span>
            {it.hint && <span className="ops-kpi-hint">{it.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
