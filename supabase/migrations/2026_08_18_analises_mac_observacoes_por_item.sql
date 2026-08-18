-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-08-18 · analises_mac — observação por ITEM (Slot 5)
--
-- Contexto: o Slot 1 (analise-regularizacao/analise-aceite-sei) já tem observação
-- por ABA (`observacoes_por_aba`, Record<grupo, string>). O Slot 5 pediu mais
-- granular — cada ITEM do checklist tem sua própria caixa de observação, não só
-- por grupo. Motivo concreto: vários itens do MAC pedem VALOR ("Informar o
-- número do PROCESSO: OS ____ / PROJETO Nº ____;"), não status de conformidade —
-- e hoje o único lugar pra digitar isso é a observação (mesmo padrão que o
-- próprio Slot 1 usa pros itens dele desse tipo).
--
-- Mesmo padrão de coluna que `observacoes_por_aba` já usa nesta tabela — jsonb,
-- chave livre (aqui é o id do item em vez do nome do grupo), default '{}'.
--
-- Coluna nova na tabela compartilhada, mas só o Slot 5
-- (app/api/mac/slot-05/analise/route.ts, app/analise-aprovacao-projeto) lê/grava
-- nela — Slot 1 nunca referencia `observacoes_por_item`, mesmo isolamento que já
-- vale pro resto da tabela (Slot 5 nunca importa código do Slot 1 e vice-versa).
--
-- Aditiva e idempotente. Reversão comentada no fim.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE analises_mac
  ADD COLUMN IF NOT EXISTS observacoes_por_item jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSÃO:
--   ALTER TABLE analises_mac DROP COLUMN IF EXISTS observacoes_por_item;
-- ─────────────────────────────────────────────────────────────────────────────
