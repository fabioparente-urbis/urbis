-- 2026_05_21_add_assunto_id_analises_mac.sql
--
-- Sessão 5A — MAC multi-assunto.
--
-- Adiciona `assunto_id` em `analises_mac` para que cada análise fique
-- vinculada ao assunto do processo (Regularização hoje; outros 14 slots
-- a partir da Sessão 4). O LIP já carrega `assunto_id` em `lip_abas` e
-- em `processos` — esta coluna fecha o trilho no MAC.
--
-- Backfill: como hoje o MAC só atende Regularização, todas as análises
-- legadas apontam para o slot fixo `regularizacao`. Isso preserva o
-- comportamento atual sem nenhuma intervenção manual.
--
-- A coluna fica nullable nesta sessão para não quebrar inserts legados
-- (telas / rotas que ainda não passam `assunto_id`). Em sessão futura
-- pode-se torná-la NOT NULL após confirmar que todos os callsites
-- preenchem o campo.

ALTER TABLE analises_mac
  ADD COLUMN IF NOT EXISTS assunto_id UUID REFERENCES assuntos(id);

UPDATE analises_mac
   SET assunto_id = (SELECT id FROM assuntos WHERE slug = 'regularizacao')
 WHERE assunto_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_analises_mac_assunto_id
  ON analises_mac (assunto_id);
