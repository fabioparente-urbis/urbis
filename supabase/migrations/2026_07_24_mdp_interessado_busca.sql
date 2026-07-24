-- 2026_07_24_mdp_interessado_busca.sql
--
-- MDP: mostrar e permitir buscar pelo INTERESSADO, além do número do
-- processo, ignorando acentos e caixa.
--
-- Contexto (auditoria 2026-07-24): a listagem do MDP só exibia o código
-- do processo, e o parâmetro `search` do GET era lido mas NUNCA aplicado
-- à query — o campo de busca da tela não filtrava nada.
--
-- `busca_norm` guarda "<interessado> <processo_codigo>" já normalizado
-- (minúsculas, sem acentos) pela aplicação. Normalizar na gravação evita
-- depender da extensão `unaccent` e mantém a busca como um ILIKE simples.
--
-- Idempotente. Reversão no fim.

ALTER TABLE mdp_registros
  ADD COLUMN IF NOT EXISTS interessado TEXT,
  ADD COLUMN IF NOT EXISTS busca_norm  TEXT;

COMMENT ON COLUMN mdp_registros.interessado IS
  'Nome do interessado, copiado de processos.dados->proprietario->valor na '
  'emissão. Desnormalizado de proposito: o historico do despacho deve '
  'refletir quem constava NA EPOCA, mesmo que o processo mude depois.';

COMMENT ON COLUMN mdp_registros.busca_norm IS
  'interessado + processo_codigo em minusculas e sem acentos. Preenchido '
  'pela aplicacao (lib/texto.ts normalizarBusca). Usado no ILIKE da busca.';

-- Dataset pequeno; indice trigram so se a extensao estiver disponivel.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS idx_mdp_busca_norm_trgm
    ON mdp_registros USING gin (busca_norm gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  -- Sem pg_trgm o ILIKE continua funcionando (seq scan). Nao e bloqueante.
  RAISE NOTICE 'pg_trgm indisponivel; busca do MDP segue sem indice trigram.';
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- REVERSAO (nao rodar junto):
--   DROP INDEX IF EXISTS idx_mdp_busca_norm_trgm;
--   ALTER TABLE mdp_registros DROP COLUMN IF EXISTS busca_norm;
--   ALTER TABLE mdp_registros DROP COLUMN IF EXISTS interessado;
-- ─────────────────────────────────────────────────────────────────────
