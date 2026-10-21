-- 2026_10_16_slots_3_4_ped_fundacao.sql
--
-- Fase 0 do plano docs/URBIS_PLANO_SLOTS_3_4_PED.md: estrutura de banco para o Slot 3
-- (Regularização PED, slug `slot_03`) e o Slot 4 (Aceite PED, slug `slot_04`).
--
-- Só ESTRUTURA. O conteúdo (abas e campos do LIP, prompts, checklist do MAC, vínculos) é copiado
-- pelo script scripts/clonar_slots_3_4_ped.mts, que roda depois desta migration.
--
-- O que muda:
--   1. urbis_config ganha um interruptor da aba "Documentos" (Organizador SEI) POR SLOT, como os
--      Slots 1 e 2 já têm (documentos_vivos_regularizacao_ativo / documentos_vivos_aceite_sei_ativo).
--      Uma coluna para cada slot, nunca compartilhada: ligar num não pode ligar o outro.
--      Começa DESLIGADO (false), mesmo padrão dos Slots 1 e 2.
--   2. Os dois CHECKs que listam os slots aceitos pelo URBI passam a aceitar slot_03 e slot_04.
--      Sem isso, a primeira conversa do URBI num processo do Slot 3/4 falharia ao gravar o histórico.
--
-- O que NÃO muda:
--   - Nenhuma linha dos Slots 1, 2 e 5. Os CHECKs são recriados com os MESMOS valores de antes
--     e mais dois.
--   - `assuntos`: slot_03 e slot_04 já existem (vazios, ativo = false). Nome e nome_documento
--     são gravados pelo script de clonagem; ativar é ação do Fábio pela tela.
--
-- Rodar primeiro em transação de teste com ROLLBACK (trocar o COMMIT final por ROLLBACK).

BEGIN;

-- 1. Interruptores da aba Documentos, um por slot -------------------------------------------
ALTER TABLE public.urbis_config
  ADD COLUMN IF NOT EXISTS documentos_vivos_slot_03_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS documentos_vivos_slot_04_ativo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.urbis_config.documentos_vivos_slot_03_ativo IS
  'Interruptor da aba Documentos (Organizador de PDF SEI) no Slot 3 — Regularização PED. false por padrão. Independente do interruptor do Slot 1.';
COMMENT ON COLUMN public.urbis_config.documentos_vivos_slot_04_ativo IS
  'Interruptor da aba Documentos (Organizador de PDF SEI) no Slot 4 — Aceite PED. false por padrão. Independente do interruptor do Slot 2.';

-- 2. Slots aceitos pelo URBI -----------------------------------------------------------------
ALTER TABLE public.urbi_historico DROP CONSTRAINT IF EXISTS urbi_historico_tipo_processo_check;
ALTER TABLE public.urbi_historico ADD CONSTRAINT urbi_historico_tipo_processo_check
  CHECK (tipo_processo IS NULL OR tipo_processo IN ('regularizacao', 'aceite_sei', 'slot_03', 'slot_04', 'slot_05'));

ALTER TABLE public.urbi_sugestoes DROP CONSTRAINT IF EXISTS urbi_sugestoes_slot_check;
ALTER TABLE public.urbi_sugestoes ADD CONSTRAINT urbi_sugestoes_slot_check
  CHECK (slot IS NULL OR slot IN ('regularizacao', 'aceite_sei', 'slot_03', 'slot_04', 'slot_05'));

-- Conferência (aparece no resultado da transação)
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'urbis_config'
      AND column_name IN ('documentos_vivos_slot_03_ativo', 'documentos_vivos_slot_04_ativo')) AS colunas_novas,  -- esperado: 2
  (SELECT documentos_vivos_slot_03_ativo FROM public.urbis_config WHERE id = 1) AS slot_03_ligado,            -- esperado: false
  (SELECT documentos_vivos_slot_04_ativo FROM public.urbis_config WHERE id = 1) AS slot_04_ligado;            -- esperado: false

COMMIT;
