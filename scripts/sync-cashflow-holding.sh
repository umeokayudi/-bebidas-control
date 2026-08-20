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
echo "  JBM — sincronizando tudo (v5, sem Node)"
echo "══════════════════════════════════════════"
echo ""

echo "▶ [1/3] Buscando JBM Drinks..."
DRINKS=$(curl -fsSL "$API_URL") || { echo "❌ Erro API drinks"; exit 1; }

echo "▶ [2/3] Buscando KuriPuro..."
HDR=(-H "Authorization: Bearer $HOLDING_SERVICE_ROLE_KEY" -H "apikey: $HOLDING_SERVICE_ROLE_KEY")
CLIENTS=$(curl -fsSL "$HOLDING_URL/rest/v1/clients?is_active=eq.true&select=company_name,contact_name,monthly_revenue,monthly_cost,notes" "${HDR[@]}" 2>/dev/null || echo "[]")
FATURAS=$(curl -fsSL "$HOLDING_URL/rest/v1/faturas?status=eq.pending&select=client_id,client_name,period_start,period_end,total,status,notes&order=period_start" "${HDR[@]}" 2>/dev/null || echo "[]")
CASHFLOW=$(curl -fsSL "$HOLDING_URL/rest/v1/cashflow?select=entry_type,category,description,amount,entry_date&order=entry_date.desc&limit=40" "${HDR[@]}" 2>/dev/null || echo "[]")
PAYMENTS=$(curl -fsSL "$HOLDING_URL/rest/v1/salary_payments?select=employee_name,amount,payment_date,status,payment_type,description,is_deduction&order=payment_date.desc&limit=30" "${HDR[@]}" 2>/dev/null || echo "[]")
EMPLOYEES=$(curl -fsSL "$HOLDING_URL/rest/v1/employees?is_active=eq.true&select=id,fixed_salary,attendance_bonus" "${HDR[@]}" 2>/dev/null || echo "[]")

echo "▶ [3/3] Gravando snapshot..."
TMP=$(mktemp)
export DRINKS_JSON="$DRINKS" CLIENTS_JSON="$CLIENTS" FATURAS_JSON="$FATURAS" CASHFLOW_JSON="$CASHFLOW" PAYMENTS_JSON="$PAYMENTS" EMPLOYEES_JSON="$EMPLOYEES"
python3 << 'PY' > "$TMP"
import json, os
from datetime import datetime, timezone

drinks = json.loads(os.environ["DRINKS_JSON"])
clients = json.loads(os.environ.get("CLIENTS_JSON") or "[]")
faturas = json.loads(os.environ.get("FATURAS_JSON") or "[]")
cashflow = json.loads(os.environ.get("CASHFLOW_JSON") or "[]")
payments = json.loads(os.environ.get("PAYMENTS_JSON") or "[]")
employees = json.loads(os.environ.get("EMPLOYEES_JSON") or "[]")

receita = sum(float(c.get("monthly_revenue") or 0) for c in clients)
custo_clientes = sum(float(c.get("monthly_cost") or 0) for c in clients)
custo_folha = sum(float(e.get("fixed_salary") or 0) + float(e.get("attendance_bonus") or 0) for e in employees)
custo = custo_clientes + custo_folha

descontos = [c for c in cashflow if c.get("entry_type") == "expense" and "desconto" in (c.get("category") or "")]
desconto_agosto_otp = sum(float(c.get("amount") or 0) for c in descontos if "on the planet" in (c.get("description") or "").lower())

atomic_faturas = [f for f in faturas if (f.get("client_name") or "").lower().startswith("atomic")]
a_receber_atomic = sum(float(f.get("total") or 0) for f in atomic_faturas)
a_receber_kuri = sum(float(f.get("total") or 0) for f in faturas)

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

for c in cashflow:
    entries.append({
        "description": c.get("description"),
        "amount": c.get("amount"),
        "type": "income" if c.get("entry_type") == "income" else "expense",
        "date": c.get("entry_date"),
        "category": c.get("category"),
        "paid": False,
    })

unpaid = [e for e in entries if not e.get("paid")]
expenses = sum(float(e.get("amount") or 0) for e in entries if e.get("type") == "expense")
income = sum(float(e.get("amount") or 0) for e in entries if e.get("type") == "income")

lucro_ajustado = receita - custo - desconto_agosto_otp

out = {
    **drinks,
    "geradoEm": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "destino": "jbm-master",
    "fonte": "jbm-sync",
    "kuripuro": {
        "receitaMes": receita,
        "receitaAjustadaAgosto": lucro_ajustado + custo_folha,
        "custoMes": custo,
        "custoFolha": custo_folha,
        "custoClientes": custo_clientes,
        "lucroMes": receita - custo,
        "lucroAjustadoAgosto": lucro_ajustado,
        "descontoOnThePlanetAgosto": desconto_agosto_otp,
        "aReceber": a_receber_kuri,
        "aReceberAtomic": a_receber_atomic,
        "atomicFaturas": [{
            "mes": (f.get("period_start") or "")[:7],
            "valor": f.get("total"),
            "notas": f.get("notes"),
        } for f in atomic_faturas],
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
            "notas": c.get("notes"),
        } for c in clients[:10]],
        "lancamentos": entries[:20],
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
export DRINKS_JSON="$DRINKS" CLIENTS_JSON="$CLIENTS" FATURAS_JSON="$FATURAS" EMPLOYEES_JSON="$EMPLOYEES"
python3 -c "
import json, os
f = json.loads(os.environ['DRINKS_JSON']).get('financeiro', {})
clients = json.loads(os.environ['CLIENTS_JSON'])
faturas = json.loads(os.environ['FATURAS_JSON'])
employees = json.loads(os.environ['EMPLOYEES_JSON'])
receita = sum(float(c.get('monthly_revenue') or 0) for c in clients)
custo_folha = sum(float(e.get('fixed_salary') or 0) + float(e.get('attendance_bonus') or 0) for e in employees)
atomic = [x for x in faturas if (x.get('client_name') or '').lower().startswith('atomic')]
print()
print('  JBM DRINKS')
print('  • A receber:     ¥{:,.0f}'.format(f.get('aReceber', 0)))
print('  • Caixa:         ¥{:,.0f}'.format(f.get('caixaLiquido', 0)))
print()
print('  KURIPURO')
print('  • Receita/mês:   ¥{:,.0f}'.format(receita))
print('  • A receber:     ¥{:,.0f}'.format(sum(float(x.get('total') or 0) for x in faturas)))
if atomic:
    print('  • Atomic Bar:')
    for x in atomic:
        print('      {}  ¥{:,.0f}'.format((x.get('period_start') or '')[:7], float(x.get('total') or 0)))
print('  • Desconto OTP ago: ¥132,000 (Kodama Kinshicho)')
print('  • Custo folha:   ¥{:,.0f}'.format(custo_folha))
print()
print('  https://jbm-master.vercel.app/')
"
