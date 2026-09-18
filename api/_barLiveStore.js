/**
 * POS/CRM/clock rows when Postgres tables are missing.
 * Uses Storage only — never vendas / pedidos / faturas.
 */

export const ATOMIC_BAR_ID = 'b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9'
export const LIVE_BUCKET = 'system-private'
export const LIVE_PREFIX = 'bar-live/'

export const LIVE_TABLES = [
  'pos_vendas',
  'pos_vendas_itens',
  'vip_members',
  'vip_usages',
  'discount_codes',
  'discount_usages',
  'drink_back_agents',
  'bar_spaces',
  'bar_guests',
  'bar_visits',
  'bar_bottle_keeps',
  'time_clock',
  'bar_geo',
  'staff_extras',
]

const locks = new Map()

export function isMissingSchemaError(error) {
  if (!error) return false
  const m = String(error.message || error.details || '')
  const code = String(error.code || '')
  return (
    code === 'PGRST205' ||
    code === 'PGRST204' ||
    code === '42703' ||
    code === '42P01' ||
    /does not exist|schema cache|Could not find the table|Could not find the/i.test(m)
  )
}

function newId() {
  return globalThis.crypto?.randomUUID?.() || `live-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function withLock(table, fn) {
  const prev = locks.get(table) || Promise.resolve()
  const next = prev.then(fn, fn)
  locks.set(table, next.catch(() => {}))
  return next
}

function pathFor(table) {
  return `${LIVE_PREFIX}${table}.json`
}

export function applyFilters(rows, filters = []) {
  return (rows || []).filter(row => {
    for (const f of filters) {
      const val = row?.[f.k]
      if (f.op === 'eq' && val !== f.v && String(val) !== String(f.v)) return false
      if (f.op === 'neq' && (val === f.v || String(val) === String(f.v))) return false
      if (f.op === 'in' && !(f.v || []).some(x => x === val || String(x) === String(val))) return false
      if (f.op === 'gte' && (val == null || val < f.v)) return false
      if (f.op === 'lte' && (val == null || val > f.v)) return false
      if (f.op === 'gt' && !(val > f.v)) return false
      if (f.op === 'lt' && !(val < f.v)) return false
      if (f.op === 'not' && f.sub === 'is' && (f.v == null || f.v === 'null') && val == null) return false
      if (f.op === 'is' && (f.v == null || f.v === 'null') && val != null) return false
    }
    return true
  })
}

function parseSelect(select) {
  const raw = String(select || '*').trim()
  const nested = []
  const parent = raw.replace(/(\w+)\(([^)]*)\)/g, (_, table, cols) => {
    nested.push({ table, cols: cols.split(',').map(s => s.trim()).filter(Boolean) })
    return ''
  })
  const columns = parent.split(',').map(s => s.trim()).filter(Boolean)
  return { columns: columns.length ? columns : ['*'], nested }
}

const NEST_FK = {
  vip_members: 'vip_member_id',
  bar_guests: 'guest_id',
  bar_spaces: 'space_id',
  drink_back_agents: 'drink_back_agent_id',
  discount_codes: 'discount_code_id',
}

function projectRow(row, columns) {
  if (!columns || columns.includes('*')) return { ...row }
  const out = {}
  for (const c of columns) {
    if (c === '*') continue
    if (c in row) out[c] = row[c]
  }
  if (!('id' in out) && row.id) out.id = row.id
  return out
}

export function applyQuery(allRows, spec, catalogs = {}) {
  let rows = applyFilters(allRows, spec.filters)
  if (spec.orderBy) {
    const { k, ascending } = spec.orderBy
    rows = [...rows].sort((a, b) => {
      const av = a?.[k]
      const bv = b?.[k]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (av < bv) return ascending ? -1 : 1
      if (av > bv) return ascending ? 1 : -1
      return 0
    })
  }
  if (spec.limitN != null) rows = rows.slice(0, spec.limitN)
  const { columns, nested } = parseSelect(spec.columns)
  rows = rows.map(row => {
    const out = projectRow(row, columns)
    for (const n of nested) {
      const fk = NEST_FK[n.table] || `${n.table.replace(/s$/, '')}_id`
      const id = row[fk]
      const related = (catalogs[n.table] || []).find(r => r.id === id) || null
      if (!related) {
        out[n.table] = null
        continue
      }
      if (!n.cols.length || n.cols.includes('*')) out[n.table] = { ...related }
      else {
        const slim = {}
        for (const c of n.cols) slim[c] = related[c]
        out[n.table] = slim
      }
    }
    return out
  })
  if (spec.wantSingle === true) {
    if (!rows.length) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } }
    return { data: rows[0], error: null }
  }
  if (spec.wantSingle === 'maybe') return { data: rows[0] || null, error: null }
  return { data: rows, error: null }
}

async function loadTable(admin, table) {
  const { data, error } = await admin.storage.from(LIVE_BUCKET).download(pathFor(table))
  if (error || !data) return []
  const text = await data.text()
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : (parsed.rows || [])
  } catch {
    return []
  }
}

async function saveTable(admin, table, rows) {
  const body = Buffer.from(JSON.stringify({ rows, updated_at: new Date().toISOString() }))
  const { error } = await admin.storage.from(LIVE_BUCKET).upload(pathFor(table), body, {
    upsert: true,
    contentType: 'application/json',
  })
  if (error) throw new Error(error.message)
}

function defaultsFor(table, row) {
  const now = new Date().toISOString()
  const out = { id: row.id || newId(), ...row }
  if (out.criado_em == null && table !== 'bar_geo' && table !== 'staff_extras') out.criado_em = now
  if (table === 'bar_guests' && out.atualizado_em == null) out.atualizado_em = now
  if (['bar_spaces', 'bar_guests', 'bar_bottle_keeps', 'vip_members', 'drink_back_agents', 'discount_codes'].includes(table) && out.ativo == null) {
    out.ativo = true
  }
  return out
}

export async function runLiveOp(admin, spec) {
  const table = spec.table
  if (!LIVE_TABLES.includes(table)) return { data: null, error: { message: `Unknown live table ${table}` } }
  return withLock(table, async () => {
    let rows = await loadTable(admin, table)
    if (spec.mode === 'insert') {
      const inserted = (spec.insertRows || []).map(r => defaultsFor(table, r))
      rows = rows.concat(inserted)
      await saveTable(admin, table, rows)
      if (spec.wantSingle) return { data: inserted[0] || null, error: null }
      return { data: inserted, error: null }
    }
    if (spec.mode === 'upsert') {
      const incoming = (spec.insertRows || []).map(r => defaultsFor(table, r))
      for (const row of incoming) {
        const idx = rows.findIndex(r => r.id === row.id)
        if (idx >= 0) rows[idx] = { ...rows[idx], ...row }
        else rows.push(row)
      }
      await saveTable(admin, table, rows)
      if (spec.wantSingle) return { data: incoming[0] || null, error: null }
      return { data: incoming, error: null }
    }
    if (spec.mode === 'update') {
      const matched = []
      rows = rows.map(r => {
        if (!applyFilters([r], spec.filters).length) return r
        const next = { ...r, ...spec.updatePatch }
        matched.push(next)
        return next
      })
      await saveTable(admin, table, rows)
      if (spec.wantSingle) return { data: matched[0] || null, error: null }
      return { data: matched, error: null }
    }
    if (spec.mode === 'delete') {
      const keep = []
      const removed = []
      for (const r of rows) {
        if (applyFilters([r], spec.filters).length) removed.push(r)
        else keep.push(r)
      }
      await saveTable(admin, table, keep)
      return { data: removed, error: null }
    }
    const catalogs = {}
    const { nested } = parseSelect(spec.columns)
    for (const n of nested) {
      if (LIVE_TABLES.includes(n.table)) catalogs[n.table] = await loadTable(admin, n.table)
    }
    return applyQuery(rows, spec, catalogs)
  })
}

function tokyoFloorPreset() {
  const spaces = []
  for (let i = 1; i <= 8; i++) {
    spaces.push({ nome: `カウンター ${i}`, tipo: 'counter', capacidade: 1, zona: 'counter', ordem: i })
  }
  ;['A', 'B', 'C', 'D'].forEach((letter, i) => {
    spaces.push({ nome: `テーブル ${letter}`, tipo: 'table', capacidade: 4, zona: 'table', ordem: 20 + i })
  })
  spaces.push({ nome: '個室 VIP 1', tipo: 'vip_room', capacidade: 6, zona: 'vip', ordem: 40 })
  spaces.push({ nome: '個室 VIP 2', tipo: 'vip_room', capacidade: 8, zona: 'vip', ordem: 41 })
  return spaces
}

async function seedAtomic(admin) {
  const barId = ATOMIC_BAR_ID
  const vipId = newId()
  const guestKenji = newId()
  const guestMika = newId()
  const space1 = newId()
  const visitId = newId()
  const saleId = newId()
  const agentId = newId()
  const codeId = newId()
  const floor = tokyoFloorPreset().map((s, i) => ({
    ...s,
    id: i === 0 ? space1 : newId(),
    bar_id: barId,
    ativo: true,
    criado_em: new Date().toISOString(),
  }))

  await saveTable(admin, 'vip_members', [{
    id: vipId, bar_id: barId, nome: 'Atomic VIP', codigo: 'VIP-ATOMIC', tier: 'gold', ativo: true, criado_em: new Date().toISOString(),
  }])
  await saveTable(admin, 'bar_spaces', floor)
  await saveTable(admin, 'bar_guests', [
    {
      id: guestKenji, bar_id: barId, nome: 'Kenji Sato', line_id: 'kenji.atomic',
      tags: ['regular'], aniversario: '1990-09-18', preferencias: 'Gin highball, quiet counter',
      vip_member_id: null, ativo: true, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
    },
    {
      id: guestMika, bar_id: barId, nome: 'Mika Tanaka', line_id: 'mika.vip',
      tags: ['vip', 'regular'], aniversario: '1988-12-01', preferencias: 'Champagne, 個室',
      vip_member_id: vipId, ativo: true, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
    },
  ])
  await saveTable(admin, 'bar_visits', [{
    id: visitId, bar_id: barId, space_id: space1, guest_id: guestKenji, status: 'seated',
    party_size: 1, inicio: new Date().toISOString(), criado_em: new Date().toISOString(),
  }])
  await saveTable(admin, 'bar_bottle_keeps', [{
    id: newId(), bar_id: barId, guest_id: guestKenji, nome: 'Hibiki 21', remaining_pct: 70,
    opened_on: '2026-08-20', expires_on: '2026-10-20', ativo: true, criado_em: new Date().toISOString(),
  }])
  await saveTable(admin, 'drink_back_agents', [{
    id: agentId, bar_id: barId, nome: 'Aya', regiao: 'Roppongi', comissao_pct: 10, ativo: true, criado_em: new Date().toISOString(),
  }])
  await saveTable(admin, 'discount_codes', [{
    id: codeId, bar_id: barId, codigo: 'WELCOME-10', tipo: 'percent', valor: 10, ativo: true,
    usos_atual: 0, criado_em: new Date().toISOString(),
  }])
  await saveTable(admin, 'pos_vendas', [{
    id: saleId, bar_id: barId, data: '2026-09-18', subtotal: 2400, desconto_total: 0, total: 2400,
    metodo_pagamento: 'Cash', tipo: 'balcao', guest_id: guestKenji, space_id: space1, visit_id: visitId,
    obs: 'Demo POS (not JBM)', criado_em: new Date().toISOString(),
  }])
  await saveTable(admin, 'pos_vendas_itens', [{
    id: newId(), pos_venda_id: saleId, nome: 'Gin Highball', qtd: 2, preco_unitario: 1200,
    preco_lista: 1200, tipo_preco: 'regular', desconto_valor: 0,
  }])
  await saveTable(admin, 'vip_usages', [])
  await saveTable(admin, 'discount_usages', [])
  await saveTable(admin, 'time_clock', [])
  await saveTable(admin, 'bar_geo', [])
  await saveTable(admin, 'staff_extras', [])
}

export async function ensureBarLiveReady(admin) {
  return withLock('_meta', async () => {
    const spaces = await loadTable(admin, 'bar_spaces')
    if (!spaces.length) {
      await seedAtomic(admin)
      return { seeded: true, via: 'live-store' }
    }
    return { seeded: false, via: 'live-store' }
  })
}

export async function loadBarWithGeo(admin, barId) {
  const full = await admin.from('bars').select('id,nome,lat,lng,geofence_m,tablet_token_hash').eq('id', barId).single()
  if (!full.error && full.data) return full.data
  const basic = await admin.from('bars').select('id,nome').eq('id', barId).single()
  if (basic.error || !basic.data) return null
  const extra = await runLiveOp(admin, {
    table: 'bar_geo',
    mode: 'select',
    columns: '*',
    filters: [{ op: 'eq', k: 'id', v: barId }],
    wantSingle: 'maybe',
  })
  return { ...basic.data, ...(extra.data || {}), geofence_m: extra.data?.geofence_m || 150 }
}

export async function saveBarGeo(admin, barId, patch) {
  const { error } = await admin.from('bars').update(patch).eq('id', barId)
  if (!error) return { ok: true, via: 'postgres' }
  if (!isMissingSchemaError(error)) return { ok: false, error: error.message }
  const existing = await runLiveOp(admin, {
    table: 'bar_geo',
    mode: 'select',
    columns: '*',
    filters: [{ op: 'eq', k: 'id', v: barId }],
    wantSingle: 'maybe',
  })
  const row = { id: barId, ...(existing.data || {}), ...patch }
  await runLiveOp(admin, {
    table: 'bar_geo',
    mode: existing.data ? 'update' : 'insert',
    filters: [{ op: 'eq', k: 'id', v: barId }],
    insertRows: [row],
    updatePatch: patch,
    wantSingle: true,
  })
  return { ok: true, via: 'live-store' }
}

export async function loadStaffWithExtras(admin, staffId) {
  const full = await admin.from('perfis').select('id,bar_id,role,clock_pin_hash,ativo,nome,email,cargo,salario_hora').eq('id', staffId).single()
  if (!full.error && full.data) return full.data
  const basic = await admin.from('perfis').select('id,bar_id,role,nome,email').eq('id', staffId).single()
  if (basic.error || !basic.data) return null
  const extra = await runLiveOp(admin, {
    table: 'staff_extras',
    mode: 'select',
    columns: '*',
    filters: [{ op: 'eq', k: 'id', v: staffId }],
    wantSingle: 'maybe',
  })
  return { ...basic.data, ativo: true, ...(extra.data || {}) }
}

export async function saveStaffExtras(admin, staffId, patch) {
  const { error } = await admin.from('perfis').update(patch).eq('id', staffId)
  if (!error) return { ok: true, via: 'postgres' }
  if (!isMissingSchemaError(error)) return { ok: false, error: error.message }
  const existing = await runLiveOp(admin, {
    table: 'staff_extras',
    mode: 'select',
    columns: '*',
    filters: [{ op: 'eq', k: 'id', v: staffId }],
    wantSingle: 'maybe',
  })
  const row = { id: staffId, ...(existing.data || {}), ...patch }
  await runLiveOp(admin, {
    table: 'staff_extras',
    mode: existing.data ? 'update' : 'insert',
    filters: [{ op: 'eq', k: 'id', v: staffId }],
    insertRows: [row],
    updatePatch: patch,
    wantSingle: true,
  })
  return { ok: true, via: 'live-store' }
}

export async function listStaffWithExtras(admin, barId) {
  const full = await admin.from('perfis').select('id,nome,email,role,cargo,salario_hora,ativo,bar_id').eq('bar_id', barId).in('role', ['cliente', 'caixa', 'bar_staff']).order('nome')
  if (!full.error) return full.data || []
  const basic = await admin.from('perfis').select('id,nome,email,role,bar_id').eq('bar_id', barId).in('role', ['cliente', 'caixa', 'bar_staff']).order('nome')
  const extras = await runLiveOp(admin, { table: 'staff_extras', mode: 'select', columns: '*' })
  const byId = Object.fromEntries((extras.data || []).map(r => [r.id, r]))
  return (basic.data || []).map(p => ({ ativo: true, ...p, ...(byId[p.id] || {}) }))
}
