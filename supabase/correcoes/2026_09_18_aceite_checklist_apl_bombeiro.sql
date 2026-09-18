-- ============================================================
-- Slot 2 (Aceite) — checklist, achados de "pente fino" pedido pelo
-- Fábio em 18/09/2026 ("olha a primeira aba... tem dezenas de itens
-- iguais"). JÁ APLICADO EM PRODUÇÃO via script avulso — este arquivo é
-- só o registro, no mesmo padrão de supabase/correcoes/2026_09_18_*.sql.
-- Pode rodar inteiro. Rodar duas vezes não estraga nada (cada passo
-- confere o estado antes de escrever).
-- ============================================================
BEGIN;

-- 1. Grupo "No Setor Central/APL: Art.15 LC 314/2018" tinha 8 itens
--    ativos repetindo o MESMO parágrafo de abertura (4 linhas) 8 vezes,
--    cada um só acrescentando 1 bullet no fim — e 2 desses bullets eram
--    IDÊNTICOS ("índice paisagístico mínimo de 15%" aparecia 2x). O
--    Fábio confirmou que o grupo faz sentido no Aceite (18/09/2026:
--    "faz sentido sim, mas o conteudo dele ta com bug") — mantido, só
--    consolidado num item com os pontos em lista, sem repetir o
--    parágrafo. O item dos templos religiosos (8a9fb944) é regra
--    distinta e não foi tocado. Conferido antes: nenhuma das 3 análises
--    existentes do Aceite tinha marcação nesses 7 itens — zero risco de
--    exigência sumir de análise em andamento. Mesmo bug existe também
--    no Slot 1 (modelo 00000000-...) — NÃO tocado aqui, fora de escopo.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM mac_checklist_itens
                  WHERE id = '20e6aac3-e5e3-4675-bf03-df34e32519be'
                    AND position('•Atender ocupação de 100% até altura de 14,50 m;' in texto) > 0
                    AND position('•Atender índice paisagístico mínimo de 15%' in texto) = 0) THEN
    RAISE NOTICE '1: item já mesclado (ou estado inesperado) — pulado.'; RETURN;
  END IF;
  UPDATE mac_checklist_itens
     SET texto = 'As normas previstas abaixo terão validade de 01 ano a partir da regulamentação do respectivo APL. (averiguar data).' || chr(10) ||
                  'Para as novas edificações, quais sejam, uso habitacional e atividades econômicas na tipologia de macro-projeto, localizadas no setor Central e nas áreas delimitadas com APL Modas – Arranjo Produtivo Local da Moda, fica estabelecidos os seguintes parâmetros abaixo:' || chr(10) ||
                  '•Atender ocupação de 100% até altura de 14,50 m;' || chr(10) ||
                  '•Não incidirão recuos frontais, laterais e fundos mínimos obrigatórios até a altura de 14,50m da edificação;' || chr(10) ||
                  '•Permitido o índice de ocupação de 100% entre 14,50 m e 32,00 desde que respeitado os recuos ou afastamentos da LC 349/2024;' || chr(10) ||
                  '•As alturas da edificação serão medidas a partir do nível 0,00;' || chr(10) ||
                  '•Atender índice paisagístico mínimo de 15%, podendo ser em cobertura vegetal não permeável;' || chr(10) ||
                  '•Atender 1 vaga/ 60 m² de área destinada à atividade econômica;' || chr(10) ||
                  '•Para demais parâmetros urbanísticos atender Legislação vigente; (§1º) – averiguar unidade territorial em que estiver inserida;',
         atualizado_em = now()
   WHERE id = '20e6aac3-e5e3-4675-bf03-df34e32519be';
  RAISE NOTICE '1: item 20e6aac3 mesclado com os 7 parâmetros (sem repetir o parágrafo).';
END $$;

