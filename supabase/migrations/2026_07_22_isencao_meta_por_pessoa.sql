-- Isenção de meta por pessoa, versionada por data de vigência.
--
-- Gerências e Diretoria não têm meta de produtividade. Mas isso não pode ser
-- lido do perfil atual: gerente pode voltar a analista e analista pode virar
-- gerente. Se a isenção fosse derivada do perfil de hoje, trocar o perfil de
-- alguém reescreveria a avaliação de meses já fechados — nos dois sentidos.
--
-- A mesma tabela da meta geral passa a aceitar linhas por pessoa:
--   usuario_id IS NULL  → regra geral (meta de todo mundo)
--   usuario_id = X      → regra específica de X, prevalece sobre a geral
--   isento = true       → sem meta naquele período
--   isento = false      → usa `meta` se preenchida; senão cai na regra geral
--
-- Administrador NÃO é isento: acumula chefia e produção.

ALTER TABLE mrp_meta_historico
  ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS isento BOOLEAN NOT NULL DEFAULT false;

-- meta passa a ser opcional (nula quando isento).
ALTER TABLE mrp_meta_historico ALTER COLUMN meta DROP NOT NULL;

-- A unicidade era só por data, o que impediria duas pessoas com vigência no
-- mesmo dia. Passa a ser: uma linha geral por data, e uma linha por pessoa
-- por data.
ALTER TABLE mrp_meta_historico DROP CONSTRAINT IF EXISTS mrp_meta_historico_vigente_desde_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mrp_meta_geral
  ON mrp_meta_historico (vigente_desde) WHERE usuario_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mrp_meta_usuario
  ON mrp_meta_historico (usuario_id, vigente_desde) WHERE usuario_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mrp_meta_usuario_vigencia
  ON mrp_meta_historico (usuario_id, vigente_desde DESC);

COMMENT ON COLUMN mrp_meta_historico.usuario_id IS
  'NULL = regra geral. Preenchido = regra específica da pessoa, prevalece sobre a geral.';
COMMENT ON COLUMN mrp_meta_historico.isento IS
  'true = sem meta no período (Gerência/Diretoria). Administrador não é isento.';
