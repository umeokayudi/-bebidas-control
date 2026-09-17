/**
 * Supabase em memória para rodar o POS do bar sem banco.
 *
 * Usado só pelo preview de desenvolvimento (`npm run dev:pos`), que serve
 * para demonstrar e revisar as telas sem precisar de credenciais. O bundle
 * de produção nunca importa este arquivo.
 */

import { SEED, SESSION } from './seed'

const store = structuredClone(SEED)

let seq = 0
function nextId(table) {
  seq += 1
  return `${table}-mock-${seq}`
}

function rows(table) {
  if (!store[table]) store[table] = []
  return store[table]
}

/** Extrai as relações embutidas do select: "*, produtos(nome), itens(*)". */
function parseEmbeds(select) {
  const embeds = []
  const re = /([a-z_]+)\s*\(/gi
  let depth = 0
  let i = 0
  const text = select || '*'
  while (i < text.length) {
    const char = text[i]
    if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    i += 1
  }
  re.lastIndex = 0
  let match
  while ((match = re.exec(text))) {
    // Só relações de primeiro nível interessam para o preview.
    const before = text.slice(0, match.index)
    const open = (before.match(/\(/g) || []).length
    const close = (before.match(/\)/g) || []).length
    if (open === close) embeds.push(match[1])
  }
  return embeds
}

const RELATIONS = {
  produtos: { table: 'produtos', type: 'one', localKey: 'produto_id', foreignKey: 'id' },
  pos_vendas_itens: { table: 'pos_vendas_itens', type: 'many', localKey: 'id', foreignKey: 'pos_venda_id' },
  pedidos_itens: { table: 'pedidos_itens', type: 'many', localKey: 'id', foreignKey: 'pedido_id' },
  vip_members: { table: 'vip_members', type: 'one', localKey: 'vip_member_id', foreignKey: 'id' },
  drink_back_agents: { table: 'drink_back_agents', type: 'one', localKey: 'agent_id', foreignKey: 'id' },
}

function hydrate(row, embeds) {
  if (!embeds.length) return row
  const out = { ...row }
  embeds.forEach(name => {
    const rel = RELATIONS[name]
    if (!rel) return
    if (rel.type === 'one') {
      out[name] = rows(rel.table).find(r => r[rel.foreignKey] === row[rel.localKey]) || null
    } else {
      out[name] = rows(rel.table).filter(r => r[rel.foreignKey] === row[rel.localKey])
    }
  })
  return out
}

function applyFilters(list, filters) {
  return list.filter(row => filters.every(([op, col, val]) => {
    const value = row[col]
    switch (op) {
      case 'eq': return value === val
      case 'neq': return value !== val
      case 'in': return val.includes(value)
      case 'gte': return String(value ?? '') >= String(val)
      case 'lte': return String(value ?? '') <= String(val)
      default: return true
    }
  }))
}

function compare(a, b, col, asc) {
  const av = a[col] ?? ''
  const bv = b[col] ?? ''
  if (av === bv) return 0
  return (av > bv ? 1 : -1) * (asc ? 1 : -1)
}

function from(table) {
  const state = { op: 'select', select: '*', payload: null, filters: [], orders: [], limit: null, conflict: null }

  function run() {
    if (state.op === 'insert' || state.op === 'upsert') {
      const list = Array.isArray(state.payload) ? state.payload : [state.payload]
      const inserted = list.map(payload => {
        if (state.op === 'upsert' && state.conflict) {
          const keys = state.conflict.split(',').map(k => k.trim())
          const existing = rows(table).find(r => keys.every(k => r[k] === payload[k]))
          if (existing) {
            Object.assign(existing, payload)
            return existing
          }
        }
        const row = { id: nextId(table), criado_em: new Date().toISOString(), ...payload }
        rows(table).push(row)
        return row
      })
      return { data: inserted, error: null }
    }

    if (state.op === 'update') {
      const matched = applyFilters(rows(table), state.filters)
      matched.forEach(row => Object.assign(row, state.payload))
      return { data: matched, error: null }
    }

    if (state.op === 'delete') {
      const matched = applyFilters(rows(table), state.filters)
      store[table] = rows(table).filter(r => !matched.includes(r))
      return { data: matched, error: null }
    }

    let list = applyFilters(rows(table), state.filters)
    state.orders.forEach(([col, asc]) => { list = [...list].sort((a, b) => compare(a, b, col, asc)) })
    if (state.limit != null) list = list.slice(0, state.limit)
    const embeds = parseEmbeds(state.select)
    return { data: list.map(row => hydrate(row, embeds)), error: null }
  }

  const chain = {
    select(sel) { if (sel) state.select = sel; return chain },
    insert(payload) { state.op = 'insert'; state.payload = payload; return chain },
    upsert(payload, opts) { state.op = 'upsert'; state.payload = payload; state.conflict = opts?.onConflict || null; return chain },
    update(payload) { state.op = 'update'; state.payload = payload; return chain },
    delete() { state.op = 'delete'; return chain },
    eq(col, val) { state.filters.push(['eq', col, val]); return chain },
    neq(col, val) { state.filters.push(['neq', col, val]); return chain },
    in(col, val) { state.filters.push(['in', col, val]); return chain },
    gte(col, val) { state.filters.push(['gte', col, val]); return chain },
    lte(col, val) { state.filters.push(['lte', col, val]); return chain },
    order(col, opts) { state.orders.push([col, opts?.ascending !== false]); return chain },
    limit(n) { state.limit = n; return chain },
    async single() {
      const res = run()
      return { data: res.data?.[0] ?? null, error: res.error }
    },
    async maybeSingle() { return chain.single() },
    then(onFulfilled, onRejected) {
      return Promise.resolve(run()).then(onFulfilled, onRejected)
    },
  }
  return chain
}

export const supabase = {
  from,
  auth: {
    async getSession() { return { data: { session: SESSION } } },
    onAuthStateChange() {
      return { data: { subscription: { unsubscribe() {} } } }
    },
    async signInWithPassword() { return { data: { session: SESSION }, error: null } },
    async signUp() { return { data: {}, error: null } },
    async signOut() { return { error: null } },
  },
}

export const mockStore = store
