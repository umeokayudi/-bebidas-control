-- ============================================================
-- PORTAL DO CLIENTE — Cole no Supabase SQL Editor e clique Run
-- ============================================================

-- 1. Adiciona coluna bar_id ao perfil (vincula cliente ao bar)
alter table perfis add column if not exists bar_id uuid references bars(id);

-- 2. Tabela de pedidos dos clientes
create table if not exists pedidos (
  id uuid default uuid_generate_v4() primary key,
  bar_id uuid references bars(id) not null,
  criado_por uuid references perfis(id),
  status text not null default 'pendente', -- pendente | confirmado | entregue | cancelado
  data_pedido date not null default current_date,
  data_entrega_prevista date,
  obs text,
  total_estimado numeric default 0,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

-- 3. Itens dos pedidos
create table if not exists pedidos_itens (
  id uuid default uuid_generate_v4() primary key,
  pedido_id uuid references pedidos(id) on delete cascade,
  produto_id uuid references produtos(id),
  qtd numeric not null,
  preco_unitario numeric not null default 0
);

-- 4. Pagamentos / faturas
create table if not exists faturas (
  id uuid default uuid_generate_v4() primary key,
  bar_id uuid references bars(id) not null,
  venda_id uuid references vendas(id),
  valor numeric not null,
  status text not null default 'pendente', -- pendente | pago | vencido
  data_emissao date not null default current_date,
  data_vencimento date,
  data_pagamento date,
  obs text,
  criado_em timestamptz default now()
);

-- 5. RLS nas novas tabelas
alter table pedidos      enable row level security;
alter table pedidos_itens enable row level security;
alter table faturas      enable row level security;

-- Admin e funcionários veem tudo
create policy "staff lê pedidos"       on pedidos       for select using (auth.role() = 'authenticated');
create policy "staff lê pedidos_itens" on pedidos_itens for select using (auth.role() = 'authenticated');
create policy "staff lê faturas"       on faturas       for select using (auth.role() = 'authenticated');
create policy "staff escreve pedidos"  on pedidos       for all    using (auth.role() = 'authenticated');
create policy "staff escreve pedidos_itens" on pedidos_itens for all using (auth.role() = 'authenticated');
create policy "staff escreve faturas"  on faturas       for all    using (auth.role() = 'authenticated');

-- 6. View para o portal do cliente — vendas do bar dele
create or replace view cliente_vendas as
  select v.*, b.nome as bar_nome
  from vendas v
  join bars b on b.id = v.bar_id
  join perfis p on p.bar_id = v.bar_id and p.id = auth.uid();

-- 7. Função para vincular cliente ao bar
create or replace function vincular_cliente_bar(perfil_id uuid, p_bar_id uuid)
returns void as $$
begin
  update perfis set bar_id = p_bar_id, role = 'cliente' where id = perfil_id;
end;
$$ language plpgsql security definer;

-- 8. Confirma
select 'Portal do cliente configurado!' as status;
