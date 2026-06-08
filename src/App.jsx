import { useState, useEffect } from 'react'
import { AuthProvider, useAuth, LoginPage } from './components/Auth'
import { supabase } from './lib/supabase'
import { LogoSidebar } from './components/Logo'
import ComprasTab   from './components/Compras'
import VendasTab    from './components/Vendas'
import RelatorioTab from './components/Relatorio'
import RyoshushoTab from './components/Ryoshusho'
import EstoqueTab from './components/Estoque'
import PortalCliente from './components/PortalCliente'
import { ProductsTab, BarsTab, UsuariosTab, PedidosAdminTab } from './components/Configs'
import { fmtYen, monthLabel } from './components/utils'
import { useNotifications, NotificationBell } from './components/Notifications'

const ADMIN_TABS = [
  { id:'dashboard', label:'Dashboard' },
  { id:'purchases', label:'Purchases' },
  { id:'sales',     label:'Sales' },
  { id:'pedidos',   label:'Orders' },
  { id:'relatorio', label:'Report' },
  { id:'ryoshusho', label:'領収書' },
  { id:'products',  label:'Products' },
  { id:'bars',      label:'Bars' },
  { id:'usuarios',  label:'Users' },
]

function Shell() {
  const { user, perfil, loading, signOut } = useAuth()
  const [tab, setTab] = useState('dashboard')
  if (loading) return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#001028'}}><LogoSidebar /></div>
  if (!user) return <LoginPage />
  if (perfil?.role === 'cliente') return <div style={{padding:20}}>Cliente portal coming soon</div>
  return <div style={{padding:20}}>Admin - {perfil?.role} - tab: {tab}</div>
}

export default function App() {
  return <AuthProvider><Shell/></AuthProvider>
}
