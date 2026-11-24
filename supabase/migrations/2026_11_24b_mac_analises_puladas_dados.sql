-- 2026_11_24b — pular análise passa a exigir o nº do despacho/parecer e a data da análise feita em outro
-- ambiente (Fábio, 24/11/2026), para os despachos e pareceres mostrarem essas informações.
-- Nulas no banco só por causa de marcas criadas antes desta regra; a ROTA exige os dois em marca nova.
ALTER TABLE mac_analises_puladas ADD COLUMN IF NOT EXISTS numero_documento text;
ALTER TABLE mac_analises_puladas ADD COLUMN IF NOT EXISTS data_documento date;
-- Desfazer: ALTER TABLE mac_analises_puladas DROP COLUMN numero_documento, DROP COLUMN data_documento;
