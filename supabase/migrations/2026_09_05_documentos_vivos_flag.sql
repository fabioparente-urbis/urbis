-- 2026_09_05_documentos_vivos_flag.sql
--
-- Interruptor da Fase 2 do plano "Documentos Vivos" (docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md):
-- a aba "Documentos" da Regularização (Slot 1), que fatia o PDF único do SEI em eventos
-- (lib/documentosSei/fatiar.ts). Mesmo padrão de `urbis_config.visao_ligada`, mas ao contrário:
-- aqui o padrão é DESLIGADO — Slot 1 é produção crítica rodando liso (CLAUDE.md), a feature é
-- aditiva e nova, então só liga quem decidir ligar. Sem UI de admin ainda (mesma trilha que
-- `chat_gemini_ativo` seguiu no começo): liga-se por SQL direto até valer a pena UI.
--
-- Fase 2 não grava nada em Regularização/MHD — a coluna só controla se a ABA aparece.

BEGIN;

ALTER TABLE public.urbis_config
  ADD COLUMN IF NOT EXISTS documentos_vivos_regularizacao_ativo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.urbis_config.documentos_vivos_regularizacao_ativo IS
  'Interruptor da aba "Documentos" (fatiador determinístico do PDF do SEI, Fase 2 de
   docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md) na Regularização (Slot 1). false por padrão — Slot 1 é
   produção crítica. Liga-se por SQL direto (UPDATE urbis_config SET
   documentos_vivos_regularizacao_ativo = true WHERE id = 1) até haver UI de admin.';

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 05/09/2026, transação com ROLLBACK antes de aplicar de verdade
-- ======================================================================
-- ADD COLUMN IF NOT EXISTS rodado dentro de transação de teste: SELECT * confirmou a coluna
-- nova com default false em todas as linhas existentes; ROLLBACK desfez, confirmado por fora
-- que a coluna não existia — só então aplicada de verdade.
-- ======================================================================
