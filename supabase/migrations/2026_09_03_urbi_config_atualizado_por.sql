-- 2026_09_03_urbi_config_atualizado_por.sql
--
-- Fase F do plano de Inteligência URBIS ("Conversas e ações" em /admin/urbi): hoje
-- urbi_config.atualizado_em muda sozinho quando alguém liga/desliga o kill switch ou edita
-- outra chave (app/api/urbi/config/route.ts, PUT), mas ninguém fica registrado — não dá pra
-- distinguir "quem" tomou essa ação administrativa. Coluna nova, só ADITIVA (NULL pra toda
-- linha existente, nenhuma leitura antiga quebra).
--
-- ✅ APLICADA — testada em transação com ROLLBACK antes de aplicar de verdade (ver rodapé).

BEGIN;

ALTER TABLE urbi_config ADD COLUMN IF NOT EXISTS atualizado_por UUID REFERENCES usuarios(id);

COMMENT ON COLUMN urbi_config.atualizado_por IS
  'Quem fez a última alteração de valor (app/api/urbi/config PUT) — NULL pra alterações
   anteriores a 03/09/2026 ou feitas antes desta coluna existir. Nunca decide nada sozinho,
   só identifica quem decidiu (Fase F — visibilidade de ação administrativa em /admin/urbi).';

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 03/09/2026, transação com ROLLBACK antes de aplicar de verdade
-- ======================================================================
-- ADD COLUMN rodado dentro de transação de teste: coluna aparece em information_schema,
-- UPDATE de teste setando atualizado_por pra um usuário real confirmado com SELECT, SELECT *
-- de uma linha antiga confirma atualizado_por NULL (não quebra leitura existente). Tudo
-- desfeito por ROLLBACK, confirmado por fora que a coluna não existia — só então aplicada de
-- verdade.
-- ======================================================================
