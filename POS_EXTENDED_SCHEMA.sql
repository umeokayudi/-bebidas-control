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
