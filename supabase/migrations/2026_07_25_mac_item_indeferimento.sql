-- 2026_07_25_mac_item_indeferimento.sql
--
-- Marca quais itens do checklist, quando NÃO CONFORMES, levam o processo
-- ao indeferimento — em oposição aos que geram apenas exigência a ser
-- cumprida pelo interessado.
--
-- Por que isso é necessário:
--   1. Prioridade de leitura por IA. A Aprovação de Projeto tem 561
--      itens; avaliar todos com o mesmo peso é caro e impreciso. Os que
--      decidem o destino do processo devem ser avaliados primeiro e com
--      mais contexto.
--   2. Aviso ao analista. Marcar como não-conforme um item de
--      indeferimento tem consequência diferente de marcar um item de
--      exigência, e hoje a tela não distingue.
--   3. Estatística. "Qual item mais indefere processo" é a pergunta que
--      o usuário quer responder para prever problema e sugerir solução.
--
-- Aditiva e idempotente. Nasce tudo FALSE — nenhum comportamento muda
-- até alguém marcar item a item. Reversão comentada no fim.

ALTER TABLE mac_checklist_itens
  ADD COLUMN IF NOT EXISTS gera_indeferimento BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN mac_checklist_itens.gera_indeferimento IS
  'true = item que, nao conforme, leva a indeferimento (nao e mera exigencia).';

CREATE INDEX IF NOT EXISTS idx_mac_itens_indeferimento
  ON mac_checklist_itens (modelo_id)
  WHERE gera_indeferimento;

-- ── REVERSÃO (não rodar junto) ───────────────────────────────────────
-- DROP INDEX IF EXISTS idx_mac_itens_indeferimento;
-- ALTER TABLE mac_checklist_itens DROP COLUMN IF EXISTS gera_indeferimento;
