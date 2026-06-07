import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './Auth'

export function useNotifications() {
  const { user } = useAuth()
  const [notifs, setNotifs] = useState([])

  const load = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('notificacoes')
      .select('*')
      .eq('user_id', user.id)
      .order('criado_em', { ascending: false })
      .limit(20)
    setNotifs(data || [])
  }, [user])

  useEffect(() => {
    load()
    // Poll every 30s for new notifications
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [load])

  async function markRead(id) {
    await supabase.from('notificacoes').update({ lida: true }).eq('id', id)
    setNotifs(prev => prev.map(n => n.id === id ? {...n, lida: true} : n))
  }

  async function markAllRead() {
    if (!user) return
    await supabase.from('notificacoes').update({ lida: true }).eq('user_id', user.id)
    setNotifs(prev => prev.map(n => ({...n, lida: true})))
  }

  const unread = notifs.filter(n => !n.lida).length
  return { notifs, unread, markRead, markAllRead, reload: load }
}

const TIPO_ICON = {
  pedido_novo:       { icon: '🛒', color: '#8A5A00', bg: '#FDF3E0' },
  pedido_confirmado: { icon: '✅', color: '#1A4E8A', bg: '#EAF0FA' },
  pedido_entregue:   { icon: '📦', color: '#1A7A5E', bg: '#EAF5F0' },
  pedido_cancelado:  { icon: '❌', color: '#C0392B', bg: '#FBEAEA' },
}

export function NotificationBell({ notifs, unread, markRead, markAllRead, deleteNotif, deleteAll, onNavigate }) {
  const [open, setOpen] = useState(false)

  function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff/60000)
    const h = Math.floor(m/60)
    const d = Math.floor(h/24)
    if (d > 0) return d + 'd ago'
    if (h > 0) return h + 'h ago'
    if (m > 0) return m + 'm ago'
    return 'just now'
  }

  return (
    <div style={{ position:'relative' }}>
      <button onClick={() => setOpen(x => !x)} style={{
        position:'relative', background:'transparent',
        border:'1px solid rgba(255,255,255,0.1)',
        borderRadius:10, width:36, height:36,
        display:'flex', alignItems:'center', justifyContent:'center',
        cursor:'pointer', fontSize:16, color:'rgba(255,255,255,0.6)',
        transition:'all 0.15s'
      }}>
        🔔
        {unread > 0 && (
          <span style={{
            position:'absolute', top:-4, right:-4,
            background:'var(--red)', color:'white',
            fontSize:9, fontWeight:800,
            width:16, height:16, borderRadius:'50%',
            display:'flex', alignItems:'center', justifyContent:'center',
            border:'2px solid var(--navy)'
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{
            position:'fixed', inset:0, zIndex:998
          }}/>
          <div style={{
            position:'fixed', bottom:80, left:16,
            width:320, maxHeight:450, overflowY:'auto',
            background:'var(--bg2)', border:'1px solid var(--border)',
            borderRadius:14, boxShadow:'0 8px 30px rgba(0,0,0,0.15)',
            zIndex:999
          }}>
            <div style={{
              padding:'12px 16px', borderBottom:'1px solid var(--border)',
              display:'flex', justifyContent:'space-between', alignItems:'center'
            }}>
              <span style={{ fontSize:13, fontWeight:700 }}>Notifications</span>
              {unread > 0 && (
                {notifs.some(n=>n.lida) && deleteAll && <button onClick={deleteAll} style={{ fontSize:11, color:'var(--text2)', background:'none', border:'none', cursor:'pointer', padding:'4px 8px' }}>🗑 Clear read</button>}
                <button onClick={markAllRead} style={{
                  fontSize:11, color:'var(--blue)', border:'none',
                  background:'none', cursor:'pointer', fontWeight:600
                }}>Mark all read</button>
              )}
            </div>

            {notifs.length === 0 ? (
              <div style={{ padding:'24px 16px', textAlign:'center', color:'var(--text2)', fontSize:13 }}>
                No notifications
              </div>
            ) : notifs.map(n => {
              const t = TIPO_ICON[n.tipo] || { icon:'🔔', color:'var(--text2)', bg:'var(--bg3)' }
              return (
                <div key={n.id} style={{
                  padding:'12px 16px', borderBottom:'1px solid var(--border)',
                  display:'flex', gap:10, alignItems:'flex-start',
                  background: n.lida ? 'transparent' : 'rgba(193,156,86,0.05)',
                  transition:'background 0.15s'
                }}>
                  <div onClick={() => { markRead(n.id); if(onNavigate&&n.link) onNavigate(n.link) }}
                    style={{ width:32, height:32, borderRadius:8, flexShrink:0, background:t.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, cursor:'pointer' }}>{t.icon}</div>
                  <div style={{ flex:1, minWidth:0, cursor:'pointer' }} onClick={() => { markRead(n.id); if(onNavigate&&n.link) onNavigate(n.link) }}>
                    <div style={{ fontSize:12, fontWeight: n.lida ? 500 : 700, marginBottom:2 }}>
                      {n.titulo}
                    </div>
                    {n.mensagem && (
                      <div style={{ fontSize:11, color:'var(--text2)', lineHeight:1.4 }}>
                        {n.mensagem}
                      </div>
                    )}
                    <div style={{ fontSize:10, color:'var(--text3)', marginTop:4 }}>
                      {timeAgo(n.criado_em)}
                    </div>
                  </div>
                  {!n.lida && (
                    <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--gold)', flexShrink:0, marginTop:4 }}/>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
