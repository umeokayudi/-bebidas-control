import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

/* ─────────────────────────────────────────────────────────────
   COLE ESTE SQL NO EDITOR DO SUPABASE (SQL Editor → New Query)
   ─────────────────────────────────────────────────────────────

-- Extensão para UUIDs
create extension if not exists "uuid-ossp";

-- Perfis de usuário (ligado ao auth do Supabase)
create table perfis (
  id uuid references auth.users on delete cascade primary key,
  nome text not null,
  role text not null default 'funcionario', -- 'admin' ou 'funcionario'
  criado_em timestamptz default now()
);

-- Bares / clientes
create table bars (
  id uuid default uuid_generate_v4() primary key,
  nome text not null,
  cor text default '#185FA5',
  criado_em timestamptz default now()
);

-- Produtos / bebidas
create table produtos (
  id uuid default uuid_generate_v4() primary key,
  nome text not null,
  categoria text not null,
  custo numeric not null default 0,
  preco_venda numeric not null default 0,
  ativo boolean default true,
  criado_em timestamptz default now()
);

-- Compras (notas fiscais)
create table compras (
  id uuid default uuid_generate_v4() primary key,
  data date not null,
  fornecedor text not null,
  pagamento text not null,
  subtotal numeric default 0,
  desconto_pontos numeric default 0,
  total_pago numeric default 0,
  total_real numeric default 0,
  pontos_ganhos integer default 0,
  obs text,
  imagem_url text,
  criado_por uuid references perfis(id),
  criado_em timestamptz default now()
);

-- Itens de cada compra
create table compras_itens (
  id uuid default uuid_generate_v4() primary key,
  compra_id uuid references compras(id) on delete cascade,
  nome text not null,
  qtd numeric not null,
  custo_unitario numeric not null
);

-- Vendas para os bares
create table vendas (
  id uuid default uuid_generate_v4() primary key,
  data date not null,
  bar_id uuid references bars(id),
  total numeric default 0,
  obs text,
  criado_por uuid references perfis(id),
  criado_em timestamptz default now()
);

-- Itens de cada venda
create table vendas_itens (
  id uuid default uuid_generate_v4() primary key,
  venda_id uuid references vendas(id) on delete cascade,
  produto_id uuid references produtos(id),
  qtd numeric not null,
  preco_unitario numeric not null
);

-- Row Level Security: cada usuário só vê dados da empresa
alter table perfis       enable row level security;
alter table bars         enable row level security;
alter table produtos     enable row level security;
alter table compras      enable row level security;
alter table compras_itens enable row level security;
alter table vendas       enable row level security;
alter table vendas_itens enable row level security;

-- Políticas: qualquer usuário autenticado lê tudo
create policy "leitura autenticada" on perfis        for select using (auth.role() = 'authenticated');
create policy "leitura autenticada" on bars          for select using (auth.role() = 'authenticated');
create policy "leitura autenticada" on produtos      for select using (auth.role() = 'authenticated');
create policy "leitura autenticada" on compras       for select using (auth.role() = 'authenticated');
create policy "leitura autenticada" on compras_itens for select using (auth.role() = 'authenticated');
create policy "leitura autenticada" on vendas        for select using (auth.role() = 'authenticated');
create policy "leitura autenticada" on vendas_itens  for select using (auth.role() = 'authenticated');

-- Políticas de escrita: qualquer autenticado pode inserir/editar
create policy "escrita autenticada" on bars          for all using (auth.role() = 'authenticated');
create policy "escrita autenticada" on produtos      for all using (auth.role() = 'authenticated');
create policy "escrita autenticada" on compras       for all using (auth.role() = 'authenticated');
create policy "escrita autenticada" on compras_itens for all using (auth.role() = 'authenticated');
create policy "escrita autenticada" on vendas        for all using (auth.role() = 'authenticated');
create policy "escrita autenticada" on vendas_itens  for all using (auth.role() = 'authenticated');

-- Trigger para criar perfil automaticamente no cadastro
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into perfis (id, nome, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.email), 'funcionario');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Dados iniciais de exemplo
insert into bars (nome, cor) values ('Atomic', '#185FA5'), ('Bar do Mário', '#1D9E75');
insert into produtos (nome, categoria, custo, preco_venda) values
  ('Asahi 500ml',          'Cerveja', 220, 600),
  ('Kirin Ichiban 350ml',  'Cerveja', 180, 500),
  ('Hakutsuru Sake 720ml', 'Sake',    820, 1800),
  ('Iichiko Shochu 720ml', 'Shochu',  960, 2200),
  ('Suntory Highball',     'Whisky',  150, 550);

*/
