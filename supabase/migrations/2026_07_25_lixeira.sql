-- 2026_07_25_lixeira.sql
--
-- Lixeira: excluir passa a ser reversível.
--
-- Hoje `DELETE /api/processos` apaga a linha do banco — sem confirmação,
-- sem registro de quem apagou e sem volta. Um clique errado leva junto o
-- LIP, o histórico e o vínculo com as análises.
--
-- A partir daqui, excluir marca `excluido_em`/`excluido_por`; o processo
-- some das listas e vai para a lixeira do admin, de onde pode ser
-- restaurado ou apagado de vez.
--
-- Vale também para `analises_mac`: análise descartada deve poder voltar.
--
-- Aditiva e idempotente — nada nasce excluído, então nenhum
-- comportamento muda até alguém apagar algo. Reversão no fim.

ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS excluido_em     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS excluido_por    UUID,
  ADD COLUMN IF NOT EXISTS excluido_motivo TEXT;

ALTER TABLE analises_mac
  ADD COLUMN IF NOT EXISTS excluido_em     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS excluido_por    UUID,
  ADD COLUMN IF NOT EXISTS excluido_motivo TEXT;

COMMENT ON COLUMN processos.excluido_em IS
  'Quando foi para a lixeira. NULL = ativo. Exclusao definitiva remove a linha.';
COMMENT ON COLUMN processos.excluido_por IS
  'usuarios.id de quem mandou para a lixeira.';

-- Índices parciais: as listas do dia a dia filtram por "nao excluido", e a
-- lixeira busca justamente o contrario.
CREATE INDEX IF NOT EXISTS idx_processos_ativos
  ON processos (criado_em DESC) WHERE excluido_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_processos_lixeira
  ON processos (excluido_em DESC) WHERE excluido_em IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analises_lixeira
  ON analises_mac (excluido_em DESC) WHERE excluido_em IS NOT NULL;

-- ── REVERSÃO (não rodar junto) ───────────────────────────────────────
-- DROP INDEX IF EXISTS idx_processos_ativos;
-- DROP INDEX IF EXISTS idx_processos_lixeira;
-- DROP INDEX IF EXISTS idx_analises_lixeira;
-- ALTER TABLE processos    DROP COLUMN IF EXISTS excluido_em, DROP COLUMN IF EXISTS excluido_por, DROP COLUMN IF EXISTS excluido_motivo;
-- ALTER TABLE analises_mac DROP COLUMN IF EXISTS excluido_em, DROP COLUMN IF EXISTS excluido_por, DROP COLUMN IF EXISTS excluido_motivo;
