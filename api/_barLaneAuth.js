import { drinksAdminClient, drinksAuthClient, createStaffUserClient } from './_supabaseAdmin.js'
import { ensureBarLiveReady, runLiveOp } from './_barLiveStore.js'
import { secretsMatch } from './_hash.js'

function bearerToken(req) {
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
}

function newId() {
  return globalThis.crypto?.randomUUID?.() || `lane-${Date.now()}`
}

export async function resolveLaneSession(token, admin) {
  if (!token || !String(token).startsWith('lane:')) return null
  const sessionId = String(token).slice(5)
  const { data } = await runLiveOp(admin, {
    table: 'bar_sessions',
    mode: 'select',
    columns: '*',
    filters: [{ op: 'eq', k: 'id', v: sessionId }],
    wantSingle: 'maybe',
  })
  if (!data || (data.exp && data.exp < Date.now())) return null
  return {
    user: { id: data.login_id, email: data.email },
    perfil: {
      id: data.login_id,
      email: data.email,
      nome: data.nome,
      role: data.role,
      bar_id: data.bar_id,
      cargo: data.cargo || data.role,
      salario_hora: data.salario_hora || 0,
    },
    token,
    lane: true,
  }
}

export async function resolveBarActor(req, admin) {
  const token = bearerToken(req)
  if (!token) return { error: 'Não autenticado', status: 401 }
  const lane = await resolveLaneSession(token, admin)
  if (lane) return lane

  const authClient = drinksAuthClient()
  const { data: { user }, error } = await authClient.auth.getUser(token)
  if (error || !user) return { error: 'Sessão inválida', status: 401 }
  const userDb = createStaffUserClient(token)
  const { data: perfil } = await userDb.from('perfis').select('*').eq('id', user.id).single()
  if (!perfil) return { error: 'Sem perfil', status: 403 }
  return { user, perfil, token, lane: false }
}

export async function loginLane(email, password) {
  const admin = drinksAdminClient()
  await ensureBarLiveReady(admin)
  const wanted = String(email || '').trim().toLowerCase()
  const { data: logins } = await runLiveOp(admin, { table: 'bar_logins', mode: 'select', columns: '*' })
  const login = (logins || []).find(l => String(l.email || '').toLowerCase() === wanted && l.ativo !== false)
  if (!login || !secretsMatch(password, login.password_hash)) {
    return { error: 'Incorrect email or password', status: 401 }
  }
  const session = {
    id: newId(),
    login_id: login.id,
    bar_id: login.bar_id,
    role: login.role,
    nome: login.nome,
    email: login.email,
    cargo: login.cargo || login.role,
    salario_hora: login.salario_hora || 0,
    exp: Date.now() + 12 * 60 * 60 * 1000,
  }
  await runLiveOp(admin, { table: 'bar_sessions', mode: 'insert', insertRows: [session], wantSingle: true })
  return {
    ok: true,
    token: `lane:${session.id}`,
    perfil: {
      id: login.id,
      email: login.email,
      nome: login.nome,
      role: login.role,
      bar_id: login.bar_id,
      cargo: login.cargo || login.role,
      salario_hora: login.salario_hora || 0,
    },
  }
}
