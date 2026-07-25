-- 2026_07_25_assuntos_numeracao.sql
--
-- Cada assunto diz como numera os seus processos.
--
-- Regularização e Aceite usam número SEI (ou o processo físico antigo).
-- A Aprovação de Projeto não tem SEI: tem o número do ALVARÁ — que também
-- é chamado de número do PROJETO, é o mesmo número, 5 ou 6 dígitos — e,
-- no lugar do processo físico, a ORDEM DE SERVIÇO, de 7 ou 8 dígitos.
--
-- Antes disso a regra vivia hardcoded na Home, presa a um slug
-- `aprovacao_pp` que nem existe na tabela: todo slot novo caía no SEI.
-- Quem lê agora é lib/numeracao.ts.
--
-- Aditiva e idempotente. Reversão comentada no fim.

ALTER TABLE assuntos
  ADD COLUMN IF NOT EXISTS numeracao TEXT NOT NULL DEFAULT 'sei';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assuntos_numeracao_valida'
  ) THEN
    ALTER TABLE assuntos
      ADD CONSTRAINT assuntos_numeracao_valida
      CHECK (numeracao IN ('sei', 'alvara'));
  END IF;
END $$;

COMMENT ON COLUMN assuntos.numeracao IS
  'Familia de numeracao do assunto: sei (SEI + processo fisico) ou alvara (alvara/projeto 5-6 digitos + ordem de servico 7-8 digitos).';

UPDATE assuntos SET numeracao = 'alvara' WHERE slug = 'slot_05';

-- ── REVERSÃO (não rodar junto) ───────────────────────────────────────
-- ALTER TABLE assuntos DROP CONSTRAINT IF EXISTS assuntos_numeracao_valida;
-- ALTER TABLE assuntos DROP COLUMN IF EXISTS numeracao;
