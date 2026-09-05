-- 2026_09_05_urbi_radar_previsao_tempo.sql
--
-- Fase 4 do mandato de 12 fases (05/09/2026): previsão determinística de tempo/esforço. Adiciona
-- a coluna `previsao_tempo` (JSONB) a `urbi_radar_retratos`, no mesmo padrão de `campos_consulta`/
-- `linha_evidencia` — calculada por lib/urbi/previsao.ts a partir de `vw_bdi_tempo_etapas` (a
-- única fonte com timestamp real de início/fim de análise hoje), nunca Gemini, nunca inventa
-- certeza quando a amostra é pequena.
--
-- ✅ APLICADA — testada em transação com ROLLBACK antes de aplicar de verdade (ver rodapé).

BEGIN;

ALTER TABLE public.urbi_radar_retratos
  ADD COLUMN IF NOT EXISTS previsao_tempo jsonb;

COMMENT ON COLUMN public.urbi_radar_retratos.previsao_tempo IS
  'Previsão determinística de tempo (lib/urbi/previsao.ts) — {status: estimativa|suspensa|
   base_insuficiente, ...}. Nunca Gemini, nunca certeza falsa: exige amostra mínima de casos
   comparáveis reais (vw_bdi_tempo_etapas), sempre declara confiança/amostra/fonte.';

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 05/09/2026, transação com ROLLBACK antes de aplicar de verdade
-- ======================================================================
-- ALTER TABLE rodado dentro de transação de teste: coluna aceita JSONB nulo e objeto; linha
-- existente lida de volta sem quebrar (default NULL, não obrigatório). Desfeito por ROLLBACK,
-- confirmado por fora que a coluna não existia — só então aplicada de verdade.
-- ======================================================================
