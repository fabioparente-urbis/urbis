-- ============================================================
-- Slot 2 (Aceite) — decisões do Fábio em 18/09/2026:
--   "1 REESCREVE" → item da foto passa a usar o marco do Aceite
--   "2 CRIA"      → campo "Área Permeável" no LIP do Aceite
-- Pode rodar inteiro. Rodar duas vezes não estraga nada.
-- ============================================================
BEGIN;

-- 1. Reescreve o item ab5b19bd (chave_lip = foto). Antes: regra da
--    Regularização (Art. 1º §2º, Google Earth até "041/03/2022").
--    Agora: foto primeiro, documento depois — com o marco do Aceite.
--    "Imagem aérea" e não "Google Earth": o Google Earth normalmente não
--    tem imagem de antes de 1995; a foto possível é a aerofotogramétrica
--    de 1992 ou ortofoto antiga.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM mac_checklist_itens
                  WHERE id = 'ab5b19bd-11d5-481b-8419-a50f0b1a12e8'
                    AND position('041/03/2022' in texto) > 0) THEN
    RAISE NOTICE '1: item já não tem "041/03/2022" — pulado (já reescrito?).'; RETURN;
  END IF;
  UPDATE mac_checklist_itens
     SET texto = 'Comprovar a existência da edificação anterior a 19/10/1995 por imagem aérea com data anterior a essa (ex.: Planta Aerofotogramétrica de 1992 ou ortofoto). Não sendo possível identificar a edificação pela imagem, apresentar a documentação do Art. 7º, § 1º da LC nº 314/2018, além da Vistoria Fiscal.',
         ref = 'Art. 7º, § 1º LC 314/2018',
         atualizado_em = now()
   WHERE id = 'ab5b19bd-11d5-481b-8419-a50f0b1a12e8';
  RAISE NOTICE '1: item da foto reescrito com o marco 19/10/1995.';
END $$;

-- 2. Cria o campo "Área Permeável" na aba "4. Urbanístico" do Aceite,
--    logo antes da "Área Impermeável". O prompt do Aceite já pedia esse
--    valor ao Gemini ("Quadro de áreas") e ele era jogado fora por não ter
--    campo; agora tem, e o laudo da chefia usa (Painel H19).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM lip_campos
              WHERE aba_id = '37bdc7ca-e112-4510-aa3d-56705975b3db' AND chave = 'areaPermeavel') THEN
    RAISE NOTICE '2: campo areaPermeavel já existe — pulado.'; RETURN;
  END IF;
  INSERT INTO lip_campos (aba_id, chave, label, tipo, opcoes, placeholder, valor_padrao, ordem, ativo)
  VALUES ('37bdc7ca-e112-4510-aa3d-56705975b3db', 'areaPermeavel', 'Área Permeável', 'texto', NULL,
          'Quadro de áreas', 'NP', 6, true);
  UPDATE lip_campos SET ordem = 7
   WHERE aba_id = '37bdc7ca-e112-4510-aa3d-56705975b3db' AND chave = 'areaImpermeavel';
  RAISE NOTICE '2: campo areaPermeavel criado.';
END $$;

-- 3. Recupera a Área Permeável do 25.5.000016900-4 (27,38), que também
--    estava no snapshot de 26/06 (auditoria_log 9d65845b) e não tinha
--    onde morar. Só grava se estiver vazio.
DO $$
BEGIN
  IF coalesce((SELECT dados->'areaPermeavel'->>'valor' FROM processos
                WHERE codigo = '25.5.000016900-4' AND tipo_processo = 'aceite_sei'), '') <> '' THEN
    RAISE NOTICE '3: areaPermeavel já preenchida — pulado.'; RETURN;
  END IF;
  UPDATE processos
     SET dados = jsonb_set(dados, '{areaPermeavel}',
           '{"valor":"27,38","fonte":"Quadro de áreas — recuperado do auditoria_log 9d65845b em 18/09/2026","origem":"urbis"}'),
         atualizado_em = now()
   WHERE codigo = '25.5.000016900-4' AND tipo_processo = 'aceite_sei';
  RAISE NOTICE '3: areaPermeavel = 27,38 recuperada no 25.5.000016900-4.';
END $$;

COMMIT;

-- ROLLBACK do item 1 (texto exatamente como estava):
-- UPDATE mac_checklist_itens SET texto = 'Atender ao Art. 1º §2° da Lei Complementar 314/2018:' || chr(10) || '“ Para fins de análise e comprovação das características da edificação a referência será a imagem do Google Earth, até a data de' || chr(10) || '041/03/2022, atestada pelo órgão municipal de planejamento, ou, ainda, documentos emitidos até a data da publicação' || chr(10) || 'desta Lei Complementar que comprovem as edificações, tais como autos de infração, embargos, notificações e outros' || chr(10) || 'documentos oficiais da Prefeitura de Goiânia, além de Vistoria Fiscal devidamente acompanhada de laudo e registro fotográfico' || chr(10) || 'com data. ”', ref = 'LC 314/2018, IR7/2024, LC364/2022, LC 368/2023' WHERE id = 'ab5b19bd-11d5-481b-8419-a50f0b1a12e8';
