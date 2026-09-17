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

-- Fila de reposição do POS. Não cria pedidos nem vendas da JBM:
-- apenas registra o alerta para integração via webhook.
create table if not exists pos_restock_alerts (
  id uuid default gen_random_uuid() primary key,
  bar_id uuid references bars(id) not null,
  produto_id uuid references produtos(id) not null,
  pos_venda_id uuid references pos_vendas(id),
  estoque_atual numeric not null,
  estoque_minimo numeric not null,
  quantidade_sugerida numeric not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  webhook_error text,
  criado_em timestamptz default now(),
  enviado_em timestamptz
);

create unique index if not exists idx_pos_restock_pending
  on pos_restock_alerts(bar_id, produto_id)
  where status = 'pending';

-- Acesso por bar. Administradores JBM continuam com visão global, mas um
-- cliente só pode ler/escrever dados POS do bar vinculado ao próprio perfil.
create or replace function can_access_bar(target_bar_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from perfis
    where id = auth.uid()
      and (role = 'admin' or bar_id = target_bar_id)
  );
$$;

grant execute on function can_access_bar(uuid) to authenticated;

-- RLS
alter table bar_pricing enable row level security;
alter table drink_menu enable row level security;
alter table pos_vendas enable row level security;
alter table pos_vendas_itens enable row level security;
alter table vip_members enable row level security;
alter table vip_usages enable row level security;
alter table discount_codes enable row level security;
alter table discount_usages enable row level security;
alter table pos_restock_alerts enable row level security;

drop policy if exists "auth bar_pricing" on bar_pricing;
drop policy if exists "auth drink_menu" on drink_menu;
drop policy if exists "auth pos_vendas" on pos_vendas;
drop policy if exists "auth pos_vendas_itens" on pos_vendas_itens;
drop policy if exists "auth vip_members" on vip_members;
drop policy if exists "auth vip_usages" on vip_usages;
drop policy if exists "auth discount_codes" on discount_codes;
drop policy if exists "auth discount_usages" on discount_usages;
drop policy if exists "bar scoped bar_pricing" on bar_pricing;
drop policy if exists "bar scoped drink_menu" on drink_menu;
drop policy if exists "bar scoped pos_vendas" on pos_vendas;
drop policy if exists "bar scoped pos_vendas_itens" on pos_vendas_itens;
drop policy if exists "bar scoped vip_members" on vip_members;
drop policy if exists "bar scoped vip_usages" on vip_usages;
drop policy if exists "bar scoped discount_codes" on discount_codes;
drop policy if exists "bar scoped discount_usages" on discount_usages;
drop policy if exists "bar scoped pos_restock_alerts" on pos_restock_alerts;

create policy "bar scoped bar_pricing" on bar_pricing for all
  using (can_access_bar(bar_id)) with check (can_access_bar(bar_id));
create policy "bar scoped drink_menu" on drink_menu for all
  using (can_access_bar(bar_id)) with check (can_access_bar(bar_id));
create policy "bar scoped pos_vendas" on pos_vendas for all
  using (can_access_bar(bar_id)) with check (can_access_bar(bar_id));
create policy "bar scoped pos_vendas_itens" on pos_vendas_itens for all
  using (exists (
    select 1 from pos_vendas sale
    where sale.id = pos_venda_id and can_access_bar(sale.bar_id)
  ))
  with check (exists (
    select 1 from pos_vendas sale
    where sale.id = pos_venda_id and can_access_bar(sale.bar_id)
  ));
create policy "bar scoped vip_members" on vip_members for all
  using (can_access_bar(bar_id)) with check (can_access_bar(bar_id));
create policy "bar scoped vip_usages" on vip_usages for all
  using (can_access_bar(bar_id)) with check (can_access_bar(bar_id));
create policy "bar scoped discount_codes" on discount_codes for all
  using (can_access_bar(bar_id)) with check (can_access_bar(bar_id));
create policy "bar scoped discount_usages" on discount_usages for all
  using (can_access_bar(bar_id)) with check (can_access_bar(bar_id));
create policy "bar scoped pos_restock_alerts" on pos_restock_alerts for all
  using (can_access_bar(bar_id)) with check (can_access_bar(bar_id));

