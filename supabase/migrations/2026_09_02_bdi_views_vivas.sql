-- 2026_09_02_bdi_views_vivas.sql
--
-- ⚠️ NÃO APLICADA. Escrita para revisão do Fábio (decisão de 02/09/2026:
--    "não aplique migrations nem publique sem me mostrar os arquivos e testes").
--    Cada SELECT aqui já foi rodado contra o banco real por
--    scripts/validar_views_bdi.mts — 6 de 6 devolvem dado que faz sentido.
--
-- POR QUE ESTAS VIEWS
--
-- O BDI já está vivo e ninguém colhe: mac_historico tem 10.320 linhas e
-- auditoria_eventos 6.006, e nenhuma das 8 views que alimentam o painel lê
-- qualquer uma das duas. Estas seis views leem o que já está gravado.
--
-- CUSTO ZERO, e não por acaso: é tudo SQL sobre dado que já existe. Nenhuma
-- chamada a Gemini, ElevenLabs, Groq ou qualquer serviço cobrado. A regra
-- master do Fábio (02/09/2026) é custo zero absoluto, e estatística
-- determinística cumpre isso por construção.
--
-- NADA AQUI É PREVISÃO. São fatos contados, do jeito que aconteceram —
-- "triagem por evidência", não porcentagem de adivinhação (decisão 5).
--
-- Segurança: mesmo padrão do resto do banco — sem grant para anon/authenticated,
-- só a service_role alcança, e a permissão de quem vê o quê continua sendo
-- decidida na rota, como em /api/bdi/stats (restrita a Administrador).
-- security_invoker = true corrige, nas views novas, a fragilidade apontada na
-- auditoria de 01/09 (47 das 58 views antigas rodam com o privilégio de quem
-- criou, não de quem consulta).

BEGIN;

-- ======================================================================
-- 1. Tempo entre etapas
-- ----------------------------------------------------------------------
-- RESSALVA IMPORTANTE, ler antes de tirar conclusão: hoje a maioria dos
-- processos fecha com 0,0 dia, porque `analise_concluida_em` é carimbada na
-- geração do documento, e o analista costuma gerar tudo numa sentada só. O
-- número mede "quando saiu o documento", não "quanto tempo levou a análise".
-- Só 2 processos têm duração real (14,2 e 4,0 dias). Serve para acompanhar
-- daqui pra frente; não serve para medir o passado.
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_tempo_etapas
WITH (security_invoker = true) AS
  SELECT
    p.codigo,
    lower(p.tipo_processo)                        AS tipo_processo,
    p.analista_id,
    p.analise_iniciada_em,
    p.analise_concluida_em,
    round(extract(epoch FROM (p.analise_concluida_em - p.analise_iniciada_em)) / 86400.0, 1) AS dias,
    count(h.id)                                   AS marcacoes_no_mac
  FROM processos p
  LEFT JOIN mac_historico h ON h.processo_codigo = p.codigo
  WHERE p.excluido_em IS NULL
    AND p.analise_iniciada_em IS NOT NULL
    AND p.analise_concluida_em IS NOT NULL
  GROUP BY 1,2,3,4,5,6;

-- ======================================================================
-- 2. Retrabalho
-- ----------------------------------------------------------------------
-- Item que foi marcado, desmarcado e remarcado. `conforme -> nao_conforme`
-- é a marca do retrabalho; `nao_conforme -> conforme` é a exigência que o
-- interessado resolveu. O histórico separa os dois sentidos, então dá para
-- distinguir "o analista mudou de ideia" de "o projeto foi corrigido".
-- Ignora `status_anterior = '-'`, que é como o sistema grava a primeira
-- marcação de alguns itens (não é troca, é estreia).
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_retrabalho
WITH (security_invoker = true) AS
  SELECT
    h.processo_codigo,
    count(*) FILTER (WHERE h.status_anterior = 'conforme'     AND h.status_novo = 'nao_conforme') AS virou_nao_conforme,
    count(*) FILTER (WHERE h.status_anterior = 'nao_conforme' AND h.status_novo = 'conforme')     AS foi_resolvido,
    count(*) FILTER (WHERE h.status_anterior IS NOT NULL AND h.status_anterior <> '-'
                       AND h.status_novo IS NOT NULL AND h.status_anterior <> h.status_novo)      AS trocas_totais,
    max(h.criado_em)                                                                              AS ultima_troca
  FROM mac_historico h
  GROUP BY 1
  HAVING count(*) FILTER (WHERE h.status_anterior IS NOT NULL AND h.status_anterior <> '-'
                            AND h.status_novo IS NOT NULL AND h.status_anterior <> h.status_novo) > 0;

