-- ============================================================
-- Slot 2 (Aceite SEI) — corrige o marco temporal no checklist do MAC
--
-- Modelo: "Checklist Aceite SEI" (da29333d-0d9d-4a1b-a810-8dfe8ebbf6b4)
-- Item:   f1bf5485-af47-479f-a4c3-455151e68489  (ordem 11, grupo "Documentação")
--
-- PROBLEMA
-- O item manda comprovar existência "anterior a 04/03/2022" citando o
-- "Art. 1º §2° LC 314/2018". As duas coisas são da REGULARIZAÇÃO:
--   • 04/03/2022 é o marco do Título I (Art. 1º);
--   • no ACEITE o marco é 19/10/1995, e a regra é o Art. 7º, § 1º.
-- `lib/marcoTemporal.ts` já usa 19/10/1995 para o Aceite desde sempre —
-- o checklist contradizia o próprio sistema, na frente do analista.
--
-- POR QUE PODEMOS MEXER NESTE ITEM
-- Ele NÃO vem do modelo de despacho da chefia: o arquivo
-- "checkist slot2 claud.xlsm" não contém a expressão "tempo de
-- existência" nem a data "04/03/2022" (conferido em 17/09/2026). É
-- acréscimo nosso, com erro nosso. Corrigir não altera documento deles.
--
-- O TEXTO NOVO é a transcrição do Art. 7º, § 1º da LC nº 314/2018:
--   "O tempo de existência da edificação de que trata este artigo,
--    comprovar-se-á através da Vistoria Fiscal e, pelo menos um, dos
--    seguintes documentos: I - Declaração de energização da edificação
--    emitida pela CELG ou talão de energia anterior a 19/10/1995;
--    II - Talão de IPTU emitido anterior a 19/10/1995; III - Averbação
--    da edificação em Cartório; IV - Planta Aerofotogramétrica de 1992."
-- Nada foi redigido livremente: são os quatro incisos da lei.
--
-- Atenção ao "E" do § 1º: a Vistoria Fiscal é exigida ALÉM de um dos
-- quatro documentos, não como alternativa a eles.
--
-- ROLLBACK ao fim do arquivo.
-- ============================================================

BEGIN;

-- Confere que é a linha certa antes de escrever (aborta se o texto já mudou).
DO $$
DECLARE atual text;
BEGIN
  SELECT texto INTO atual FROM mac_checklist_itens
   WHERE id = 'f1bf5485-af47-479f-a4c3-455151e68489';
  IF atual IS NULL THEN
    RAISE EXCEPTION 'Item f1bf5485 não existe — nada foi alterado.';
  END IF;
  IF atual NOT LIKE '%04/03/2022%' THEN
    RAISE EXCEPTION 'Item f1bf5485 não contém mais "04/03/2022" (texto atual: %). Alguém já mexeu — conferir antes de rodar.', left(atual, 80);
  END IF;
END $$;

UPDATE mac_checklist_itens
   SET texto = 'Comprovar o tempo de existência da edificação anterior a 19/10/1995, através da Vistoria Fiscal E de pelo menos um dos seguintes documentos (Art. 7º, § 1º da LC nº 314/2018):' || chr(10) ||
               '- Declaração de energização da edificação emitida pela CELG, ou talão de energia, anterior a 19/10/1995;' || chr(10) ||
               '- Talão de IPTU emitido anterior a 19/10/1995;' || chr(10) ||
               '- Averbação da edificação em Cartório;' || chr(10) ||
               '- Planta Aerofotogramétrica de 1992;',
       ref   = 'Art. 7º, § 1º LC 314/2018',
       atualizado_em = now()
 WHERE id = 'f1bf5485-af47-479f-a4c3-455151e68489';

-- Confirma que uma linha (e só uma) mudou.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM mac_checklist_itens
   WHERE id = 'f1bf5485-af47-479f-a4c3-455151e68489'
     AND texto LIKE '%19/10/1995%' AND ref = 'Art. 7º, § 1º LC 314/2018';
  IF n <> 1 THEN RAISE EXCEPTION 'Esperava 1 linha corrigida, achei %.', n; END IF;
  RAISE NOTICE 'OK: item do marco temporal do Aceite corrigido (04/03/2022 -> 19/10/1995).';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (texto exatamente como estava antes de 17/09/2026)
-- ============================================================
-- UPDATE mac_checklist_itens
--    SET texto = 'Comprovar tempo de existência da edificação anterior a 04/03/2022: imagem do Google Earth atestada pela SEPLANH, ou documentos emitidos até a data de publicação da LC 314/2018 (autos de infração, embargos, notificações, Vistoria Fiscal com laudo e registro fotográfico datados) — Art. 1º §2° LC 314/2018;',
--        ref   = 'Art. 1º §2° LC 314/2018, Art. 20 IN nº 4/2024'
--  WHERE id = 'f1bf5485-af47-479f-a4c3-455151e68489';
