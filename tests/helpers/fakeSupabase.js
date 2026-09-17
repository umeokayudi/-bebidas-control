/**
 * Cliente Supabase falso para testar o caminho de escrita do POS sem rede.
 * Grava toda operação em `calls`, o que permite provar em teste que o POS
 * não escreve nas tabelas de fornecimento da JBM.
 */

let seq = 0

function nextId(table) {
  seq += 1
  return `${table}-${String(seq).padStart(8, '0')}`
}

function withIds(table, payload) {
  const rows = Array.isArray(payload) ? payload : [payload]
  return rows.map(row => ({ id: nextId(table), ...row }))
}

export function createFakeSupabase({ tables = {}, failOn = {} } = {}) {
  const calls = []

  function from(table) {
    const state = { table, op: 'select', payload: null, filters: [] }

    function resolve() {
      const failure = failOn[`${table}:${state.op}`] || failOn[table]
      if (failure) return { data: null, error: { message: failure } }

      if (state.op === 'insert' || state.op === 'upsert') {
        return { data: withIds(table, state.payload), error: null }
      }
      if (state.op === 'update' || state.op === 'delete') {
        return { data: null, error: null }
      }
      const rows = tables[table]
      if (rows === undefined) {
        return { data: null, error: { code: 'PGRST205', message: `relation "${table}" does not exist` } }
      }
      return { data: typeof rows === 'function' ? rows(state) : rows, error: null }
    }

    function record(op, payload) {
      state.op = op
      state.payload = payload
      calls.push({ table, op, payload })
    }

    const chain = {
      select() { return chain },
      insert(payload) { record('insert', payload); return chain },
      upsert(payload) { record('upsert', payload); return chain },
      update(payload) { record('update', payload); return chain },
      delete() { record('delete', null); return chain },
      eq(col, val) { state.filters.push(['eq', col, val]); return chain },
      neq(col, val) { state.filters.push(['neq', col, val]); return chain },
      in(col, val) { state.filters.push(['in', col, val]); return chain },
      gte(col, val) { state.filters.push(['gte', col, val]); return chain },
      lte(col, val) { state.filters.push(['lte', col, val]); return chain },
      order() { return chain },
      limit() { return chain },
      async single() {
        const res = resolve()
        return { data: Array.isArray(res.data) ? (res.data[0] ?? null) : res.data, error: res.error }
      },
      async maybeSingle() {
        return chain.single()
      },
      then(onFulfilled, onRejected) {
        return Promise.resolve(resolve()).then(onFulfilled, onRejected)
      },
    }

    calls.push({ table, op: 'from' })
    return chain
  }

  return {
    calls,
    from,
    auth: {
      async getSession() {
        return { data: { session: { access_token: 'fake-token' } } }
      },
    },
    writes(table) {
      return calls.filter(c => c.table === table && ['insert', 'upsert', 'update', 'delete'].includes(c.op))
    },
    inserts(table) {
      const rows = calls.filter(c => c.table === table && c.op === 'insert').flatMap(c => (Array.isArray(c.payload) ? c.payload : [c.payload]))
      return rows
    },
    touched() {
      return [...new Set(calls.map(c => c.table))]
    },
  }
}

/** Tabelas do fornecimento JBM que o POS jamais deve escrever. */
export const JBM_SUPPLY_TABLES = [
  'vendas',
  'vendas_itens',
  'compras',
  'compras_itens',
  'faturas',
  'faturas_pagamentos',
  'produtos',
  'fornecedores',
  'ryoshusho',
  'seikyusho',
]
