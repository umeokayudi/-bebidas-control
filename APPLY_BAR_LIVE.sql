-- ONE PASTE: POS + CRM + clock. Does not touch JBM vendas/pedidos/faturas.

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

-- RLS
alter table bar_pricing enable row level security;
alter table drink_menu enable row level security;
alter table pos_vendas enable row level security;
alter table pos_vendas_itens enable row level security;
alter table vip_members enable row level security;
alter table vip_usages enable row level security;
alter table discount_codes enable row level security;
alter table discount_usages enable row level security;

-- RLS: dono/caixa do bar vê só o próprio bar; JBM (admin/funcionario/staff) vê todos.
-- bar_staff não lê vendas POS. Não usa auth.role()='authenticated'.

drop policy if exists "auth bar_pricing" on bar_pricing;
drop policy if exists "auth drink_menu" on drink_menu;
drop policy if exists "auth pos_vendas" on pos_vendas;
drop policy if exists "auth pos_vendas_itens" on pos_vendas_itens;
drop policy if exists "auth vip_members" on vip_members;
drop policy if exists "auth vip_usages" on vip_usages;
drop policy if exists "auth discount_codes" on discount_codes;
drop policy if exists "auth discount_usages" on discount_usages;

drop policy if exists "bar_or_jbm bar_pricing" on bar_pricing;
drop policy if exists "bar_or_jbm drink_menu" on drink_menu;
drop policy if exists "bar_or_jbm pos_vendas" on pos_vendas;
drop policy if exists "bar_or_jbm pos_vendas_itens" on pos_vendas_itens;
drop policy if exists "bar_or_jbm vip_members" on vip_members;
drop policy if exists "bar_or_jbm vip_usages" on vip_usages;
drop policy if exists "bar_or_jbm discount_codes" on discount_codes;
drop policy if exists "bar_or_jbm discount_usages" on discount_usages;

create or replace function public.pos_can_access_bar(target_bar uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from perfis p
    where p.id = auth.uid()
      and (
        p.role in ('admin', 'funcionario', 'staff')
        or (p.bar_id = target_bar and p.role in ('cliente', 'caixa'))
      )
  );
$$;

