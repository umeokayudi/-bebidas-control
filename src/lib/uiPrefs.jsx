import { createContext, useContext, useEffect, useState } from 'react'

const THEME_KEY = 'jbm_drinks_theme'
const LAYOUT_KEY = 'jbm_drinks_layout'

export const THEMES = { light: 'light', dark: 'dark' }
export const LAYOUTS = { auto: 'auto', desktop: 'desktop', mobile: 'mobile' }

const UiPrefsContext = createContext({
  theme: THEMES.light,
  layout: LAYOUTS.auto,
  setTheme: () => {},
  setLayout: () => {},
})

export function UiPrefsProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem(THEME_KEY) || THEMES.light)
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
    setThemeState(t === THEMES.dark ? THEMES.dark : THEMES.light)
  }

  function setLayout(l) {
    setLayoutState(Object.values(LAYOUTS).includes(l) ? l : LAYOUTS.auto)
  }

  return (
    <UiPrefsContext.Provider value={{ theme, layout, setTheme, setLayout }}>
      {children}
    </UiPrefsContext.Provider>
  )
}

export function useUiPrefs() {
  return useContext(UiPrefsContext)
}
