# 🍺 Bebidas Control — Guia de instalação completo

## O que você vai criar
Um sistema web com login, banco de dados na nuvem, acesso para funcionários,
histórico completo e relatórios mensais. Tudo gratuito para começar.

---

## PASSO 1 — Criar conta no GitHub (guarda o código)

1. Acesse **github.com** e clique em "Sign up"
2. Crie uma conta com seu e-mail
3. Confirme o e-mail

---

## PASSO 2 — Subir o código para o GitHub

1. Acesse **github.com/new** (criar novo repositório)
2. Nome: `bebidas-control`
3. Deixe como **Private** (privado)
4. Clique em "Create repository"
5. Baixe o **GitHub Desktop** em desktop.github.com
6. Abra o GitHub Desktop → "Add an Existing Repository" → selecione a pasta do projeto
7. Clique em "Publish repository"

---

## PASSO 3 — Criar banco de dados no Supabase (GRATUITO)

1. Acesse **supabase.com** e clique em "Start your project"
2. Faça login com o GitHub (mais fácil)
3. Clique em **"New project"**
   - Nome: `bebidas-control`
   - Senha do banco: anote em algum lugar seguro
   - Região: **Northeast Asia (Tokyo)** ← escolha essa pois você está no Japão
4. Aguarde ~2 minutos enquanto o projeto é criado

### Criar as tabelas:
5. No menu lateral, clique em **"SQL Editor"**
6. Clique em **"New query"**
7. Abra o arquivo `src/lib/supabase.js` deste projeto
8. Copie todo o bloco de SQL que está nos comentários (entre `/* ... */`)
9. Cole no editor do Supabase e clique em **"Run"** (ou Ctrl+Enter)
10. Você verá "Success" — as tabelas foram criadas!

### Pegar as chaves:
11. No menu lateral, clique em **"Project Settings"** (ícone de engrenagem)
12. Clique em **"API"**
13. Copie e salve:
    - **Project URL** → algo como `https://xyzxyz.supabase.co`
    - **anon public** key → string longa começando com `eyJ...`

---

## PASSO 4 — Pegar a chave da Anthropic (IA para ler notas)

1. Acesse **console.anthropic.com**
2. Crie uma conta
3. Vá em **"API Keys"** → **"Create Key"**
4. Copie a chave (começa com `sk-ant-...`)
5. **IMPORTANTE:** guarde essa chave, ela não aparece de novo

---

## PASSO 5 — Publicar no Vercel (o site fica no ar)

1. Acesse **vercel.com** e clique em "Sign Up"
2. Faça login com o GitHub
3. Clique em **"Add New Project"**
4. Selecione o repositório `bebidas-control`
5. Antes de clicar em Deploy, clique em **"Environment Variables"**
6. Adicione as 3 variáveis:

   | Name | Value |
   |------|-------|
   | `VITE_SUPABASE_URL` | `https://seucodigo.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `eyJ...` (a chave anon do Supabase) |
   | `VITE_ANTHROPIC_KEY` | `sk-ant-...` (a chave da Anthropic) |

7. Clique em **"Deploy"**
8. Aguarde ~1 minuto
9. Você receberá um link como `https://bebidas-control.vercel.app` ← **esse é o seu site!**

---

## PASSO 6 — Criar o seu usuário admin

1. Acesse o link do seu site
2. Clique em "Criar agora" e faça o cadastro com seu e-mail
3. Verifique o e-mail e confirme
4. Agora vá ao **Supabase → Table Editor → perfis**
5. Encontre seu usuário e mude o campo `role` de `funcionario` para `admin`
6. Pronto! Você agora tem acesso total, incluindo a aba "Usuários"

---

## PASSO 7 — Adicionar funcionários

1. Compartilhe o link do site com cada funcionário
2. Eles criam conta própria
3. Você vai na aba **Usuários** do sistema e define o papel de cada um

---

## Domínio personalizado (opcional, ~¥1.500/ano)

Se quiser um endereço próprio como `bebidas.suaempresa.com`:
1. Compre um domínio no **Namecheap.com** ou **お名前.com**
2. No Vercel → Settings → Domains → adicione o domínio
3. Siga as instruções para apontar o DNS

---

## Custos

| Serviço | Plano gratuito inclui | Custo se precisar de mais |
|---------|----------------------|--------------------------|
| Supabase | 500MB banco, 50.000 usuários | ~$25/mês |
| Vercel | Sites ilimitados, 100GB tráfego | ~$20/mês |
| Anthropic | $5 de crédito grátis | ~$0,003 por nota escaneada |

**Para o seu uso, tudo fica GRATUITO por muito tempo.**

---

## Problemas comuns

**"Cannot read properties of undefined"** → as variáveis de ambiente não foram adicionadas no Vercel. Refaça o passo 5.

**Tela branca após login** → execute o SQL do passo 3 novamente no Supabase.

**IA não lê a nota** → verifique se a chave da Anthropic está correta no Vercel.

---

## Atualizar o sistema no futuro

1. Modifique os arquivos
2. No GitHub Desktop, escreva uma mensagem e clique "Commit to main"
3. Clique "Push origin"
4. O Vercel detecta automaticamente e atualiza o site em ~1 minuto

---

Dúvidas? Volte aqui e pergunte — qualquer etapa pode ser detalhada com prints!

---

## SQL ADICIONAL — Tabela de 領収書 (rode no Supabase após o SQL principal)

```sql
create table ryoshusho (
  id uuid default uuid_generate_v4() primary key,
  numero text not null,
  bar_id uuid references bars(id),
  data_emissao date not null,
  periodo_inicio date,
  periodo_fim date,
  subtotal numeric default 0,
  consumo_tax numeric default 0,
  total numeric default 0,
  emitente_nome text,
  emitente_endereco text,
  emitente_tel text,
  emitente_registro text,
  itens jsonb,
  criado_em timestamptz default now()
);
alter table ryoshusho enable row level security;
create policy "leitura autenticada" on ryoshusho for select using (auth.role() = 'authenticated');
create policy "escrita autenticada" on ryoshusho for all using (auth.role() = 'authenticated');
```

## Como gerar a 領収書

1. Vá na aba **領収書** do sistema
2. Selecione o bar (ex: Atomic)
3. Escolha o período (ex: 01/06 a 30/06)
4. O sistema **preenche os itens automaticamente** com base nas vendas registradas
5. Preencha os dados do emitente (seu nome/empresa, endereço, nº de registro)
6. Clique em **"Gerar prévia"** para ver como vai ficar
7. Clique em **"Salvar e imprimir PDF"**
   - Abre a janela de impressão do navegador
   - Escolha **"Salvar como PDF"** ao invés de uma impressora
   - Salve no celular ou envie por mensagem para o cliente