-- ======================================================================
-- 3. Exigências por contexto
-- ----------------------------------------------------------------------
-- O coração da triagem por evidência: o que costuma reprovar em processo
-- parecido com este. Recorta por assunto e por faixa de área construída.
-- `lower(tipo_processo)` porque o histórico gravou em duas grafias
-- (regularizacao e REGULARIZACAO) — sem normalizar, o mesmo assunto se
-- divide em duas linhas e some do topo do ranking.
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_exigencias_por_contexto
WITH (security_invoker = true) AS
  SELECT
    lower(h.tipo_processo)                        AS tipo_processo,
    CASE
      WHEN p.area_construida IS NULL THEN '(sem área)'
      WHEN p.area_construida < 100   THEN 'até 100 m²'
      WHEN p.area_construida < 300   THEN '100 a 300 m²'
      WHEN p.area_construida < 1000  THEN '300 a 1.000 m²'
      ELSE 'acima de 1.000 m²'
    END                                           AS faixa_area,
    p.dados->'bairro'->>'valor'                   AS bairro,
    h.item_texto                                  AS exigencia,
    h.checklist_item_id,
    count(*)                                      AS vezes,
    count(DISTINCT h.processo_codigo)             AS processos
  FROM mac_historico h
  JOIN processos p ON p.codigo = h.processo_codigo AND p.excluido_em IS NULL
  WHERE h.status_novo = 'nao_conforme'
    AND coalesce(trim(h.item_texto), '') <> ''
  GROUP BY 1,2,3,4,5;

-- ======================================================================
-- 4. Desempenho da referência legal
-- ----------------------------------------------------------------------
-- Qual lei mais tropeça. `referencia_legal` é texto livre e às vezes traz
-- várias leis juntas ("LC 314/2018, IR7/2024, LC364/2022"), então isto mede
-- desempenho da COMBINAÇÃO como ela foi gravada, não de artigo isolado.
-- Separar por artigo exigiria normalizar o campo — trabalho à parte, não
-- assumido aqui para não inventar precisão que o dado não tem.
-- Corte de 3 processos para não ranquear referência que apareceu uma vez.
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_desempenho_referencia
WITH (security_invoker = true) AS
  SELECT
    trim(h.referencia_legal)                                       AS referencia,
    count(*) FILTER (WHERE h.status_novo = 'nao_conforme')          AS reprovou,
    count(*) FILTER (WHERE h.status_novo = 'conforme')              AS passou,
    count(DISTINCT h.processo_codigo)                               AS processos,
    round(100.0 * count(*) FILTER (WHERE h.status_novo = 'nao_conforme')
          / nullif(count(*) FILTER (WHERE h.status_novo IN ('conforme','nao_conforme')), 0), 1) AS pct_reprova
  FROM mac_historico h
  WHERE coalesce(trim(h.referencia_legal), '') <> ''
  GROUP BY 1
  HAVING count(DISTINCT h.processo_codigo) >= 3;

-- ======================================================================
-- 5. Campos críticos do LIP
-- ----------------------------------------------------------------------
-- Vazio, X e incoerência. Vazio e X são coisas DIFERENTES e a view não
-- mistura: X afirma que o documento não traz aquilo (convenção do Slot 5);
-- vazio pode ser falha de leitura, e é o que merece olhar.
-- A área vem com vírgula decimal ("375,00") — sem trocar por ponto, o cast
-- estoura a consulta inteira. Valor não numérico vira NULL e a comparação
-- só não acusa, em vez de derrubar tudo.
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_campos_criticos
WITH (security_invoker = true) AS
  SELECT
    p.codigo,
    p.analista_id,
    lower(p.tipo_processo)                                                        AS tipo_processo,
    count(*) FILTER (WHERE coalesce(trim(v->>'valor'), '') = '')                  AS campos_vazios,
    count(*) FILTER (WHERE upper(trim(coalesce(v->>'valor', ''))) = 'X')          AS campos_em_x,
    count(*)                                                                      AS campos_totais,
    (p.area_construida > nullif(regexp_replace(replace(p.dados->'areaTerreno'->>'valor', '.', ''), ',', '.'), '')::numeric)
                                                                                  AS area_maior_que_terreno
  FROM processos p, LATERAL jsonb_each(p.dados) e(k, v)
  WHERE p.dados IS NOT NULL
    AND p.excluido_em IS NULL
    AND jsonb_typeof(v) = 'object'
  GROUP BY p.codigo, p.analista_id, p.tipo_processo, p.area_construida, p.dados;

-- ======================================================================
-- 6. Saldo da numeração
-- ----------------------------------------------------------------------
-- Avisa antes de travar a emissão. Hoje: 3 faixas já esgotadas, parecer com
-- 13 restantes (ATENÇÃO) e despacho com 42 (ok). É o alerta mais concreto
-- do conjunto — número exato, sem interpretação.
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_numeracao_saldo
WITH (security_invoker = true) AS
  SELECT
    f.id,
    f.usuario_id,
    f.tipo,
    f.ano,
    f.numero_inicial,
    f.numero_final,
    f.proximo,
    greatest(f.numero_final - f.proximo + 1, 0) AS restantes,
    CASE
      WHEN f.proximo > f.numero_final                 THEN 'ESGOTADA'
      WHEN (f.numero_final - f.proximo + 1) <= 5      THEN 'CRITICO'
      WHEN (f.numero_final - f.proximo + 1) <= 20     THEN 'ATENCAO'
      ELSE 'OK'
    END                                          AS situacao
  FROM urbis_numeracao_faixas f;

-- Mesma trava do resto do banco: nada para anon/authenticated.
REVOKE ALL ON public.vw_bdi_tempo_etapas             FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.vw_bdi_retrabalho               FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.vw_bdi_exigencias_por_contexto  FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.vw_bdi_desempenho_referencia    FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.vw_bdi_campos_criticos          FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.vw_bdi_numeracao_saldo          FROM anon, authenticated, PUBLIC;

COMMIT;
