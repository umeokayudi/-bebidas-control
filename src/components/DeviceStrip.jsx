import { useI18n } from '../lib/i18n'
import { devicesForRole } from '../lib/barDevices'
import { setDoorHash } from '../lib/barDoors'

export default function DeviceStrip({
  role,
  current = '',
  onPick,
  dim = false,
  compact = false,
}) {
  const { t } = useI18n()
  const lanes = devicesForRole(role, { current, includeCurrent: true })
  if (!lanes.length) return null

  function pick(id) {
    if (id === current) return
    if (onPick) onPick(id)
    else setDoorHash(id)
  }

  return (
    <nav className={`device-strip${dim ? ' is-dim' : ''}${compact ? ' is-compact' : ''}`} aria-label={t('auth.pickDevice')}>
      {lanes.map(d => (
        <button
          key={d.id}
          type="button"
          className={d.id === current ? 'is-on' : ''}
          data-device-lane={d.id}
          disabled={d.id === current}
          onClick={() => pick(d.id)}
        >
          <span className="device-strip-icon">{d.icon}</span>
          <span className="device-strip-label">{t(d.labelKey)}</span>
        </button>
      ))}
    </nav>
  )
}
