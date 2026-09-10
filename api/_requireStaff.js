/** Auth compartilhado — JWT staff/admin/cliente ou secret interno (cron / holding sync). */

import { createStaffUserClient, drinksAuthClient } from './_supabaseAdmin.js'

export function bearerToken(req) {
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
}

export function isInternalService(req) {
  const token = bearerToken(req)
  const secrets = [
    process.env.INTERNAL_API_SECRET,
    process.env.CRON_SECRET,
    process.env.HOLDING_SYNC_SECRET,
  ].filter(Boolean)
  return secrets.length > 0 && secrets.includes(token)
}

/**
 * @param {{ roles?: string[], adminOnly?: boolean }} opts
 */
export async function requireAuth(req, opts = {}) {
  const { roles = ['staff', 'admin', 'cliente'], adminOnly = false } = opts

  if (isInternalService(req)) {
    return { user: null, perfil: { role: 'service' }, service: true, token: null }
  }

  const token = bearerToken(req)
  if (!token) return { error: 'Not authenticated', status: 401 }

  const authClient = drinksAuthClient()
  const { data: { user }, error } = await authClient.auth.getUser(token)
  if (error || !user) return { error: 'Invalid session', status: 401 }

  const userDb = createStaffUserClient(token)
  const { data: perfil } = await userDb.from('perfis').select('role').eq('id', user.id).single()
  if (!perfil) return { error: 'Forbidden', status: 403 }
  if (adminOnly && perfil.role !== 'admin' && perfil.role !== 'staff') {
    return { error: 'Forbidden', status: 403 }
  }
  if (!roles.includes(perfil.role) && perfil.role !== 'admin') {
    return { error: 'Forbidden', status: 403 }
  }

  return { user, perfil, token }
}

/**
 * Staff/admin only (+ internal service).
 * @param {import('@supabase/supabase-js').SupabaseClient} [_admin] legacy — não usado
 */
export async function requireStaff(req, _admin, opts = {}) {
  return requireAuth(req, { ...opts, roles: opts.roles || ['staff', 'admin'] })
}

/** @deprecated Use requireStaff — origin bypass removed for security. */
export async function requireStaffOrTrustedOrigin(req, admin, opts = {}) {
  return requireStaff(req, admin, opts)
}
