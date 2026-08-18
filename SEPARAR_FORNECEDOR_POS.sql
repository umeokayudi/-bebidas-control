-- Separar fornecedor (JBM) vs POS (faturamento do bar)
alter table vendas add column if not exists origem text default 'fornecedor';

update vendas set origem = 'pos'
where obs ilike '%balcão%' or obs ilike '%balcao%' or obs ilike '%square%' or cast_id is not null;

update vendas set origem = 'fornecedor'
where origem is null or (origem <> 'pos' and obs ilike 'Auto: order%');

-- Apagar vendas POS da tabela fornecedor (opcional — descomente se quiser)
-- delete from vendas_itens where venda_id in (select id from vendas where origem = 'pos');
-- delete from vendas where origem = 'pos';

select origem, count(*) from vendas group by origem;
