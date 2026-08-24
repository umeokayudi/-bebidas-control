#!/usr/bin/env node
/**
 * Marca pedidos confirmados de junho como entregue e cria vendas.
 * Uso: node scripts/confirm-june-pedidos.mjs
 * Ou via API: POST /api/fix-atomic-june { confirm, action: "markEntregue" }
 */
const URL = process.env.VITE_SUPABASE_URL || 'https://bebidas-control.vercel.app'

async function main() {
  const res = await fetch(`${URL.replace(/\/$/, '')}/api/fix-atomic-june`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      confirm: 'atomic-june-465000',
      action: 'markEntregue',
      dateFrom: process.argv[2] || '2026-06-01',
      dateTo: process.argv[3] || '2026-06-30',
    }),
  })
  const data = await res.json()
  console.log(JSON.stringify(data, null, 2))
  if (!res.ok) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
