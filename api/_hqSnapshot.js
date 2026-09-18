/** Bar HQ snapshot. Reads JBM + POS live-store + clock + rent. Never writes vendas/pedidos/faturas. */

import { filterSupplierVendas } from './_supplierVenda.js'
import { filterJbmDrinksFaturas, faturaRemaining, faturaValor, faturaPago } from '../src/lib/barPortal.js'
import { payrollFromPunches } from '../src/lib/timeClock.js'
import { tokyoMonthKey, monthRange } from '../src/lib/tokyo.js'
import { splitCostBooks, rentForMonth } from '../src/lib/costBooks.js'
import {
  isMissingSchemaError,
  runLiveOp,
  listStaffWithExtras,
  ensureBarLiveReady,
} from './_barLiveStore.js'

function source(ok, extra = {}) {
  return { ok: !!ok, at: new Date().toISOString(), ...extra }
}

async function pgOrLive(admin, table, filters, columns = '*') {
  let q = admin.from(table).select(columns)
  for (const f of filters || []) {
    if (f.op === 'eq') q = q.eq(f.k, f.v)
    else if (f.op === 'gte') q = q.gte(f.k, f.v)
    else if (f.op === 'lte') q = q.lte(f.k, f.v)
  }
  const pg = await q
  if (!pg.error) return { rows: pg.data || [], via: 'postgres', error: null }
  if (!isMissingSchemaError(pg.error)) return { rows: [], via: 'postgres', error: pg.error.message }
  const live = await runLiveOp(admin, {
    table,
    mode: 'select',
    columns,
    filters,
  })
  if (live.error) return { rows: [], via: 'live-store', error: live.error.message }
  return { rows: live.data || [], via: 'live-store', error: null }
}

function monthBill(vendas, faturas, mes) {
  const supplier = filterSupplierVendas(vendas || [])
  const mesVendas = supplier.filter(v => String(v.data || '').startsWith(mes))
  const contaMes = mesVendas.reduce((a, v) => a + (+v.total || 0), 0)
  const drinksFaturas = filterJbmDrinksFaturas(faturas || [])
  const pending = drinksFaturas.filter(f => f.status !== 'pago')
  const overdue = pending.filter(f => {
    const venc = f.data_vencimento || f.periodo_fim
    return venc && new Date(venc) < new Date()
  })
  return {
    contaMes,
    deliveries: mesVendas.length,
    faturasPendentes: pending.length,
    faturasAtraso: overdue.length,
    totalPendente: pending.reduce((a, f) => a + faturaRemaining(f), 0),
    faturaPagaMes: drinksFaturas
      .filter(f => f.status === 'pago' && String(f.data_vencimento || f.periodo_fim || '').startsWith(mes))
      .reduce((a, f) => a + (faturaPago(f) || faturaValor(f)), 0),
    faturasResumo: drinksFaturas.slice(0, 6).map(f => ({
      status: f.status,
      total: faturaValor(f),
      pago: faturaPago(f),
      vencimento: f.data_vencimento || f.periodo_fim,
    })),
  }
}

