-- 2026_09_11_leitura_unica_lip_mac_flag.sql
--
-- Interruptor da Fase 9 do plano docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md ("uma leitura,
-- dois destinos"): hoje o botão LER PROCESSO do LIP (app/processo/ProcessoClient.tsx, S1→S2→S3)
-- e o checklist do MAC (app/api/mac/p3/route.ts) leem o MESMO PDF em duas chamadas separadas ao
-- Gemini. Esta fase junta as duas leituras num prompt combinado, uma chamada só.
--
-- false por padrão — Slot 1 e Slot 2 são produção crítica (CLAUDE.md, feedback_slot1_producao_
-- critica). NADA foi ligado a esta coluna ainda: nem ProcessoClient.tsx nem mac/p3/route.ts leem
-- este flag nesta rodada — só a base (lib/documentosSei/leituraUnicaLipMac.ts) foi criada.
-- Continuação fica para a próxima sessão, com o Fábio presente (mexe nos dois pipelines).

BEGIN;

ALTER TABLE public.urbis_config
  ADD COLUMN IF NOT EXISTS leitura_unica_lip_mac_ativo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.urbis_config.leitura_unica_lip_mac_ativo IS
  'Interruptor da Fase 9 (docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md): quando true, o botão LER
   PROCESSO do LIP passa a usar o prompt combinado (lib/documentosSei/leituraUnicaLipMac.ts) e
   preencher LIP + checklist MAC numa chamada só ao Gemini, em vez de duas. false por padrão —
   Slot 1/2 produção crítica. Liga-se por SQL direto até haver UI de admin, igual
   documentos_vivos_regularizacao_ativo.';

COMMIT;

-- ======================================================================
-- Ainda NÃO aplicada. Rodar em transação de teste com ROLLBACK antes de aplicar de verdade,
-- mesmo padrão das migrations anteriores desta fase.
-- ======================================================================
