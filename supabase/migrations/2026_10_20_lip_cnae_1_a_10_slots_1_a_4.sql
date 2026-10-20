-- 2026_10_20_lip_cnae_1_a_10_slots_1_a_4.sql
--
-- Pedido do Fábio (20/10/2026): a aba "3. Uso do Solo" do LIP passa a ter 10 "Código CNAE" e
-- 10 "Descrição CNAE", todos com padrão "NP". Hoje são 5 códigos (cnae1..cnae5) e 2 descrições
-- (descCnae1, descCnae2).
--
-- Abas "3. Uso do Solo" tocadas (o Slot 5 fica de fora):
--   - Slot 1 — Regularização SEI (aba c35cd0f7-06cb-45b1-bd32-88d1a452bec1)
--   - Slot 3 — Regularização PED (aba a7b40183-9970-4969-b00b-7c34e43553b0)
--   - Slot 2 — Aceite SEI        (aba a37ff0c1-5e53-48ab-8096-8e01b76efacf)
--   - Slot 4 — Aceite PED        (aba 8f5e4299-1cbf-4163-90b8-7b167b2950c3)
-- Nos Slots 2 e 4 as chaves cnae1/cnae2 existiam com o rótulo "Descrição CNAE". Conferido em
-- 20/10/2026: nenhum processo do Aceite tem valor nelas. Passam a ser "Código CNAE 1/2" (igual ao
-- Slot 1), e as descrições ganham chaves próprias (descCnae1..10).
--
-- O que este arquivo faz, em cada aba:
--   1. cria cnae6..cnae10 e descCnae3..descCnae10 (tipo texto, padrão NP, igual aos existentes);
--   2. reordena o bloco para ficar em pares na tela: Código CNAE N à esquerda, Descrição CNAE N
--      à direita. Nos Slots 1 e 3 os campos de cima não mudam de lugar; nos Slots 2 e 4 o
--      "Nº Uso para Aprovação" vai para o fim da aba (ver abaixo).
-- Nenhum valor já gravado em processo é tocado: só a definição dos campos muda.
-- Pode rodar de novo sem efeito colateral.

DO $$
DECLARE
  abas uuid[] := ARRAY[
    'c35cd0f7-06cb-45b1-bd32-88d1a452bec1'::uuid,  -- Slot 1
    'a7b40183-9970-4969-b00b-7c34e43553b0'::uuid,  -- Slot 3
    'a37ff0c1-5e53-48ab-8096-8e01b76efacf'::uuid,  -- Slot 2
    '8f5e4299-1cbf-4163-90b8-7b167b2950c3'::uuid   -- Slot 4
  ];
  a uuid;
  n int;
BEGIN
  FOREACH a IN ARRAY abas LOOP
    FOR n IN 1..10 LOOP
      IF NOT EXISTS (SELECT 1 FROM public.lip_campos WHERE aba_id = a AND chave = 'cnae' || n) THEN
        INSERT INTO public.lip_campos (aba_id, chave, label, tipo, opcoes, placeholder, valor_padrao, ordem, ativo)
        VALUES (a, 'cnae' || n, 'Código CNAE ' || n, 'texto', NULL, 'Se não houver: NP', 'NP', 0, true);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.lip_campos WHERE aba_id = a AND chave = 'descCnae' || n) THEN
        INSERT INTO public.lip_campos (aba_id, chave, label, tipo, opcoes, placeholder, valor_padrao, ordem, ativo)
        VALUES (a, 'descCnae' || n, 'Descrição CNAE ' || n, 'texto', NULL, 'Se não houver: NP', 'NP', 0, true);
      END IF;

      UPDATE public.lip_campos SET label = 'Código CNAE ' || n, placeholder = 'Se não houver: NP'
       WHERE aba_id = a AND chave = 'cnae' || n AND label <> 'Código CNAE ' || n;

      UPDATE public.lip_campos SET ordem = 6 + 2 * (n - 1) WHERE aba_id = a AND chave = 'cnae' || n;
      UPDATE public.lip_campos SET ordem = 7 + 2 * (n - 1) WHERE aba_id = a AND chave = 'descCnae' || n;
    END LOOP;

    -- Slots 1 e 3: "Número Sei do Uso do Solo" fecha a 6ª posição. Slots 2 e 4 não têm esse
    -- campo nem tipoUso/usoDefinido (só 3 campos antes dos CNAEs): o "Nº Uso para Aprovação"
    -- vai para o fim da aba, para os pares código/descrição ficarem lado a lado na tela.
    UPDATE public.lip_campos SET ordem = 5 WHERE aba_id = a AND chave = 'usoSolo';
    IF NOT EXISTS (SELECT 1 FROM public.lip_campos WHERE aba_id = a AND chave = 'usoSolo') THEN
      UPDATE public.lip_campos SET ordem = 30 WHERE aba_id = a AND chave = 'numeroUso';
    END IF;
  END LOOP;
END $$;

-- Conferência: deve listar 20 linhas de CNAE por aba (4 abas), todas com padrão NP.
SELECT aba_id, count(*) AS campos_cnae, count(*) FILTER (WHERE valor_padrao = 'NP') AS com_np
  FROM public.lip_campos
 WHERE aba_id IN ('c35cd0f7-06cb-45b1-bd32-88d1a452bec1', 'a7b40183-9970-4969-b00b-7c34e43553b0',
                  'a37ff0c1-5e53-48ab-8096-8e01b76efacf', '8f5e4299-1cbf-4163-90b8-7b167b2950c3')
   AND (chave ~ '^cnae([1-9]|10)$' OR chave ~ '^descCnae([1-9]|10)$')
 GROUP BY aba_id;
