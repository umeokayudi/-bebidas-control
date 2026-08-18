import { LogoLogin } from './Logo'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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
    if (!data) {
      const { data: user } = await supabase.auth.getUser()
      await supabase.from('perfis').insert({
        id: uid,
        nome: user?.user?.user_metadata?.nome || user?.user?.email?.split('@')[0] || 'Usuário',
        email: user?.user?.email || null,
        role: 'staff'
      })
      const { data: newPerfil } = await supabase.from('perfis').select('*').eq('id', uid).single()
      data = newPerfil
    }
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

export function LoginPage() {
  const { signIn, signUp } = useAuth()
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
        if (error) setErr('Email ou senha incorretos')
      } else {
        if (!nome) return setErr('Please enter your name')
        const { error } = await signUp(email, pass, nome)
        if (error) setErr(error.message)
        else setErr('✅ ✅ Check your email to confirm.')
      }
    } finally { setBusy(false) }
  }

  return (
    <div style={{
      minHeight:'100vh', display:'flex', background:'var(--navy)',
      alignItems:'center', justifyContent:'center', padding:20
    }}>
      {/* Background pattern */}
      <div style={{
        position:'fixed', inset:0, opacity:0.03,
        backgroundImage:'repeating-linear-gradient(45deg,#c19c56 0,#c19c56 1px,transparent 0,transparent 50%)',
        backgroundSize:'20px 20px', pointerEvents:'none'
      }}/>

      <div style={{width:'100%',maxWidth:400,position:'relative'}}>
        {/* Logo */}
        <div style={{textAlign:'center',marginBottom:36}}>
          <LogoLogin />
        </div>

        <div style={{
          background:'rgba(255,255,255,0.04)',
          border:'1px solid rgba(193,156,86,0.2)',
          borderRadius:20, padding:'32px 28px',
          backdropFilter:'blur(10px)'
        }}>
          <div style={{fontSize:14,fontWeight:600,color:'rgba(255,255,255,0.6)',
            marginBottom:24,textAlign:'center',letterSpacing:'0.05em',textTransform:'uppercase'}}>
            {mode==='login'?'System access':'Create account'}
          </div>

          {mode==='signup'&&(
            <div style={{marginBottom:14}}>
              <label className="form-label" style={{color:'rgba(193,156,86,0.7)'}}>Name</label>
              <input type="text" value={nome} onChange={e=>setName(e.target.value)}
                placeholder="Your name"
                style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(193,156,86,0.2)',color:'white'}}/>
            </div>
          )}
          <div style={{marginBottom:14}}>
            <label className="form-label" style={{color:'rgba(193,156,86,0.7)'}}>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
              placeholder="seu@email.com"
              style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(193,156,86,0.2)',color:'white'}}/>
          </div>
          <div style={{marginBottom:24}}>
            <label className="form-label" style={{color:'rgba(193,156,86,0.7)'}}>Password</label>
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
            {busy?<><span className="spinner"/>Please wait...</>:mode==='login'?'Sign in':'Create account'}
          </button>

          <div style={{textAlign:'center',marginTop:20,fontSize:12,color:'rgba(255,255,255,0.35)'}}>
            {mode==='login'
              ?<>Don't have access? <button onClick={()=>setMode('signup')} style={{border:'none',background:'none',color:'var(--gold)',fontWeight:600,padding:0,cursor:'pointer',fontSize:12}}>Request access</button></>
              :<>Already have an account? <button onClick={()=>setMode('login')} style={{border:'none',background:'none',color:'var(--gold)',fontWeight:600,padding:0,cursor:'pointer',fontSize:12}}>Sign in</button></>
            }
          </div>
        </div>

        <div style={{textAlign:'center',marginTop:20,fontSize:10,color:'rgba(255,255,255,0.2)',letterSpacing:'0.1em',textTransform:'uppercase'}}>
          Management System — JBM Drinks
        </div>
      </div>
    </div>
  )
}
