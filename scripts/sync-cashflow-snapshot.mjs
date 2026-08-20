#!/usr/bin/env node
/**
 * Sincroniza cashflow JBM Drinks → Supabase storage do jbm-master.
 *
 * Modo recomendado (só chave da holding):
 *   HOLDING_SERVICE_ROLE_KEY=xxx node scripts/sync-cashflow-snapshot.mjs
 *
 * Modo legado (lê direto do Supabase drinks):
 *   SUPABASE_SERVICE_ROLE_KEY=xxx VITE_SUPABASE_URL=https://ojirgkqtqvugqktyuhem.supabase.co node scripts/sync-cashflow-snapshot.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { isSupplierVenda } from './lib/supplierVenda.mjs'

const DRINKS_URL = process.env.VITE_SUPABASE_URL || 'https://ojirgkqtqvugqktyuhem.supabase.co'
const DRINKS_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const HOLDING_URL = process.env.HOLDING_SUPABASE_URL || 'https://fxsakrshmldmkdmbevna.supabase.co'
const HOLDING_KEY = process.env.HOLDING_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const API_URL = process.env.CASHFLOW_API_URL || 'https://bebidas-control.vercel.app/api/cashflow-export'
const BUCKET = 'system-private'
const FILE = 'cashflow_snapshot.json'
const HOLDING_FILE = 'jbm_holding.json'

if (!HOLDING_KEY) {
  console.error('❌ HOLDING_SERVICE_ROLE_KEY required')
  console.error('   https://supabase.com/dashboard/project/fxsakrshmldmkdmbevna/settings/api')
  process.exit(1)
}

const holdingSb = createClient(HOLDING_URL, HOLDING_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

async function fetchFromApi() {
  const res = await fetch(API_URL)
  if (!res.ok) throw new Error(`API ${API_URL} → ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data
}

async function buildFromDrinksDb(sb) {
  let holding = { nome: 'JBM Holding', negocios: [] }
  try {
    const { data } = await sb.storage.from(BUCKET).download(HOLDING_FILE)
    if (data) holding = JSON.parse(await data.text())
  } catch { /* default */ }

  const today = new Date().toISOString().slice(0, 10)
  const mes = today.slice(0, 7)
  const in30 = new Date()
  in30.setDate(in30.getDate() + 30)
  const end30 = in30.toISOString().slice(0, 10)

  const [barsR, vendasR, comprasR, faturasR, pedidosR, barPricingR] = await Promise.all([
    sb.from('bars').select('id,nome'),
    sb.from('vendas').select('id,bar_id,data,total,obs,cast_id').order('data', { ascending: false }).limit(100),
    sb.from('compras').select('id,data,fornecedor,pagamento,total_real,total_pago,status_pagamento,data_pagamento').order('data', { ascending: false }).limit(50),
    sb.from('faturas').select('id,bar_id,valor,total,pago,status,data_vencimento,data_emissao').order('data_vencimento', { ascending: false }),
    sb.from('pedidos').select('id,status,total_estimado').limit(30),
    sb.from('bar_pricing').select('bar_id', { count: 'exact', head: true }),
  ])

  const bars = barsR.data || []
  const vendas = (vendasR.data || []).filter(isSupplierVenda)
  const compras = comprasR.data || []
  const faturas = faturasR.data || []

  const vendasMes = vendas.filter(v => v.data?.startsWith(mes))
  const receitaMes = vendasMes.reduce((a, v) => a + (+v.total || 0), 0)
  const comprasMes = compras.filter(c => String(c.data || '').slice(0, 7) === mes)
  const custoMes = comprasMes.reduce((a, c) => a + (+c.total_real || +c.total_pago || 0), 0)

  const paidIn = faturas.filter(f => f.status === 'pago').reduce((a, f) => a + (+f.valor || +f.total || 0), 0)
  const paidOut = compras.filter(c => c.status_pagamento === 'pago' || !c.status_pagamento).reduce((a, c) => a + (+c.total_real || +c.total_pago || 0), 0)

  const faturasPendentes = faturas.filter(f => f.status !== 'pago')
  const aReceber = faturasPendentes.reduce((a, f) => a + Math.max(0, (+f.valor || +f.total || 0) - (+f.pago || 0)), 0)
  const faturasVencidas = faturasPendentes.filter(f => f.data_vencimento && f.data_vencimento < today)

  const comprasPendentes = compras.filter(c => c.status_pagamento === 'pendente')
  const aPagar = comprasPendentes.reduce((a, c) => a + (+c.total_pago || +c.total_real || 0), 0)

  const pendingIn30 = faturasPendentes
    .filter(f => f.data_vencimento >= today && f.data_vencimento <= end30)
    .reduce((a, f) => a + Math.max(0, (+f.valor || +f.total || 0) - (+f.pago || 0)), 0)

  const pendingOut30 = comprasPendentes
    .filter(c => {
      const d = c.data_pagamento || c.data
      return d >= today && d <= end30
    })
    .reduce((a, c) => a + (+c.total_pago || +c.total_real || 0), 0)

  const caixaLiquido = paidIn - paidOut

  return {
    geradoEm: new Date().toISOString(),
    fonte: 'bebidas-control-db',
    apiUrl: API_URL,
    holding,
    financeiro: {
      receitaMes,
      custoMes,
      lucroMes: receitaMes - custoMes,
      caixaLiquido,
      projetado30d: caixaLiquido + pendingIn30 - pendingOut30,
      aReceber,
      aPagar,
      faturasVencidas: faturasVencidas.length,
      entradas30d: pendingIn30,
      saidas30d: pendingOut30,
      paidIn,
      paidOut,
    },
    operacao: {
      entregasMes: vendasMes.length,
      pedidosAtivos: (pedidosR.data || []).filter(p => p.status === 'pendente' || p.status === 'confirmado').length,
      precosPos: barPricingR.count || 0,
      bars: bars.length,
    },
    recentes: {
      vendas: vendas.slice(0, 10).map(v => ({ data: v.data, total: v.total, bar: bars.find(b => b.id === v.bar_id)?.nome })),
      compras: compras.slice(0, 8).map(c => ({ data: c.data, fornecedor: c.fornecedor, total: c.total_real || c.total_pago, pagamento: c.pagamento })),
      faturas: faturas.slice(0, 8).map(f => ({
        status: f.status,
        valor: f.valor || f.total,
        pago: f.pago,
        vencimento: f.data_vencimento,
        bar: bars.find(b => b.id === f.bar_id)?.nome,
      })),
      faturasVencidas: faturasVencidas.slice(0, 5).map(f => ({
        bar: bars.find(b => b.id === f.bar_id)?.nome,
        valor: (f.valor || f.total || 0) - (f.pago || 0),
        vencimento: f.data_vencimento,
      })),
    },
  }
}

