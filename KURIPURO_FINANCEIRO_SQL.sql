-- KuriPuro holding — já aplicado em 2026-08-20
-- https://supabase.com/dashboard/project/fxsakrshmldmkdmbevna/sql/new

-- Atomic Bar (bf3f7ab5): maio ¥165k + jun ¥150k + jul ¥150k
-- On The Planet ago/2026: desconto ¥132k Kodama Kinshicho (reclamação)

begin;

delete from faturas where client_id = 'bf3f7ab5-24c4-4ec1-b25f-d91becb166de';

insert into faturas (client_id, client_name, period_start, period_end, issue_date, due_date, subtotal, tax_amount, total, status, notes) values
('bf3f7ab5-24c4-4ec1-b25f-d91becb166de', 'Atomic Bar', '2026-05-01', '2026-05-31', '2026-05-31', '2026-06-30', 165000, 0, 165000, 'pending', 'Maio/2026 — limpeza ¥150.000 + equipamentos ¥15.000'),
('bf3f7ab5-24c4-4ec1-b25f-d91becb166de', 'Atomic Bar', '2026-06-01', '2026-06-30', '2026-06-30', '2026-07-31', 150000, 0, 150000, 'pending', 'Junho/2026 — limpeza Atomic'),
('bf3f7ab5-24c4-4ec1-b25f-d91becb166de', 'Atomic Bar', '2026-07-01', '2026-07-31', '2026-07-31', '2026-08-31', 150000, 0, 150000, 'pending', 'Julho/2026 — limpeza Atomic (KuriPuro)');

update clients set notes = 'Daily Cleaning + Deep Cleaning. Ago/2026: desconto ¥132.000 (isenção Kodama Kinshicho — reclamação).'
where id = '7138f082-0d38-43e4-bd77-00c4598690b3';

delete from cashflow where description ilike '%On The Planet ago/2026%';

insert into cashflow (entry_type, category, description, amount, entry_date) values
('expense', 'desconto_cliente', 'On The Planet ago/2026 — desconto ¥132.000 (isenção cobrança Kodama Kinshicho, reclamação)', 132000, '2026-08-01');

commit;
