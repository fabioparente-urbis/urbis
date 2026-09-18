-- ============================================================
-- AUDITORIA 18/09/2026 — SQL CONSOLIDADO
-- Plano: ~/.claude/plans/auditoria-slots-1-2-5-2026-09-18.md
--
-- COMO RODAR (Supabase → SQL Editor):
--   • PARTE A: pode rodar inteira. Cada passo confere o estado antes e
--     só escreve se ainda precisa — rodar duas vezes não estraga nada.
--     O resultado de cada passo aparece nas mensagens (NOTICE).
--   • PARTE B: mexe em dado do Slot 1. Está COMENTADA. Só tire os "--"
--     do passo que você autorizar.
--   • PARTE C: Slot 5. Fica de fora até atualizar os dois manuais.
--
-- O QUE NÃO ESTÁ AQUI (e por quê):
--   • MHD com código sujo: os 30 documentos colidem com documentos limpos
--     do mesmo papel — um trim simples quebraria. Precisa de desenho.
--   • Regularização 25.5.000056026-9: recomendado RELER o processo no LIP.
--   • Decreto 2.559 e nome da secretaria: são código + texto da chefia.
--   • Item "Art. 1º §2º / Google Earth" do Aceite: decisão sua (ver fim).
-- ============================================================


-- ============================================================
-- PARTE A — Slot 2 e prompts do Aceite (pode rodar)
-- ============================================================
BEGIN;

-- A1. Recupera 5 campos perdidos do Aceite 25.5.000016900-4.
--     Fonte: auditoria_log 9d65845b (26/06/2026 01:00), ficha antes da
--     queda de 106 para 1 campo. Só grava campo que HOJE está vazio.
DO $$
DECLARE d jsonb; n int := 0;
BEGIN
  SELECT dados INTO d FROM processos
   WHERE codigo = '25.5.000016900-4' AND tipo_processo = 'aceite_sei';
  IF d IS NULL THEN RAISE NOTICE 'A1: processo não encontrado — pulado.'; RETURN; END IF;

  IF coalesce(d->'dataEnergizacao'->>'valor','') = '' THEN
    d := jsonb_set(d, '{dataEnergizacao}', '{"valor":"21/09/1984","fonte":"Declaração de Energização (Equatorial GO) — recuperado do auditoria_log 9d65845b em 18/09/2026","origem":"urbis"}'); n := n + 1; END IF;
  IF coalesce(d->'cau'->>'valor','') = '' THEN
    d := jsonb_set(d, '{cau}', '{"valor":"1018567658-D/GO","fonte":"Declaração de Responsabilidade das Informações (Versão 3) — recuperado do auditoria_log 9d65845b em 18/09/2026","origem":"urbis"}'); n := n + 1; END IF;
  IF coalesce(d->'areaImpermeavel'->>'valor','') = '' THEN
    d := jsonb_set(d, '{areaImpermeavel}', '{"valor":"395,62","fonte":"Cálculo — recuperado do auditoria_log 9d65845b em 18/09/2026","origem":"urbis"}'); n := n + 1; END IF;
  -- nome antigo "nomeResponsavelArq" → chave real "nome_responsavel_arq"
  IF coalesce(d->'nome_responsavel_arq'->>'valor','') = '' THEN
    d := jsonb_set(d, '{nome_responsavel_arq}', '{"valor":"GUSTAVO RODRIGUES DE OLIVEIRA ABREU","fonte":"Declaração de Responsabilidade das Informações (Versão 3) — recuperado do auditoria_log 9d65845b em 18/09/2026","origem":"urbis"}'); n := n + 1; END IF;
  -- nome antigo "unidadeTerritorial" → chave real "vistoriaUnidadeTerritorial"
  IF coalesce(d->'vistoriaUnidadeTerritorial'->>'valor','') = '' THEN
    d := jsonb_set(d, '{vistoriaUnidadeTerritorial}', '{"valor":"37 SET CIDADE JARDIM","fonte":"Consulta de Cadastro GEOPIX — recuperado do auditoria_log 9d65845b em 18/09/2026","origem":"urbis"}'); n := n + 1; END IF;

  IF n > 0 THEN
    UPDATE processos SET dados = d, atualizado_em = now()
     WHERE codigo = '25.5.000016900-4' AND tipo_processo = 'aceite_sei';
  END IF;
  RAISE NOTICE 'A1: % campo(s) recuperado(s) no 25.5.000016900-4.', n;
END $$;

