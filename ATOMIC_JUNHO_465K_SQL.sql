-- Cole no SQL Editor do Supabase JBM DRINKS
-- https://supabase.com/dashboard/project/ojirgkqtqvugqktyuhem/sql/new
-- Ajusta dívida Atomic jun/2026 → ¥465.000 e prepara julho para novos lançamentos

begin;

-- Atomic Bar
-- id fixo usado no sistema
-- b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9

-- 1) Remove vendas de junho (detalhe errado — total inflado)
delete from vendas_itens
where venda_id in (
  select id from vendas
  where bar_id = 'b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9'
    and data >= '2026-06-01' and data <= '2026-06-30'
);

delete from vendas
where bar_id = 'b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9'
  and data >= '2026-06-01' and data <= '2026-06-30';

-- 2) Pedidos de junho permanecem em junho (NÃO mover para julho)
-- Se algum pedido foi movido por engano, use REVERT_ATOMIC_PEDIDOS_JUNE.sql

-- 3) Faturas maio/jun/jul = ¥465.000 total
delete from faturas
where bar_id = 'b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9'
  and status = 'pendente';

insert into faturas (
  bar_id, valor, total, pago, status,
  data_emissao, data_vencimento,
  periodo_inicio, periodo_fim, obs
) values (
  'b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9',
  465000, 465000, 0, 'pendente',
  '2026-06-30', '2026-07-31',
  '2026-06-01', '2026-06-30',
  'Fatura jun/2026 — dívida consolidada Atomic (¥465.000)'
);

commit;

select 'Atomic jun/2026 ajustado: dívida ¥465.000' as status;
