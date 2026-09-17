-- ============================================================
-- BAR POS — Sistema de gestão do bar (POS, estoque, staff,
-- drink back, serviços, reposição automática)
-- Cole no Supabase SQL Editor (projeto Drinks ojirgkqtqvugqktyuhem):
-- https://supabase.com/dashboard/project/ojirgkqtqvugqktyuhem/sql/new
--
-- Idempotente: pode rodar várias vezes. Só cria/adiciona — nunca
-- altera tabelas do fornecedor (vendas, compras, faturas, pedidos).
-- Vendas de balcão ficam em pos_vendas (separadas de vendas JBM).
-- ============================================================

-- ── 0. Base POS (mesmo conteúdo de ATOMIC_POS_SCHEMA.sql) ────────────────────
create table if not exists bar_pricing (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  produto_id uuid references produtos(id) not null,
  drinks_por_garrafa numeric not null default 16,
  preco_drink numeric not null default 0,
  criado_em timestamptz default now(),
  unique(bar_id, produto_id)
);

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

-- ── 1. Estoque do bar (usado pelo portal; garante existência) ────────────────
create table if not exists estoque_movimentos (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id),
  produto_id uuid references produtos(id) not null,
  tipo text not null default 'saida',            -- entrada | saida
  qtd numeric not null default 1,
  obs text,
  criado_por uuid,
  criado_em timestamptz default now()
);

create table if not exists estoque_regras (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  produto_id uuid references produtos(id) not null,
  minimo numeric not null default 0,             -- reorder point
  criado_em timestamptz default now(),
  unique(bar_id, produto_id)
);

-- Baixa fracionada (1 shot = 1/16 garrafa) exige qtd numeric
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'estoque_movimentos' and column_name = 'qtd' and data_type in ('integer', 'bigint', 'smallint')
  ) then
    alter table estoque_movimentos alter column qtd type numeric using qtd::numeric;
  end if;
end $$;

alter table estoque_movimentos add column if not exists pos_venda_id uuid references pos_vendas(id) on delete set null;
alter table estoque_movimentos add column if not exists origem text default 'manual'; -- manual | pos | compra

-- ── 2. Staff do bar (funcionários, salários, turnos) ─────────────────────────
create table if not exists bar_staff (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  nome text not null,
  cargo text default 'Bartender',
  salario_base numeric default 0,
  comissao_pct numeric default 0,                -- % sobre vendas POS vinculadas
  telefone text,
  ativo boolean default true,
  notas text,
  criado_em timestamptz default now()
);

create table if not exists bar_turnos (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  staff_id uuid references bar_staff(id) on delete cascade,
  data date not null,
  hora_inicio time not null default '18:00',
  hora_fim time not null default '02:00',
  obs text,
  criado_em timestamptz default now()
);

-- ── 3. Drink back (promoters / hostesses) ───────────────────────────────────
create table if not exists drink_back_agents (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  nome text not null,
  apelido text,
  regiao text,                                   -- mapeamento regional
  telefone text,
  comissao_pct numeric default 10,               -- % sobre o valor do drink
  comissao_fixa numeric default 0,               -- ¥ fixo por drink (opcional)
  meta_mensal numeric default 0,                 -- meta em ¥ de vendas/mês
  ativo boolean default true,
  notas text,
  criado_em timestamptz default now()
);

-- ── 4. Vínculos da venda POS (staff, drink back, mesa) ──────────────────────
alter table pos_vendas add column if not exists staff_id uuid references bar_staff(id) on delete set null;
alter table pos_vendas add column if not exists drink_back_agent_id uuid references drink_back_agents(id) on delete set null;
alter table pos_vendas add column if not exists comissao_drink_back numeric default 0;
alter table pos_vendas add column if not exists comissao_staff numeric default 0;
alter table pos_vendas add column if not exists custo_total numeric default 0;
alter table pos_vendas add column if not exists mesa text;
alter table pos_vendas_itens add column if not exists custo_unitario numeric default 0;

