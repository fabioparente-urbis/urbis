-- 2026_05_21_add_assunto_id_lip_prompts.sql
--
-- Adiciona assunto_id em lip_prompts para que cada assunto possa ter
-- seu próprio conjunto de prompts (P1_TRIAGEM, P1_TRIAGEM_BACKUP,
-- P2_EXTRACAO, P2_EXTRACAO_BACKUP).
-- Os registros existentes (todos de Regularização) são apontados para o
-- UUID do slug 'regularizacao'.

ALTER TABLE lip_prompts
  ADD COLUMN IF NOT EXISTS assunto_id UUID REFERENCES assuntos(id);

-- Backfill: aponta todos os registros existentes para regularizacao
UPDATE lip_prompts
SET assunto_id = (
  SELECT id FROM assuntos WHERE slug = 'regularizacao' LIMIT 1
)
WHERE assunto_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_lip_prompts_assunto_id
  ON lip_prompts(assunto_id);

COMMENT ON COLUMN lip_prompts.assunto_id IS
  'Assunto ao qual este prompt pertence. NULL (legado) = regularizacao.';
