-- Cole no SQL Editor do Supabase (bebidas-control)
-- Corrige: Dashboard/Report mostram "0 compras" porque RLS bloqueia compras importadas por script

ALTER TABLE compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read compras" ON compras;
CREATE POLICY "staff read compras" ON compras
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "staff write compras" ON compras;
CREATE POLICY "staff write compras" ON compras
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "staff read compras_itens" ON compras_itens;
CREATE POLICY "staff read compras_itens" ON compras_itens
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "staff write compras_itens" ON compras_itens;
CREATE POLICY "staff write compras_itens" ON compras_itens
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
