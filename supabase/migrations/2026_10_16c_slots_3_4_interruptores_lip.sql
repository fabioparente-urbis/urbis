-- 2026_10_16c_slots_3_4_interruptores_lip.sql
--
-- Etapa 2 do plano docs/URBIS_PLANO_SLOTS_3_4_PED.md ("5 programas independentes"): o liga/desliga
-- da "leitura única LIP+MAC" passa a ser PRÓPRIO dos Slots 3 e 4. Hoje existe um só
-- (`leitura_unica_lip_mac_ativo`), lido pelo Slot 1 e pelo Slot 2 — ligar lá não pode ligar no 3/4.
--
-- Começam DESLIGADOS (false), como o original começou. Slot 1/2 não mudam.
-- Rodar primeiro em transação de teste com ROLLBACK (trocar o COMMIT final por ROLLBACK).

BEGIN;

ALTER TABLE public.urbis_config
  ADD COLUMN IF NOT EXISTS leitura_unica_slot_03_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS leitura_unica_slot_04_ativo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.urbis_config.leitura_unica_slot_03_ativo IS
  'Leitura única LIP+MAC do Slot 3 (Regularização PED). Independente de leitura_unica_lip_mac_ativo (Slot 1/2). false por padrão.';
COMMENT ON COLUMN public.urbis_config.leitura_unica_slot_04_ativo IS
  'Leitura única LIP+MAC do Slot 4 (Aceite PED). Independente de leitura_unica_lip_mac_ativo (Slot 1/2). false por padrão.';

-- Conferência: esperado 2 colunas, ambas false.
SELECT leitura_unica_slot_03_ativo, leitura_unica_slot_04_ativo FROM public.urbis_config WHERE id = 1;

COMMIT;
