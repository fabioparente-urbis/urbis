-- 2026_09_02_bdi_retorno_cobertura.sql
--
-- ✅ APLICADA em produção em 02/09/2026, depois de revisão do Fábio no SQL
--    e no teste abaixo. Confirmado por leitura direta no banco após aplicar:
--    as 2 views existem, security_invoker=true, grants só postgres/
--    service_role (sem anon/authenticated), 8 e 3 linhas respectivamente —
--    mesmo resultado do teste pré-aplicação, sem divergência.
--    Cada SELECT abaixo tinha rodado contra o banco real, só leitura, via um
--    script descartável (não versionado — mesma técnica de
--    scripts/validar_views_bdi.mts) antes de virar CREATE VIEW.
--
-- POR QUE ESTAS VIEWS
--
-- Continuação de [[urbis-bdi-fundacao-dados]] / da fase "BDI como base do
-- Co-Analista": só leem fato que já existe nos 3 slots (analises_mac,
-- mdp_registros, mrp_registros, processos) — nenhuma regra de análise de
-- slot é tocada, nenhum LIP/MAC/documento é alterado. Transversal por
-- observação, não por regra (CLAUDE.md).
--
-- CUSTO ZERO: SQL sobre dado que já existe, nenhuma chamada a serviço
-- externo. NADA AQUI É PREVISÃO — são fatos contados.
--
-- Segurança: mesmo padrão de 2026_09_02_bdi_views_vivas.sql —
-- security_invoker = true, sem grant para anon/authenticated.

BEGIN;

-- ======================================================================
-- 1. Retorno por slot
-- ----------------------------------------------------------------------
-- "Retorno" aqui é definido como já documentado na auditoria: um processo
-- com mais de uma passada em analises_mac (max(numero_analise) > 1). Não é
-- um evento de "veio de volta do SEI" — é a única coisa que o banco de hoje
-- consegue provar. Contagem por processo (não por passada), porque a
-- pergunta que interessa é "quantos processos voltam", não "quantas vezes
-- a tabela analises_mac cresceu".
--
-- RESSALVA (visível no teste): fora de Regularização, o volume é baixíssimo
-- — Aceite SEI e Slot 5 têm 1-2 processos por faixa hoje. Percentual de
-- retorno para esses dois slots não é publicável ainda; só Regularização
-- tem massa (23-25 processos por faixa) para um número fazer sentido.
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_retorno_por_slot
WITH (security_invoker = true) AS
  WITH passadas AS (
    SELECT processo_codigo, max(numero_analise) AS max_analise
    FROM analises_mac
    WHERE excluido_em IS NULL
    GROUP BY processo_codigo
  )
  SELECT
    lower(p.tipo_processo) AS tipo_processo,
    CASE
      WHEN p.area_construida IS NULL THEN '(sem área)'
      WHEN p.area_construida < 100   THEN 'até 100 m²'
      WHEN p.area_construida < 300   THEN '100 a 300 m²'
      WHEN p.area_construida < 1000  THEN '300 a 1.000 m²'
      ELSE 'acima de 1.000 m²'
    END                                                                       AS faixa_area,
    count(*)                                                                  AS processos,
    count(*) FILTER (WHERE a.max_analise > 1)                                 AS processos_com_retorno,
    round(100.0 * count(*) FILTER (WHERE a.max_analise > 1)
          / nullif(count(*), 0), 1)                                          AS pct_retorno,
    round(avg(a.max_analise) FILTER (WHERE a.max_analise > 1), 2)             AS media_passadas_quando_retorna,
    sum(greatest(a.max_analise - 1, 0))                                       AS passadas_extras_total
  FROM passadas a
  JOIN processos p ON p.codigo = a.processo_codigo AND p.excluido_em IS NULL
  GROUP BY 1, 2;