export async function buildHqSnapshot(admin, barId, barNome = '') {
  await ensureBarLiveReady(admin)
  const mes = tokyoMonthKey()
  const range = monthRange()

  const [vendasR, pedR, fatR, estR, posR, clockR, rentR, staff] = await Promise.all([
    admin.from('vendas').select('id,data,total,obs,bar_id,cast_id').eq('bar_id', barId).order('data', { ascending: false }).limit(400),
    admin.from('pedidos').select('id,status,total,criado_em,obs').eq('bar_id', barId).order('criado_em', { ascending: false }).limit(80),
    admin.from('faturas').select('*').eq('bar_id', barId).order('data_vencimento', { ascending: false }).limit(24),
    admin.from('estoque').select('qtd,minimo,produtos(nome)').eq('bar_id', barId),
    pgOrLive(admin, 'pos_vendas', [{ op: 'eq', k: 'bar_id', v: barId }], 'id,total,data,obs'),
    pgOrLive(admin, 'time_clock', [
      { op: 'eq', k: 'bar_id', v: barId },
      { op: 'gte', k: 'punched_at', v: range.from },
      { op: 'lte', k: 'punched_at', v: range.to },
    ]),
    pgOrLive(admin, 'bar_overhead', [{ op: 'eq', k: 'bar_id', v: barId }]),
    listStaffWithExtras(admin, barId).catch(() => []),
  ])

  const jbmOk = !vendasR.error && !pedR.error && !fatR.error
  const jbm = monthBill(vendasR.data || [], fatR.data || [], mes)
  const pedidos = pedR.data || []
  const lowStock = (estR.data || [])
    .filter(e => (+e.qtd || 0) <= (+e.minimo || 3))
    .slice(0, 10)
    .map(e => ({ nome: e.produtos?.nome || '?', qtd: e.qtd, minimo: e.minimo }))

  const posRows = posR.rows || []
  const posMonthTotal = posRows
    .filter(s => String(s.data || '').startsWith(mes))
    .reduce((a, s) => a + (+s.total || 0), 0)

  const payroll = payrollFromPunches(clockR.rows || [], staff || [], range)
  const staffMonthPay = payroll.reduce((a, r) => a + (+r.pay || 0), 0)
  const hoursTotal = payroll.reduce((a, r) => a + (+r.hours || 0), 0)

  const rentAmount = rentForMonth(rentR.rows || [], mes)
  const rentRow = (rentR.rows || []).find(r => r.kind === 'rent' && r.month_key === mes) || null

  const books = splitCostBooks({
    posMonthTotal,
    jbmMonthBill: jbm.contaMes,
    staffMonthPay,
    rentMonth: rentAmount,
  })

  const sources = {
    jbm: source(jbmOk, {
      via: 'postgres',
      vendas: filterSupplierVendas(vendasR.data || []).length,
      pedidos: pedidos.length,
      faturas: filterJbmDrinksFaturas(fatR.data || []).length,
      error: vendasR.error?.message || pedR.error?.message || fatR.error?.message || null,
    }),
    pos: source(!posR.error, {
      via: posR.via,
      sales: posRows.filter(s => String(s.data || '').startsWith(mes)).length,
      error: posR.error,
    }),
    clock: source(!clockR.error, {
      via: clockR.via,
      punches: (clockR.rows || []).length,
      error: clockR.error,
    }),
    rent: source(!rentR.error, {
      via: rentR.via,
      error: rentR.error,
    }),
  }

  const syncedAt = new Date().toISOString()
  try {
    await persistHqMeta(admin, barId, { last_sync: syncedAt, sources })
  } catch {
    // Snapshot still returns even if meta write is blocked.
  }

  return {
    bar: { id: barId, nome: barNome },
    mes,
    syncedAt,
    mixed: false,
    sources,
    books,
    payroll: payroll.map(r => ({
      staff_id: r.staff_id,
      nome: r.nome,
      cargo: r.cargo,
      salario_hora: r.salario_hora,
      hours: r.hours,
      lateHours: r.lateHours || 0,
      pay: r.pay,
      open: r.open,
    })),
    hoursTotal: Math.round(hoursTotal * 100) / 100,
    rent: {
      amount: rentAmount,
      note: rentRow?.note || '',
      month_key: mes,
      id: rentRow?.id || null,
    },
    pos: { salesCount: sources.pos.sales, till: books.pos.amount },
    jbm: {
      comprasMes: jbm.contaMes,
      entregasMes: jbm.deliveries,
      faturasPendentes: jbm.faturasPendentes,
      faturasAtraso: jbm.faturasAtraso,
      totalPendente: jbm.totalPendente,
      faturaPagaMes: jbm.faturaPagaMes,
      faturasResumo: jbm.faturasResumo,
      pedidosRecentes: pedidos.slice(0, 5).map(p => ({
        status: p.status,
        total: p.total,
        criado: p.criado_em?.slice(0, 10),
      })),
      estoqueBaixo: lowStock,
    },
  }
}

async function persistHqMeta(admin, barId, patch) {
  const row = {
    id: barId,
    bar_id: barId,
    last_sync: patch.last_sync,
    sources: patch.sources,
    atualizado_em: new Date().toISOString(),
  }
  const pg = await admin.from('bar_hq_meta').upsert(row).eq('id', barId)
  if (!pg.error) return { via: 'postgres' }
  if (!isMissingSchemaError(pg.error)) return { via: 'postgres', error: pg.error.message }
  const existing = await runLiveOp(admin, {
    table: 'bar_hq_meta',
    mode: 'select',
    columns: '*',
    filters: [{ op: 'eq', k: 'bar_id', v: barId }],
    wantSingle: 'maybe',
  })
  await runLiveOp(admin, {
    table: 'bar_hq_meta',
    mode: existing.data ? 'update' : 'insert',
    filters: [{ op: 'eq', k: 'bar_id', v: barId }],
    insertRows: [row],
    updatePatch: row,
    wantSingle: true,
  })
  return { via: 'live-store' }
}

export async function saveHqRent(admin, barId, { amount, note, month_key } = {}) {
  await ensureBarLiveReady(admin)
  const mes = month_key || tokyoMonthKey()
  const loaded = await pgOrLive(admin, 'bar_overhead', [
    { op: 'eq', k: 'bar_id', v: barId },
    { op: 'eq', k: 'kind', v: 'rent' },
    { op: 'eq', k: 'month_key', v: mes },
  ])
  const prev = (loaded.rows || [])[0]
  const row = {
    id: prev?.id,
    bar_id: barId,
    kind: 'rent',
    month_key: mes,
    amount: Math.round(+amount || 0),
    note: String(note || prev?.note || ''),
  }
  const pg = prev
    ? await admin.from('bar_overhead').update({ amount: row.amount, note: row.note }).eq('id', prev.id)
    : await admin.from('bar_overhead').insert(row)
  if (!pg.error) return { ok: true, via: 'postgres', row }
  if (!isMissingSchemaError(pg.error)) return { ok: false, error: pg.error.message }
  await runLiveOp(admin, {
    table: 'bar_overhead',
    mode: prev ? 'update' : 'insert',
    filters: prev ? [{ op: 'eq', k: 'id', v: prev.id }] : [],
    insertRows: [row],
    updatePatch: { amount: row.amount, note: row.note },
    wantSingle: true,
  })
  return { ok: true, via: 'live-store', row }
}
