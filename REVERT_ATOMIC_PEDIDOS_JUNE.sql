-- Cole no SQL Editor do Supabase JBM DRINKS
-- https://supabase.com/dashboard/project/ojirgkqtqvugqktyuhem/sql/new
-- Reverte pedidos Atomic movidos erroneamente de junho para julho

begin;

update pedidos set
  data_pedido = case
    when criado_em::text like '2026-06%' then left(criado_em::text, 10)
    when criado_em::text like '2026-07%' then replace(left(criado_em::text, 10), '2026-07-', '2026-06-')
    else '2026-06-15'
  end,
  data_entrega_prevista = case
    when criado_em::text like '2026-06%' then left(criado_em::text, 10)
    when criado_em::text like '2026-07%' then replace(left(criado_em::text, 10), '2026-07-', '2026-06-')
    else '2026-06-15'
  end,
  criado_em = case
    when criado_em::text like '2026-07%' then replace(criado_em::text, '2026-07-', '2026-06-')::timestamptz
    else criado_em
  end,
  obs = nullif(trim(regexp_replace(coalesce(obs, ''), '\[movido de jun→jul 2026\]', '', 'gi')), '')
where bar_id = 'b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9'
  and obs ilike '%movido de jun%jul%';

commit;

select count(*) as pedidos_revertidos
from pedidos
where bar_id = 'b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9'
  and data_pedido >= '2026-06-01' and data_pedido <= '2026-06-30'
  and status = 'pendente';
