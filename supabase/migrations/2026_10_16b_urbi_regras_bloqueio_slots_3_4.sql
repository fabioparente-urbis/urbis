-- 2026_10_16b_urbi_regras_bloqueio_slots_3_4.sql
--
-- Liga/desliga PRÓPRIO das 8 condições bloqueantes do URBI para o Slot 3 (Regularização PED,
-- `slot_03`) e o Slot 4 (Aceite PED, `slot_04`). Pedido do Fábio, 16/10/2026: "crie um
-- liga/desliga próprio por slot para as condições bloqueantes, só para os Slots 3 e 4, sem mexer
-- no 1 e no 2". Plano: docs/URBIS_PLANO_SLOTS_3_4_PED.md.
--
-- Por que tabela NOVA e não linhas novas em `urbi_regras_bloqueio`: aquela tabela é lida por
-- `lerRegrasBloqueio()` para os Slots 1 e 2, com a chave como PK. Uma tabela separada garante
-- que nada do que se faz aqui muda o 1 e o 2 — nem a leitura, nem o backup, nem um UPDATE sem
-- WHERE.
--
-- Estado inicial: CÓPIA do estado atual de `urbi_regras_bloqueio` (ativo + parametros), linha a
-- linha, para cada um dos dois slots — "o Slot 3 copia 100% o Slot 1, o Slot 4 copia 100% o
-- Slot 2". Em 16/10/2026 as 8 estavam ligadas no 1/2. Daqui em diante cada slot tem as suas:
-- ligar/desligar no 1/2 NÃO muda o 3/4, e vice-versa.
--
-- Ligar/desligar (por SQL, igual ao Slot 1/2 hoje):
--   UPDATE public.urbi_regras_bloqueio_slot SET ativo = false, atualizado_em = now()
--    WHERE slot = 'slot_03' AND chave = 'COND_180_DIAS';
--
-- Rodar primeiro em transação de teste com ROLLBACK (trocar o COMMIT final por ROLLBACK).

BEGIN;

CREATE TABLE IF NOT EXISTS public.urbi_regras_bloqueio_slot (
    slot          text NOT NULL CHECK (slot IN ('slot_03', 'slot_04')),
    chave         text NOT NULL CHECK (chave IN (
                    'COND_180_DIAS', 'COND_FISCAL_DIVERGE', 'COND_MARCO_TEMPORAL', 'COND_USO_SOLO',
                    'COND_BUSCA_ENDERECO', 'COND_ASSUNTO_ERRADO', 'COND_CHEADV_APTO',
                    'COND_IMOVEL_DUPLICADO')),
    ativo         boolean NOT NULL DEFAULT false,
    parametros    jsonb NOT NULL DEFAULT '{}'::jsonb,
    criado_em     timestamp with time zone NOT NULL DEFAULT now(),
    atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (slot, chave)
);

COMMENT ON TABLE public.urbi_regras_bloqueio_slot IS
  'Liga/desliga por slot das condições bloqueantes do URBI — só Slot 3 (slot_03) e Slot 4
   (slot_04). Slots 1 e 2 seguem em urbi_regras_bloqueio, sem mudança. Fail-safe DESLIGADO em
   erro de leitura (lib/urbi/regrasBloqueio.ts). Editada por SQL direto, como a do Slot 1/2.';

ALTER TABLE public.urbi_regras_bloqueio_slot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.urbi_regras_bloqueio_slot FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.urbi_regras_bloqueio_slot TO service_role;

-- Cópia do estado atual do Slot 1/2 para cada slot novo.
INSERT INTO public.urbi_regras_bloqueio_slot (slot, chave, ativo, parametros)
SELECT s.slot, r.chave, r.ativo, r.parametros
  FROM public.urbi_regras_bloqueio r
 CROSS JOIN (VALUES ('slot_03'), ('slot_04')) AS s(slot)
 WHERE r.chave IN ('COND_180_DIAS', 'COND_FISCAL_DIVERGE', 'COND_MARCO_TEMPORAL', 'COND_USO_SOLO',
                   'COND_BUSCA_ENDERECO', 'COND_ASSUNTO_ERRADO', 'COND_CHEADV_APTO',
                   'COND_IMOVEL_DUPLICADO')
ON CONFLICT (slot, chave) DO NOTHING;

-- Conferência: esperado 16 linhas (8 por slot), com o mesmo ativo/parametros do Slot 1/2.
SELECT s.slot, s.chave, s.ativo, s.parametros, r.ativo AS ativo_slot_1_2
  FROM public.urbi_regras_bloqueio_slot s
  JOIN public.urbi_regras_bloqueio r USING (chave)
 ORDER BY s.slot, s.chave;

COMMIT;
