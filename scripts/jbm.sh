#!/usr/bin/env bash
# Uso (1 linha, troca KEY e EMAIL):
# SUPABASE_SERVICE_ROLE_KEY='sua_key' ATOMIC_EMAIL='email@bar.com' bash -c "$(curl -fsSL https://raw.githubusercontent.com/umeokayudi/-bebidas-control/main/scripts/jbm.sh)"
set -e
cd "${JBM_DIR:-$HOME/-bebidas-control}"
git pull origin main -q 2>/dev/null || true
npm install --silent 2>/dev/null
export VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-https://ojirgkqtqvugqktyuhem.supabase.co}"
[ -z "$SUPABASE_SERVICE_ROLE_KEY" ] && { echo "❌ Falta SUPABASE_SERVICE_ROLE_KEY"; exit 1; }
node scripts/sync-atomic-prices.mjs
node scripts/setup-usuarios.mjs "${ATOMIC_EMAIL:-}"
echo "✅ https://bebidas-control.vercel.app"
