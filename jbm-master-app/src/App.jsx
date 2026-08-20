import { useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
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

function Shell() {
  const [authed, setAuthed] = useState(localStorage.getItem(AUTH_KEY) === 'true')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')

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

  if (!authed) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div style={{ fontSize: 28, fontWeight: 800, color: '#c19c56', marginBottom: 4 }}>JBM</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginBottom: 28 }}>Master Dashboard</div>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} placeholder="Senha" />
          {err && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>{err}</div>}
          <button type="button" onClick={login}>Entrar</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <Toaster position="top-right" toastOptions={{ style: { background: '#0d1f35', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' } }} />
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <aside className="sidebar">
          <div className="sidebar-brand">
            <div style={{ fontSize: 22, fontWeight: 800, color: '#c19c56' }}>JBM</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: 2, textTransform: 'uppercase' }}>Holding Master</div>
          </div>
          {NAV.map(n => n.section ? (
            <div key={n.section} style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: 2, textTransform: 'uppercase', padding: '12px 14px 4px', marginTop: 8 }}>{n.section}</div>
          ) : (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              <span>{n.icon}</span> {n.label}
            </NavLink>
          ))}
          <button type="button" className="logout-btn" onClick={() => { localStorage.removeItem(AUTH_KEY); setAuthed(false) }}>Logout</button>
        </aside>
        <main className="main">
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
        </main>
      </div>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  )
}
