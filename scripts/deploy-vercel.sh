#!/usr/bin/env bash
# Deploy JBM Drinks + JBM Master para produção via Vercel CLI
#
# Pré-requisito (uma vez):
#   1. Crie token: https://vercel.com/account/tokens
#   2. export VERCEL_TOKEN="seu_token"
#
# Uso:
#   ./scripts/deploy-vercel.sh           # deploy dos dois projetos
#   ./scripts/deploy-vercel.sh bebidas   # só bebidas-control
#   ./scripts/deploy-vercel.sh jbm       # só jbm-master-app
#   ./scripts/deploy-vercel.sh --audit   # deploy bebidas + auditoria live

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-all}"

BEBIDAS_PROJECT="${BEBIDAS_PROJECT:-bebidas-control}"
JBM_PROJECT="${JBM_PROJECT:-jbm-master}"

if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo ""
  echo "❌ VERCEL_TOKEN não definido."
  echo ""
  echo "   1. Abra https://vercel.com/account/tokens"
  echo "   2. Create Token → Full Account (ou scope deploy)"
  echo "   3. No terminal:"
  echo "      export VERCEL_TOKEN=\"seu_token_aqui\""
  echo "      ./scripts/deploy-vercel.sh"
  echo ""
  exit 1
fi

VC="npx vercel --token \"$VERCEL_TOKEN\""
TEAM_ARGS=()
if [[ -n "${VERCEL_ORG_ID:-}" ]]; then
  TEAM_ARGS=(--scope "$VERCEL_ORG_ID")
elif [[ -n "${VERCEL_TEAM:-}" ]]; then
  TEAM_ARGS=(--scope "$VERCEL_TEAM")
fi

link_project() {
  local dir="$1" project="$2"
  cd "$dir"
  npx vercel link --yes --project "$project" "${TEAM_ARGS[@]}" --token "$VERCEL_TOKEN"
}

deploy_bebidas() {
  echo ""
  echo "══════════════════════════════════════════"
  echo "  🚀 Deploy: $BEBIDAS_PROJECT (bebidas-control)"
  echo "══════════════════════════════════════════"
  cd "$ROOT"
  echo "→ npm ci"
  npm ci --silent
  echo "→ npm run build:holding (app + mirror /holding/)"
  npm run build:holding
  link_project "$ROOT" "$BEBIDAS_PROJECT"
  npx vercel deploy --prod --yes "${TEAM_ARGS[@]}" --token "$VERCEL_TOKEN"
  echo "✅ $BEBIDAS_PROJECT → https://${BEBIDAS_PROJECT}.vercel.app"
}

deploy_jbm() {
  echo ""
  echo "══════════════════════════════════════════"
  echo "  🚀 Deploy: $JBM_PROJECT (jbm-master-app)"
  echo "══════════════════════════════════════════"
  cd "$ROOT/jbm-master-app"
  echo "→ npm ci"
  npm ci --silent
  echo "→ npm run build"
  npm run build
  link_project "$ROOT/jbm-master-app" "$JBM_PROJECT"
  npx vercel deploy --prod --yes "${TEAM_ARGS[@]}" --token "$VERCEL_TOKEN"
  echo "✅ $JBM_PROJECT → https://${JBM_PROJECT}.vercel.app"
  echo ""
  echo "   Se /hr der 404, confirme no Vercel:"
  echo "   Settings → Root Directory → jbm-master-app"
}

post_audit() {
  echo ""
  echo "→ Auditoria live..."
  sleep 5
  node "$ROOT/scripts/audit-live.mjs" || true
  echo ""
  echo "Links:"
  echo "  Drinks:  https://bebidas-control.vercel.app"
  echo "  Holding: https://bebidas-control.vercel.app/holding/#/hr"
  echo "  Master:  https://jbm-master.vercel.app/hr"
}

case "$TARGET" in
  bebidas|drinks)
    deploy_bebidas
    ;;
  jbm|master|holding)
    deploy_jbm
    ;;
  --audit|audit)
    deploy_bebidas
    post_audit
    ;;
  all|"")
    deploy_bebidas
    deploy_jbm
    post_audit
    ;;
  *)
    echo "Uso: $0 [all|bebidas|jbm|--audit]"
    exit 1
    ;;
esac

echo ""
echo "🎉 Deploy concluído."