do $$ begin
  create policy "bar_or_jbm bar_pricing" on bar_pricing for all using (public.pos_can_access_bar(bar_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "bar_or_jbm drink_menu" on drink_menu for all using (public.pos_can_access_bar(bar_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "bar_or_jbm pos_vendas" on pos_vendas for all using (public.pos_can_access_bar(bar_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "bar_or_jbm pos_vendas_itens" on pos_vendas_itens for all
    using (exists (select 1 from pos_vendas v where v.id = pos_venda_id and public.pos_can_access_bar(v.bar_id)));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "bar_or_jbm vip_members" on vip_members for all using (public.pos_can_access_bar(bar_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "bar_or_jbm vip_usages" on vip_usages for all using (public.pos_can_access_bar(bar_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "bar_or_jbm discount_codes" on discount_codes for all using (public.pos_can_access_bar(bar_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "bar_or_jbm discount_usages" on discount_usages for all using (public.pos_can_access_bar(bar_id));
exception when duplicate_object then null; end $$;

-- Índices
create index if not exists idx_pos_vendas_bar_data on pos_vendas(bar_id, data desc);
create index if not exists idx_vip_usages_bar on vip_usages(bar_id, criado_em desc);
create index if not exists idx_discount_codes_bar on discount_codes(bar_id, codigo);

select 'Atomic POS schema ready' as status;

-- ============================================================
-- POS EXTENDED — Drink Back + vínculo com vendas POS
-- Execute APÓS ATOMIC_POS_SCHEMA.sql
-- Não altera tabelas de fornecimento JBM (vendas, pedidos, etc.)
-- ============================================================

-- Promoters / hostesses (drink back)
create table if not exists drink_back_agents (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  nome text not null,
  regiao text,
  comissao_pct numeric not null default 10,
  ativo boolean default true,
  notas text,
  criado_em timestamptz default now()
);

-- Vínculo opcional de promoter na venda POS
alter table pos_vendas add column if not exists drink_back_agent_id uuid references drink_back_agents(id);

create index if not exists idx_drink_back_agents_bar on drink_back_agents(bar_id, ativo);
create index if not exists idx_pos_vendas_agent on pos_vendas(drink_back_agent_id) where drink_back_agent_id is not null;

alter table drink_back_agents enable row level security;

do $$ begin
  create policy "auth drink_back_agents" on drink_back_agents for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

select 'POS extended schema ready' as status;

-- ============================================================
-- ACESSO DO BAR + PONTO ELETRÔNICO (tablet do local)
-- Não altera tabelas de fornecimento JBM (vendas, pedidos, faturas).
-- ============================================================

alter table bars add column if not exists lat double precision;
alter table bars add column if not exists lng double precision;
alter table bars add column if not exists geofence_m integer default 150;
alter table bars add column if not exists tablet_token_hash text;

alter table perfis add column if not exists cargo text;
alter table perfis add column if not exists salario_hora numeric default 0;
alter table perfis add column if not exists clock_pin_hash text;
alter table perfis add column if not exists ativo boolean default true;

create table if not exists time_clock (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  staff_id uuid references perfis(id) not null,
  tipo text not null check (tipo in ('in', 'out')),
  punched_at timestamptz not null default now(),
  lat double precision,
  lng double precision,
  accuracy_m numeric,
  distance_m numeric,
  tablet_ok boolean default false,
  origem text default 'tablet',
  criado_em timestamptz default now()
);

create index if not exists idx_time_clock_bar_staff on time_clock(bar_id, staff_id, punched_at desc);

alter table time_clock enable row level security;

drop policy if exists "auth time_clock" on time_clock;
drop policy if exists "bar time_clock" on time_clock;

do $$ begin
  create policy "bar time_clock" on time_clock for all using (
    exists (
      select 1 from perfis p
      where p.id = auth.uid()
        and (
          p.role in ('admin', 'funcionario', 'staff')
          or (p.bar_id = time_clock.bar_id and p.role in ('cliente', 'caixa'))
          or (p.id = time_clock.staff_id and p.bar_id = time_clock.bar_id)
        )
    )
  );
exception when duplicate_object then null; end $$;

select 'Bar access + time clock schema ready' as status;

-- ============================================================
-- BAR CRM + SPACES — hóspedes, piso, visitas, ボトルキープ
-- Não altera fornecimento JBM: vendas, pedidos, faturas, compras.
-- Liga só a pos_vendas (caixa do bar).
-- Cole no Supabase SQL Editor DEPOIS de ATOMIC_POS_SCHEMA.sql
-- Reexecutável (if not exists).
-- ============================================================

create table if not exists bar_spaces (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  nome text not null,
  tipo text not null default 'table',
  capacidade integer not null default 2,
  zona text default 'floor',
  ordem integer default 0,
  cor text,
  ativo boolean default true,
  notas text,
  criado_em timestamptz default now()
);

create table if not exists bar_guests (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  nome text not null,
  telefone text,
  line_id text,
  email text,
  aniversario date,
  tags text[] default '{}',
  preferencias text,
  alergias text,
  notas text,
  preferred_host text,
  vip_member_id uuid references vip_members(id),
  ativo boolean default true,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

alter table bar_guests add column if not exists preferred_host text;

create table if not exists bar_visits (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  space_id uuid references bar_spaces(id),
  guest_id uuid references bar_guests(id),
  vip_member_id uuid references vip_members(id),
  status text not null default 'seated',
  party_size integer default 1,
  host_nome text,
  inicio timestamptz default now(),
  fim timestamptz,
  obs text,
  pos_venda_id uuid references pos_vendas(id),
  criado_por uuid,
  criado_em timestamptz default now()
);

alter table bar_visits add column if not exists host_nome text;

-- ボトルキープ: serviço do bar, não é venda JBM e não baixa estoque.
create table if not exists bar_bottle_keeps (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  guest_id uuid references bar_guests(id) not null,
  nome text not null,
  remaining_pct integer not null default 100,
  opened_on date,
  expires_on date,
  notas text,
  ativo boolean default true,
  criado_em timestamptz default now()
);

alter table pos_vendas add column if not exists space_id uuid references bar_spaces(id);
alter table pos_vendas add column if not exists guest_id uuid references bar_guests(id);
alter table pos_vendas add column if not exists visit_id uuid references bar_visits(id);

create index if not exists idx_bar_spaces_bar on bar_spaces(bar_id, ativo, ordem);
create index if not exists idx_bar_guests_bar on bar_guests(bar_id, nome);
create index if not exists idx_bar_visits_bar on bar_visits(bar_id, status, inicio desc);
create index if not exists idx_bar_keeps_guest on bar_bottle_keeps(bar_id, guest_id, ativo);
create index if not exists idx_pos_vendas_guest on pos_vendas(guest_id) where guest_id is not null;
create index if not exists idx_pos_vendas_space on pos_vendas(space_id) where space_id is not null;

alter table bar_spaces enable row level security;
alter table bar_guests enable row level security;
alter table bar_visits enable row level security;
alter table bar_bottle_keeps enable row level security;

drop policy if exists "bar_or_jbm bar_spaces" on bar_spaces;
drop policy if exists "bar_or_jbm bar_guests" on bar_guests;
drop policy if exists "bar_or_jbm bar_visits" on bar_visits;
drop policy if exists "bar_or_jbm bar_bottle_keeps" on bar_bottle_keeps;

do $$ begin
  create policy "bar_or_jbm bar_spaces" on bar_spaces for all using (public.pos_can_access_bar(bar_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "bar_or_jbm bar_guests" on bar_guests for all using (public.pos_can_access_bar(bar_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "bar_or_jbm bar_visits" on bar_visits for all using (public.pos_can_access_bar(bar_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "bar_or_jbm bar_bottle_keeps" on bar_bottle_keeps for all using (public.pos_can_access_bar(bar_id));
exception when duplicate_object then null; end $$;

select 'Bar CRM + spaces + bottle keep ready (JBM supply untouched)' as status;

-- Bar HQ overhead (rent) — never mixed with POS till or JBM vendas/faturas
create table if not exists bar_overhead (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  kind text not null default 'rent',
  month_key text not null,
  amount numeric not null default 0,
  note text,
  criado_em timestamptz default now(),
  unique(bar_id, kind, month_key)
);
alter table bar_overhead enable row level security;
do $$ begin
  create policy "bar_or_jbm bar_overhead" on bar_overhead for all using (public.pos_can_access_bar(bar_id));
exception when duplicate_object then null; end $$;

create table if not exists bar_hq_meta (
  id uuid primary key,
  bar_id uuid references bars(id) not null,
  last_sync timestamptz,
  sources jsonb,
  atualizado_em timestamptz default now()
);
alter table bar_hq_meta enable row level security;
do $$ begin
  create policy "bar_or_jbm bar_hq_meta" on bar_hq_meta for all using (public.pos_can_access_bar(bar_id));
exception when duplicate_object then null; end $$;

select 'Bar HQ rent + sync meta ready (JBM supply untouched)' as status;

-- Allow caixa / bar_staff and keep Auth signup from 500ing
alter table public.perfis drop constraint if exists perfis_role_check;
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, nome, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'staff')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
