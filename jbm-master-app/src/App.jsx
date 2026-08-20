import { useState } from 'react'
import { BrowserRouter, HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { ThemeProvider, useTheme, THEMES } from './lib/theme'
import Dashboard from './pages/Dashboard'
import Drinks from './pages/Drinks'
import KuriPuro from './pages/KuriPuro'
import HR from './pages/HR'
import Financeiro from './pages/Financeiro'
import Logistica from './pages/Logistica'
import Investimentos from './pages/Investimentos'
import Saques from './pages/Saques'

const AUTH_KEY = 'jbm_auth'
const PASSWORD = import.meta.env.VITE_JBM_PASSWORD || ''

const NAV = [
  { to: '/', label: 'Dashboard', icon: '⬤', end: true },
  { section: 'Negócios' },
  { to: '/kuripuro', label: 'KuriPuro', icon: '🧹' },
  { to: '/drinks', label: 'JBM Drinks', icon: '🍾' },
  { to: '/hr', label: 'JBM HR', icon: '👥' },
  { to: '/logistica', label: 'Logística', icon: '🚚' },
  { to: '/investimentos', label: 'Investimentos', icon: '📈' },
  { section: 'Financeiro' },
  { to: '/financeiro', label: 'Consolidado', icon: '💴' },
  { to: '/saques', label: 'Saques', icon: '💸' },
]

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <button type="button" className="theme-toggle" onClick={() => setTheme(theme === THEMES.modern ? THEMES.classic : THEMES.modern)}>
      <span className="theme-toggle-label">Design</span>
      <span className="theme-pill">
        <span className={theme === THEMES.classic ? 'on' : ''}>Clássico</span>
        <span className={theme === THEMES.modern ? 'on' : ''}>Moderno</span>
      </span>
    </button>
  )
}

function Shell() {
  const [authed, setAuthed] = useState(localStorage.getItem(AUTH_KEY) === 'true')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const { theme } = useTheme()

  function login() {
    if (!PASSWORD) {
      setErr('Configure VITE_JBM_PASSWORD no Vercel')
      return
    }
    if (pw === PASSWORD) {
      localStorage.setItem(AUTH_KEY, 'true')
      setAuthed(true)
      setErr('')
    } else {
      setErr('Senha incorreta')
    }
  }

  const toastStyle = theme === THEMES.modern
    ? { background: '#fff', color: '#1d1d1f', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }
    : { background: '#0d1f35', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }

  if (!authed) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="sidebar-brand-title" style={{ marginBottom: 4 }}>JBM</div>
          <div className="sidebar-brand-sub" style={{ marginBottom: 28 }}>Master Dashboard</div>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} placeholder="Senha" />
          {err && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{err}</div>}
          <button type="button" onClick={login}>Entrar</button>
          <div style={{ marginTop: 16 }}><ThemeToggle /></div>
        </div>
      </div>
    )
  }

  return (
    <>
      <Toaster position="top-right" toastOptions={{ style: toastStyle }} />
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <aside className="sidebar">
          <div className="sidebar-brand">
            <div className="sidebar-brand-title">JBM</div>
            <div className="sidebar-brand-sub">Holding Master</div>
          </div>
          {NAV.map(n => n.section ? (
            <div key={n.section} className="nav-section">{n.section}</div>
          ) : (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              <span>{n.icon}</span>
              <span className="nav-label">{n.label}</span>
            </NavLink>
          ))}
          <div className="sidebar-footer">
            <ThemeToggle />
            <button type="button" className="logout-btn" onClick={() => { localStorage.removeItem(AUTH_KEY); setAuthed(false) }}>Logout</button>
          </div>
        </aside>
        <main className="main">
          <div className="main-inner">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/kuripuro" element={<KuriPuro />} />
              <Route path="/drinks" element={<Drinks />} />
              <Route path="/hr" element={<HR />} />
              <Route path="/logistica" element={<Logistica />} />
              <Route path="/investimentos" element={<Investimentos />} />
              <Route path="/financeiro" element={<Financeiro />} />
              <Route path="/saques" element={<Saques />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </>
  )
}

export default function App() {
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined
  const isHoldingMirror = basename === '/holding'
  const Router = isHoldingMirror ? HashRouter : BrowserRouter
  const routerProps = isHoldingMirror ? {} : { basename }

  return (
    <ThemeProvider>
      <Router {...routerProps}>
        <Shell />
      </Router>
    </ThemeProvider>
  )
}
