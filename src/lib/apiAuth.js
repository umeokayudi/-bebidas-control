import { supabase } from './supabase'

/** Headers com Bearer do staff logado para APIs /api/* protegidas. */
export async function staffAuthHeaders(extra = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = { ...extra }
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`
  }
  return headers
}

export async function staffFetch(url, options = {}) {
  const headers = await staffAuthHeaders(options.headers || {})
  return fetch(url, { ...options, headers })
}
