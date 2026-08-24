import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from './Auth'
import { fmtYen, fmtDate } from './utils'
import { splitPendingCompras, splitPendingFaturas } from '../lib/compraPagamentos'

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
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [load])

  async function markRead(id) {
    await supabase.from('notificacoes').update({ lida: true }).eq('id', id)
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n))
  }

  async function markAllRead() {
    if (!user) return
    await supabase.from('notificacoes').update({ lida: true }).eq('user_id', user.id)
    setNotifs(prev => prev.map(n => ({ ...n, lida: true })))
  }

  const unread = notifs.filter(n => !n.lida).length
  return { notifs, unread, markRead, markAllRead, reload: load }
}

/** Alertas de vencimento (faturas/compras atrasadas) para o sino e dashboard */
export function useOverdueAlerts() {
  const { user } = useAuth()
  const [alerts, setAlerts] = useState(null)

  const load = useCallback(async () => {
    if (!user) return
    const today = new Date().toISOString().slice(0, 10)
    const [fR, cR, foR] = await Promise.all([
      supabase.from('faturas').select('*, bars(nome)').order('data_vencimento'),
      supabase.from('compras').select('*').order('data'),
      supabase.from('fornecedores').select('nome,pagamento'),
    ])
    const faturaSplit = splitPendingFaturas(fR.data || [], today)
    const compraSplit = splitPendingCompras(cR.data || [], foR.data || [])
    setAlerts({
      faturas: faturaSplit.overdue.map(f => ({
        id: f.id,
        label: f.bars?.nome || 'Bar',
        amount: f.amount,
        date: f.dueDate,
      })),
      compras: compraSplit.overdue.map(c => ({
        id: c.id,
        label: c.fornecedor || 'Fornecedor',
        amount: c.amount,
        date: c.dueDate,
      })),
      faturasTotal: faturaSplit.overdueTotal,
      comprasTotal: compraSplit.overdueTotal,
    })
  }, [user])

  useEffect(() => {
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [load])

  return alerts
}

const TIPO_ICON = {
  pedido_novo:       { icon: '🛒', color: '#8A5A00', bg: '#FDF3E0' },
  pedido_confirmado: { icon: '✅', color: '#1A4E8A', bg: '#EAF0FA' },
  pedido_entregue:   { icon: '📦', color: '#1A7A5E', bg: '#EAF5F0' },
  pedido_cancelado:  { icon: '❌', color: '#C0392B', bg: '#FBEAEA' },
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d atrás`
  if (h > 0) return `${h}h atrás`
  if (m > 0) return `${m}min atrás`
  return 'agora'
}

export function NotificationBell({
  notifs,
  unread,
  markRead,
  markAllRead,
  deleteNotif,
  deleteAll,
  onNavigate,
  overdueAlerts,
  placement = 'sidebar',
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const [panelStyle, setPanelStyle] = useState(null)

  const overdueCount = (overdueAlerts?.faturas?.length || 0) + (overdueAlerts?.compras?.length || 0)
  const badgeCount = unread + overdueCount

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setPanelStyle(null)
      return
    }
    const rect = btnRef.current.getBoundingClientRect()
    const panelW = Math.min(360, window.innerWidth - 16)
    const maxH = Math.min(480, window.innerHeight - 24)
    let left
    let top

    if (placement === 'header') {
      left = Math.min(Math.max(8, rect.right - panelW), window.innerWidth - panelW - 8)
      top = rect.bottom + 8
      if (top + maxH > window.innerHeight - 8) top = Math.max(8, rect.top - maxH - 8)
    } else {
      left = Math.max(8, rect.left)
      if (left + panelW > window.innerWidth - 8) left = window.innerWidth - panelW - 8
      top = rect.top - maxH - 8
      if (top < 8) top = rect.bottom + 8
    }

    setPanelStyle({ left, top, width: panelW, maxHeight: maxH })
  }, [open, placement])

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const panel = open && panelStyle && createPortal(
    <>
      <button type="button" className="notif-backdrop" onClick={() => setOpen(false)} aria-label="Fechar notificações" />
      <div className="notif-panel" style={panelStyle} role="dialog" aria-label="Notificações">
        <div className="notif-panel-header">
          <span className="notif-panel-title">Notificações</span>
          <div className="notif-panel-actions">
            {notifs.some(n => n.lida) && deleteAll && (
              <button type="button" className="notif-panel-link" onClick={deleteAll}>Limpar lidas</button>
            )}
            {unread > 0 && (
              <button type="button" className="notif-panel-link notif-panel-link-primary" onClick={markAllRead}>
                Marcar lidas
              </button>
            )}
          </div>
        </div>

        <div className="notif-panel-body">
          {overdueCount > 0 && (
            <div className="notif-overdue-block">
              <div className="notif-overdue-title">⚠️ Vencimentos atrasados</div>
              {overdueAlerts.faturas?.map(f => (
                <button
                  key={`f-${f.id}`}
                  type="button"
                  className="notif-overdue-row"
                  onClick={() => { setOpen(false); onNavigate?.('faturas') }}
                >
                  <span className="notif-overdue-kind">Fatura</span>
                  <span className="notif-overdue-label">{f.label}</span>
                  <span className="notif-overdue-amount">{fmtYen(f.amount)}</span>
                  <span className="notif-overdue-date">venceu {fmtDate(f.date)}</span>
                </button>
              ))}
              {overdueAlerts.compras?.map(c => (
                <button
                  key={`c-${c.id}`}
                  type="button"
                  className="notif-overdue-row"
                  onClick={() => { setOpen(false); onNavigate?.('cashflow') }}
                >
                  <span className="notif-overdue-kind">Compra</span>
                  <span className="notif-overdue-label">{c.label}</span>
                  <span className="notif-overdue-amount">{fmtYen(c.amount)}</span>
                  <span className="notif-overdue-date">venceu {fmtDate(c.date)}</span>
                </button>
              ))}
            </div>
          )}

          {notifs.length === 0 && overdueCount === 0 ? (
            <div className="notif-empty">Nenhuma notificação</div>
          ) : notifs.map(n => {
            const t = TIPO_ICON[n.tipo] || { icon: '🔔', color: 'var(--text2)', bg: 'var(--bg3)' }
            return (
              <div
                key={n.id}
                className={`notif-row${n.lida ? '' : ' is-unread'}`}
              >
                <button
                  type="button"
                  className="notif-row-icon"
                  style={{ background: t.bg }}
                  onClick={() => { markRead(n.id); if (onNavigate && n.link) { setOpen(false); onNavigate(n.link) } }}
                >
                  {t.icon}
                </button>
                <button
                  type="button"
                  className="notif-row-content"
                  onClick={() => { markRead(n.id); if (onNavigate && n.link) { setOpen(false); onNavigate(n.link) } }}
                >
                  <div className="notif-row-title">{n.titulo}</div>
                  {n.mensagem && <div className="notif-row-msg">{n.mensagem}</div>}
                  <div className="notif-row-time">{timeAgo(n.criado_em)}</div>
                </button>
                {!n.lida && <span className="notif-unread-dot" aria-hidden />}
              </div>
            )
          })}
        </div>
      </div>
    </>,
    document.body
  )

  return (
    <div className="notif-bell-wrap">
      <button
        ref={btnRef}
        type="button"
        className="notif-bell-btn"
        onClick={() => setOpen(x => !x)}
        aria-expanded={open}
        aria-label={badgeCount > 0 ? `${badgeCount} notificações` : 'Notificações'}
      >
        🔔
        {badgeCount > 0 && (
          <span className="notif-badge">{badgeCount > 9 ? '9+' : badgeCount}</span>
        )}
      </button>
      {panel}
    </div>
  )
}
