-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-08-18 · MAC Slot 5 — índice para o filtro (modelo_id, ativo)
--
-- Contexto: reconciliação do checklist do MAC Slot 5 (768 itens no banco x 524
-- na planilha real do Fábio — ver memória urbis-mac-slot5-checklist-reconciliacao).
-- A estratégia é nunca apagar nesta etapa: só `ativo=false`, com vínculos e
-- respostas migrados antes para a linha gêmea.
--
-- ── POR QUE NÃO TEM TRIGGER DE AUDITORIA AQUI ────────────────────────────────
-- A primeira versão deste arquivo tentava estender para `mac_checklist_itens`
-- um trigger de auditoria que eu supunha existir em `analises_mac`. Ele NÃO
-- existe: no URBIS o `auditoria_log` é preenchido pelo CÓDIGO DA APLICAÇÃO
-- (ver `app/api/admin/assuntos/zerar/route.ts`, `app/api/admin/lixeira/route.ts`,
-- `app/api/processos/route.ts`), cada chamada com seu próprio `operacao`
-- ("SLOT_ZERADO", etc.). O bloco falhou alto em vez de criar trigger errado.
-- Por isso a trilha desta reconciliação é gravada pelo próprio script
-- (`scripts/reconciliar_mac_slot5.mts`, operacao `MAC_ITEM_DESATIVADO` /
-- `MAC_VINCULO_MIGRADO` / `MAC_RESPOSTA_MIGRADA`) — mesmo padrão do resto do
-- sistema, sem inventar mecanismo novo.
--
-- Sobra deste arquivo só o índice, que é útil de qualquer jeito: TODAS as rotas
-- do Slot 5 (analise, p3, preencher-automatico, ler-pasta, exportar, importar)
-- já filtram por `modelo_id` + `ativo`. Com 768 linhas não é crítico, mas passa
-- a valer quando a desativação entrar em uso.
--
-- Aditiva e idempotente. Reversão comentada no fim.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_mac_checklist_itens_modelo_ativo
  ON mac_checklist_itens (modelo_id, ativo);

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSÃO:
--   DROP INDEX IF EXISTS idx_mac_checklist_itens_modelo_ativo;
-- ─────────────────────────────────────────────────────────────────────────────
