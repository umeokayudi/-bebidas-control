#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# JBM TUDO — sincroniza cashflow e ativa automático
#
# COLE NO TERMINAL (uma linha):
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/umeokayudi/-bebidas-control/main/scripts/jbm-tudo.sh)"
# ═══════════════════════════════════════════════════════════════════
set -e

export HOLDING_SERVICE_ROLE_KEY="${HOLDING_SERVICE_ROLE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4c2FrcnNobWxkbWtkbWJldm5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTEyNjAxMSwiZXhwIjoyMDk2NzAyMDExfQ.dFpBZGlulIp99ecHTSPA0izIRjNSi3NRR1BioZhUBZ0}"
export HOLDING_SUPABASE_URL="${HOLDING_SUPABASE_URL:-https://fxsakrshmldmkdmbevna.supabase.co}"

echo ""
echo "══════════════════════════════════════════"
echo "  JBM — rodando tudo..."
echo "══════════════════════════════════════════"
echo ""

# ── 1. Sync cashflow ──
echo "▶ [1/2] Sincronizando cashflow..."
bash -c "$(curl -fsSL https://raw.githubusercontent.com/umeokayudi/-bebidas-control/main/scripts/sync-cashflow-holding.sh)"
echo ""

# ── 2. Registrar chave + ativar cron (quando API estiver no ar) ──
echo "▶ [2/2] Ativando sync automático 15 min..."
for ENDPOINT in \
  "https://bebidas-control.vercel.app/api/register-holding-key" \
  "https://bebidas-control.vercel.app/api/holding-audit"
do
  R=$(curl -s -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "{\"holdingKey\":\"$HOLDING_SERVICE_ROLE_KEY\"}" 2>/dev/null || true)
  if echo "$R" | grep -qE '"ok":true|registrada|registered'; then
    echo "   ✅ Automático ativado via $ENDPOINT"
    break
  fi
done

# Forçar sync via cron endpoint se existir
curl -s -H "x-vercel-cron: 1" "https://bebidas-control.vercel.app/api/sync-cashflow-cron" >/dev/null 2>&1 || true

echo ""
echo "══════════════════════════════════════════"
echo "  ✅ FEITO"
echo "══════════════════════════════════════════"
echo ""
echo "  Abra: https://jbm-master.vercel.app/"
echo ""
echo "  Números ao vivo:"
curl -s "https://bebidas-control.vercel.app/api/cashflow-export" | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  f=d.get('financeiro',{})
  print('  • A receber:     ¥{:,.0f}'.format(f.get('aReceber',0)))
  print('  • Caixa:         ¥{:,.0f}'.format(f.get('caixaLiquido',0)))
  print('  • Projetado 30d: ¥{:,.0f}'.format(f.get('projetado30d',0)))
except: print('  (ver https://bebidas-control.vercel.app/api/cashflow-export)')
" 2>/dev/null || true
echo ""
echo "  Sync repete sozinho a cada 15 min (servidor)."
echo ""
