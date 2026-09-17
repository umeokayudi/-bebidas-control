-- ============================================================
-- BAR POS PLATFORM — Módulos 1 a 5 (POS, estoque inteligente,
-- staff, drink back, serviços) para a operação do bar.
--
-- Rode DEPOIS de ATOMIC_POS_SCHEMA.sql.
-- Cole no Supabase SQL Editor:
--   https://supabase.com/dashboard/project/ojirgkqtqvugqktyuhem/sql/new
--
-- REGRA DE OURO — não estragar o fornecimento JBM:
--   * Nada aqui altera o significado de `vendas`, `vendas_itens`,
--     `compras`, `faturas` ou `produtos`. O faturamento do balcão vive
--     só em `pos_vendas`.
--   * Todas as instruções são aditivas (create if not exists /
--     add column if not exists), então rodar duas vezes é seguro.
--   * As colunas novas em tabelas JBM (`pedidos`, `estoque_movimentos`)
--     têm DEFAULT, então o código atual continua inserindo sem elas.
-- ============================================================

-- ── Módulo 1+2: configuração do POS por bar ───────────────────
create table if not exists bar_pos_config (
  bar_id uuid primary key references bars(id) on delete cascade,
  hora_abertura smallint not null default 18,
  hora_fechamento smallint not null default 5,
  meta_faturamento_hora numeric not null default 0,
  auto_reorder_enabled boolean not null default false,
  reorder_webhook_url text,
  reorder_cooldown_horas integer not null default 24,
  reorder_multiplicador numeric not null default 2,
  criar_pedido_jbm boolean not null default true,
  drink_back_comissao_pct numeric not null default 20,
  atualizado_em timestamptz default now()
);

-- ── Módulo 2: receita dos drinks do cardápio ──────────────────
-- Liga um drink do `drink_menu` aos produtos JBM que ele consome,
-- permitindo baixa de estoque real a cada venda do POS.
create table if not exists drink_menu_ingredientes (
  id uuid default gen_random_uuid() primary key,
  drink_menu_id uuid references drink_menu(id) on delete cascade,
  produto_id uuid references produtos(id),
  doses numeric not null default 1,
  criado_em timestamptz default now(),
  unique(drink_menu_id, produto_id)
);

-- ── Módulo 2: ordens de reposição geradas pelo POS ────────────
create table if not exists pos_reorder_requests (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) on delete cascade not null,
  produto_id uuid references produtos(id),
  sku text,
  produto_nome text,
  estoque_atual numeric not null default 0,
  minimo numeric not null default 0,
  qtd_sugerida numeric not null default 0,
  status text not null default 'pendente',
  pedido_id uuid references pedidos(id),
  webhook_status text,
  webhook_resposta text,
  payload jsonb,
  disparado_por text default 'pos',
  criado_em timestamptz default now(),
  resolvido_em timestamptz
);

-- ── Módulo 3: staff, custos e salários ────────────────────────
create table if not exists bar_staff (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) on delete cascade not null,
  nome text not null,
  cargo text default 'Bartender',
  tipo_pagamento text not null default 'mensal', -- mensal | diaria | hora
  salario_base numeric not null default 0,
  comissao_pct numeric not null default 0,
  telefone text,
  ativo boolean not null default true,
  notas text,
  criado_em timestamptz default now()
);

create table if not exists bar_staff_turnos (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) on delete cascade not null,
  staff_id uuid references bar_staff(id) on delete cascade,
  data date not null default current_date,
  hora_inicio smallint not null default 18,
  hora_fim smallint not null default 2,
  status text not null default 'escalado', -- escalado | presente | falta
  obs text,
  criado_em timestamptz default now()
);

-- ── Módulo 4: drink back (promoters / hostesses) ──────────────
create table if not exists drink_back_agents (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) on delete cascade not null,
  nome text not null,
  codigo text,
  regiao text,
  cidade text,
  telefone text,
  comissao_pct numeric not null default 20,
  meta_mensal numeric not null default 0,
  ativo boolean not null default true,
  notas text,
  criado_em timestamptz default now()
);

