-- ============================================================
-- PLATAFORMA DE GESTÃO COMPLETA PARA BARES (ALL-IN-ONE POS & ERP)
-- Módulos: POS, Faturamento por Hora, Estoque Inteligente, Staff,
-- Drink Back Promoters, Serviços Integrados & Webhook de Reposição.
-- ATENÇÃO: Totalmente isolado do fornecimento JBM (vendas distribuidora).
-- ============================================================

-- 1. Preços por garrafa e shots do bar (relação produto JBM -> drinks do bar)
create table if not exists bar_pricing (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  produto_id uuid references produtos(id) not null,
  drinks_por_garrafa numeric not null default 16,
  preco_drink numeric not null default 0,
  criado_em timestamptz default now(),
  unique(bar_id, produto_id)
);

-- 2. Cardápio / drinks do bar
create table if not exists drink_menu (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  nome text not null,
  categoria text default 'Cocktail',
  receita text,
  copo text,
  preco_venda numeric not null default 0,
  custo numeric default 0,
  margem numeric default 0,
  preco_desconto numeric default 500,
  notas text,
  custom boolean default true,
  ativo boolean default true,
  criado_em timestamptz default now()
);

-- 3. Gestão de Staff, Custos e Salários
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

-- 4. Escalas de horários e turnos do staff
create table if not exists staff_turnos (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  staff_id uuid references bar_staff(id) on delete cascade,
  data date not null default current_date,
  hora_inicio text not null default '18:00',
  hora_fim text not null default '02:00',
  status text default 'agendado', -- agendado, presente, falta, concluido
  valor_turno numeric default 0,
  notas text,
  criado_em timestamptz default now()
);

-- 5. Gestão de Drink Back (Promoters / Hostesses)
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

-- 6. Vendas POS (balcão — isolado do fornecimento distribuidora JBM)
create table if not exists pos_vendas (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  data date not null default current_date,
  hora time default current_time,
  subtotal numeric not null default 0,
  desconto_total numeric default 0,
  total numeric not null default 0,
  metodo_pagamento text default 'Cash',
  tipo text default 'balcao',
  vip_member_id uuid,
  discount_code_id uuid,
  staff_id uuid references bar_staff(id) on delete set null,
  drink_back_agent_id uuid references drink_back_agents(id) on delete set null,
  comissao_drink_back numeric default 0,
  obs text,
  criado_por uuid,
  criado_em timestamptz default now()
);

-- Colunas retrocompatíveis caso pos_vendas já exista
alter table pos_vendas add column if not exists hora time default current_time;
alter table pos_vendas add column if not exists staff_id uuid references bar_staff(id) on delete set null;
alter table pos_vendas add column if not exists drink_back_agent_id uuid references drink_back_agents(id) on delete set null;
alter table pos_vendas add column if not exists comissao_drink_back numeric default 0;

-- 7. Itens das vendas POS
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
  desconto_valor numeric default 0,
  drink_back_agent_id uuid references drink_back_agents(id) on delete set null,
  comissao_item numeric default 0
);

alter table pos_vendas_itens add column if not exists drink_back_agent_id uuid references drink_back_agents(id) on delete set null;
alter table pos_vendas_itens add column if not exists comissao_item numeric default 0;

-- 8. Membros VIP e usos
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

-- 9. Códigos de desconto
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

-- 10. Serviços Integrados (Limpeza profissional & Manutenção preventiva)
create table if not exists service_orders (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  tipo text not null default 'limpeza', -- limpeza, manutencao, eletrica, refrigeracao, outro
  titulo text not null,
  descricao text,
  prioridade text default 'media', -- baixa, media, alta, urgente
  status text default 'solicitado', -- solicitado, agendado, em_andamento, concluido, cancelado
  data_agendada date,
  hora_agendada text,
  prestador_nome text,
  valor_estimado numeric default 0,
  valor_final numeric default 0,
  notas text,
  criado_por uuid,
  criado_em timestamptz default now()
);

-- 11. Configuração de Webhook de Reposição Automática
create table if not exists pos_reorder_settings (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null unique,
  webhook_url text,
  auto_order_jbm boolean default true,
  email_notificacao text,
  ativo boolean default true,
  atualizado_em timestamptz default now()
);

-- 12. Log de disparos de reposição automática
create table if not exists pos_reorder_logs (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  produto_id uuid references produtos(id),
  stock_atual numeric not null,
  minimo numeric not null,
  qtd_sugerida numeric not null,
  tipo text default 'jbm_pedido', -- jbm_pedido, webhook, ambos
  status text default 'sucesso',
  detalhes jsonb,
  criado_em timestamptz default now()
);

-- RLS
alter table bar_staff enable row level security;
alter table staff_turnos enable row level security;
alter table drink_back_agents enable row level security;
alter table service_orders enable row level security;
alter table pos_reorder_settings enable row level security;
alter table pos_reorder_logs enable row level security;

do $$ begin
  create policy "auth bar_staff" on bar_staff for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "auth staff_turnos" on staff_turnos for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "auth drink_back_agents" on drink_back_agents for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "auth service_orders" on service_orders for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "auth pos_reorder_settings" on pos_reorder_settings for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "auth pos_reorder_logs" on pos_reorder_logs for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- Índices de performance
create index if not exists idx_pos_vendas_bar_data on pos_vendas(bar_id, data desc);
create index if not exists idx_pos_vendas_hora on pos_vendas(bar_id, data, hora);
create index if not exists idx_pos_vendas_drink_back on pos_vendas(bar_id, drink_back_agent_id);
create index if not exists idx_staff_turnos_bar_data on staff_turnos(bar_id, data desc);
create index if not exists idx_service_orders_bar on service_orders(bar_id, status);

select 'Plataforma Bar POS & ERP Schema instalado com sucesso' as status;
