import { createContext, useContext, useEffect, useState } from 'react'

const THEME_KEY = 'jbm_design_theme'
export const THEMES = { classic: 'classic', modern: 'modern' }

const ThemeContext = createContext({ theme: THEMES.classic, setTheme: () => {}, toggleTheme: () => {} })

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem(THEME_KEY) || THEMES.classic)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  function setTheme(t) {
    setThemeState(t === THEMES.modern ? THEMES.modern : THEMES.classic)
  }

  function toggleTheme() {
    setThemeState(t => t === THEMES.modern ? THEMES.classic : THEMES.modern)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
