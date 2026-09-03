-- 2026_09_03_bdi_aguardando_retorno.sql
--
-- ✅ APLICADA em produção em 03/09/2026, depois de revisão do Fábio e reteste
--    completo em transação com ROLLBACK (mesmo método da Fase 1 do mesmo
--    recorte): CREATE VIEW + REVOKE rodados dentro da transação, resultado
--    conferido (35 ainda aguardando / 29 base insuficiente / 5 retornou,
--    security_invoker=true, grants só postgres/service_role), tudo desfeito,
--    confirmado por fora que a view não existia — só então aplicada de
--    verdade e reconferida ao vivo, mesmo resultado, sem divergência.
--
-- POR QUE ESTA VIEW
--
-- Fase 2 de "Inteligência URBIS — fechamento da base / fundação do
-- Co-Analista". Mede quanto tempo um processo fica esperando o interessado
-- responder a um despacho, e se já respondeu ou continua esperando —
-- usando só o que já é gravado hoje, sem evento novo:
--   · urbis_numeracao_uso.emitido_em  → quando o despacho saiu
--   · urbis_numeracao_uso.numero_analise → em qual passada
--   · analises_mac.criado_em da passada seguinte → quando "voltou"
--
-- ACHADO CRÍTICO ANTES DE DESENHAR: `urbis_numeracao_uso.tipo_documento`
-- NÃO distingue despacho ao interessado de despacho interno — os dois saem
-- da MESMA série ('despacho'), mesmo `tipo_documento`. Confirmado no código
-- (app/api/numeracao/proximo/route.ts, comentário explícito: "Despacho ao
-- interessado e Despacho Interno saem da MESMA série, então `tipo` não os
-- separa"). Por isso esta view NUNCA confia só em `tipo_documento='despacho'`
-- — cruza com `analises_mac.numero_despacho` (só a coluna do despacho AO
-- INTERESSADO) pra confirmar que o número é mesmo esse documento. Testado:
-- na amostra real de hoje, 0 casos de despacho interno disfarçado — mas a
-- proteção fica, porque o dado poderia ter isso amanhã.
--
-- 3 SITUAÇÕES, cada uma com prova diferente:
--   'retornou'           → existe analises_mac da passada seguinte; a data
--                           dela É a prova do retorno.
--   'ainda aguardando'   → não existe passada seguinte ainda; conta os dias
--                           até AGORA (intervalo aberto, cresce a cada
--                           consulta — não é estimativa, é fato "até este
--                           momento").
--   'base insuficiente'  → `numero_analise` nulo (registro antigo, campo
--                           começou a ser preenchido depois) OU o número
--                           não bate com `numero_despacho` (pode ser
--                           despacho interno, pode ser dado inconsistente —
--                           a view não tenta adivinhar qual dos dois, só
--                           recusa concluir).
--
-- O QUE ISTO NÃO É: não é "tempo de espera do analista" — só conta a partir
-- do momento em que o despacho JÁ SAIU (decisão do analista já tomada,
-- devolvida ao SEI). Tempo antes disso é tempo de análise, não de retorno,
-- e não entra aqui (ver vw_bdi_tempo_etapas / vw_bdi_analises_em_andamento
-- pra isso). Também não presume CAUSA do atraso — o interessado pode estar
-- lento, o SEI pode estar lento, o analista pode não ter aberto a próxima
-- passada ainda; a view só sabe que o relógio está correndo.
--
-- CUSTO ZERO: SQL sobre 2 tabelas que já existem e já são gravadas nos 3
-- slots (numeração é fonte única — CLAUDE.md). Nenhuma chamada a serviço
-- externo.
--
-- SEPARAÇÃO POR ASSUNTO: `tipo_processo` vem direto de `processos`, sem
-- hardcode de slug.
--
-- EXCLUSÃO: `JOIN processos p ON ... AND p.excluido_em IS NULL` — processo
-- na lixeira nunca aparece, mesmo padrão de todas as views deste recorte.
--
-- Segurança: mesmo padrão das views anteriores — security_invoker = true,
-- sem grant para anon/authenticated.

BEGIN;

CREATE OR REPLACE VIEW public.vw_bdi_aguardando_retorno
WITH (security_invoker = true) AS
  WITH candidatos AS (
    SELECT
      u.processo_codigo,
      u.numero_analise,
      u.emitido_em,
      u.numero,
      a.numero_despacho AS despacho_confirmado
    FROM urbis_numeracao_uso u
    LEFT JOIN analises_mac a
      ON a.processo_codigo = u.processo_codigo
     AND a.numero_analise = u.numero_analise
     AND a.excluido_em IS NULL
    WHERE u.tipo_documento = 'despacho'
  )
  SELECT
    c.processo_codigo,
    lower(p.tipo_processo)                                                        AS tipo_processo,
    c.numero_analise                                                              AS analise_que_gerou_despacho,
    c.emitido_em                                                                  AS despacho_emitido_em,
    prox.numero_analise                                                          AS proxima_analise,
    prox.criado_em                                                               AS proxima_analise_iniciada_em,
    CASE
      WHEN c.numero_analise IS NULL THEN NULL
      WHEN c.despacho_confirmado IS DISTINCT FROM c.numero::text THEN NULL
      WHEN prox.criado_em IS NOT NULL THEN round(extract(epoch FROM (prox.criado_em - c.emitido_em)) / 86400.0, 1)
      ELSE round(extract(epoch FROM (now() - c.emitido_em)) / 86400.0, 1)
    END                                                                            AS dias_aguardando_retorno,
    CASE
      WHEN c.numero_analise IS NULL THEN 'base insuficiente'
      WHEN c.despacho_confirmado IS DISTINCT FROM c.numero::text THEN 'base insuficiente'
      WHEN prox.criado_em IS NOT NULL THEN 'retornou'
      ELSE 'ainda aguardando'
    END                                                                            AS situacao
  FROM candidatos c
  JOIN processos p ON p.codigo = c.processo_codigo AND p.excluido_em IS NULL
  LEFT JOIN analises_mac prox
    ON prox.processo_codigo = c.processo_codigo
   AND prox.numero_analise = c.numero_analise + 1
   AND prox.excluido_em IS NULL
  ORDER BY situacao, dias_aguardando_retorno DESC NULLS LAST;

REVOKE ALL ON public.vw_bdi_aguardando_retorno FROM anon, authenticated, PUBLIC;

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 03/09/2026, só leitura contra produção
-- ======================================================================
-- 69 linhas totais (urbis_numeracao_uso, tipo_documento='despacho'):
--   ainda aguardando:   35  (mais antigo: 42,5 dias)
--   base insuficiente:  29  (27 sem numero_analise + 2 que não bateram
--                            com numero_despacho — nenhum era despacho
--                            interno disfarçado nesta amostra, mas a
--                            proteção continua valendo)
--   retornou:            5  (de 2,5 a 23,5 dias de espera)
--
-- Amostra "retornou":
--  processo             | passada | emitido em | retornou em | dias
--  25.5.000084973-0     | 2       | 22/07      | 14/08       | 23.5
--  24.28.000000406-7    | 1       | 13/08      | 31/08       | 17.9
--  26.5.000026140-3     | 1       | 12/08      | 14/08       | 2.5
-- ======================================================================
