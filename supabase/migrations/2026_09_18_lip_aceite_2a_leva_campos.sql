-- 2026_09_18_lip_aceite_2a_leva_campos.sql
--
-- Bloco A do plano docs/PLANO_LEITURA_INDIVIDUAL_E_ACEITE_SLOT2.md — 2ª leva de campos que
-- faltavam no LIP do Aceite SEI (cb574aa0-5040-4fd0-aa60-14b64d9a047a). O Fábio confirmou "sim"
-- para os 3 (18/09/2026): ANAC/Exército, áreas de laudo/ART/vistoria, e um campo novo para o SEI
-- do documento que comprova o tempo de existência.
--
-- 5 campos copiados do Slot 1 (Regularização SEI), tipo/placeholder/valor_padrao idênticos:
--   - flAnac, flExercito         → aba "8. Vistoria e Uso"
--   - areaLaudo, areaArt, areaVistoria → aba "2. Áreas"
-- 1 campo NOVO (não existe no Slot 1 — o Aceite não tem lá):
--   - seiComprovacao ("DOC SEI — Comprovação do Tempo de Existência") → aba "7. Documentos".
--     Companheiro do já existente "tipoComprovacao" (guarda o TIPO: Vistoria Fiscal/Google
--     Earth/etc.) — este guarda o Nº SEI do documento usado.
--
-- JÁ APLICADO EM PRODUÇÃO em 18/09/2026 via script avulso (mesmo efeito deste arquivo). Este
-- arquivo é só o registro/reprodutibilidade — idempotente, rodar de novo é seguro.
--
-- NÃO inclui a leitura (prompt) desses campos — isso é o Bloco C (prompt v36 do Aceite), ainda
-- pendente.

DO $$
DECLARE
  aba_vistoria uuid := 'f5685c08-7e5e-42d9-8a71-c9f821bc100d'; -- "8. Vistoria e Uso" (Aceite)
  aba_areas    uuid := 'bd91045a-5cd5-4090-9925-7d68ab2c3d0e'; -- "2. Áreas" (Aceite)
  aba_doc      uuid := '8e904571-3e85-43ea-95c7-6c25f0fb6b10'; -- "7. Documentos" (Aceite)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lip_campos WHERE aba_id = aba_vistoria AND chave = 'flAnac') THEN
    INSERT INTO public.lip_campos (aba_id, chave, label, tipo, opcoes, placeholder, valor_padrao, ordem, ativo)
    VALUES (aba_vistoria, 'flAnac', 'Folha/SEI — Anuência ANAC', 'texto', NULL, 'Se não houver: NP', 'NP', 21, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.lip_campos WHERE aba_id = aba_vistoria AND chave = 'flExercito') THEN
    INSERT INTO public.lip_campos (aba_id, chave, label, tipo, opcoes, placeholder, valor_padrao, ordem, ativo)
    VALUES (aba_vistoria, 'flExercito', 'Folha/SEI — Anuência Exército', 'texto', NULL, 'Se não houver: NP', 'NP', 22, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.lip_campos WHERE aba_id = aba_areas AND chave = 'areaLaudo') THEN
    INSERT INTO public.lip_campos (aba_id, chave, label, tipo, opcoes, placeholder, valor_padrao, ordem, ativo)
    VALUES (aba_areas, 'areaLaudo', 'Área conforme Laudo Técnico', 'texto', NULL, 'Só se o laudo citar área — deixe vazio se não citar', '', 8, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.lip_campos WHERE aba_id = aba_areas AND chave = 'areaArt') THEN
    INSERT INTO public.lip_campos (aba_id, chave, label, tipo, opcoes, placeholder, valor_padrao, ordem, ativo)
    VALUES (aba_areas, 'areaArt', 'Área conforme ART de Levantamento', 'texto', NULL, 'Só se a ART citar área — deixe vazio se não citar', '', 9, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.lip_campos WHERE aba_id = aba_areas AND chave = 'areaVistoria') THEN
    INSERT INTO public.lip_campos (aba_id, chave, label, tipo, opcoes, placeholder, valor_padrao, ordem, ativo)
    VALUES (aba_areas, 'areaVistoria', 'Área apontada pela Fiscalização (Vistoria)', 'texto', NULL, 'Área confirmada pelo fiscal no Termo de Vistoria', '', 10, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.lip_campos WHERE aba_id = aba_doc AND chave = 'seiComprovacao') THEN
    INSERT INTO public.lip_campos (aba_id, chave, label, tipo, opcoes, placeholder, valor_padrao, ordem, ativo)
    VALUES (aba_doc, 'seiComprovacao', 'DOC SEI — Comprovação do Tempo de Existência', 'texto', NULL,
            'SEI do documento usado (foto aérea, energização, IPTU ou averbação)', '', 12, true);
  END IF;
END $$;

-- Bônus desta sessão: corrige a citação legal errada do item de checklist "artLev" do Aceite
-- (cfde2b8b-2c45-4f1b-b72f-bf8424346caf), que citava "Art. 2º, inc. VII da LC 314/2018" (artigo
-- do TÍTULO I / Regularização) sem nenhum limiar de área. O Fábio confirmou (18/09/2026): a
-- citação certa é a Instrução Normativa nº 7/2024, Anexo I, item 9 — até 200,00 m² só croqui
-- cotado (ART/RRT dispensada); acima disso, ART/RRT de levantamento exigível.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.mac_checklist_itens
              WHERE id = 'cfde2b8b-2c45-4f1b-b72f-bf8424346caf'
                AND position('Art. 2º, inc. VII' in texto) > 0) THEN
    UPDATE public.mac_checklist_itens
       SET texto = 'Até 200,00 m² de área construída, croqui cotado é suficiente, dispensada a ART/RRT (Instrução Normativa nº 7/2024, Anexo I, item 9).' || chr(10) ||
                    'Acima de 200,00 m², é exigível ART/RRT de levantamento da edificação, devendo ser anexado ao processo “relatório/laudo técnico que conste o tipo de estrutura, condições de segurança e habitabilidade da edificação, registros fotográficos da situação atual do imóvel” onde ATESTE as condições de segurança e habitabilidade da edificação;',
           ref = 'IN nº 7/2024, Anexo I, item 9; LC364/2022',
           atualizado_em = now()
     WHERE id = 'cfde2b8b-2c45-4f1b-b72f-bf8424346caf';
  END IF;
END $$;
