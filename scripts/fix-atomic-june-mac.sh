#!/usr/bin/env bash
# Corrige dívida Atomic jun/2026 → ¥465.000 (usa API Vercel com service role)
set -e
echo ""
echo "══════════════════════════════════════════"
echo "  Atomic — ajustando dívida jun/2026"
echo "══════════════════════════════════════════"
echo ""

RES=$(curl -fsSL 'https://bebidas-control.vercel.app/api/cashflow-export?fixAtomicJune=1&confirm=atomic-june-465000&debt=465000' 2>/dev/null) || true
if ! echo "$RES" | python3 -c "import json,sys; r=json.load(sys.stdin); sys.exit(0 if r.get('ok') else 1)" 2>/dev/null; then
  RES=$(curl -fsSL 'https://bebidas-control.vercel.app/api/holding-audit?fixAtomicJune=1&confirm=atomic-june-465000&debt=465000' 2>/dev/null) || true
fi

if ! echo "$RES" | python3 -c "import json,sys; r=json.load(sys.stdin); sys.exit(0 if r.get('ok') else 1)" 2>/dev/null; then
  echo "❌ API ainda não disponível. Aguarde 1–2 min após deploy e tente de novo."
  echo ""
  echo "   Alternativa: abra no navegador"
  echo "   https://supabase.com/dashboard/project/ojirgkqtqvugqktyuhem/sql/new"
  echo "   Cole o arquivo ATOMIC_JUNHO_465K_SQL.sql e clique Run"
  exit 1
fi

python3 -c "
import json,sys
r=json.loads(sys.argv[1])
fix=r.get('fix', {})
ar=r.get('aReceber') or r.get('financeiro',{}).get('aReceber',0)
print('✅ Vendas jun removidas:', fix.get('deletedVendas',0))
print('✅ Pedidos movidos p/ jul:', fix.get('movedPedidos',0))
print('✅ A receber agora:      ¥{:,.0f}'.format(ar))
print()
print('   Julho limpo — pode lançar as vendas novas.')
" "$RES"

echo ""
echo "══════════════════════════════════════════"
