#!/usr/bin/env node
/**
 * Auditoria live — APIs públicas com Origin confiável.
 * Uso: node scripts/audit-live.mjs
 */
const ORIGIN = 'https://bebidas-control.vercel.app'
const DRINKS_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qaXJna3F0cXZ1Z3FrdHl1aGVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NTkwNTIsImV4cCI6MjA5NjEzNTA1Mn0.nRiZHav9wAY2HRKrO66W9HhY3R5wGZHMM8UH5W4PK_M'
const BAR = 'b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9'
const SB = 'https://ojirgkqtqvugqktyuhem.supabase.co/rest/v1'

async function count(path) {
  const r = await fetch(`${SB}/${path}`, {
    headers: { apikey: DRINKS_KEY, Authorization: `Bearer ${DRINKS_KEY}`, Prefer: 'count=exact' },
  })
  const cr = r.headers.get('content-range') || ''
  const m = cr.match(/\/(\d+|\*)/)
  return m ? (m[1] === '*' ? '?' : Number(m[1])) : 0
}

async function getJson(url) {
  const r = await fetch(url, { headers: { Origin: ORIGIN } })
  return r.json()
}

async function main() {
  const checks = []

  const audit = await getJson(`${ORIGIN}/api/holding-audit`)
  checks.push({ ok: !audit.error && audit.checksOk >= 5, name: 'holding-audit', detail: audit.error || `${audit.checksOk}/${audit.checksTotal} checks` })

  const atomicAReceber = audit.financeiro?.atomicAReceber ?? 0
  checks.push({
    ok: atomicAReceber >= 465000,
    name: 'Atomic a receber (faturas)',
    detail: `¥${atomicAReceber.toLocaleString('ja-JP')}`,
  })

  const junEntregues = await count(`pedidos?bar_id=eq.${BAR}&data_pedido=gte.2026-06-01&data_pedido=lte.2026-06-30&status=eq.entregue&select=id`)
  const julPend = await count(`pedidos?bar_id=eq.${BAR}&data_pedido=gte.2026-07-01&status=eq.pendente&select=id`)
  const movido = await count(`pedidos?bar_id=eq.${BAR}&obs=ilike.*movido*jun*jul*&select=id`)
  checks.push({ ok: junEntregues >= 28, name: 'Pedidos jun/2026 entregues', detail: String(junEntregues) })
  checks.push({ ok: julPend === 0, name: 'Pedidos jul pendentes', detail: String(julPend) })
  checks.push({ ok: movido === 0, name: 'Tag movido jun→jul', detail: movido ? `${movido} restantes` : 'limpo' })

  const fpLm = audit.supplierPrices?.liquorMountain ?? 0
  const fpFel = audit.supplierPrices?.felicity ?? 0
  checks.push({ ok: fpLm >= 25, name: 'Preços Liquor Mountain', detail: String(fpLm) })
  checks.push({ ok: fpFel >= 10, name: 'Preços Felicity/Miraido', detail: String(fpFel) })

  const cf = await getJson(`${ORIGIN}/api/cashflow-export`)
  checks.push({ ok: !cf.error && cf.financeiro?.aReceber > 0, name: 'cashflow-export', detail: cf.error || `¥${(cf.financeiro?.aReceber || 0).toLocaleString('ja-JP')}` })

  const chat = await fetch(`${ORIGIN}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }] }),
  }).then(r => r.json())
  checks.push({ ok: !chat.error, name: 'Gemini /api/chat', detail: chat.error || 'OK' })

  const holdingHtml = await fetch(`${ORIGIN}/holding/`).then(r => r.text())
  checks.push({ ok: holdingHtml.includes('JBM Holding Master'), name: 'Holding mirror /holding/', detail: holdingHtml.includes('JBM Holding Master') ? 'OK' : '404/redeploy' })

  const jbmHr = await fetch('https://jbm-master.vercel.app/hr')
  checks.push({ ok: jbmHr.ok, name: 'jbm-master /hr', detail: jbmHr.ok ? 'OK' : `HTTP ${jbmHr.status}` })

  console.log('\n📋 JBM — Live audit\n')
  for (const c of checks) console.log(`${c.ok ? '✅' : '❌'} ${c.name}: ${c.detail}`)
  const failed = checks.filter(c => !c.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} passed\n`)
  process.exit(failed.length ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
