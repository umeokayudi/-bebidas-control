-- ============================================================
-- BAR POS COMPLETO — Módulos 1..5 (ADITIVO, não toca JBM fornecedor)
-- Como aplicar: Supabase SQL Editor -> colar e Run.
-- Seguro: só CREATE TABLE IF NOT EXISTS + policies IF NOT EXISTS.
-- NÃO altera: vendas, vendas_itens, produtos, faturas, compras.
-- Tabelas POS usadas aqui têm prefixo pos_ / drink_back_ / service_.
-- ============================================================

-- ── Módulo 3: Staff do bar (POS) ─────────────────────────────
create table if not exists pos_staff (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) on delete cascade not null,
  nome text not null,
  cargo text default 'Atendente',
  salario_base numeric default 0,
  comissao_pct numeric default 0,
  telefone text,
  ativo boolean default true,
  criado_em timestamptz default now()
);

create table if not exists pos_shifts (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) on delete cascade not null,
  staff_id uuid references pos_staff(id) on delete set null,
  data date not null default current_date,
  hora_inicio time,
  hora_fim time,
  observacao text,
  criado_em timestamptz default now()
);

-- ── Módulo 4: Drink Back (promoters / hostesses) ─────────────
-- Separado de vip_members (que é cartão/VIP). Aqui é agente + comissionamento.
create table if not exists drink_back_agents (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) on delete cascade not null,
  nome text not null,
  codigo text,
  regiao text,
  telefone text,
  comissao_pct numeric default 10,
  meta_mensal numeric default 0,
  ativo boolean default true,
  notas text,
  criado_em timestamptz default now()
);

-- Vincula uma venda POS (pos_vendas) à promoter — NÃO toca vendas (JBM).
create table if not exists drink_back_sales (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) on delete cascade not null,
  agent_id uuid references drink_back_agents(id) on delete set null,
  pos_venda_id uuid references pos_vendas(id) on delete set null,
  valor_venda numeric not null default 0,
  comissao_valor numeric not null default 0,
  criado_por uuid,
  criado_em timestamptz default now()
);

-- ── Módulo 2: Estoque do bar (POS) + reposição ───────────────
-- NÃO altera produtos. Estoque POS é por bar + produto OU drink.
create table if not exists pos_stock (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) on delete cascade not null,
  produto_id uuid references produtos(id) on delete set null,
  drink_menu_id uuid references drink_menu(id) on delete set null,
  current_stock numeric not null default 0,
  min_stock_level numeric not null default 5,
  unidade text default 'un',
  atualizado_em timestamptz default now(),
  unique(bar_id, produto_id, drink_menu_id)
);

-- Ordens de recompra geradas pelo gatilho (log auditável + webhook).
create table if not exists pos_reorder_orders (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) on delete cascade not null,
  produto_id uuid references produtos(id) on delete set null,
  drink_menu_id uuid references drink_menu(id) on delete set null,
  sku_nome text not null,
  estoque_atual numeric default 0,
  estoque_minimo numeric default 0,
  qtd_sugerida numeric default 0,
  status text default 'pendente',
  webhook_status text default 'nao_enviado',
  webhook_payload jsonb,
  criado_em timestamptz default now()
);

-- ── Módulo 5: Serviços (limpeza & manutenção) ────────────────
create table if not exists service_orders (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) on delete cascade not null,
  tipo text not null default 'limpeza',
  titulo text not null,
  descricao text,
  data_agendada date,
  status text default 'aberto',
  custo numeric default 0,
  prestador text,
  criado_por uuid,
  criado_em timestamptz default now()
);

-- ── RLS (leitura/escrita autenticada — mesmo padrão do POS) ──
alter table pos_staff enable row level security;
alter table pos_shifts enable row level security;
alter table drink_back_agents enable row level security;
alter table drink_back_sales enable row level security;
alter table pos_stock enable row level security;
alter table pos_reorder_orders enable row level security;
alter table service_orders enable row level security;

do $$ begin
  create policy "auth pos_staff" on pos_staff for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "auth pos_shifts" on pos_shifts for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "auth drink_back_agents" on drink_back_agents for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "auth drink_back_sales" on drink_back_sales for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "auth pos_stock" on pos_stock for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "auth pos_reorder_orders" on pos_reorder_orders for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "auth service_orders" on service_orders for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- ── Índices ──────────────────────────────────────────────────
create index if not exists idx_pos_staff_bar on pos_staff(bar_id);
create index if not exists idx_pos_shifts_bar_data on pos_shifts(bar_id, data desc);
create index if not exists idx_drink_back_agents_bar on drink_back_agents(bar_id);
create index if not exists idx_drink_back_sales_bar on drink_back_sales(bar_id, criado_em desc);
create index if not exists idx_pos_stock_bar on pos_stock(bar_id);
create index if not exists idx_pos_reorder_bar on pos_reorder_orders(bar_id, criado_em desc);
create index if not exists idx_service_orders_bar on service_orders(bar_id, data_agendada);

select 'Bar POS completo ready (JBM fornecedor intacto)' as status;
