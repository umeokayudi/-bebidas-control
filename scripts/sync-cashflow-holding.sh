#!/usr/bin/env bash
# Sincroniza JBM Drinks + KuriPuro → Supabase holding (só curl + python3, sem Node)
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/umeokayudi/-bebidas-control/main/scripts/sync-cashflow-holding.sh)"
#
set -e

export HOLDING_SERVICE_ROLE_KEY="${HOLDING_SERVICE_ROLE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4c2FrcnNobWxkbWtkbWJldm5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTEyNjAxMSwiZXhwIjoyMDk2NzAyMDExfQ.dFpBZGlulIp99ecHTSPA0izIRjNSi3NRR1BioZhUBZ0}"
HOLDING_URL="${HOLDING_SUPABASE_URL:-https://fxsakrshmldmkdmbevna.supabase.co}"
API_URL="${CASHFLOW_API_URL:-https://bebidas-control.vercel.app/api/cashflow-export}"
BUCKET="system-private"
FILE="cashflow_snapshot.json"

echo ""
echo "══════════════════════════════════════════"
echo "  JBM — sincronizando tudo (v4, sem Node)"
echo "══════════════════════════════════════════"
echo ""

echo "▶ [1/3] Buscando JBM Drinks..."
DRINKS=$(curl -fsSL "$API_URL") || { echo "❌ Erro API drinks"; exit 1; }

echo "▶ [2/3] Buscando KuriPuro..."
HDR=(-H "Authorization: Bearer $HOLDING_SERVICE_ROLE_KEY" -H "apikey: $HOLDING_SERVICE_ROLE_KEY")
CLIENTS=$(curl -fsSL "$HOLDING_URL/rest/v1/clients?is_active=eq.true&select=company_name,contact_name,monthly_revenue,monthly_cost" "${HDR[@]}" 2>/dev/null || echo "[]")
PAYMENTS=$(curl -fsSL "$HOLDING_URL/rest/v1/salary_payments?select=employee_name,amount,payment_date,status,payment_type,description,is_deduction&order=payment_date.desc&limit=30" "${HDR[@]}" 2>/dev/null || echo "[]")
EMPLOYEES=$(curl -fsSL "$HOLDING_URL/rest/v1/employees?is_active=eq.true&select=id,fixed_salary,attendance_bonus" "${HDR[@]}" 2>/dev/null || echo "[]")

echo "▶ [3/3] Gravando snapshot..."
TMP=$(mktemp)
export DRINKS_JSON="$DRINKS" CLIENTS_JSON="$CLIENTS" PAYMENTS_JSON="$PAYMENTS" EMPLOYEES_JSON="$EMPLOYEES"
python3 << 'PY' > "$TMP"
import json, os
from datetime import datetime, timezone

drinks = json.loads(os.environ["DRINKS_JSON"])
clients = json.loads(os.environ.get("CLIENTS_JSON") or "[]")
payments = json.loads(os.environ.get("PAYMENTS_JSON") or "[]")
employees = json.loads(os.environ.get("EMPLOYEES_JSON") or "[]")

receita = sum(float(c.get("monthly_revenue") or 0) for c in clients)
custo_clientes = sum(float(c.get("monthly_cost") or 0) for c in clients)
custo_folha = sum(float(e.get("fixed_salary") or 0) + float(e.get("attendance_bonus") or 0) for e in employees)
custo = custo_clientes + custo_folha

entries = []
for p in payments:
    desc = p.get("description") or p.get("payment_type") or "pagamento"
    name = p.get("employee_name") or ""
    entries.append({
        "description": f"{name} — {desc}".strip(" —"),
        "amount": p.get("amount"),
        "type": "income" if p.get("is_deduction") else "expense",
        "date": p.get("payment_date"),
        "category": p.get("payment_type") or "folha",
        "paid": p.get("status") == "paid",
    })

paid = [e for e in entries if e.get("paid")]
unpaid = [e for e in entries if not e.get("paid")]
expenses = sum(float(e.get("amount") or 0) for e in entries if e.get("type") == "expense")
income = sum(float(e.get("amount") or 0) for e in entries if e.get("type") == "income")

out = {
    **drinks,
    "geradoEm": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "destino": "jbm-master",
    "fonte": "jbm-sync",
    "kuripuro": {
        "receitaMes": receita,
        "custoMes": custo,
        "custoFolha": custo_folha,
        "custoClientes": custo_clientes,
        "lucroMes": receita - custo,
        "clientesAtivos": len(clients),
        "funcionariosAtivos": len(employees),
        "lancamentosReceita": income,
        "lancamentosDespesa": expenses,
        "saldoLancamentos": income - expenses,
        "contasPendentes": len(unpaid),
        "clientes": [{
            "nome": c.get("company_name") or c.get("contact_name"),
            "receita": c.get("monthly_revenue"),
            "custo": c.get("monthly_cost"),
        } for c in clients[:10]],
        "lancamentos": entries[:15],
    },
}
print(json.dumps(out, ensure_ascii=False))
PY

HTTP=$(curl -s -o /tmp/jbm-resp.txt -w "%{http_code}" \
  -X POST "$HOLDING_URL/storage/v1/object/$BUCKET/$FILE" \
  -H "Authorization: Bearer $HOLDING_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "x-upsert: true" \
  --data-binary @"$TMP")
rm -f "$TMP"

if [ "$HTTP" != "200" ] && [ "$HTTP" != "201" ]; then
  echo "❌ Erro Supabase HTTP $HTTP"
  cat /tmp/jbm-resp.txt 2>/dev/null
  exit 1
fi

echo ""
echo "══════════════════════════════════════════"
echo "  ✅ FEITO"
echo "══════════════════════════════════════════"
export DRINKS_JSON="$DRINKS" CLIENTS_JSON="$CLIENTS" EMPLOYEES_JSON="$EMPLOYEES"
python3 -c "
import json, os
f = json.loads(os.environ['DRINKS_JSON']).get('financeiro', {})
clients = json.loads(os.environ['CLIENTS_JSON'])
employees = json.loads(os.environ['EMPLOYEES_JSON'])
receita = sum(float(c.get('monthly_revenue') or 0) for c in clients)
custo_cli = sum(float(c.get('monthly_cost') or 0) for c in clients)
custo_folha = sum(float(e.get('fixed_salary') or 0) + float(e.get('attendance_bonus') or 0) for e in employees)
custo = custo_cli + custo_folha
print()
print('  JBM DRINKS')
print('  • A receber:     ¥{:,.0f}'.format(f.get('aReceber', 0)))
print('  • Caixa:         ¥{:,.0f}'.format(f.get('caixaLiquido', 0)))
print()
print('  KURIPURO')
print('  • Receita/mês:   ¥{:,.0f}'.format(receita))
print('  • Custo folha:   ¥{:,.0f}'.format(custo_folha))
print('  • Lucro:         ¥{:,.0f}'.format(receita - custo))
print('  • Clientes:      {}'.format(len(clients)))
print('  • Funcionários:  {}'.format(len(employees)))
print()
print('  https://jbm-master.vercel.app/')
"