-- A2. Desfaz meu erro de ontem: o item 4e3a7769 ("Informar título do
--     projeto: ALVARÁ DE ACEITE...") é duplicado do 1c6f1f3a, que já está
--     ativo. Estava desligado de propósito.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM mac_checklist_itens WHERE id = '1c6f1f3a-a362-45fd-a979-2766233f9493' AND ativo) THEN
    RAISE NOTICE 'A2: o 1c6f1f3a não está ativo — NÃO desativei o 4e3a7769 (senão o item some). Conferir.'; RETURN;
  END IF;
  UPDATE mac_checklist_itens SET ativo = false, atualizado_em = now()
   WHERE id = '4e3a7769-8435-4b3b-ba20-b2695168f9fd' AND ativo;
  RAISE NOTICE 'A2: item duplicado 4e3a7769 desativado (o 1c6f1f3a segue ativo).';
END $$;

-- A3. P2_EXTRACAO do Aceite (id=14): tira a chave fantasma "usoSolo" e
--     acerta a lista de nomes da instrução, que ficou com nomes antigos
--     depois das renomeações de ontem.
--     "areaPermeavel" FICA: não tem campo no LIP, mas alimenta a
--     "Área Permeável" do laudo da chefia — decisão pendente (ver fim).
DO $$
DECLARE c text; n int := 0;
BEGIN
  SELECT conteudo INTO c FROM lip_prompts WHERE id = 14 AND chave = 'P2_EXTRACAO';
  IF position('    "usoSolo": { "valor": null, "fonte": null },' || chr(10) in c) > 0 THEN
    c := replace(c, '    "usoSolo": { "valor": null, "fonte": null },' || chr(10), ''); n := n + 1; END IF;
  IF position('retorne null para: usoSolo, numeroUso, cnae1, cnae2, usoDefinido, tipoUso, corredor, faixaAmpliacao, unidadeTerritorial.' in c) > 0 THEN
    c := replace(c,
      'retorne null para: usoSolo, numeroUso, cnae1, cnae2, usoDefinido, tipoUso, corredor, faixaAmpliacao, unidadeTerritorial.',
      'retorne null para: numeroUso, cnae1, cnae2, corredor, faixa, vistoriaUnidadeTerritorial.');
    n := n + 1; END IF;
  IF n > 0 THEN UPDATE lip_prompts SET conteudo = c, atualizado_em = now() WHERE id = 14; END IF;
  RAISE NOTICE 'A3: % trecho(s) corrigido(s) no P2 do Aceite.', n;
END $$;

-- A4. P3_MAC do Aceite (id=5): parar de cobrar Uso do Solo e tirar a
--     citação da LC 181/2008. Só a linha do Aceite muda — o texto era
--     idêntico nos 3 slots, mas cada slot tem a sua linha no banco.
DO $$
DECLARE c text; n int := 0;
BEGIN
  SELECT conteudo INTO c FROM lip_prompts WHERE id = 5 AND chave = 'P3_MAC';
  IF position('- Para itens de CONFORMIDADE LEGAL: aplique LC 181/2008 (regularização) ou LC 314/2018 (aceite) conforme o tipo do processo' in c) > 0 THEN
    c := replace(c,
      '- Para itens de CONFORMIDADE LEGAL: aplique LC 181/2008 (regularização) ou LC 314/2018 (aceite) conforme o tipo do processo',
      '- Para itens de CONFORMIDADE LEGAL: aplique a LC 314/2018, Título II (Alvará de Aceite) — edificação anterior a 19/10/1995');
    n := n + 1; END IF;
  IF position('- Para itens de USO DO SOLO: verifique se o Despacho CHEADV está presente e se o uso aprovado é compatível com o uso constatado na vistoria' in c) > 0 THEN
    c := replace(c,
      '- Para itens de USO DO SOLO: verifique se o Despacho CHEADV está presente e se o uso aprovado é compatível com o uso constatado na vistoria',
      '- Para itens de USO DO SOLO: o Alvará de Aceite NÃO exige documento de Uso do Solo (LC 314/2018, Art. 7º, § 2º). Se o documento não estiver no processo, classifique esses itens como "nao_aplica" — NUNCA "nao_conforme" pela ausência. Se o interessado apresentou, verifique se o uso aprovado é compatível com o uso constatado na vistoria. O mesmo vale para caixa de recarga e ART/RRT: não são exigíveis no Aceite; se vierem, registre.');
    n := n + 1; END IF;
  IF n > 0 THEN UPDATE lip_prompts SET conteudo = c, atualizado_em = now() WHERE id = 5; END IF;
  RAISE NOTICE 'A4: % trecho(s) corrigido(s) no P3 do Aceite.', n;
END $$;

-- A5. P3_WORD do Aceite (id=8) = "-- a calibrar --", nenhum código chama.
UPDATE lip_prompts SET ativo = false, atualizado_em = now()
 WHERE id = 8 AND chave = 'P3_WORD' AND ativo;

COMMIT;


