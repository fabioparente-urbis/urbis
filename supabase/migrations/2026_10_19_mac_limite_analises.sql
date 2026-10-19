-- 2026_10_19_mac_limite_analises.sql
--
-- Limite de análises do MAC POR SLOT, configurável no admin (/admin/configuracoes, coluna
-- "Análises" da tabela de Assuntos). Pedido do Fábio, 19/10/2026: "em breve serão 2 análises" — a penúltima
-- avisa que a próxima indefere, a última indefere.
--
-- Um número de 1 a 10 por slot. O corte é sempre do FIM: limite 3 = Análises 1, 2 e 3; a 3ª é a
-- ÚLTIMA* (liberação de taxa ou indeferimento) e a 2ª leva o aviso de penúltimo despacho.
--
-- Nasce com 5 em todos os slots = exatamente o comportamento de hoje. Sem a coluna, o código lê 5.

BEGIN;

ALTER TABLE public.urbis_config
  ADD COLUMN IF NOT EXISTS mac_limite_analises jsonb NOT NULL
  DEFAULT '{"regularizacao":5,"aceite_sei":5,"slot_03":5,"slot_04":5,"slot_05":5}'::jsonb;

COMMENT ON COLUMN public.urbis_config.mac_limite_analises IS
  'Quantas análises o MAC permite por slot (1 a 10), chave = tipo_processo. A última é a do indeferimento; a penúltima leva o aviso. Ver lib/macLimiteAnalises.ts.';

SELECT mac_limite_analises FROM public.urbis_config WHERE id = 1;

COMMIT;
