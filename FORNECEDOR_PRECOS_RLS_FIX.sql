-- Cole no SQL Editor do Supabase (bebidas-control)
-- Permite que staff autenticado leia/edite preços de fornecedor no painel

ALTER TABLE fornecedor_precos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read fornecedor_precos" ON fornecedor_precos;
CREATE POLICY "staff read fornecedor_precos" ON fornecedor_precos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "staff write fornecedor_precos" ON fornecedor_precos;
CREATE POLICY "staff write fornecedor_precos" ON fornecedor_precos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
