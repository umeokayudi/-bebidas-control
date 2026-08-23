import { useUiPrefs, THEMES, LAYOUTS } from '../lib/uiPrefs'

function PrefPill({ options, value, onChange }) {
  return (
    <span className="ui-pref-pill">
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          className={value === opt.id ? 'on' : ''}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </span>
  )
}

export default function UiPrefsPanel() {
  const { theme, layout, setTheme, setLayout } = useUiPrefs()

  return (
    <div className="ui-prefs-panel">
      <div className="ui-pref-row">
        <span className="ui-pref-label">Tema</span>
        <PrefPill
          value={theme}
          onChange={setTheme}
          options={[
            { id: THEMES.light, label: 'Claro' },
            { id: THEMES.dark, label: 'Escuro' },
          ]}
        />
      </div>
      <div className="ui-pref-row">
        <span className="ui-pref-label">Layout</span>
        <PrefPill
          value={layout}
          onChange={setLayout}
          options={[
            { id: LAYOUTS.auto, label: 'Auto' },
            { id: LAYOUTS.desktop, label: 'Desktop' },
            { id: LAYOUTS.mobile, label: 'Mobile' },
          ]}
        />
      </div>
    </div>
  )
}
