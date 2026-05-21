-- 2026_05_20_add_assunto_id_lip_abas.sql
--
-- Sessão 4 — LIP multi-assunto.
--
-- Adiciona `assunto_id` em `lip_abas` para que cada conjunto de abas/campos
-- do LIP fique vinculado a um assunto específico (ex.: Regularização,
-- Aceite, etc.). Os campos (`lip_campos`) herdam o assunto via `aba_id`,
-- por isso não precisam de coluna própria.
--
-- Backfill: como hoje o LIP só existe para Regularização, todas as abas
-- legadas apontam para o slot fixo `regularizacao`. Isso preserva o
-- comportamento atual sem nenhuma intervenção manual.
--
-- A coluna fica nullable nesta sessão para não quebrar inserts legados
-- (admin antigo que ainda não passa `assunto_id`). Em sessão futura
-- pode-se torná-la NOT NULL após confirmar que todos os callsites
-- preenchem o campo.

ALTER TABLE lip_abas
  ADD COLUMN IF NOT EXISTS assunto_id UUID REFERENCES assuntos(id);

UPDATE lip_abas
   SET assunto_id = (SELECT id FROM assuntos WHERE slug = 'regularizacao')
 WHERE assunto_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_lip_abas_assunto_id
  ON lip_abas (assunto_id);