create table if not exists drink_back_comissoes (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) on delete cascade not null,
  agent_id uuid references drink_back_agents(id) on delete cascade,
  pos_venda_id uuid references pos_vendas(id) on delete cascade,
  data date not null default current_date,
  base_valor numeric not null default 0,
  comissao_pct numeric not null default 0,
  comissao_valor numeric not null default 0,
  pago boolean not null default false,
  pago_em timestamptz,
  criado_em timestamptz default now()
);

-- ── Módulo 5: limpeza e manutenção ────────────────────────────
create table if not exists service_orders (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) on delete cascade not null,
  tipo text not null default 'limpeza', -- limpeza | manutencao | outro
  titulo text not null,
  descricao text,
  prioridade text not null default 'normal', -- baixa | normal | alta | urgente
  status text not null default 'aberto', -- aberto | agendado | em_andamento | concluido | cancelado
  agendado_para date,
  concluido_em timestamptz,
  recorrencia text default 'nenhuma', -- nenhuma | semanal | quinzenal | mensal
  fornecedor_nome text,
  custo_estimado numeric default 0,
  custo_final numeric default 0,
  criado_por uuid,
  criado_em timestamptz default now()
);

-- ── Colunas novas em tabelas existentes (todas com default) ───
-- pos_vendas: quem atendeu + qual promoter de drink back + hora
alter table pos_vendas add column if not exists staff_id uuid references bar_staff(id);
alter table pos_vendas add column if not exists drink_back_agent_id uuid references drink_back_agents(id);
alter table pos_vendas add column if not exists drink_back_valor numeric default 0;
alter table pos_vendas add column if not exists hora smallint;

-- pos_vendas_itens: custo estimado do item (margem por drink)
alter table pos_vendas_itens add column if not exists custo_estimado numeric default 0;

-- estoque_movimentos: rastrear baixas automáticas do POS
-- (a coluna `origem` default 'manual' mantém o portal JBM funcionando igual)
alter table estoque_movimentos add column if not exists origem text default 'manual';
alter table estoque_movimentos add column if not exists pos_venda_id uuid references pos_vendas(id) on delete set null;

-- pedidos (bar -> JBM): marcar os gerados pela reposição automática
-- sem mudar nada dos pedidos manuais, que continuam 'manual'.
alter table pedidos add column if not exists origem text default 'manual';

-- ── RLS ───────────────────────────────────────────────────────
alter table bar_pos_config           enable row level security;
alter table drink_menu_ingredientes  enable row level security;
alter table pos_reorder_requests     enable row level security;
alter table bar_staff                enable row level security;
alter table bar_staff_turnos         enable row level security;
alter table drink_back_agents        enable row level security;
alter table drink_back_comissoes     enable row level security;
alter table service_orders           enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'bar_pos_config',
    'drink_menu_ingredientes',
    'pos_reorder_requests',
    'bar_staff',
    'bar_staff_turnos',
    'drink_back_agents',
    'drink_back_comissoes',
    'service_orders'
  ]
  loop
    begin
      execute format(
        'create policy "auth %1$s" on %1$I for all using (auth.role() = ''authenticated'')',
        tbl
      );
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ── Índices ───────────────────────────────────────────────────
create index if not exists idx_pos_vendas_bar_criado     on pos_vendas(bar_id, criado_em desc);
create index if not exists idx_pos_vendas_agent          on pos_vendas(drink_back_agent_id, data desc);
create index if not exists idx_reorder_bar_status         on pos_reorder_requests(bar_id, status, criado_em desc);
create index if not exists idx_reorder_bar_produto        on pos_reorder_requests(bar_id, produto_id, criado_em desc);
create index if not exists idx_staff_turnos_bar_data      on bar_staff_turnos(bar_id, data desc);
create index if not exists idx_drink_back_com_bar_data    on drink_back_comissoes(bar_id, data desc);
create index if not exists idx_service_orders_bar_status  on service_orders(bar_id, status, agendado_para);
create index if not exists idx_estoque_mov_pos_venda      on estoque_movimentos(pos_venda_id);
create index if not exists idx_drink_ingredientes_drink   on drink_menu_ingredientes(drink_menu_id);

select 'Bar POS platform schema ready' as status;
