import { LogoLogin } from './Logo'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n, LANGS } from '../lib/i18n'
import {
  readLanePerfil,
  readLaneToken,
  writeLaneSession,
  clearLaneSession,
  isLaneEmail,
} from '../lib/barLanes'
import {
  LOGIN_DOORS,
  doorById,
  loginDoorFromHash,
  setDoorHash,
  readDoorPref,
  writeDoorPref,
} from '../lib/barDoors'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

function laneUserFromPerfil(perfil) {
  if (!perfil) return null
  return { id: perfil.id, email: perfil.email }
}

async function tryLaneLogin(email, password) {
  const res = await fetch('/api/bar/lane-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { error: { message: json.error || 'Incorrect email or password' } }
  return { error: null, token: json.token, perfil: { ...json.perfil, lane: true } }
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [perfil,  setPerfil]  = useState(null)
  const [loading, setLoading] = useState(true)

  function applyLane(perfil) {
    const next = { ...perfil, lane: true }
    setUser(laneUserFromPerfil(next))
    setPerfil(next)
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        loadPerfil(session.user.id)
        return
      }
      const lane = readLanePerfil()
      const token = readLaneToken()
      if (lane && token) applyLane(lane)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) {
        clearLaneSession()
        setUser(session.user)
        loadPerfil(session.user.id)
        return
      }
      const lane = readLanePerfil()
      const token = readLaneToken()
      if (lane && token) applyLane(lane)
      else { setUser(null); setPerfil(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function loadPerfil(uid) {
    let { data } = await supabase.from('perfis').select('*').eq('id', uid).single()
    setPerfil(data)
    setLoading(false)
  }

  async function signIn(email, password, { keep } = {}) {
    const e = String(email || '').trim().toLowerCase()
    const p = String(password || '')

    if (isLaneEmail(e)) {
      const lane = await tryLaneLogin(e, p)
      if (lane.error) return lane
      writeLaneSession(lane.token, lane.perfil, !!keep)
      applyLane(lane.perfil)
      return { error: null, perfil: lane.perfil }
    }

    clearLaneSession()
    const result = await supabase.auth.signInWithPassword({ email: e, password: p })
    if (!result.error) return result

    const lane = await tryLaneLogin(e, p)
    if (!lane.error) {
      writeLaneSession(lane.token, lane.perfil, !!keep)
      applyLane(lane.perfil)
      return { error: null, perfil: lane.perfil }
    }
    return result
  }

  async function signOut() {
    clearLaneSession()
    setUser(null)
    setPerfil(null)
    try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* already cleared */ }
  }

  return (
    <AuthContext.Provider value={{
      user, perfil, loading,
      signIn,
      signUp: (e, p, n) => supabase.auth.signUp({ email: e, password: p, options: { data: { nome: n } } }),
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

function LoginLanguagePicker() {
  const { lang, setLang, t } = useI18n()
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 22 }}>
      {Object.values(LANGS).map(opt => (
        <button
          key={opt.id}
          type="button"
          onClick={() => setLang(opt.id)}
          style={{
            padding: '5px 12px',
            borderRadius: 20,
            border: lang === opt.id ? '1px solid var(--gold)' : '1px solid rgba(193,156,86,0.25)',
            background: lang === opt.id ? 'rgba(193,156,86,0.15)' : 'transparent',
            color: lang === opt.id ? 'var(--gold)' : 'rgba(255,255,255,0.45)',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {opt.id === 'ja' ? t('shell.langJaOptional') : opt.label}
        </button>
      ))}
    </div>
  )
}

function loginFormDoorId(hashDoor, pref) {
  if (hashDoor === 'live') return 'gerente'
  if (hashDoor === 'make' || hashDoor === 'send') return 'pos'
  return hashDoor || pref || ''
}

export function LoginPage() {
  const { signIn } = useAuth()
  const { t } = useI18n()
  const [doorId, setDoorId] = useState(() => loginFormDoorId(loginDoorFromHash(), readDoorPref()))
  const door = doorById(doorId)
  const [email, setEmail] = useState(() => doorById(loginFormDoorId(loginDoorFromHash(), readDoorPref()))?.prefillEmail || '')
  const [pass,  setPass]  = useState('')
  const [keep,  setKeep]  = useState(() => doorById(loginFormDoorId(loginDoorFromHash(), readDoorPref()))?.keep !== false)
  const [err,   setErr]   = useState('')
  const [busy,  setBusy]  = useState(false)

  useEffect(() => {
    const sync = () => {
      const fromHash = loginDoorFromHash()
      const formId = loginFormDoorId(fromHash, '')
      if (formId && formId !== doorId) pickDoor(formId, false)
    }
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [doorId])

  function pickDoor(id, writeHash = true) {
    const next = doorById(id)
    setDoorId(id || '')
    setErr('')
    setPass('')
    setEmail(next?.prefillEmail || '')
    setKeep(next?.keep !== false)
    writeDoorPref(id || '')
    if (writeHash) setDoorHash(id || '')
  }

  const submit = async () => {
    setErr('')
    if (!email.trim() || !pass) {
      setErr(t('auth.wrongCredentials'))
      return
    }
    setBusy(true)
    try {
      const { error } = await signIn(email, pass, { keep: !!(door?.keep && keep) })
      if (error) setErr(t('auth.wrongCredentials'))
      else if (loginDoorFromHash() === 'live') setDoorHash('live')
      else if (loginDoorFromHash() === 'make') setDoorHash('make')
      else if (loginDoorFromHash() === 'send') setDoorHash('send')
      else if (doorId) setDoorHash(doorId)
    } finally { setBusy(false) }
  }

  const field = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(193,156,86,0.22)',
    color: 'white',
    width: '100%',
    padding: '14px 16px',
    borderRadius: 12,
    fontSize: 16,
  }

  return (
    <div className="login-wrap" style={{
      minHeight: '100vh', display: 'flex', background: 'var(--navy)',
      alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        position: 'fixed', inset: 0, opacity: 0.03, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(45deg,#c19c56 0,#c19c56 1px,transparent 0,transparent 50%)',
        backgroundSize: '20px 20px',
      }} />

      <div style={{ width: '100%', maxWidth: door ? 400 : 520, position: 'relative' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <LogoLogin />
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(193,156,86,0.2)',
          borderRadius: 20,
          padding: '32px 28px',
          backdropFilter: 'blur(10px)',
        }}>
          <LoginLanguagePicker />
          {!door ? (
            <>
              <div style={{
                fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.55)',
                marginBottom: 18, textAlign: 'center', letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
                {t('auth.pickDevice')}
              </div>
              <div className="login-doors">
                {LOGIN_DOORS.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    className="login-door"
                    onClick={() => pickDoor(d.id)}
                  >
                    <strong>{t(d.titleKey)}</strong>
                    <span>{t(d.hintKey)}</span>
                  </button>
                ))}
              </div>
              <div className="login-door-hint">{t('auth.devicesHint')}</div>
            </>
          ) : (
            <>
              <div style={{
                fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.55)',
                marginBottom: 8, textAlign: 'center', letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
                {t(door.titleKey)}
              </div>
              <div className="login-door-hint">{t(door.hintKey)}</div>
              {door.id === 'pos' && <div className="login-door-hint">{t('auth.posBookmark')}</div>}
              {door.id === 'pos' && <div className="login-door-hint">{t('auth.makeBookmark')}</div>}
              {door.id === 'pos' && <div className="login-door-hint">{t('auth.sendBookmark')}</div>}
              {door.id === 'clock' && <div className="login-door-hint">{t('auth.clockBookmark')}</div>}
              {door.id === 'gerente' && <div className="login-door-hint">{t('auth.liveBookmark')}</div>}

              <div style={{ marginBottom: 14, marginTop: 18 }}>
                <label className="form-label" style={{ color: 'rgba(193,156,86,0.7)' }}>{t('auth.email')}</label>
                <input
                  type="email"
                  autoComplete="username"
                  autoFocus
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  style={field}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label className="form-label" style={{ color: 'rgba(193,156,86,0.7)' }}>{t('auth.password')}</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={pass}
                  onChange={e => setPass(e.target.value)}
                  placeholder="••••••••"
                  style={field}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                />
              </div>
              {door.keep && (
                <label className="login-keep">
                  <input type="checkbox" checked={keep} onChange={e => setKeep(e.target.checked)} />
                  {t('auth.keepTablet')}
                </label>
              )}

              {err && (
                <div style={{
                  fontSize: 13, marginBottom: 16, padding: '10px 14px', borderRadius: 8,
                  background: 'rgba(160,41,28,0.2)',
                  color: '#fca5a5',
                  border: '1px solid rgba(160,41,28,0.3)',
                }}>{err}</div>
              )}

              <button className="btn-gold" onClick={submit} disabled={busy}
                style={{ width: '100%', padding: 13, fontSize: 14, borderRadius: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {busy
                  ? <><span className="spinner" />{door.id === 'pos' || isLaneEmail(email) ? t('auth.openingLane') : t('common.wait')}</>
                  : t('auth.enter')}
              </button>
              <button type="button" className="login-back" onClick={() => pickDoor('')}>
                {t('auth.backDoors')}
              </button>
            </>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {t('auth.costsNeverMix')}
        </div>
      </div>
    </div>
  )
}
