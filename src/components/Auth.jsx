import { LogoLogin } from './Logo'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n, LANGS } from '../lib/i18n'
import {
  WRITTEN_LOGINS,
  readLanePerfil,
  readLaneToken,
  writeLaneSession,
  clearLaneSession,
  isLaneEmail,
} from '../lib/barLanes'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

function laneUserFromPerfil(perfil) {
  if (!perfil) return null
  return { id: perfil.id, email: perfil.email }
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

  async function signIn(email, password) {
    if (isLaneEmail(email)) {
      const res = await fetch('/api/bar/lane-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return { error: { message: json.error || 'Incorrect email or password' } }
      const next = { ...json.perfil, lane: true }
      writeLaneSession(json.token, next)
      applyLane(next)
      return { error: null, perfil: next }
    }
    clearLaneSession()
    return supabase.auth.signInWithPassword({ email, password })
  }

  async function signOut() {
    clearLaneSession()
    setUser(null)
    setPerfil(null)
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{
      user, perfil, loading,
      signIn,
      signUp:  (e,p,n) => supabase.auth.signUp({ email:e, password:p, options:{ data:{ nome:n } } }),
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

function LoginLanguagePicker() {
  const { lang, setLang, t } = useI18n()
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, textAlign: 'center', color: 'rgba(193,156,86,0.75)', marginBottom: 8, letterSpacing: '0.04em' }}>
        {t('shell.languageHint')}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
        {Object.values(LANGS).map(opt => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setLang(opt.id)}
            style={{
              padding: '6px 12px',
              borderRadius: 20,
              border: lang === opt.id ? '1px solid var(--gold)' : '1px solid rgba(193,156,86,0.25)',
              background: lang === opt.id ? 'rgba(193,156,86,0.15)' : 'transparent',
              color: lang === opt.id ? 'var(--gold)' : 'rgba(255,255,255,0.5)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {opt.id === 'ja' ? t('shell.langJaOptional') : opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

const DOORS = [
  { id: 'pos', login: WRITTEN_LOGINS.pos, titleKey: 'auth.doorPosTitle', hintKey: 'auth.doorPosHint' },
  { id: 'gerente', login: WRITTEN_LOGINS.gerente, titleKey: 'auth.doorGerenteTitle', hintKey: 'auth.doorGerenteHint' },
  { id: 'funcionario', login: WRITTEN_LOGINS.funcionario, titleKey: 'auth.doorStaffTitle', hintKey: 'auth.doorStaffHint' },
]

function DoorCard({ door, busy, onEnter, t }) {
  const login = door.login
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(193,156,86,0.22)',
      borderRadius: 16,
      padding: 18,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--gold)' }}>{t(door.titleKey)}</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)', lineHeight: 1.5, minHeight: 54 }}>{t(door.hintKey)}</div>
      <div style={{ fontSize: 10, color: 'rgba(193,156,86,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('auth.writtenEmail')}</div>
      <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: 'white', wordBreak: 'break-all' }}>{login.email}</div>
      <div style={{ fontSize: 10, color: 'rgba(193,156,86,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('auth.writtenPassword')}</div>
      <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: 'white' }}>{login.password}</div>
      {login.pin && (
        <>
          <div style={{ fontSize: 10, color: 'rgba(193,156,86,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('auth.writtenPin')}</div>
          <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: 'white' }}>{login.pin}</div>
        </>
      )}
      <button
        className="btn-gold"
        disabled={busy}
        onClick={() => onEnter(login)}
        style={{ width: '100%', marginTop: 8, padding: '11px', fontSize: 13, borderRadius: 10 }}
      >
        {busy ? t('common.wait') : t('auth.enterAs', { name: t(door.titleKey) })}
      </button>
    </div>
  )
}

export function LoginPage() {
  const { signIn, signUp } = useAuth()
  const { t } = useI18n()
  const [mode,  setMode]  = useState('login')
  const [nome,  setName]  = useState('')
  const [email, setEmail] = useState('')
  const [pass,  setPass]  = useState('')
  const [err,   setErr]   = useState('')
  const [busy,  setBusy]  = useState(false)
  const [other, setOther] = useState(false)

  const submit = async (overrideEmail, overridePass) => {
    const e = overrideEmail ?? email
    const p = overridePass ?? pass
    setErr(''); setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await signIn(e, p)
        if (error) setErr(t('auth.wrongCredentials'))
      } else {
        if (!nome) return setErr(t('auth.enterName'))
        const { error } = await signUp(e, p, nome)
        if (error) setErr(error.message)
        else setErr(`✅ ${t('auth.checkEmail')}`)
      }
    } finally { setBusy(false) }
  }

  return (
    <div className="login-wrap" style={{
      minHeight:'100vh', display:'flex', background:'var(--navy)',
      alignItems:'center', justifyContent:'center', padding:20
    }}>
      <div style={{
        position:'fixed', inset:0, opacity:0.03,
        backgroundImage:'repeating-linear-gradient(45deg,#c19c56 0,#c19c56 1px,transparent 0,transparent 50%)',
        backgroundSize:'20px 20px', pointerEvents:'none'
      }}/>

      <div style={{width:'100%',maxWidth:980,position:'relative'}}>
        <div style={{textAlign:'center',marginBottom:28}}>
          <LogoLogin />
        </div>

        <div style={{
          background:'rgba(255,255,255,0.04)',
          border:'1px solid rgba(193,156,86,0.2)',
          borderRadius:20, padding:'28px 24px',
          backdropFilter:'blur(10px)'
        }}>
          <LoginLanguagePicker />
          <div style={{fontSize:14,fontWeight:600,color:'rgba(255,255,255,0.6)',
            marginBottom:8,textAlign:'center',letterSpacing:'0.05em',textTransform:'uppercase'}}>
            {t('auth.systemAccess')}
          </div>
          <div style={{fontSize:12,color:'rgba(255,255,255,0.5)',textAlign:'center',marginBottom:20,lineHeight:1.5}}>
            {t('auth.costsNeverMix')}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))', gap:12, marginBottom:18 }}>
            {DOORS.map(door => (
              <DoorCard key={door.id} door={door} busy={busy} onEnter={login => submit(login.email, login.password)} t={t} />
            ))}
          </div>

          {err&&(
            <div style={{
              fontSize:13,marginBottom:16,padding:'10px 14px',borderRadius:8,
              background:err.startsWith('✅')?'rgba(26,107,74,0.2)':'rgba(160,41,28,0.2)',
              color:err.startsWith('✅')?'#6ee7b7':'#fca5a5',
              border:`1px solid ${err.startsWith('✅')?'rgba(26,107,74,0.3)':'rgba(160,41,28,0.3)'}`
            }}>{err}</div>
          )}

          <button
            type="button"
            onClick={() => setOther(o => !o)}
            style={{ display:'block', margin:'0 auto 12px', border:'none', background:'none', color:'rgba(193,156,86,0.85)', fontSize:12, cursor:'pointer' }}
          >
            {t('auth.otherLogin')} · {t('auth.doorJbmTitle')}
          </button>

          {other && (
            <>
              {mode==='signup'&&(
                <div style={{marginBottom:14}}>
                  <label className="form-label" style={{color:'rgba(193,156,86,0.7)'}}>{t('auth.name')}</label>
                  <input type="text" value={nome} onChange={e=>setName(e.target.value)}
                    placeholder={t('auth.yourName')}
                    style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(193,156,86,0.2)',color:'white'}}/>
                </div>
              )}
              <div style={{marginBottom:14}}>
                <label className="form-label" style={{color:'rgba(193,156,86,0.7)'}}>{t('auth.email')}</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                    placeholder={WRITTEN_LOGINS.jbm.email}
                  style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(193,156,86,0.2)',color:'white'}}/>
              </div>
              <div style={{marginBottom:16}}>
                <label className="form-label" style={{color:'rgba(193,156,86,0.7)'}}>{t('auth.password')}</label>
                <input type="password" value={pass} onChange={e=>setPass(e.target.value)}
                  placeholder={WRITTEN_LOGINS.jbm.password}
                  style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(193,156,86,0.2)',color:'white'}}
                  onKeyDown={e=>e.key==='Enter'&&submit()}/>
              </div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginBottom:12, textAlign:'center' }}>
                {t('auth.doorJbmHint')} · {WRITTEN_LOGINS.jbm.email} / {WRITTEN_LOGINS.jbm.password}
              </div>
              <button className="btn-gold" onClick={() => submit()} disabled={busy}
                style={{width:'100%',padding:'13px',fontSize:14,borderRadius:10,letterSpacing:'0.05em',textTransform:'uppercase'}}>
                {busy?<><span className="spinner"/>{t('common.wait')}</>:mode==='login'?t('auth.enter'):t('auth.create')}
              </button>
              <div style={{textAlign:'center',marginTop:16,fontSize:12,color:'rgba(255,255,255,0.35)'}}>
                {mode==='login'
                  ?<>{t('auth.noAccess')} <button onClick={()=>setMode('signup')} style={{border:'none',background:'none',color:'var(--gold)',fontWeight:600,padding:0,cursor:'pointer',fontSize:12}}>{t('auth.requestAccess')}</button></>
                  :<>{t('auth.haveAccount')} <button onClick={()=>setMode('login')} style={{border:'none',background:'none',color:'var(--gold)',fontWeight:600,padding:0,cursor:'pointer',fontSize:12}}>{t('auth.enter')}</button></>
                }
              </div>
            </>
          )}
        </div>

        <div style={{textAlign:'center',marginTop:20,fontSize:10,color:'rgba(255,255,255,0.2)',letterSpacing:'0.1em',textTransform:'uppercase'}}>
          {t('auth.panelTitle')}
        </div>
      </div>
    </div>
  )
}
