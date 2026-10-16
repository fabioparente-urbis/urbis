-- 2026_10_16d_slot2_interruptor_leitura_unica.sql
--
-- Separação do Slot 2 (Aceite SEI) — mesmo molde da Etapa 2 dos Slots 3/4
-- (docs/URBIS_PLANO_SLOTS_3_4_PED.md, "5 programas independentes"): o liga/desliga da "leitura
-- única LIP+MAC" passa a ser PRÓPRIO do Slot 2. Hoje existe um só (`leitura_unica_lip_mac_ativo`),
-- lido pelo Slot 1 e pelo Slot 2 — com o LIP próprio do Slot 2, desligar no 1 não pode desligar
-- no 2, e vice-versa.
--
-- DIFERENTE dos Slots 3/4: a coluna NÃO nasce desligada. Ela COPIA o valor atual do interruptor
-- comum (em 16/10/2026: ligado), para o Slot 2 continuar exatamente como estava. Slot 1 não muda.
--
-- Rodar ANTES de publicar o LIP próprio do Slot 2: sem a coluna, a rota do Slot 2 lê "desligado".

BEGIN;

ALTER TABLE public.urbis_config
  ADD COLUMN IF NOT EXISTS leitura_unica_aceite_sei_ativo boolean NOT NULL DEFAULT false;

UPDATE public.urbis_config
   SET leitura_unica_aceite_sei_ativo = leitura_unica_lip_mac_ativo
 WHERE id = 1;

COMMENT ON COLUMN public.urbis_config.leitura_unica_aceite_sei_ativo IS
  'Leitura única LIP+MAC do Slot 2 (Aceite SEI). Independente de leitura_unica_lip_mac_ativo (Slot 1). Valor inicial copiado do interruptor comum em 16/10/2026.';

-- Conferência: as duas colunas com o MESMO valor.
SELECT leitura_unica_lip_mac_ativo AS slot_1, leitura_unica_aceite_sei_ativo AS slot_2
  FROM public.urbis_config WHERE id = 1;

COMMIT;
