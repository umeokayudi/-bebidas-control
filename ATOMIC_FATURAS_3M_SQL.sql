-- JBM DRINKS — Atomic Bar: 3 faturas (maio/jun/jul) = ¥465.000 total
-- https://supabase.com/dashboard/project/ojirgkqtqvugqktyuhem/sql/new

begin;

delete from faturas
where bar_id = 'b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9'
  and status = 'pendente';

insert into faturas (bar_id, valor, total, pago, status, data_emissao, data_vencimento, periodo_inicio, periodo_fim, obs) values
('b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9', 165000, 165000, 0, 'pendente', '2026-05-31', '2026-06-30', '2026-05-01', '2026-05-31', 'Maio/2026 — fornecimento ¥150.000 + equipamentos limpeza ¥15.000'),
('b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9', 150000, 150000, 0, 'pendente', '2026-06-30', '2026-07-31', '2026-06-01', '2026-06-30', 'Junho/2026 — fornecimento Atomic'),
('b23a5f97-ad4c-4c2a-baa6-72a0d3ba85b9', 150000, 150000, 0, 'pendente', '2026-07-31', '2026-08-31', '2026-07-01', '2026-07-31', 'Julho/2026 — fornecimento Atomic');

commit;

select 'Drinks: 3 faturas Atomic = ¥465.000' as status;
