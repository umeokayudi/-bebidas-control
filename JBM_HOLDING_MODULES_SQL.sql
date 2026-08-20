-- JBM Holding — HR, Logística, Investimentos
-- Cole no SQL Editor: https://supabase.com/dashboard/project/fxsakrshmldmkdmbevna/sql/new

-- ── HR: apresentações de candidatos ─────────────────────────────────────────
create table if not exists hr_presentations (
  id uuid primary key default gen_random_uuid(),
  candidate_name text not null,
  client_company text not null,
  position text,
  presentation_date date not null default current_date,
  status text not null default 'agendada'
    check (status in ('agendada','realizada','aprovada','recusada','cancelada')),
  expected_fee numeric default 0,
  commission_rate numeric default 0,
  notes text,
  created_at timestamptz default now()
);

-- ── HR: comissões a receber (apresentação, colocação, empreiteira) ─────────
create table if not exists hr_commissions (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid references hr_placements(id) on delete set null,
  presentation_id uuid references hr_presentations(id) on delete set null,
  type text not null default 'colocacao'
    check (type in ('apresentacao','colocacao','empreiteira','bonus')),
  candidate_name text not null,
  client_company text not null,
  amount numeric not null default 0,
  due_date date,
  paid_date date,
  status text not null default 'pendente'
    check (status in ('pendente','parcial','pago','cancelado')),
  notes text,
  created_at timestamptz default now()
);

-- ── Logística: trabalhos / fretes com comissão ───────────────────────────────
create table if not exists logistics_jobs (
  id uuid primary key default gen_random_uuid(),
  reference text,
  client_name text not null,
  route_description text,
  job_date date not null default current_date,
  revenue numeric not null default 0,
  cost numeric not null default 0,
  commission numeric not null default 0,
  commission_status text not null default 'pendente'
    check (commission_status in ('pendente','pago','cancelado')),
  status text not null default 'ativo'
    check (status in ('cotacao','ativo','concluido','cancelado')),
  notes text,
  created_at timestamptz default now()
);

-- ── Investimentos em pessoas ─────────────────────────────────────────────────
create table if not exists jbm_investments (
  id uuid primary key default gen_random_uuid(),
  person_name text not null,
  person_ref text,
  unit text default 'HR'
    check (unit in ('HR','KuriPuro','Logistica','Drinks','Holding')),
  investment_type text not null default 'formacao'
    check (investment_type in ('formacao','equipamento','adiantamento','moradia','outro')),
  amount_invested numeric not null default 0,
  invested_at date not null default current_date,
  expected_return_date date,
  expected_return_amount numeric default 0,
  status text not null default 'ativo'
    check (status in ('ativo','retornando','quitado','perda')),
  notes text,
  created_at timestamptz default now()
);

create table if not exists investment_returns (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid not null references jbm_investments(id) on delete cascade,
  amount numeric not null default 0,
  return_date date not null default current_date,
  source text default 'trabalho'
    check (source in ('trabalho','comissao','salario','bonus','outro')),
  notes text,
  created_at timestamptz default now()
);

-- Índices
create index if not exists idx_hr_comm_status on hr_commissions(status);
create index if not exists idx_logistics_comm on logistics_jobs(commission_status);
create index if not exists idx_investments_status on jbm_investments(status);

-- RLS aberto para service_role (painel interno)
alter table hr_presentations enable row level security;
alter table hr_commissions enable row level security;
alter table logistics_jobs enable row level security;
alter table jbm_investments enable row level security;
alter table investment_returns enable row level security;

drop policy if exists "holding read hr_presentations" on hr_presentations;
create policy "holding read hr_presentations" on hr_presentations for all using (true);
drop policy if exists "holding read hr_commissions" on hr_commissions;
create policy "holding read hr_commissions" on hr_commissions for all using (true);
drop policy if exists "holding read logistics_jobs" on logistics_jobs;
create policy "holding read logistics_jobs" on logistics_jobs for all using (true);
drop policy if exists "holding read jbm_investments" on jbm_investments;
create policy "holding read jbm_investments" on jbm_investments for all using (true);
drop policy if exists "holding read investment_returns" on investment_returns;
create policy "holding read investment_returns" on investment_returns for all using (true);

select 'JBM Holding modules tables OK' as status;

-- ── Dados iniciais (opcional — remova se não quiser seed) ───────────────────
insert into hr_presentations (candidate_name, client_company, position, presentation_date, status, expected_fee, notes)
select 'João Silva', 'Restaurante Kodama', 'Limpeza noturna', current_date - 14, 'aprovada', 50000, 'Apresentação HR'
where not exists (select 1 from hr_presentations limit 1);

insert into hr_commissions (type, candidate_name, client_company, amount, due_date, status, notes)
select 'apresentacao', 'João Silva', 'Restaurante Kodama', 50000, current_date + 7, 'pendente', 'Comissão apresentação'
where not exists (select 1 from hr_commissions limit 1);

insert into logistics_jobs (reference, client_name, route_description, job_date, revenue, cost, commission, commission_status, status, notes)
select 'LOG-001', 'Atomic Bar', 'Depósito → Atomic Bar Kinshicho', current_date - 3, 25000, 12000, 8000, 'pendente', 'concluido', 'Entrega bebidas'
where not exists (select 1 from logistics_jobs limit 1);

insert into jbm_investments (person_name, person_ref, unit, investment_type, amount_invested, invested_at, expected_return_date, expected_return_amount, status, notes)
select 'Maria Santos', 'HR-2026-01', 'HR', 'formacao', 150000, current_date - 60, current_date + 300, 200000, 'ativo', 'Curso + visto trabalho'
where not exists (select 1 from jbm_investments limit 1);

insert into investment_returns (investment_id, amount, return_date, source, notes)
select i.id, 30000, current_date - 15, 'trabalho', 'Primeiro retorno mensal'
from jbm_investments i
where i.person_name = 'Maria Santos'
  and not exists (select 1 from investment_returns limit 1);
