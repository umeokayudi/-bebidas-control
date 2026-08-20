#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# JBM TUDO — sincroniza cashflow (só curl, funciona no Mac)
#
# COLE NO TERMINAL:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/umeokayudi/-bebidas-control/main/scripts/jbm-tudo.sh)"
# ═══════════════════════════════════════════════════════════════════
set -e

export HOLDING_SERVICE_ROLE_KEY="${HOLDING_SERVICE_ROLE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4c2FrcnNobWxkbWtkbWJldm5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTEyNjAxMSwiZXhwIjoyMDk2NzAyMDExfQ.dFpBZGlulIp99ecHTSPA0izIRjNSi3NRR1BioZhUBZ0}"
HOLDING_URL="${HOLDING_SUPABASE_URL:-https://fxsakrshmldmkdmbevna.supabase.co}"
API_URL="${CASHFLOW_API_URL:-https://bebidas-control.vercel.app/api/cashflow-export}"
BUCKET="system-private"
FILE="cashflow_snapshot.json"

echo ""
echo "══════════════════════════════════════════"
echo "  JBM — rodando tudo..."
echo "══════════════════════════════════════════"
echo ""

# ── 1. Buscar cashflow do bebidas-control ──
echo "▶ [1/2] Buscando dados do JBM Drinks..."
CF=$(curl -fsSL "$API_URL")
if [ -z "$CF" ] || echo "$CF" | grep -q '"error"'; then
  echo "❌ Erro ao buscar cashflow em $API_URL"
  exit 1
fi

# Adicionar metadata
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")
if command -v python3 >/dev/null 2>&1; then
  PAYLOAD=$(CF_JSON="$CF" NOW="$NOW" python3 -c "
import json, os
d = json.loads(os.environ['CF_JSON'])
d['geradoEm'] = os.environ['NOW']
d['destino'] = 'jbm-master'
d['fonte'] = 'jbm-tudo.sh'
print(json.dumps(d, ensure_ascii=False))
")
else
  PAYLOAD="$CF"
fi

# ── 2. Gravar no Supabase da holding ──
echo "▶ [2/2] Gravando no jbm-master Supabase..."
TMP=$(mktemp)
printf '%s' "$PAYLOAD" > "$TMP"

HTTP=$(curl -s -o /tmp/jbm-upload-resp.txt -w "%{http_code}" \
  -X POST "$HOLDING_URL/storage/v1/object/$BUCKET/$FILE" \
  -H "Authorization: Bearer $HOLDING_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "x-upsert: true" \
  --data-binary @"$TMP")

rm -f "$TMP"

if [ "$HTTP" != "200" ] && [ "$HTTP" != "201" ]; then
  echo "❌ Erro ao gravar no Supabase (HTTP $HTTP)"
  cat /tmp/jbm-upload-resp.txt 2>/dev/null
  echo ""
  echo "   Verifique a chave em:"
  echo "   https://supabase.com/dashboard/project/fxsakrshmldmkdmbevna/settings/api"
  exit 1
fi

# ── 3. Tentar ativar cron automático (opcional) ──
curl -s -X POST "https://bebidas-control.vercel.app/api/register-holding-key" \
  -H "Content-Type: application/json" \
  -d "{\"holdingKey\":\"$HOLDING_SERVICE_ROLE_KEY\"}" >/dev/null 2>&1 || true

echo ""
echo "══════════════════════════════════════════"
echo "  ✅ FEITO"
echo "══════════════════════════════════════════"
echo ""

if command -v python3 >/dev/null 2>&1; then
  echo "$PAYLOAD" | python3 -c "
import json,sys
d=json.load(sys.stdin)
f=d.get('financeiro',{})
print('  • A receber:     ¥{:,.0f}'.format(f.get('aReceber',0)))
print('  • Caixa:         ¥{:,.0f}'.format(f.get('caixaLiquido',0)))
print('  • A pagar:       ¥{:,.0f}'.format(f.get('aPagar',0)))
print('  • Projetado 30d: ¥{:,.0f}'.format(f.get('projetado30d',0)))
"
else
  echo "  Dados gravados com sucesso."
fi

echo ""
echo "  Abra: https://jbm-master.vercel.app/"
echo ""