-- ============================================================
-- PARTE B — dados do Slot 1 (COMENTADA — só com sua autorização)
-- Tire os "--" do começo das linhas do passo que você liberar.
-- ============================================================

-- B1. Regularização com DUAS versões ativas do P2_EXTRACAO (v21 e v22).
--     A rota usa a maior (v22); a v21 é sobra. Mesmo defeito já
--     corrigido no Aceite.
-- UPDATE lip_prompts SET ativo = false, atualizado_em = now()
--  WHERE id = 2 AND chave = 'P2_EXTRACAO' AND versao = 21 AND ativo;

-- B2. Data inexistente "041/03/2022" no checklist da Regularização
--     (item 74877912) → "04/03/2022". Vai literal pro despacho.
-- UPDATE mac_checklist_itens
--    SET texto = replace(texto, '041/03/2022', '04/03/2022'), atualizado_em = now()
--  WHERE id = '74877912-1f97-4490-9207-6695071038f5' AND position('041/03/2022' in texto) > 0;

-- B3. Migration pendente desde 10/09 (2026_09_10_mrp_processo_codigo_corrigido.sql):
--     9 linhas do MRP com o protocolo físico no lugar do código do processo,
--     e 9 análises com 'REGULARIZACAO' maiúsculo. Conferido hoje: continua necessária.
-- UPDATE mrp_registros SET processo_codigo = '25.5.000088425-0' WHERE id = 'eeb437fc-d187-4558-b483-7fb0f47100b0' AND processo_codigo = '92459732';
-- UPDATE mrp_registros SET processo_codigo = '25.5.000048240-3' WHERE id = '2a2f1006-cda6-46e2-a7bd-336e83bcf5c2' AND processo_codigo = '92396753';
-- UPDATE mrp_registros SET processo_codigo = '25.5.000087937-0' WHERE id = 'dc64184e-d3ea-48fe-b04b-21191ba52e11' AND processo_codigo = '92458691';
-- UPDATE mrp_registros SET processo_codigo = '25.5.000081902-5' WHERE id = '9a78f9d6-0ee3-48f6-a36b-06caa0f354f3' AND processo_codigo = '92448181';
-- UPDATE mrp_registros SET processo_codigo = '24.5.000050678-0' WHERE id = 'f573cd0d-0fcc-4560-b309-91bc018571f2' AND processo_codigo = '92259425';
-- UPDATE mrp_registros SET processo_codigo = '25.5.000027562-9' WHERE id = '950bb289-9920-4b75-92d5-f1e7410561b5' AND processo_codigo = '92360041';
-- UPDATE mrp_registros SET processo_codigo = '25.5.000020730-5' WHERE id = '4fb2f706-f937-4d4c-99b3-e2d0109ece3e' AND processo_codigo = '92347589';
-- UPDATE mrp_registros SET processo_codigo = '25.5.000081077-0' WHERE id = '0b9d7e93-a05e-4806-8fbc-2ae693b27c4f' AND processo_codigo = '92446741';
-- UPDATE mrp_registros SET processo_codigo = '24.5.000057800-5' WHERE id = '4956657f-a0c2-459a-a9e9-e79b71cd4bee' AND processo_codigo = '25.5.000059276-4';
-- UPDATE analises_mac SET tipo_processo = 'regularizacao' WHERE tipo_processo = 'REGULARIZACAO';

-- B4. Registro do MDP sem assunto_id (processo 26.5.000026140-3, Regularização).
-- UPDATE mdp_registros SET assunto_id = '33e01883-4151-48a8-95a9-fec2e3f1e0ba'
--  WHERE id = '2c6d0c75-8503-4628-a75a-3d7164d56bd7' AND assunto_id IS NULL;


-- ============================================================
-- PARTE C — Slot 5 (fora por enquanto: exige atualizar os 2 manuais)
-- ============================================================
-- C1. Prompts do Slot 5 no banco (P1 id=10, P2 id=11, P3 id=12) não são
--     usados — o Slot 5 lê pela lerPasta, com motor em código.
-- UPDATE lip_prompts SET ativo = false, atualizado_em = now() WHERE id IN (10, 11, 12) AND ativo;


-- ============================================================
-- DECISÕES SUAS (não viram SQL sem resposta)
-- ============================================================
-- 1. Item do Aceite ab5b19bd ("Atender ao Art. 1º §2°... Google Earth até
--    041/03/2022"): é regra da Regularização (data e artigo). Pela sua regra
--    do Aceite (foto primeiro, documento depois), a foto vale — mas com marco
--    19/10/1995. Desativo, ou reescrevo pra "foto até 19/10/1995"?
-- 2. areaPermeavel do Aceite: criar o campo no LIP (alimenta a "Área
--    Permeável" do laudo) ou tirar do prompt?
