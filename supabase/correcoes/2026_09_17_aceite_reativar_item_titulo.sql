-- Reativa o item "Informar título do projeto: ALVARÁ DE ACEITE – LEVANTAMENTO
-- ARQUITETÔNICO" (ITEM 2.0 no modelo da chefia) — único item do checklist que
-- nomeia o Aceite, estava desligado. Fábio, 17/09/2026: "ITEM 2.0 LIGA".
BEGIN;
UPDATE mac_checklist_itens SET ativo = true, atualizado_em = now()
 WHERE id = '4e3a7769-8435-4b3b-ba20-b2695168f9fd';
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM mac_checklist_itens
   WHERE id = '4e3a7769-8435-4b3b-ba20-b2695168f9fd' AND ativo = true;
  IF n <> 1 THEN RAISE EXCEPTION 'não confirmou a reativação'; END IF;
END $$;
COMMIT;
