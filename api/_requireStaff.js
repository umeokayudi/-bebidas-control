/** Auth compartilhado — staff JWT ou secret interno (cron / holding sync). */

export function bearerToken(req) {
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
}

export function isAllowedOrigin(req) {
  const origins = [
    'https://jbm-master.vercel.app',
    'https://bebidas-control.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:4173',
  ]
  const origin = req.headers.origin || ''
  const referer = req.headers.referer || ''
  return origins.some(o => origin === o || referer.startsWith(o))
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
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {{ roles?: string[], adminOnly?: boolean }} opts
 */
export async function requireStaff(req, admin, opts = {}) {
  const { roles = ['staff', 'admin'], adminOnly = false } = opts

  if (isInternalService(req)) {
    return { user: null, perfil: { role: 'service' }, service: true }
  }

  const token = bearerToken(req)
  if (!token) return { error: 'Não autenticado', status: 401 }

  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return { error: 'Sessão inválida', status: 401 }

  const { data: perfil } = await admin.from('perfis').select('role').eq('id', user.id).single()
  if (!perfil || perfil.role === 'cliente') return { error: 'Sem permissão', status: 403 }
  if (adminOnly && perfil.role !== 'admin' && perfil.role !== 'staff') {
    return { error: 'Sem permissão', status: 403 }
  }
  if (!roles.includes(perfil.role) && perfil.role !== 'admin') {
    return { error: 'Sem permissão', status: 403 }
  }

  return { user, perfil }
}

/** Staff JWT, service secret, ou origem permitida (jbm-master / bebidas SPA). */
export async function requireStaffOrTrustedOrigin(req, admin, opts = {}) {
  if (isInternalService(req)) return { user: null, perfil: { role: 'service' }, service: true }
  if (isAllowedOrigin(req)) {
    const auth = await requireStaff(req, admin, opts)
    if (!auth.error) return auth
    // Origem confiável sem login — só leitura/IA holding (não expõe service role)
    return { user: null, perfil: { role: 'origin' }, originTrusted: true }
  }
  return requireStaff(req, admin, opts)
}
