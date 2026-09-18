/** HTTP CRUD for POS/CRM live-store. Never touches JBM ledgers. */

import { drinksAdminClient } from './_supabaseAdmin.js'
import { bearerToken } from './_requireStaff.js'
import { drinksAuthClient, createStaffUserClient } from './_supabaseAdmin.js'
import { handleCorsPreflight, setCorsHeaders } from './_cors.js'
import { LIVE_TABLES, ensureBarLiveReady, runLiveOp } from './_barLiveStore.js'

function bodyOf(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
}

async function requireAnyPerfil(req) {
  const token = bearerToken(req)
  if (!token) return { error: 'Não autenticado', status: 401 }
  const authClient = drinksAuthClient()
  const { data: { user }, error } = await authClient.auth.getUser(token)
  if (error || !user) return { error: 'Sessão inválida', status: 401 }
  const userDb = createStaffUserClient(token)
  const { data: perfil } = await userDb.from('perfis').select('*').eq('id', user.id).single()
  if (!perfil) return { error: 'Sem perfil', status: 403 }
  return { user, perfil, token }
}

function scopedFilters(auth, table, filters, row) {
  const barRoles = ['cliente', 'caixa', 'bar_staff']
  if (!barRoles.includes(auth.perfil?.role) || !auth.perfil.bar_id) return { filters, row, error: null }
  const barId = auth.perfil.bar_id
  if (table === 'staff_extras') return { filters, row, error: null }
  if (table === 'pos_vendas_itens') return { filters, row, error: null }
  if (row && row.bar_id && row.bar_id !== barId) return { error: 'bar_id mismatch' }
  if (row && !row.bar_id && table !== 'bar_geo') row.bar_id = barId
  const next = [...(filters || [])]
  if (!next.some(f => f.k === 'bar_id') && table !== 'bar_geo' && table !== 'staff_extras' && table !== 'pos_vendas_itens') {
    next.push({ op: 'eq', k: 'bar_id', v: barId })
  }
  return { filters: next, row, error: null }
}

export default async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return
  setCorsHeaders(req, res, 'GET, POST, OPTIONS')

  let admin
  try { admin = drinksAdminClient() } catch (e) {
    return res.status(500).json({ error: e.message })
  }

  const auth = await requireAnyPerfil(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  try {
    await ensureBarLiveReady(admin)
    const body = req.method === 'GET' ? { table: req.query?.table, mode: 'select' } : bodyOf(req)
    const table = String(body.table || '')
    if (!LIVE_TABLES.includes(table)) return res.status(400).json({ error: 'Unknown table' })

    const spec = {
      table,
      mode: body.mode || 'select',
      columns: body.columns || '*',
      filters: body.filters || [],
      orderBy: body.orderBy || null,
      limitN: body.limitN ?? null,
      wantSingle: body.wantSingle || false,
      insertRows: body.insertRows || null,
      updatePatch: body.updatePatch || null,
    }

    if (spec.mode === 'insert' || spec.mode === 'upsert') {
      spec.insertRows = (spec.insertRows || []).map(row => {
        const scoped = scopedFilters(auth, table, spec.filters, { ...row })
        return scoped.row
      })
      const bad = spec.insertRows.find(r => r && auth.perfil.bar_id && r.bar_id && r.bar_id !== auth.perfil.bar_id && ['cliente', 'caixa', 'bar_staff'].includes(auth.perfil.role))
      if (bad) return res.status(403).json({ error: 'bar_id mismatch' })
    } else {
      const scoped = scopedFilters(auth, table, spec.filters, null)
      if (scoped.error) return res.status(403).json({ error: scoped.error })
      spec.filters = scoped.filters
    }

    const result = await runLiveOp(admin, spec)
    if (result.error) return res.status(400).json(result)
    return res.status(200).json(result)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
