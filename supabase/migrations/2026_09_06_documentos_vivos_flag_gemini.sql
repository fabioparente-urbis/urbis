-- 2026_09_06_documentos_vivos_flag_gemini.sql
--
-- Interruptor da Fase 8 do plano Documentos Vivos (docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md §6):
-- botão "Analisar páginas ambíguas (Gemini)" no Organizador de PDF SEI (Slots 1/2). Coluna
-- PRÓPRIA, separada de documentos_vivos_regularizacao_ativo/documentos_vivos_aceite_sei_ativo —
-- ligar o Organizador não liga o Gemini, e vice-versa. Custo real por clique, então default
-- DESLIGADO, mesmo padrão das demais.

BEGIN;

ALTER TABLE public.urbis_config
  ADD COLUMN IF NOT EXISTS documentos_vivos_gemini_ativo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.urbis_config.documentos_vivos_gemini_ativo IS
  'Interruptor do botão "Analisar páginas ambíguas (Gemini)" (Fase 8 de
   docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md), Slots 1/2. false por padrão — gasta dinheiro real por
   clique. Liga-se por SQL direto até haver UI de admin, mesma trilha das outras colunas deste
   módulo.';

COMMIT;
