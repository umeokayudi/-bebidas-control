-- Opcional: colunas dedicadas para preço com/sem imposto e variação
-- Cole no Supabase SQL Editor se quiser campos estruturados (o app também usa `notas`)

alter table fornecedor_precos
  add column if not exists preco_sem_imposto numeric,
  add column if not exists preco_anterior numeric,
  add column if not exists variacao_pct numeric;

comment on column fornecedor_precos.preco is 'Preço 税込 (com 10% consumo)';
comment on column fornecedor_precos.preco_sem_imposto is 'Preço 税抜 da nota do fornecedor';
