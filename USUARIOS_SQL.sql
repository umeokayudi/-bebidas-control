-- ============================================================
-- USUÁRIOS / PORTAL — Cole no Supabase SQL Editor e clique Run
-- ============================================================

-- 1. Email no perfil (login usa auth.users; perfis.email = cópia editável)
alter table perfis add column if not exists email text;

-- 2. Garantir bar_id (portal do cliente)
alter table perfis add column if not exists bar_id uuid references bars(id);

-- 3. Atomic Bar (ajuste o nome se necessário)
insert into bars (nome, cor)
select 'Atomic Bar', '#C19C56'
where not exists (
  select 1 from bars where lower(nome) like '%atomic%'
);

-- 4. Sincronizar emails existentes auth → perfis (rode uma vez)
update perfis p
set email = u.email
from auth.users u
where p.id = u.id
  and (p.email is null or p.email = '');

-- 5. Perfis sem bar para role cliente — corrija manualmente na aba Users
--    ou: update perfis set bar_id = (select id from bars where nome ilike '%atomic%' limit 1)
--        where role = 'cliente' and bar_id is null;

select 'Usuarios SQL applied' as status;
