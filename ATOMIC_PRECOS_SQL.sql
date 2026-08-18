-- ============================================================
-- ATOMIC BAR — Catálogo de preços JBM (fornecedor)
-- Cole no Supabase SQL Editor se precisar recriar o bar ou rodar como admin
-- ============================================================

-- 1. Garantir que o Atomic Bar existe
insert into bars (nome, cor)
select 'Atomic Bar', '#C19C56'
where not exists (select 1 from bars where lower(nome) like '%atomic%');

-- 2. View produtos para pedidos — só estoque fornecedor (sem POS/menu)
create or replace view produtos_public as
select
  id, nome, categoria, preco_venda, preco_bar, volume_ml,
  drinks_por_garrafa, preco_drink, ativo, criado_em
from produtos
where ativo = true
  and categoria not in (
    'Highball', 'Food', 'Bottle', 'Premium', 'Soft',
    'suco', 'cha', 'licor', 'rum', 'mixer', 'vinho',
    'Cerveja', 'Soft Drinks', 'Liqueurs'
  )
  and preco_venda not in (1000, 2000);

-- 3. Nota: faturas Atomic listam preço 税別 (sem imposto).
--    produtos.preco_venda = 税込 (zeikomi) = round(zeibetsu × 1.1)
--    Menu/copo do bar → drink_menu / bar_pricing (separado)

select 'Atomic supplier catalog ready' as status;
