import { LogoLogin } from './Logo'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n, LANGS } from '../lib/i18n'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [perfil,  setPerfil]  = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadPerfil(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      if (session?.user) loadPerfil(session.user.id)
      else { setPerfil(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function loadPerfil(uid) {
    let { data } = await supabase.from('perfis').select('*').eq('id', uid).single()
    setPerfil(data)
    setLoading(false)
  }

  return (
    <AuthContext.Provider value={{
      user, perfil, loading,
      signIn:  (e,p) => supabase.auth.signInWithPassword({ email:e, password:p }),
      signUp:  (e,p,n) => supabase.auth.signUp({ email:e, password:p, options:{ data:{ nome:n } } }),
      signOut: () => supabase.auth.signOut()
    }}>
      {children}
    </AuthContext.Provider>
  )
}

function LoginLanguagePicker() {
  const { lang, setLang } = useI18n()
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
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
          {opt.label}
        </button>
      ))}
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

  const submit = async () => {
    setErr(''); setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, pass)
        if (error) setErr(t('auth.wrongCredentials'))
      } else {
        if (!nome) return setErr(t('auth.enterName'))
        const { error } = await signUp(email, pass, nome)
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

      <div style={{width:'100%',maxWidth:400,position:'relative'}}>
        <div style={{textAlign:'center',marginBottom:36}}>
          <LogoLogin />
        </div>

        <div style={{
          background:'rgba(255,255,255,0.04)',
          border:'1px solid rgba(193,156,86,0.2)',
          borderRadius:20, padding:'32px 28px',
          backdropFilter:'blur(10px)'
        }}>
          <LoginLanguagePicker />
          <div style={{fontSize:14,fontWeight:600,color:'rgba(255,255,255,0.6)',
            marginBottom:24,textAlign:'center',letterSpacing:'0.05em',textTransform:'uppercase'}}>
            {mode==='login'?t('auth.systemAccess'):t('auth.createAccount')}
          </div>

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
              placeholder="seu@email.com"
              style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(193,156,86,0.2)',color:'white'}}/>
          </div>
          <div style={{marginBottom:24}}>
            <label className="form-label" style={{color:'rgba(193,156,86,0.7)'}}>{t('auth.password')}</label>
            <input type="password" value={pass} onChange={e=>setPass(e.target.value)}
              placeholder="••••••••"
              style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(193,156,86,0.2)',color:'white'}}
              onKeyDown={e=>e.key==='Enter'&&submit()}/>
          </div>

          {err&&(
            <div style={{
              fontSize:13,marginBottom:16,padding:'10px 14px',borderRadius:8,
              background:err.startsWith('✅')?'rgba(26,107,74,0.2)':'rgba(160,41,28,0.2)',
              color:err.startsWith('✅')?'#6ee7b7':'#fca5a5',
              border:`1px solid ${err.startsWith('✅')?'rgba(26,107,74,0.3)':'rgba(160,41,28,0.3)'}`
            }}>{err}</div>
          )}

          <button className="btn-gold" onClick={submit} disabled={busy}
            style={{width:'100%',padding:'13px',fontSize:14,borderRadius:10,letterSpacing:'0.05em',textTransform:'uppercase'}}>
            {busy?<><span className="spinner"/>{t('common.wait')}</>:mode==='login'?t('auth.enter'):t('auth.create')}
          </button>

          <div style={{textAlign:'center',marginTop:20,fontSize:12,color:'rgba(255,255,255,0.35)'}}>
            {mode==='login'
              ?<>{t('auth.noAccess')} <button onClick={()=>setMode('signup')} style={{border:'none',background:'none',color:'var(--gold)',fontWeight:600,padding:0,cursor:'pointer',fontSize:12}}>{t('auth.requestAccess')}</button></>
              :<>{t('auth.haveAccount')} <button onClick={()=>setMode('login')} style={{border:'none',background:'none',color:'var(--gold)',fontWeight:600,padding:0,cursor:'pointer',fontSize:12}}>{t('auth.enter')}</button></>
            }
          </div>
        </div>

        <div style={{textAlign:'center',marginTop:20,fontSize:10,color:'rgba(255,255,255,0.2)',letterSpacing:'0.1em',textTransform:'uppercase'}}>
          {t('auth.panelTitle')}
        </div>
      </div>
    </div>
  )
}
