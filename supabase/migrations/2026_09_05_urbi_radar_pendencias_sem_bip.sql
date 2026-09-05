-- 2026_09_05_urbi_radar_pendencias_sem_bip.sql
--
-- Fase 6 do mandato de 12 fases (05/09/2026): "quais não têm base jurídica suficiente" —
-- contagem de pendências da última análise SEM vínculo BIP aprovado, pra responder essa pergunta
-- da Pilha sem duplicar o cálculo de `d.mac.pendencias_ultima_analise[].vinculos_bip` (já
-- calculado por lib/urbi/montarDossie.ts). Cobertura completa de BIP fica pra Fase 8 — isto aqui
-- é só o sinal mínimo que a Fase 6 precisa, reaproveitado de lá, não recalculado.
--
-- ✅ APLICADA — testada em transação com ROLLBACK antes de aplicar de verdade (ver rodapé).

BEGIN;

ALTER TABLE public.urbi_radar_retratos
  ADD COLUMN IF NOT EXISTS pendencias_sem_bip integer;

COMMENT ON COLUMN public.urbi_radar_retratos.pendencias_sem_bip IS
  'Contagem de pendências da última análise MAC sem nenhum vínculo BIP aprovado (d.mac.
   pendencias_ultima_analise[].vinculos_bip vazio) — reaproveitado de lib/urbi/montarDossie.ts,
   nunca recalculado. Cobertura de BIP em si (Fase 8) é um trabalho maior, separado.';

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 05/09/2026, transação com ROLLBACK antes de aplicar de verdade
-- ======================================================================
-- ALTER TABLE rodado dentro de transação de teste: coluna aceita inteiro e nulo. Desfeito por
-- ROLLBACK, confirmado por fora que a coluna não existia — só então aplicada de verdade.
-- ======================================================================