-- ── 5. Receita do drink → produtos JBM (baixa de estoque automática) ────────
create table if not exists drink_menu_ingredientes (
  id uuid default gen_random_uuid() primary key,
  drink_menu_id uuid references drink_menu(id) on delete cascade not null,
  produto_id uuid references produtos(id) not null,
  ml numeric not null default 30,                -- ml do produto por drink
  criado_em timestamptz default now(),
  unique(drink_menu_id, produto_id)
);

-- ── 6. Serviços integrados (limpeza & manutenção) ───────────────────────────
create table if not exists service_orders (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  tipo text not null default 'limpeza',          -- limpeza | manutencao
  titulo text not null,
  descricao text,
  prioridade text default 'media',               -- baixa | media | alta
  status text not null default 'aberto',         -- aberto | agendado | em_andamento | concluido | cancelado
  data_agendada date,
  hora_agendada time,
  fornecedor text,                               -- ex.: KuriPuro
  custo numeric default 0,
  recorrencia text default 'nenhuma',            -- nenhuma | semanal | mensal
  criado_por uuid,
  criado_em timestamptz default now(),
  concluido_em timestamptz
);

create table if not exists service_order_eventos (
  id uuid default gen_random_uuid() primary key,
  service_order_id uuid references service_orders(id) on delete cascade not null,
  status text not null,
  nota text,
  criado_por uuid,
  criado_em timestamptz default now()
);

-- ── 7. Reposição automática (log + config) ──────────────────────────────────
create table if not exists pos_config (
  bar_id uuid references bars(id) primary key,
  auto_pedido boolean default true,              -- cria pedido JBM ao atingir mínimo
  webhook_url text,                              -- Make.com / operação central
  dias_cobertura integer default 7,              -- qtd sugerida cobre N dias de consumo
  hora_abre text default '18:00',
  hora_fecha text default '02:00',
  atualizado_em timestamptz default now()
);

create table if not exists pos_reposicao_eventos (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  produto_id uuid references produtos(id) not null,
  pos_venda_id uuid references pos_vendas(id) on delete set null,
  pedido_id uuid references pedidos(id) on delete set null,
  estoque_atual numeric not null default 0,
  minimo numeric not null default 0,
  qtd_sugerida numeric not null default 1,
  webhook_status text default 'pendente',        -- pendente | enviado | erro | sem_webhook
  webhook_resposta text,
  payload jsonb,
  criado_em timestamptz default now()
);

-- ── 8. RLS (mesmo padrão do restante do sistema: authenticated) ─────────────
do $$
declare t text;
begin
  foreach t in array array[
    'bar_pricing','drink_menu','pos_vendas','pos_vendas_itens','vip_members','vip_usages',
    'discount_codes','discount_usages','estoque_movimentos','estoque_regras',
    'bar_staff','bar_turnos','drink_back_agents','drink_menu_ingredientes',
    'service_orders','service_order_eventos','pos_config','pos_reposicao_eventos'
  ] loop
    execute format('alter table %I enable row level security', t);
    begin
      execute format('create policy %L on %I for all using (auth.role() = %L)', 'auth ' || t, t, 'authenticated');
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ── 9. Índices ──────────────────────────────────────────────────────────────
create index if not exists idx_pos_vendas_bar_data on pos_vendas(bar_id, data desc);
create index if not exists idx_pos_vendas_bar_criado on pos_vendas(bar_id, criado_em desc);
create index if not exists idx_pos_vendas_staff on pos_vendas(staff_id);
create index if not exists idx_pos_vendas_agent on pos_vendas(drink_back_agent_id);
create index if not exists idx_vip_usages_bar on vip_usages(bar_id, criado_em desc);
create index if not exists idx_discount_codes_bar on discount_codes(bar_id, codigo);
create index if not exists idx_estoque_mov_bar_prod on estoque_movimentos(bar_id, produto_id);
create index if not exists idx_bar_turnos_bar_data on bar_turnos(bar_id, data);
create index if not exists idx_service_orders_bar_status on service_orders(bar_id, status);
create index if not exists idx_reposicao_bar_criado on pos_reposicao_eventos(bar_id, criado_em desc);

select 'Bar POS schema ready' as status;
