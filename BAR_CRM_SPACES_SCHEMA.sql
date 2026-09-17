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
