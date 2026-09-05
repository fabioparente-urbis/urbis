-- 2026_09_05_urbi_radar_linha_evidencia.sql
-- ETAPA 2 do URBI (cadeia de evidência MDP -> exigência -> retorno -> resultado, 05/09/2026).
-- Adiciona a coluna versionada `linha_evidencia` a urbi_radar_retratos, no mesmo padrão de
-- `campos_consulta` (migration 2026_09_05_urbi_radar_campos_consulta.sql): um bloco factual
-- JSONB por retrato, sem dado pessoal, sem UUID, nunca calculado fora do processamento do Radar.
-- Só leitura de todo o resto do sistema — não altera LIP/MAC/MDP/documento/despacho/numeração.
--
-- TESTE: aplicado primeiro dentro de uma transação com ROLLBACK (script descartável), só
-- confirmado como COMMIT depois de validar que a coluna existe e aceita JSONB nulo.

BEGIN;

ALTER TABLE public.urbi_radar_retratos
  ADD COLUMN IF NOT EXISTS linha_evidencia jsonb;

COMMENT ON COLUMN public.urbi_radar_retratos.linha_evidencia IS
  'Bloco versionado (lib/urbi/linhaEvidencia.ts): cadeia MDP despacho/parecer -> análise -> retorno -> resultado MAC, por processo. Todo vínculo texto->item é rotulado como correspondência parcial (nunca estrutural) quando não há checklist_item_id envolvido. Sem UUID, sem texto de observação pessoal, sem caminho técnico.';

COMMIT;

-- ROLLBACK testado via scripts/aplicar_migration_temp.mts (descartável, apagado após a aplicação real).
