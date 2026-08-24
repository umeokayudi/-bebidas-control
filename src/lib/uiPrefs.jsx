import { createContext, useContext, useEffect, useState } from 'react'

const THEME_KEY = 'jbm_drinks_theme'
const LAYOUT_KEY = 'jbm_drinks_layout'

/** Igual JBM Holding: classic = escuro, modern = claro */
export const THEMES = { classic: 'classic', modern: 'modern' }
export const LAYOUTS = { auto: 'auto', desktop: 'desktop', mobile: 'mobile' }

function loadTheme() {
  const t = localStorage.getItem(THEME_KEY)
  if (t === 'dark' || t === 'classic') return THEMES.classic
  if (t === 'light' || t === 'modern') return THEMES.modern
  return THEMES.modern
}

const UiPrefsContext = createContext({
  theme: THEMES.modern,
  layout: LAYOUTS.auto,
  setTheme: () => {},
  setLayout: () => {},
  toggleTheme: () => {},
})

export function UiPrefsProvider({ children }) {
  const [theme, setThemeState] = useState(loadTheme)
  const [layout, setLayoutState] = useState(() => localStorage.getItem(LAYOUT_KEY) || LAYOUTS.auto)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.setAttribute('data-layout', layout)
    localStorage.setItem(LAYOUT_KEY, layout)
  }, [layout])

  function setTheme(t) {
    setThemeState(t === THEMES.classic ? THEMES.classic : THEMES.modern)
  }

  function toggleTheme() {
    setThemeState(t => t === THEMES.modern ? THEMES.classic : THEMES.modern)
  }

  function setLayout(l) {
    setLayoutState(Object.values(LAYOUTS).includes(l) ? l : LAYOUTS.auto)
  }

  return (
    <UiPrefsContext.Provider value={{ theme, layout, setTheme, setLayout, toggleTheme }}>
      {children}
    </UiPrefsContext.Provider>
  )
}

export function useUiPrefs() {
  return useContext(UiPrefsContext)
}
