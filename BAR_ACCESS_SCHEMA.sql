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

do $$ begin
  create policy "auth time_clock" on time_clock for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

select 'Bar access + time clock schema ready' as status;
