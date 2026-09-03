-- 2026_09_02_bdi_retrabalho_por_passada.sql
--
-- SQL validado só-leitura contra produção em 02/09/2026 antes de aplicar
-- (mesma regra de sempre). 44 linhas reais, 8 processos distintos, 0 sem
-- item_texto — resultado completo no rodapé deste arquivo.
--
-- POR QUE ESTA VIEW
--
-- Continuação do recorte "BDI vivo — inteligência por evidência". A view já
-- aplicada `vw_bdi_retrabalho` conta troca de status (conforme ↔ não
-- conforme) por processo, mas mistura dois fatos bem diferentes: o analista
-- mudando de ideia DENTRO da mesma passada (normal, é o trabalho
-- acontecendo) e um item que só foi corrigido DEPOIS que o processo voltou
-- numa passada nova (retrabalho de verdade — o interessado teve que agir de
-- novo). Hoje as duas coisas somam no mesmo número.
--
-- Esta view separa e detalha: liga cada troca em `mac_historico` à passada
-- (`analises_mac.numero_analise`) via `analise_id`, ordena as trocas do
-- MESMO item por data, e compara cada troca com a troca anterior do mesmo
-- item. Devolve UMA LINHA por troca que aconteceu numa passada diferente da
-- troca anterior — o "motivo" (texto da exigência) e a passada em que
-- voltou, não só uma contagem agregada.
--
-- COBERTURA DO DADO (checada antes de desenhar): das 4.518 trocas em
-- mac_historico, 4.439 (98,3%) ligam a uma análise real via analise_id — só
-- 79 ficam órfãs (analise_id apontando pra linha que não existe mais,
-- provavelmente excluída) e essas simplesmente não entram na comparação,
-- não distorcem o resultado. Das 4.439, 44 trocas em 8 processos aconteceram
-- numa passada diferente da troca anterior do mesmo item — é isso que a
-- view lista.
--
-- CUSTO ZERO: SQL sobre mac_historico e analises_mac, que já existem e já
-- são gravados nos 3 slots. Nenhuma chamada a serviço externo.
--
-- NÃO É PREVISÃO: cada linha é uma troca de status JÁ REGISTRADA, comparada
-- com a troca anterior do MESMO item. Não estima retrabalho futuro, não
-- atribui causa (o dado não diz SE foi o interessado que corrigiu ou o
-- analista que reconsiderou entre uma passada e outra — só que a marca
-- mudou depois que uma nova passada começou).
--
-- Segurança: mesmo padrão das views anteriores — security_invoker = true,
-- sem grant para anon/authenticated.

BEGIN;

CREATE OR REPLACE VIEW public.vw_bdi_retrabalho_por_passada
WITH (security_invoker = true) AS
  WITH trocas AS (
    SELECT
      h.processo_codigo, h.checklist_item_id, h.item_texto, h.referencia_legal, h.aba,
      a.numero_analise, h.status_anterior, h.status_novo, h.criado_em,
      row_number() OVER (PARTITION BY h.processo_codigo, h.checklist_item_id ORDER BY h.criado_em) AS seq
    FROM mac_historico h
    JOIN analises_mac a ON a.id = h.analise_id
    WHERE h.status_anterior IS NOT NULL AND h.status_anterior <> '-'
      AND h.status_novo IS NOT NULL AND h.status_anterior <> h.status_novo
  )
  SELECT
    t2.processo_codigo,
    t2.item_texto      AS exigencia,
    t2.aba,
    t2.referencia_legal,
    t1.numero_analise   AS passada_anterior,
    t1.status_novo       AS status_na_passada_anterior,
    t2.numero_analise   AS passada_atual,
    t2.status_anterior   AS status_antes_da_volta,
    t2.status_novo       AS status_depois_da_volta,
    t2.criado_em         AS voltou_em
  FROM trocas t1
  JOIN trocas t2
    ON t2.processo_codigo = t1.processo_codigo
   AND t2.checklist_item_id = t1.checklist_item_id
   AND t2.seq = t1.seq + 1
  WHERE t2.numero_analise <> t1.numero_analise
  ORDER BY t2.processo_codigo, t2.criado_em;

REVOKE ALL ON public.vw_bdi_retrabalho_por_passada FROM anon, authenticated, PUBLIC;

COMMIT;
