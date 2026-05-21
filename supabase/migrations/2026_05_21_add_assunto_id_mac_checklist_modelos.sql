-- 2026_05_21_add_assunto_id_mac_checklist_modelos.sql
--
-- Sessão 5A — MAC multi-assunto.
--
-- Adiciona `assunto_id` em `mac_checklist_modelos` para que cada modelo
-- de checklist fique vinculado a um assunto específico (Regularização,
-- Aceite, etc.). Os itens (`mac_checklist_itens`) herdam o assunto via
-- `modelo_id`, por isso não precisam de coluna própria — mesma estratégia
-- usada em `lip_abas` ↔ `lip_campos` na Sessão 4.
--
-- Backfill: como hoje todos os modelos cadastrados são de Regularização,
-- todos apontam para o slot fixo `regularizacao`. Modelos novos criados
-- pela UI passarão a informar `assunto_id` explicitamente.
--
-- A coluna fica nullable nesta sessão para não quebrar inserts legados
-- (admin antigo que ainda não passa `assunto_id`). Em sessão futura
-- pode-se torná-la NOT NULL após confirmar que todos os callsites
-- preenchem o campo.

ALTER TABLE mac_checklist_modelos
  ADD COLUMN IF NOT EXISTS assunto_id UUID REFERENCES assuntos(id);

UPDATE mac_checklist_modelos
   SET assunto_id = (SELECT id FROM assuntos WHERE slug = 'regularizacao')
 WHERE assunto_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_mac_checklist_modelos_assunto_id
  ON mac_checklist_modelos (assunto_id);
