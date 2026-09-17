/**
 * Guarda de regressão do fornecimento JBM.
 *
 * O POS do bar e o fornecimento de bebida da JBM compartilham o mesmo
 * banco. Este teste falha se algum arquivo do POS começar a escrever nas
 * tabelas do fornecedor — que é exatamente o jeito de "estragar" o lado
 * JBM sem perceber.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { JBM_SUPPLY_TABLES } from './helpers/fakeSupabase'

const ROOT = new URL('..', import.meta.url).pathname

const POS_FILES = [
  'src/lib/posData.js',
  'src/lib/posStock.js',
  'src/lib/posHourly.js',
  'src/lib/drinkBack.js',
  'src/lib/barStaff.js',
  'src/lib/serviceOrders.js',
  ...listFiles('src/components/pos'),
]

function listFiles(dir) {
  const abs = join(ROOT, dir)
  return readdirSync(abs)
    .filter(f => statSync(join(abs, f)).isFile())
    .map(f => `${dir}/${f}`)
}

function read(file) {
  return readFileSync(join(ROOT, file), 'utf8')
}

/** Encontra `.from('tabela')` seguido, na mesma cadeia, de uma escrita. */
function writesTo(source, table) {
  const pattern = new RegExp(
    `from\\(\\s*['"\`]${table}['"\`]\\s*\\)[\\s\\S]{0,200}?\\.(insert|update|upsert|delete)\\s*\\(`,
    'g'
  )
  return pattern.test(source)
}

describe('POS never writes to the JBM supply tables', () => {
  POS_FILES.forEach(file => {
    it(`${file} is read-only on supplier data`, () => {
      const source = read(file)
      JBM_SUPPLY_TABLES.forEach(table => {
        expect(writesTo(source, table), `${file} writes to ${table}`).toBe(false)
      })
    })
  })

  it('no POS file writes to pedidos directly — that goes through /api/pos-reorder', () => {
    POS_FILES.forEach(file => {
      const source = read(file)
      expect(writesTo(source, 'pedidos'), `${file} writes to pedidos`).toBe(false)
      expect(writesTo(source, 'pedidos_itens'), `${file} writes to pedidos_itens`).toBe(false)
    })
  })

  it('counter revenue goes to pos_vendas, and pos_vendas only', () => {
    const source = read('src/lib/posData.js')
    expect(writesTo(source, 'pos_vendas')).toBe(true)
    expect(source).not.toMatch(/from\(\s*['"`]vendas['"`]\s*\)/)
  })

  it('POS stock exits are tagged so the portal can tell them apart', () => {
    const source = read('src/lib/posData.js')
    expect(source).toMatch(/origem:\s*'pos'/)
    expect(source).toMatch(/tipo:\s*'saida'/)
  })
})

describe('the automatic JBM order stays compatible with the manual one', () => {
  const api = read('api/pos-reorder.js')

  it('creates the pedido as pending, like the portal does', () => {
    expect(api).toMatch(/status:\s*'pendente'/)
  })

  it('tags the automatic origin without changing the manual flow', () => {
    expect(api).toMatch(/origem:\s*'pos_auto'/)
  })

  it('fills pedidos_itens with the supplier price of each product', () => {
    expect(api).toMatch(/from\('pedidos_itens'\)/)
    expect(api).toMatch(/preco_unitario/)
  })

  it('reads prices from produtos without writing to it', () => {
    expect(writesTo(api, 'produtos')).toBe(false)
  })
})

describe('the schema migration is additive only', () => {
  const sql = read('BAR_POS_SCHEMA.sql')

  it('only ever adds columns to existing JBM tables', () => {
    const alters = sql.match(/alter table [\s\S]*?;/g) || []
    alters.forEach(stmt => {
      const normalized = stmt.replace(/\s+/g, ' ').toLowerCase()
      const additive = normalized.includes('add column if not exists')
        || normalized.includes('enable row level security')
      expect(additive, `non-additive statement: ${stmt}`).toBe(true)
    })
  })

  it('never drops or renames anything', () => {
    expect(sql).not.toMatch(/\bdrop\s+(table|column|constraint)\b/i)
    expect(sql).not.toMatch(/\brename\b/i)
  })

  it('creates every table defensively so it can be re-run', () => {
    const creates = sql.match(/create table[^(]*/gi) || []
    expect(creates.length).toBeGreaterThan(0)
    creates.forEach(stmt => {
      expect(stmt.toLowerCase()).toContain('if not exists')
    })
  })

  it('never deletes rows from JBM tables', () => {
    expect(sql).not.toMatch(/^\s*delete\s+from/im)
    expect(sql).not.toMatch(/^\s*update\s+(vendas|compras|faturas|produtos|pedidos)\b/im)
  })
})
