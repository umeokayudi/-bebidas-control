#!/usr/bin/env bash
# Sincroniza cashflow JBM Drinks → Supabase (para jbm-master)
#
# Uso local:
#   SUPABASE_SERVICE_ROLE_KEY='sua_key' bash scripts/sync-cashflow-holding.sh
#
# Uso remoto (1 linha, copiar e colar):
#   SUPABASE_SERVICE_ROLE_KEY='sua_key' bash -c "$(curl -fsSL https://raw.githubusercontent.com/umeokayudi/-bebidas-control/main/scripts/sync-cashflow-holding.sh)"
#
set -e
cd "${JBM_DIR:-$(dirname "$0")/..}"
export VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-https://ojirgkqtqvugqktyuhem.supabase.co}"

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ Falta SUPABASE_SERVICE_ROLE_KEY"
  echo "   Pegue em: https://supabase.com/dashboard/project/ojirgkqtqvugqktyuhem/settings/api"
  exit 1
fi

npm install --silent 2>/dev/null || true
node scripts/sync-cashflow-snapshot.mjs
