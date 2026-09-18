-- ============================================================
-- ATOMIC POS — Vendas balcão, VIP, códigos de desconto
-- Cole no Supabase SQL Editor: https://supabase.com/dashboard/project/ojirgkqtqvugqktyuhem/sql/new
-- Ou: POST /api/setup-atomic-pos { "confirm": "atomic-pos-2026" }
-- ============================================================

-- Preços por garrafa (shots)
create table if not exists bar_pricing (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  produto_id uuid references produtos(id) not null,
  drinks_por_garrafa numeric not null default 16,
  preco_drink numeric not null default 0,
  criado_em timestamptz default now(),
  unique(bar_id, produto_id)
);

-- Cardápio / drinks do bar
create table if not exists drink_menu (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  nome text not null,
  categoria text default 'Custom',
  receita text,
  copo text,
  preco_venda numeric not null default 0,
  custo numeric default 0,
  margem numeric default 0,
  preco_desconto numeric default 500,
  notas text,
  custom boolean default true,
  criado_em timestamptz default now()
);

-- Vendas POS (balcão — separado de vendas fornecedor)
create table if not exists pos_vendas (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  data date not null default current_date,
  subtotal numeric not null default 0,
  desconto_total numeric default 0,
  total numeric not null default 0,
  metodo_pagamento text default 'Cash',
  tipo text default 'balcao',
  vip_member_id uuid,
  discount_code_id uuid,
  obs text,
  criado_por uuid,
  criado_em timestamptz default now()
);

create table if not exists pos_vendas_itens (
  id uuid default gen_random_uuid() primary key,
  pos_venda_id uuid references pos_vendas(id) on delete cascade,
  drink_menu_id uuid references drink_menu(id),
  produto_id uuid references produtos(id),
  nome text not null,
  qtd numeric not null default 1,
  preco_unitario numeric not null,
  preco_lista numeric,
  tipo_preco text default 'regular',
  desconto_valor numeric default 0
);

-- Membros VIP
create table if not exists vip_members (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  nome text not null,
  codigo text,
  tier text default 'standard',
  ativo boolean default true,
  notas text,
  criado_em timestamptz default now()
);

-- Registro de uso VIP
create table if not exists vip_usages (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  vip_member_id uuid references vip_members(id),
  drink_menu_id uuid references drink_menu(id),
  produto_id uuid references produtos(id),
  nome text not null,
  qtd numeric not null default 1,
  preco_aplicado numeric not null,
  preco_lista numeric,
  tipo text default 'vip',
  pos_venda_id uuid references pos_vendas(id),
  obs text,
  criado_por uuid,
  criado_em timestamptz default now()
);

-- Códigos de desconto
create table if not exists discount_codes (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  codigo text not null,
  descricao text,
  tipo text not null default 'percent',
  valor numeric not null,
  drink_menu_id uuid references drink_menu(id),
  produto_id uuid references produtos(id),
  max_usos integer,
  usos_atual integer default 0,
  valido_ate date,
  ativo boolean default true,
  criado_em timestamptz default now(),
  unique(bar_id, codigo)
);

create table if not exists discount_usages (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  discount_code_id uuid references discount_codes(id),
  pos_venda_id uuid references pos_vendas(id),
  valor_desconto numeric not null default 0,
  criado_em timestamptz default now()
);

-- Staff, turnos e salários
create table if not exists bar_staff (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  nome text not null,
  cargo text default 'Bartender',
  telefone text,
  email text,
  salario_base numeric default 0,
  comissao_pct numeric default 0,
  ativo boolean default true,
  criado_em timestamptz default now()
);

create table if not exists staff_turnos (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  staff_id uuid references bar_staff(id) on delete cascade,
  data date not null default current_date,
  hora_inicio text not null default '18:00',
  hora_fim text not null default '02:00',
  status text default 'agendado',
  valor_turno numeric default 0,
  notas text,
  criado_em timestamptz default now()
);

-- Drink Back (Promoters / Hostesses)
create table if not exists drink_back_agents (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  nome text not null,
  apelido text,
  regiao text default 'Tokyo',
  telefone text,
  chave_pix_ou_conta text,
  comissao_drink_fixa numeric default 500,
  comissao_pct numeric default 10,
  metas_mensal_drinks integer default 50,
  ativo boolean default true,
  notas text,
  criado_em timestamptz default now()
);

-- Serviços Integrados (Limpeza & Manutenção)
create table if not exists service_orders (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  tipo text not null default 'limpeza',
  titulo text not null,
  descricao text,
  prioridade text default 'media',
  status text default 'solicitado',
  data_agendada date,
  hora_agendada text,
  prestador_nome text,
  valor_estimado numeric default 0,
  valor_final numeric default 0,
  notas text,
  criado_por uuid,
  criado_em timestamptz default now()
);

-- Reposição Automática
create table if not exists pos_reorder_settings (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null unique,
  webhook_url text,
  auto_order_jbm boolean default true,
  email_notificacao text,
  ativo boolean default true,
  atualizado_em timestamptz default now()
);

alter table pos_vendas add column if not exists hora time default current_time;
alter table pos_vendas add column if not exists staff_id uuid references bar_staff(id) on delete set null;
alter table pos_vendas add column if not exists drink_back_agent_id uuid references drink_back_agents(id) on delete set null;
alter table pos_vendas add column if not exists comissao_drink_back numeric default 0;

-- RLS
alter table bar_pricing enable row level security;
alter table drink_menu enable row level security;
alter table pos_vendas enable row level security;
alter table pos_vendas_itens enable row level security;
alter table vip_members enable row level security;
alter table vip_usages enable row level security;
alter table discount_codes enable row level security;
alter table discount_usages enable row level security;

do $$ begin
  create policy "auth bar_pricing" on bar_pricing for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "auth drink_menu" on drink_menu for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "auth pos_vendas" on pos_vendas for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "auth pos_vendas_itens" on pos_vendas_itens for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "auth vip_members" on vip_members for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "auth vip_usages" on vip_usages for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "auth discount_codes" on discount_codes for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "auth discount_usages" on discount_usages for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- Índices
create index if not exists idx_pos_vendas_bar_data on pos_vendas(bar_id, data desc);
create index if not exists idx_vip_usages_bar on vip_usages(bar_id, criado_em desc);
create index if not exists idx_discount_codes_bar on discount_codes(bar_id, codigo);

select 'Atomic POS schema ready' as status;
