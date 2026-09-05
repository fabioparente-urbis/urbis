-- 2026_09_05_urbi_radar_versao_contrato.sql
--
-- Fase 3 do mandato de 12 fases (05/09/2026, cobertura integral): "registrar versão do contrato
-- do retrato" — um inteiro simples, incrementado em código (lib/urbi/radar.ts,
-- VERSAO_CONTRATO_RETRATO) sempre que o FORMATO do que o retrato calcula muda de verdade (campo
-- novo, mudança de regra) — nunca a cada execução, só quando o contrato em si muda. Permite
-- distinguir, no futuro, retratos calculados sob regras antigas dos calculados sob as atuais.
--
-- ✅ APLICADA — testada em transação com ROLLBACK antes de aplicar de verdade (ver rodapé).

BEGIN;

ALTER TABLE public.urbi_radar_retratos
  ADD COLUMN IF NOT EXISTS versao_contrato INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.urbi_radar_retratos.versao_contrato IS
  'Versão do CONTRATO do retrato (lib/urbi/radar.ts, VERSAO_CONTRATO_RETRATO) — incrementada em
   código quando o formato do que é calculado muda, nunca a cada execução. Não confundir com
   `versao` (número sequencial de recálculo do MESMO processo).';

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 05/09/2026, transação com ROLLBACK antes de aplicar de verdade
-- ======================================================================
-- ALTER TABLE rodado dentro de transação de teste: coluna confirmada com default 1 e NOT NULL;
-- linha existente lida de volta com versao_contrato=1 sem precisar de UPDATE nenhum. Desfeito por
-- ROLLBACK, confirmado por fora que a coluna não existia — só então aplicada de verdade.
-- ======================================================================
