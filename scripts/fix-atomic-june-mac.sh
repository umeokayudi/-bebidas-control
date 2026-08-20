#!/usr/bin/env bash
# Corrige dívida Atomic jun/2026 → ¥465.000 (usa API Vercel com service role)
set -e
echo ""
echo "══════════════════════════════════════════"
echo "  Atomic — ajustando dívida jun/2026"
echo "══════════════════════════════════════════"
echo ""

RES=$(curl -fsSL 'https://bebidas-control.vercel.app/api/holding-audit?fixAtomicJune=1&confirm=atomic-june-465000&debt=465000') || {
  RES=$(curl -fsSL -X POST 'https://bebidas-control.vercel.app/api/fix-atomic-june' \
    -H 'Content-Type: application/json' \
    -d '{"confirm":"atomic-june-465000","debt":465000}') || {
  echo "❌ API ainda não disponível. Aguarde 1–2 min após deploy e tente de novo."
  echo "   Ou rode o SQL: ATOMIC_JUNHO_465K_SQL.sql no Supabase"
  exit 1
  }
}

python3 -c "
import json,sys
r=json.loads(sys.argv[1])
fix=r.get('fix', r)
print('✅ Vendas jun removidas:', fix.get('deletedVendas',0))
print('✅ Pedidos movidos p/ jul:', fix.get('movedPedidos',0))
print('✅ A receber agora:      ¥{:,.0f}'.format(r.get('aReceber',0)))
print()
print('   Julho limpo — pode lançar as vendas novas.')
" "$RES"

echo ""
echo "══════════════════════════════════════════"
