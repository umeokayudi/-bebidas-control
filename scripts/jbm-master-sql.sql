-- Cole no SQL Editor do Supabase JBM DRINKS (bebidas-control)
-- Link: https://supabase.com/dashboard/project/ojirgkqtqvugqktyuhem/sql/new
-- Isso faz o jbm-master.vercel.app ler os números certos SEM redeploy

-- VENDAS: jbm-master usa data_venda e total_pago
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS data_venda date;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS total_pago numeric;
UPDATE vendas SET
  data_venda = COALESCE(data_venda, data::date),
  total_pago = COALESCE(total_pago, total::numeric)
WHERE data IS NOT NULL;

-- COMPRAS: jbm-master usa data_compra
ALTER TABLE compras ADD COLUMN IF NOT EXISTS data_compra date;
UPDATE compras SET
  data_compra = COALESCE(data_compra, data::date)
WHERE data IS NOT NULL;

-- Manter sincronizado em novos registros
CREATE OR REPLACE FUNCTION public.jbm_sync_vendas_cols()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.data_venda := COALESCE(NEW.data_venda, NEW.data::date);
  NEW.total_pago := COALESCE(NEW.total_pago, NEW.total::numeric);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jbm_sync_vendas_cols ON vendas;
CREATE TRIGGER jbm_sync_vendas_cols
  BEFORE INSERT OR UPDATE ON vendas
  FOR EACH ROW EXECUTE FUNCTION public.jbm_sync_vendas_cols();

CREATE OR REPLACE FUNCTION public.jbm_sync_compras_cols()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.data_compra := COALESCE(NEW.data_compra, NEW.data::date);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jbm_sync_compras_cols ON compras;
CREATE TRIGGER jbm_sync_compras_cols
  BEFORE INSERT OR UPDATE ON compras
  FOR EACH ROW EXECUTE FUNCTION public.jbm_sync_compras_cols();
