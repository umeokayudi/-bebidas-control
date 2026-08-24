import { useState } from 'react'
import { useUiPrefs, THEMES, LAYOUTS } from '../lib/uiPrefs'

export function ThemeToggle({ compact }) {
  const { theme, toggleTheme } = useUiPrefs()
  return (
    <button type="button" className="theme-toggle" onClick={toggleTheme}>
      {!compact && <span className="theme-toggle-label">Tema</span>}
      <span className="theme-pill">
        <span className={theme === THEMES.classic ? 'on' : ''}>Clássico</span>
        <span className={theme === THEMES.modern ? 'on' : ''}>Moderno</span>
      </span>
    </button>
  )
}

export function LayoutToggle() {
  const { layout, setLayout } = useUiPrefs()
  return (
    <div className="layout-toggle">
      <span className="theme-toggle-label">Layout</span>
      <span className="theme-pill layout-pill">
        {[
          { id: LAYOUTS.auto, label: 'Auto' },
          { id: LAYOUTS.desktop, label: 'Desktop' },
          { id: LAYOUTS.mobile, label: 'Mobile' },
        ].map(opt => (
          <button
            key={opt.id}
            type="button"
            className={layout === opt.id ? 'on' : ''}
            onClick={() => setLayout(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </span>
    </div>
  )
}

/** Tema/layout recolhidos por padrão — não ocupa a sidebar */
export default function UiPrefsPanel() {
  const [open, setOpen] = useState(false)

  return (
    <div className="ui-prefs-wrap">
      <button
        type="button"
        className="ui-prefs-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={open ? 'Ocultar aparência' : 'Mostrar aparência'}
      >
        {open ? '▾ Aparência' : '⚙ Aparência'}
      </button>
      {open && (
        <div className="ui-prefs-panel">
          <ThemeToggle />
          <LayoutToggle />
        </div>
      )}
    </div>
  )
}
