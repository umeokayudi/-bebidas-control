import { supabase } from './supabase'

/** Headers with Bearer token for any logged-in user (staff, admin, or portal cliente). */
export async function apiAuthHeaders(extra = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = { ...extra }
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`
  }
  return headers
}

/** @deprecated alias */
export const staffAuthHeaders = apiAuthHeaders

export async function apiFetch(url, options = {}) {
  const headers = await apiAuthHeaders(options.headers || {})
  return fetch(url, { ...options, headers })
}

/** Staff/admin API calls — same as apiFetch (JWT role checked server-side). */
export async function staffFetch(url, options = {}) {
  return apiFetch(url, options)
}
