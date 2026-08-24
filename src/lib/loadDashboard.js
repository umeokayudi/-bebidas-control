import { supabase } from './supabase'

export async function loadDashboard() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Não autenticado')

  const res = await fetch('/api/dashboard', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Dashboard API ${res.status}`)
  }
  return res.json()
}
