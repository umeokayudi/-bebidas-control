#!/usr/bin/env bash
# Sincroniza cashflow JBM Drinks → Supabase do jbm-master
#
# Uso jbm-master (recomendado — só precisa da chave da holding):
#   HOLDING_SERVICE_ROLE_KEY='sua_key' bash scripts/sync-cashflow-holding.sh
#
# Uso remoto (1 linha):
#   HOLDING_SERVICE_ROLE_KEY='sua_key' bash -c "$(curl -fsSL https://raw.githubusercontent.com/umeokayudi/-bebidas-control/main/scripts/sync-cashflow-holding.sh)"
#
set -e
cd "${JBM_DIR:-$(dirname "$0")/..}"

export HOLDING_SUPABASE_URL="${HOLDING_SUPABASE_URL:-https://fxsakrshmldmkdmbevna.supabase.co}"
export CASHFLOW_API_URL="${CASHFLOW_API_URL:-https://bebidas-control.vercel.app/api/cashflow-export}"

# Aceita HOLDING_SERVICE_ROLE_KEY ou SUPABASE_SERVICE_ROLE_KEY (holding)
KEY="${HOLDING_SERVICE_ROLE_KEY:-$SUPABASE_SERVICE_ROLE_KEY}"

if [ -z "$KEY" ]; then
  echo "❌ Falta HOLDING_SERVICE_ROLE_KEY"
  echo "   Pegue em: https://supabase.com/dashboard/project/fxsakrshmldmkdmbevna/settings/api"
  exit 1
fi

export HOLDING_SERVICE_ROLE_KEY="$KEY"
npm install --silent 2>/dev/null || true
node scripts/sync-cashflow-snapshot.mjs
