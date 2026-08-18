#!/usr/bin/env bash
# Setup completo — rode na pasta do projeto: bash scripts/setup-tudo.sh
set -e

cd "$(dirname "$0")/.."
echo ""
echo "══════════════════════════════════════"
echo "  JBM Bebidas — Setup terminal"
echo "══════════════════════════════════════"
echo ""

git pull origin main 2>/dev/null || true
npm install --silent

export VITE_SUPABASE_URL="https://ojirgkqtqvugqktyuhem.supabase.co"

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "Cole a SERVICE_ROLE_KEY (Supabase → Settings → API → service_role)"
  echo "e pressione Enter:"
  read -rs SUPABASE_SERVICE_ROLE_KEY
  echo ""
  export SUPABASE_SERVICE_ROLE_KEY
fi

echo ""
echo "Senha do banco Postgres (opcional — para coluna email)."
echo "Supabase → Settings → Database → Database password"
echo "Enter = pula (usa só API)"
read -rs SUPABASE_DB_PASSWORD || true
export SUPABASE_DB_PASSWORD
echo ""

echo "Email do login Atomic para vincular ao bar (opcional):"
read -r ATOMIC_EMAIL
echo ""

echo "── Sync preços fornecedor ──"
node scripts/sync-atomic-prices.mjs

echo ""
echo "── Setup usuários / Atomic Bar ──"
node scripts/setup-usuarios.mjs "$ATOMIC_EMAIL"

echo ""
echo "── Vercel (opcional — precisa: npm i -g vercel && vercel login) ──"
if command -v vercel >/dev/null 2>&1; then
  echo "Quer gravar SUPABASE_SERVICE_ROLE_KEY no Vercel? (s/N)"
  read -r DO_VERCEL
  if [ "$DO_VERCEL" = "s" ] || [ "$DO_VERCEL" = "S" ]; then
    printf '%s' "$SUPABASE_SERVICE_ROLE_KEY" | vercel env add SUPABASE_SERVICE_ROLE_KEY production --force 2>/dev/null || \
    echo "⚠️  vercel env falhou — cola manual: https://vercel.com/umeokayudi/bebidas-control/settings/environment-variables"
    vercel --prod 2>/dev/null || echo "⚠️  deploy: faz redeploy no painel Vercel"
  fi
else
  echo "⚠️  vercel CLI não instalado. Cola a key aqui:"
  echo "   https://vercel.com/umeokayudi/bebidas-control/settings/environment-variables"
fi

echo ""
echo "══════════════════════════════════════"
echo "  Site: https://bebidas-control.vercel.app"
echo "══════════════════════════════════════"
echo ""
