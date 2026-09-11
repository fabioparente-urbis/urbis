-- 2026_09_11_interpretacao_assistida_fluxo_flag.sql
--
-- Interruptor da Fase 13 do plano docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md
-- ("Interpretação assistida" — IA cruzando as estatísticas do Módulo de Análise de Fluxo pra
-- propor melhorias).
--
-- false por padrão, e TRAVADO por um segundo portão além deste: mesmo com o interruptor true,
-- a rota /api/admin/fluxo/interpretar recusa rodar se a base não tiver pelo menos
-- MINIMO_PROCESSOS processos E MINIMO_DIAS desde a carga do primeiro evento (ver
-- lib/documentosSei/interpretacaoAssistidaFluxo.ts) — é a mitigação que o próprio plano escreveu
-- no §9 pro risco "IA opinando sobre base estatística pequena": "Fase 13 só depois da carga do
-- acervo e de meses de operação". Pedido do Fábio em 11/09/2026: código pronto agora, mas
-- inerte até os dois portões abrirem sozinhos — nada aqui liga automaticamente.

BEGIN;

ALTER TABLE public.urbis_config
  ADD COLUMN IF NOT EXISTS interpretacao_assistida_fluxo_ativo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.urbis_config.interpretacao_assistida_fluxo_ativo IS
  'Interruptor da Fase 13 (docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md): quando true E a base em
   fluxo_processo_eventos já for madura (ver MINIMO_PROCESSOS/MINIMO_DIAS em
   lib/documentosSei/interpretacaoAssistidaFluxo.ts), a rota /api/admin/fluxo/interpretar passa a
   chamar o Gemini para cruzar as estatísticas do Módulo de Análise de Fluxo e propor melhorias.
   false por padrão. Liga-se por SQL direto até haver UI de admin, igual
   leitura_unica_lip_mac_ativo.';

COMMIT;

-- ======================================================================
-- Ainda NÃO aplicada. Rodar em transação de teste com ROLLBACK antes de aplicar de verdade,
-- mesmo padrão das migrations anteriores desta fase.
-- ======================================================================
