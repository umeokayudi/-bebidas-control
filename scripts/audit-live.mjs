#!/usr/bin/env node
/**
 * Auditoria pública via APIs live (sem service role).
 * Uso: node scripts/audit-live.mjs
 */
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
  const r = await fetch(url)
  return r.json()
}

async function main() {
  const checks = []

  const audit = await getJson('https://bebidas-control.vercel.app/api/holding-audit')
  checks.push({ ok: audit.checksOk === audit.checksTotal, name: 'holding-audit checks', detail: `${audit.checksOk}/${audit.checksTotal}` })
  checks.push({ ok: audit.financeiro?.aReceber === 465000, name: 'Atomic aReceber', detail: `¥${(audit.financeiro?.aReceber || 0).toLocaleString('ja-JP')}` })
  checks.push({ ok: audit.operacao?.pedidosAtivos === 28, name: 'Pedidos pendentes Atomic', detail: String(audit.operacao?.pedidosAtivos) })

  const junPed = await count(`pedidos?bar_id=eq.${BAR}&data_pedido=gte.2026-06-01&data_pedido=lte.2026-06-30&status=eq.pendente&select=id`)
  const julPed = await count(`pedidos?bar_id=eq.${BAR}&data_pedido=gte.2026-07-01&status=eq.pendente&select=id`)
  const movido = await count(`pedidos?bar_id=eq.${BAR}&obs=ilike.*movido*jun*jul*&select=id`)
  checks.push({ ok: junPed === 28, name: 'Pedidos em junho', detail: String(junPed) })
  checks.push({ ok: julPed === 0, name: 'Pedidos em julho (deve ser 0)', detail: String(julPed) })
  checks.push({ ok: movido === 0, name: 'Tag movido jun→jul', detail: movido ? `${movido} restantes` : 'limpo' })

  const cf = await getJson('https://bebidas-control.vercel.app/api/cashflow-export')
  checks.push({ ok: !cf.error && cf.financeiro?.aReceber === 465000, name: 'cashflow-export', detail: cf.error || `¥${cf.financeiro?.aReceber}` })

  const chat = await fetch('https://bebidas-control.vercel.app/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }] }),
  }).then(r => r.json())
  checks.push({ ok: !chat.error, name: 'Gemini /api/chat', detail: chat.error || 'OK' })

  const holdingHtml = await fetch('https://bebidas-control.vercel.app/holding/').then(r => r.text())
  checks.push({ ok: holdingHtml.includes('JBM Holding Master'), name: 'Holding mirror /holding/', detail: holdingHtml.includes('JBM Holding Master') ? 'OK' : 'serve app errado (redeploy pendente)' })

  const jbmHr = await fetch('https://jbm-master.vercel.app/hr')
  checks.push({ ok: jbmHr.ok, name: 'jbm-master /hr', detail: jbmHr.ok ? 'OK' : `HTTP ${jbmHr.status} — Root Directory jbm-master-app` })

  console.log('\n📋 JBM — Live audit\n')
  for (const c of checks) console.log(`${c.ok ? '✅' : '❌'} ${c.name}: ${c.detail}`)
  const failed = checks.filter(c => !c.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} passed\n`)
  process.exit(failed.length ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
