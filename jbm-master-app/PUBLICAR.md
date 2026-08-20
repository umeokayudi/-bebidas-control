# Publicar jbm-master no GitHub (faça 1 vez)

## 1. Criar o repo no GitHub (copiar e colar no navegador)

https://github.com/new?name=jbm-master

- Owner: **umeokayudi**
- Nome: **jbm-master**
- Público ou Privado (como preferir)
- **Não** marque README (repo vazio)

## 2. Enviar o código (terminal)

```bash
cd jbm-master
git remote add origin https://github.com/umeokayudi/jbm-master.git
git push -u origin main
```

(O código já está pronto em `/workspace/jbm-master` neste ambiente.)

## 3. Vercel — conectar e publicar

https://vercel.com/new

- Import: **umeokayudi/jbm-master**
- Deploy

Ou redeploy do projeto existente:

https://vercel.com/dashboard → **jbm-master** → **Deployments** → **Redeploy**

## O que mudou

- Dashboard, JBM Drinks e Financeiro mostram **cashflow real** do bebidas-control
- Atualiza a cada 30s na tela + sync automático a cada 15 min no Supabase