-- ======================================================================
-- 2. Cobertura de satélite
-- ----------------------------------------------------------------------
-- Detector do "buraco" que a auditoria de eventos achou: MDP gravado
-- client-only sem fallback de servidor (Slot 1/2), MRP em dobro no despacho
-- do Slot 2, MRP no-op no laudo do Slot 1. Ancora em analises_mac (numero_
-- despacho / numero_parecer / numero_despacho_interno), porque é o dado
-- mais confiável de "documento saiu" — a numeração só é commitada depois
-- que o docx já foi gerado. Cruza com mdp_registros/mrp_registros pelo
-- número em texto + processo_codigo.
--
-- RESSALVA (não confirmada, checar antes de decidir algo em cima disto):
-- não verifiquei se o fluxo de indeferimento grava o número em
-- analises_mac.numero_despacho ou em numero_parecer — a rotulagem
-- "tipo_documento" abaixo prioriza numero_despacho no COALESCE, então um
-- indeferimento pode estar rotulado como "despacho" em vez de "parecer".
-- O teste de hoje só devolveu linhas com tipo_documento = 'despacho' — pode
-- ser que não haja parecer/despacho_interno emitido ainda, ou pode ser essa
-- rotulagem escondendo o caso. Não tratar o corte por tipo_documento como
-- definitivo até isso ser conferido.
--
-- NÃO cruza com auditoria_eventos: o número emitido não está numa coluna
-- própria lá (fica dentro do jsonb `detalhe`, formato não confirmado) —
-- juntar por isso seria inventar uma precisão que o dado não garante.
--
-- RESULTADO REAL DE HOJE (02/09/2026), já preocupante: despacho de
-- Regularização só tem MDP em 66,7% das emissões (44 de 66) e MRP em 71,2%
-- (47 de 66) — bate exatamente com o achado da auditoria de que a gravação
-- de MDP no despacho/indeferimento do Slot 1 é só client-side, sem
-- fallback de servidor. Slot 5 e Aceite SEI aparecem 100% cobertos, mas com
-- só 2 emissões cada — volume baixo demais para tirar conclusão.
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_cobertura_satelite
WITH (security_invoker = true) AS
  WITH emissoes AS (
    SELECT
      a.processo_codigo,
      lower(p.tipo_processo)                                                 AS tipo_processo,
      a.numero_analise,
      coalesce(a.numero_despacho, a.numero_parecer, a.numero_despacho_interno) AS numero_emitido,
      CASE
        WHEN a.numero_despacho IS NOT NULL          THEN 'despacho'
        WHEN a.numero_parecer IS NOT NULL            THEN 'parecer'
        WHEN a.numero_despacho_interno IS NOT NULL   THEN 'despacho_interno'
      END                                                                     AS tipo_documento
    FROM analises_mac a
    JOIN processos p ON p.codigo = a.processo_codigo AND p.excluido_em IS NULL
    WHERE a.excluido_em IS NULL
      AND coalesce(a.numero_despacho, a.numero_parecer, a.numero_despacho_interno) IS NOT NULL
  )
  SELECT
    e.tipo_processo,
    e.tipo_documento,
    count(*)                                          AS emitidos,
    count(*) FILTER (WHERE m.id IS NOT NULL)           AS com_mdp,
    count(*) FILTER (WHERE r.id IS NOT NULL)           AS com_mrp,
    count(*) FILTER (WHERE m.id IS NULL)               AS faltando_mdp,
    count(*) FILTER (WHERE r.id IS NULL)               AS faltando_mrp,
    round(100.0 * count(*) FILTER (WHERE m.id IS NOT NULL) / nullif(count(*), 0), 1) AS pct_mdp,
    round(100.0 * count(*) FILTER (WHERE r.id IS NOT NULL) / nullif(count(*), 0), 1) AS pct_mrp
  FROM emissoes e
  LEFT JOIN mdp_registros m ON m.processo_codigo = e.processo_codigo AND m.numero = e.numero_emitido
  LEFT JOIN mrp_registros r ON r.processo_codigo = e.processo_codigo AND r.numero_despacho = e.numero_emitido
  GROUP BY 1, 2;

-- Mesma trava do resto do banco: nada para anon/authenticated.
REVOKE ALL ON public.vw_bdi_retorno_por_slot     FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.vw_bdi_cobertura_satelite   FROM anon, authenticated, PUBLIC;

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 02/09/2026, só leitura contra produção
-- ======================================================================
--
-- vw_bdi_retorno_por_slot:
--  tipo_processo  | faixa_area          | processos | com_retorno | pct_retorno | media_passadas | extras
--  regularizacao  | 100 a 300 m²        | 23        | 9           | 39.1        | 2.11           | 10
--  regularizacao  | até 100 m²          | 3         | 1           | 33.3        | 2.00           | 1
--  regularizacao  | acima de 1.000 m²   | 8         | 2           | 25.0        | 4.00           | 6
--  regularizacao  | 300 a 1.000 m²      | 25        | 6           | 24.0        | 2.33           | 8
--  aceite_sei     | (sem área)          | 2         | 0           | 0.0         | —              | 0
--  slot_05        | 300 a 1.000 m² / acima de 1.000 m² / 100 a 300 m² | 1 cada | 0 | 0.0 | — | 0
--
-- vw_bdi_cobertura_satelite:
--  tipo_processo  | tipo_documento | emitidos | com_mdp | com_mrp | faltando_mdp | faltando_mrp | pct_mdp | pct_mrp
--  regularizacao  | despacho       | 66       | 44      | 47      | 22           | 19           | 66.7    | 71.2
--  slot_05        | despacho       | 2        | 2       | 2       | 0            | 0            | 100.0   | 100.0
--  aceite_sei     | despacho       | 2        | 2       | 2       | 0            | 0            | 100.0   | 100.0
-- ======================================================================