async function buildSnapshot() {
  if (DRINKS_KEY && process.env.VITE_SUPABASE_URL?.includes('ojirgkqtqvugqktyuhem')) {
    const drinksSb = createClient(DRINKS_URL, DRINKS_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    return buildFromDrinksDb(drinksSb)
  }
  return fetchFromApi()
}

const snapshot = await buildSnapshot()
snapshot.geradoEm = new Date().toISOString()
snapshot.destino = 'jbm-master'
snapshot.holdingSupabase = HOLDING_URL

const { data: buckets } = await holdingSb.storage.listBuckets()
if (!buckets?.some(b => b.name === BUCKET)) {
  const { error } = await holdingSb.storage.createBucket(BUCKET, { public: false })
  if (error) throw error
}

const { error } = await holdingSb.storage.from(BUCKET).upload(FILE, JSON.stringify(snapshot, null, 2), {
  upsert: true,
  contentType: 'application/json',
})
if (error) throw error

const f = snapshot.financeiro || {}
console.log('✅ Cashflow sincronizado → jbm-master Supabase')
console.log(`   Bucket: ${BUCKET}/${FILE}`)
console.log(`   Caixa líquido:  ¥${Math.round(f.caixaLiquido || 0).toLocaleString('ja-JP')}`)
console.log(`   A receber:      ¥${Math.round(f.aReceber || 0).toLocaleString('ja-JP')}`)
console.log(`   A pagar:        ¥${Math.round(f.aPagar || 0).toLocaleString('ja-JP')}`)
console.log(`   Projetado 30d:  ¥${Math.round(f.projetado30d || 0).toLocaleString('ja-JP')}`)
console.log('')
console.log('🔗 Ver no jbm-master: https://jbm-master.vercel.app/')
console.log('🔗 API ao vivo:       https://bebidas-control.vercel.app/api/cashflow-export')
