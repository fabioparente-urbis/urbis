-- P2_EXTRACAO (Aceite SEI, id=14, v35) — tipoUso e usoDefinido não existem em
-- lip_campos do Aceite. Nada no código consome esses dois pro Slot 2 (todo
-- consumidor real é Slot 1 ou Slot 5, e o único que lia tipoUso pro Aceite —
-- gerar-laudo compartilhado — já foi substituído pela rota própria sem seção
-- de Uso do Solo). Gemini extraía, Fábio pagava, o sistema descartava.
--
-- A instrução "SEM USO DEFINIDO" continua fazendo sentido — zerar os CNAEs
-- quando o Uso do Solo (se apresentado) indicar atividade sem uso definido
-- é útil independente de guardar usoDefinido em lugar nenhum. Só a produção
-- da CHAVE usoDefinido no JSON sai; a lógica de zerar CNAE fica.
--
-- RODAR EM DUAS ETAPAS (o replace depende de espaçamento exato):
--   1) BEGIN + primeiro DO $$ + UPDATE
--   2) SELECT conteudo FROM lip_prompts WHERE id = 14  -- ler antes de commitar
--   3) se o texto ficou limpo: COMMIT. Se não: ROLLBACK e avisar.

BEGIN;

DO $$ DECLARE atual text; BEGIN
  SELECT conteudo INTO atual FROM lip_prompts WHERE id = 14;
  IF atual IS NULL OR position('"tipoUso"' in atual) = 0 OR position('"usoDefinido"' in atual) = 0 THEN
    RAISE EXCEPTION 'v35 não contém mais tipoUso/usoDefinido — conferir antes de rodar.';
  END IF;
END $$;

UPDATE lip_prompts
   SET conteudo = replace(
         replace(
           replace(conteudo,
             '"usoDefinido": { "valor": null, "fonte": null },' || chr(10) || '    "tipoUso": { "valor": null, "fonte": null },' || chr(10) || '    ',
             ''
           ),
           'então usoDefinido="Não" e TODOS os campos cnae (cnae1 a cnae5) = "NP".',
           'então TODOS os campos cnae (cnae1 a cnae5) = "NP".'
         ),
         '  "tipoUso": { "valor": null, "fonte": null },' || chr(10),
         ''
       ),
       atualizado_em = now()
 WHERE id = 14 AND chave = 'P2_EXTRACAO' AND versao = 35;

-- ANTES DE COMMITAR, RODAR:
-- SELECT conteudo FROM lip_prompts WHERE id = 14;
-- e conferir que ficou limpo. Só então:

-- COMMIT;

-- Se o replace não pegou por causa de espaçamento diferente do esperado:
-- ROLLBACK;
-- (e me avisar com o texto exato que sobrou ao redor de "tipoUso"/"usoDefinido")
