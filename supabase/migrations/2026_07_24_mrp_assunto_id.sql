-- 2026_07_24_mrp_assunto_id.sql
--
-- Vincula cada registro de produtividade ao slot (assunto) por chave
-- estrangeira firme, em vez do texto livre `tipo_processo`.
--
-- Motivacao (auditoria 2026-07-24): `mrp_registros.tipo_processo` acumulou
-- 4 grafias para a mesma coisa ("Regularização SEI", "Regularização",
-- "regularizacao", "Aceite SEI") porque o caminho cliente e o caminho
-- servidor gravavam valores diferentes na mesma linha. O filtro do MRP
-- consulta o slug e enxergava 4 de 69 registros de regularizacao.
--
-- A partir daqui:
--   - `assunto_id`     = QUAL SLOT (fonte de verdade, sobrevive a rename)
--   - `tipo_processo`  = slug canonico, mantido para compatibilidade/filtros
--   - `assunto`        = assunto da OBRA extraido do LIP (nunca o nome do slot)
--
-- Idempotente. Reversao: ver bloco no fim.

ALTER TABLE mrp_registros
  ADD COLUMN IF NOT EXISTS assunto_id UUID REFERENCES assuntos(id);

CREATE INDEX IF NOT EXISTS idx_mrp_registros_assunto
  ON mrp_registros (assunto_id);

-- Consultas do painel quase sempre filtram por analista + periodo + slot.
CREATE INDEX IF NOT EXISTS idx_mrp_registros_usuario_assunto_periodo
  ON mrp_registros (usuario_id, assunto_id, ano, mes);

COMMENT ON COLUMN mrp_registros.assunto_id IS
  'Slot (assuntos.id) que originou o despacho. Fonte de verdade do vinculo — '
  'renomear o slot NAO altera o historico. `tipo_processo` guarda o slug '
  'canonico correspondente, mantido para filtros legados.';

COMMENT ON COLUMN mrp_registros.assunto IS
  'Assunto da OBRA extraido do LIP (tipo_obra / uso / descricao_assunto). '
  'NAO confundir com o nome do slot — para isso use assunto_id.';

-- ─────────────────────────────────────────────────────────────────────
-- REVERSAO (nao rodar junto):
--   DROP INDEX IF EXISTS idx_mrp_registros_usuario_assunto_periodo;
--   DROP INDEX IF EXISTS idx_mrp_registros_assunto;
--   ALTER TABLE mrp_registros DROP COLUMN IF EXISTS assunto_id;
-- ─────────────────────────────────────────────────────────────────────