DO $$
DECLARE ids uuid[] := ARRAY[
  'af00d82e-ae66-41eb-8628-28b3db95ffdb',
  '4e08f026-31b2-4a15-a8cb-2fc73d9532cf',
  '0b21ad71-a3c2-45af-a31f-68e53dbb0fbb',
  'ebfbefdc-7179-4b27-9f96-eb28c25bfa02',
  'a9da301a-cd7d-48c9-b9b7-e78c12240e64',
  '5239a8cc-b5b5-45e2-89fe-e603a110fec9'
];
BEGIN
  UPDATE mac_checklist_itens SET ativo = false, atualizado_em = now()
   WHERE id = ANY(ids) AND ativo;
  RAISE NOTICE '1b: % item(ns) duplicado(s) desativado(s) (nunca apagados).', (SELECT count(*) FROM mac_checklist_itens WHERE id = ANY(ids) AND ativo = false);
END $$;

-- 2. Item 88e2317c (caixa de recarga) tinha uma 2ª frase exigindo
--    "aprovação do projeto sob regramento do Corpo de Bombeiro" — o
--    Fábio já tinha decidido nesta mesma sessão que Bombeiros fica
--    FORA do escopo do Aceite ("pra mim não entram"). Removida só essa
--    frase; a 1ª frase (memorial de cálculo da caixa) fica, com a
--    condicional explícita "se a caixa for apresentada" (D3: caixa não
--    é cobrada por padrão, mas se apresentada tem que estar certa).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM mac_checklist_itens
                  WHERE id = '88e2317c-11ed-4ed0-99e0-f456101fcf92'
                    AND position('CORPO DE BOMBEIRO' in texto) > 0) THEN
    RAISE NOTICE '2: item já sem a frase do Bombeiro — pulado.'; RETURN;
  END IF;
  UPDATE mac_checklist_itens
     SET texto = 'Informar em campo acima do carimbo:' || chr(10) ||
                  '“O MEMORIAL DE CÁLCULO DA CAIXA DE INFILTRAÇÃO (RECARGA) É DE RESPONSABILIDADE DO PROFISSIONAL QUE ASSINOU A ART/RRT DE EXECUÇÃO E PROJETO”, se a caixa for apresentada;',
         atualizado_em = now()
   WHERE id = '88e2317c-11ed-4ed0-99e0-f456101fcf92';
  RAISE NOTICE '2: item 88e2317c reescrito sem a exigência de Corpo de Bombeiro.';
END $$;

COMMIT;

-- ============================================================
-- CONFIRMADO nesta auditoria (não precisa de SQL, só registro): os
-- itens "mais de 7 pavimentos" e "APP/APM" da janela de indeferimento
-- do Aceite (Bloco D do plano docs/PLANO_LEITURA_INDIVIDUAL_E_ACEITE_SLOT2.md,
-- que eu tinha deixado como "perguntar ao Fábio") SÃO regra do próprio
-- Aceite — ver item de checklist 72a48f6f (grupo Levantamento):
-- "Para que o projeto seja passível de aprovação por Alvará de Aceite:
-- máximo de 7 pavimentos; altura máxima 21,00m; não obstruir/ocupar
-- APM, APP ou logradouro público". Mantidos como estavam.
-- ============================================================

-- ============================================================
-- NÃO INCLUÍDO AQUI (fora de escopo desta sessão / já coberto em
-- outro lugar):
--   • Item 74877912 ("041/03/2022") no checklist do SLOT 1: já
--     identificado e com SQL pronto (comentado, aguardando autorização
--     do Fábio) em supabase/correcoes/2026_09_18_auditoria_consolidado.sql,
--     Parte B, item B2. Não duplicar aqui.
--   • Os itens pendentes do Bloco D do plano (b1f69e47, 522314ae,
--     02589912, cfde2b8b, 70f42389, corredor viário): seguem aguardando
--     decisão do Fábio, tabela em
--     docs/PLANO_LEITURA_INDIVIDUAL_E_ACEITE_SLOT2.md.
-- ============================================================