-- Registra a venda inteira em uma única transação. A função só toca tabelas
-- pos_* / VIP / desconto e estoque operacional do bar; nunca toca vendas,
-- vendas_itens, pedidos ou faturas da operação fornecedora JBM.
create or replace function register_pos_sale(
  p_bar_id uuid,
  p_criado_por uuid,
  p_metodo_pagamento text,
  p_tipo text,
  p_vip_member_id uuid,
  p_discount_code_id uuid,
  p_subtotal numeric,
  p_desconto_total numeric,
  p_total numeric,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_sale pos_vendas;
  item record;
  item_subtotal numeric;
  item_total numeric;
  bottle_usage numeric;
  current_stock numeric;
  minimum_stock numeric;
  alerts_created integer := 0;
begin
  if auth.uid() is null or not can_access_bar(p_bar_id) then
    raise exception 'Acesso negado para este bar';
  end if;
  if p_criado_por is distinct from auth.uid() then
    raise exception 'Operador inválido';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A venda precisa ter ao menos um item';
  end if;

  select
    coalesce(sum(x.preco_lista * x.qtd), 0),
    coalesce(sum(x.preco_unitario * x.qtd), 0)
  into item_subtotal, item_total
  from jsonb_to_recordset(p_items) as x(
    qtd numeric,
    preco_unitario numeric,
    preco_lista numeric
  );

  if item_subtotal <> p_subtotal
    or item_total <> p_total
    or greatest(0, item_subtotal - item_total) <> p_desconto_total then
    raise exception 'Totais da venda são inconsistentes';
  end if;
  if p_total < 0 or p_subtotal < p_total then
    raise exception 'Valores da venda são inválidos';
  end if;
  if p_tipo not in ('balcao', 'vip', 'desconto') then
    raise exception 'Tipo de venda inválido';
  end if;

  if p_vip_member_id is not null and not exists (
    select 1 from vip_members where id = p_vip_member_id and bar_id = p_bar_id and ativo
  ) then
    raise exception 'Membro VIP inválido';
  end if;
  if p_discount_code_id is not null and not exists (
    select 1 from discount_codes
    where id = p_discount_code_id
      and bar_id = p_bar_id
      and ativo
      and (valido_ate is null or valido_ate >= current_date)
      and (max_usos is null or usos_atual < max_usos)
  ) then
    raise exception 'Código de desconto inválido ou esgotado';
  end if;

  insert into pos_vendas (
    bar_id, data, subtotal, desconto_total, total, metodo_pagamento, tipo,
    vip_member_id, discount_code_id, criado_por
  ) values (
    p_bar_id, current_date, p_subtotal, p_desconto_total, p_total,
    p_metodo_pagamento, p_tipo, p_vip_member_id, p_discount_code_id, auth.uid()
  )
  returning * into new_sale;

  for item in
    select * from jsonb_to_recordset(p_items) as x(
      drink_menu_id uuid,
      produto_id uuid,
      nome text,
      qtd numeric,
      preco_unitario numeric,
      preco_lista numeric,
      tipo_preco text,
      desconto_valor numeric
    )
  loop
    if item.qtd <= 0 or item.preco_unitario < 0 then
      raise exception 'Item POS inválido';
    end if;
    if item.drink_menu_id is not null and not exists (
      select 1 from drink_menu where id = item.drink_menu_id and bar_id = p_bar_id
    ) then
      raise exception 'Item não pertence ao cardápio deste bar';
    end if;
    if item.produto_id is not null and not exists (
      select 1 from bar_pricing where produto_id = item.produto_id and bar_id = p_bar_id
    ) then
      raise exception 'Produto não configurado para este bar';
    end if;

    insert into pos_vendas_itens (
      pos_venda_id, drink_menu_id, produto_id, nome, qtd, preco_unitario,
      preco_lista, tipo_preco, desconto_valor
    ) values (
      new_sale.id, item.drink_menu_id, item.produto_id, item.nome, item.qtd,
      item.preco_unitario, item.preco_lista, item.tipo_preco, item.desconto_valor
    );

    if p_vip_member_id is not null then
      insert into vip_usages (
        bar_id, vip_member_id, drink_menu_id, produto_id, nome, qtd,
        preco_aplicado, preco_lista, tipo, pos_venda_id, criado_por
      ) values (
        p_bar_id, p_vip_member_id, item.drink_menu_id, item.produto_id,
        item.nome, item.qtd, item.preco_unitario, item.preco_lista, 'vip',
        new_sale.id, auth.uid()
      );
    end if;

    if item.produto_id is not null then
      select item.qtd / nullif(drinks_por_garrafa, 0)
      into bottle_usage
      from bar_pricing
      where bar_id = p_bar_id and produto_id = item.produto_id;

      insert into estoque_movimentos (
        produto_id, bar_id, tipo, qtd, criado_por, obs
      ) values (
        item.produto_id, p_bar_id, 'saida', bottle_usage, auth.uid(),
        'POS sale ' || new_sale.id::text
      );

      select coalesce(sum(case when tipo = 'entrada' then qtd else -qtd end), 0)
      into current_stock
      from estoque_movimentos
      where bar_id = p_bar_id and produto_id = item.produto_id;

      select minimo into minimum_stock
      from estoque_regras
      where bar_id = p_bar_id and produto_id = item.produto_id;

      if minimum_stock is not null and current_stock <= minimum_stock then
        insert into pos_restock_alerts (
          bar_id, produto_id, pos_venda_id, estoque_atual, estoque_minimo,
          quantidade_sugerida
        ) values (
          p_bar_id, item.produto_id, new_sale.id, current_stock, minimum_stock,
          greatest((minimum_stock * 2) - current_stock, 1)
        )
        on conflict (bar_id, produto_id) where status = 'pending' do nothing;
        if found then alerts_created := alerts_created + 1; end if;
      end if;
    end if;
  end loop;

  if p_discount_code_id is not null then
    update discount_codes
    set usos_atual = usos_atual + 1
    where id = p_discount_code_id;
    insert into discount_usages (
      bar_id, discount_code_id, pos_venda_id, valor_desconto
    ) values (
      p_bar_id, p_discount_code_id, new_sale.id, p_desconto_total
    );
  end if;

  return jsonb_build_object(
    'sale_id', new_sale.id,
    'total', new_sale.total,
    'restock_alerts_created', alerts_created
  );
end;
$$;

revoke all on function register_pos_sale(uuid, uuid, text, text, uuid, uuid, numeric, numeric, numeric, jsonb) from public;
grant execute on function register_pos_sale(uuid, uuid, text, text, uuid, uuid, numeric, numeric, numeric, jsonb) to authenticated;

-- Índices
create index if not exists idx_pos_vendas_bar_data on pos_vendas(bar_id, data desc);
create index if not exists idx_vip_usages_bar on vip_usages(bar_id, criado_em desc);
create index if not exists idx_discount_codes_bar on discount_codes(bar_id, codigo);

select 'Atomic POS schema ready' as status;
