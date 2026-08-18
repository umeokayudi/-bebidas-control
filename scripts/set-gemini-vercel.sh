#!/usr/bin/env bash
# Grava GEMINI_API_KEY no Vercel (precisa: vercel login)
# Uso: GEMINI_API_KEY='sua_key' bash scripts/set-gemini-vercel.sh
set -e
cd "$(dirname "$0")/.."

if [ -z "$GEMINI_API_KEY" ]; then
  echo "❌ Falta GEMINI_API_KEY"
  echo "   Uso: GEMINI_API_KEY='...' bash scripts/set-gemini-vercel.sh"
  exit 1
fi

if ! command -v vercel >/dev/null 2>&1 && ! npx vercel --version >/dev/null 2>&1; then
  echo "❌ Instale e faça login: npm i -g vercel && vercel login"
  exit 1
fi

VCMD="vercel"
command -v vercel >/dev/null 2>&1 || VCMD="npx vercel"

printf '%s' "$GEMINI_API_KEY" | $VCMD env add GEMINI_API_KEY production preview development --force
echo "✅ GEMINI_API_KEY gravada. Redeploy:"
echo "   $VCMD --prod"
echo "   ou Vercel → Deployments → Redeploy"
