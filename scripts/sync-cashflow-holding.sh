#!/usr/bin/env bash
# Sincroniza cashflow JBM Drinks → Supabase do jbm-master
#
# Uso remoto (1 linha, funciona no Mac):
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/umeokayudi/-bebidas-control/main/scripts/sync-cashflow-holding.sh)"
#
set -e

# Se rodou via curl (sem arquivo local), delega pro jbm-tudo.sh
if [ ! -f "${BASH_SOURCE[0]:-$0}" ] || [ "$(basename "$0")" = "bash" ]; then
  exec bash -c "$(curl -fsSL https://raw.githubusercontent.com/umeokayudi/-bebidas-control/main/scripts/jbm-tudo.sh)"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${JBM_DIR:-$SCRIPT_DIR/..}"

export HOLDING_SUPABASE_URL="${HOLDING_SUPABASE_URL:-https://fxsakrshmldmkdmbevna.supabase.co}"
export CASHFLOW_API_URL="${CASHFLOW_API_URL:-https://bebidas-control.vercel.app/api/cashflow-export}"

KEY="${HOLDING_SERVICE_ROLE_KEY:-$SUPABASE_SERVICE_ROLE_KEY}"
if [ -z "$KEY" ]; then
  echo "❌ Falta HOLDING_SERVICE_ROLE_KEY"
  exit 1
fi
export HOLDING_SERVICE_ROLE_KEY="$KEY"

npm install --silent 2>/dev/null || true
node "$SCRIPT_DIR/sync-cashflow-snapshot.mjs"
