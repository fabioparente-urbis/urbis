-- P2_EXTRACAO (Aceite SEI, id=14, v35) — a chave "cheadv" não existe em
-- lip_campos; o campo real com o rótulo "Despacho CHEADV" é "despacho".
-- Fábio, 18/09/2026: "CHEADV TEM O NUMERO DO DESPACHO COM O ANO E O NUMERO
-- SEI" — bate com o que o prompt já pede ("DESPACHO Nº 1374/2024"), só
-- faltava ir pra chave certa.
--
-- Renomeia SÓ a chave de saída (o texto da regra, que já está correto,
-- fica igual). Não mexe em seiCheadv — esse já é uma chave real.
BEGIN;

DO $$ DECLARE atual text; BEGIN
  SELECT conteudo INTO atual FROM lip_prompts WHERE id = 14;
  IF atual IS NULL OR position('"cheadv"' in atual) = 0 THEN
    RAISE EXCEPTION 'v35 não contém mais "cheadv" — conferir antes de rodar.';
  END IF;
END $$;

UPDATE lip_prompts
   SET conteudo = replace(conteudo, '"cheadv"', '"despacho"'),
       atualizado_em = now()
 WHERE id = 14 AND chave = 'P2_EXTRACAO' AND versao = 35;

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM lip_prompts
   WHERE id = 14 AND position('"cheadv"' in conteudo) = 0
     AND position('"despacho"' in conteudo) > 0;
  IF n <> 1 THEN RAISE EXCEPTION 'não confirmou a troca'; END IF;
END $$;

COMMIT;

-- ROLLBACK: UPDATE lip_prompts SET conteudo = replace(conteudo, '"despacho"', '"cheadv"') WHERE id = 14;
-- (só reverte com segurança se "despacho" não aparecer em nenhum outro lugar do prompt como chave de saída — conferir antes)
