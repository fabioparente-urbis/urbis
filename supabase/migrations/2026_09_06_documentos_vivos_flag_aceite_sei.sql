-- 2026_09_06_documentos_vivos_flag_aceite_sei.sql
--
-- Interruptor da aba "Documentos" (Organizador de PDF SEI, Fase 2 do plano Documentos Vivos)
-- agora no Aceite SEI (Slot 2) — pedido explícito do Fábio de ter um idêntico ao que já roda na
-- Regularização (Slot 1, ver 2026_09_05_documentos_vivos_flag.sql). Coluna PRÓPRIA, separada da
-- do Slot 1: ligar uma não liga a outra — regra de isolamento entre slots do CLAUDE.md.
--
-- Mesmo padrão: default DESLIGADO, sem UI de admin ainda, liga-se por SQL direto.

BEGIN;

ALTER TABLE public.urbis_config
  ADD COLUMN IF NOT EXISTS documentos_vivos_aceite_sei_ativo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.urbis_config.documentos_vivos_aceite_sei_ativo IS
  'Interruptor da aba "Documentos" (Organizador de PDF SEI, Fase 2 de
   docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md) no Aceite SEI (Slot 2). false por padrão. Coluna própria,
   separada de documentos_vivos_regularizacao_ativo (Slot 1) — isolamento entre slots. Liga-se por
   SQL direto (UPDATE urbis_config SET documentos_vivos_aceite_sei_ativo = true WHERE id = 1) até
   haver UI de admin.';

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 06/09/2026, transação com ROLLBACK antes de aplicar de verdade
-- ======================================================================
-- ADD COLUMN IF NOT EXISTS rodado dentro de transação de teste: SELECT * confirmou a coluna
-- nova com default false em todas as linhas existentes; ROLLBACK desfez, confirmado por fora
-- que a coluna não existia — só então aplicada de verdade.
-- ======================================================================
