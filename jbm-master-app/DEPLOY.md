# JBM Master — Deploy

O site **https://jbm-master.vercel.app** deve apontar para esta pasta.

## Fix do 404 em /hr, /logistica, etc.

No Vercel → projeto **jbm-master** → **Settings → General**:

| Campo | Valor |
|-------|-------|
| **Root Directory** | `jbm-master-app` |
| **Framework** | Vite |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |

Depois: **Deployments → Redeploy** (último commit da branch `main`).

O `vercel.json` já inclui rewrites SPA — todas as rotas (`/hr`, `/logistica`, …) funcionam após redeploy.

## Variáveis de ambiente (Vercel)

```
VITE_JBM_PASSWORD=sua_senha
VITE_HOLDING_SUPABASE_URL=https://fxsakrshmldmkdmbevna.supabase.co
VITE_HOLDING_SUPABASE_ANON_KEY=<anon key holding>
VITE_CASHFLOW_API=https://bebidas-control.vercel.app/api/cashflow-export
```

## Design — Clássico vs Moderno

No painel, sidebar inferior: botão **Design → Clássico | Moderno**

- **Clássico** — tema escuro dourado (atual)
- **Moderno** — estilo Apple, claro, minimalista (teste)

A preferência fica salva no navegador.

## Links

- Dashboard: https://jbm-master.vercel.app/
- HR: https://jbm-master.vercel.app/hr
- Logística: https://jbm-master.vercel.app/logistica
- Investimentos: https://jbm-master.vercel.app/investimentos
