# JBM Master — Deploy

## Fix do 404 em `/hr` (jbm-master.vercel.app)

O Vercel está servindo um build antigo. Corrija em 1 minuto:

1. https://vercel.com/dashboard → projeto **jbm-master**
2. **Settings → General → Root Directory** → `jbm-master-app`
3. **Build:** `npm run build` | **Output:** `dist`
4. **Deployments → Redeploy**

### Variáveis de ambiente

```
VITE_JBM_PASSWORD=sua_senha
VITE_HOLDING_SUPABASE_URL=https://fxsakrshmldmkdmbevna.supabase.co
VITE_HOLDING_SUPABASE_ANON_KEY=<anon key>
VITE_CASHFLOW_API=https://bebidas-control.vercel.app/api/cashflow-export
```

## URL alternativa (mirror)

**https://bebidas-control.vercel.app/holding/#/hr**

Usa HashRouter — rotas com `#` (ex: `#/logistica`, `#/investimentos`).

## Design — Clássico vs Moderno

Sidebar inferior → **Design → Clássico | Moderno**

| Tema | Descrição |
|------|-----------|
| Clássico | Escuro dourado (original) |
| Moderno | Apple-style, fundo claro, azul #0071e3, cards com sombra |

Pode alternar a qualquer momento — preferência salva no navegador.

## Links

| Módulo | URL |
|--------|-----|
| Dashboard | https://jbm-master.vercel.app/ |
| HR | https://jbm-master.vercel.app/hr |
| Logística | https://jbm-master.vercel.app/logistica |
| Investimentos | https://jbm-master.vercel.app/investimentos |
