-- BDI: dois achados da auditoria de 02/09/2026 (ver memória
-- urbis_bdi_fundacao_dados) que ainda não tinham sido corrigidos.
--
-- 1) total_retornos sempre zero: lia processos.eh_retorno, que nunca foi
--    preenchido (0/86 = true). Substituto real: analises_mac.numero_analise
--    > 1 já é o sinal de retorno usado (e correto) em vw_bdi_retorno_por_slot
--    — aqui só se reaplica o mesmo critério nas 3 views que ainda usavam o
--    campo morto.
-- 2) tempo_medio_horas sempre zero: lia processos.tempo_total_analise, que
--    nunca foi preenchido (0/82). Não existe hoje nenhum campo com dado
--    suficiente para virar um "tempo médio" real e confiável (só 11/82
--    processos têm analise_iniciada_em + analise_concluida_em, e alguns
--    desses fecham no mesmo dia, minutos depois — não é tempo de análise
--    real). Em vez de inventar um substituto, a média para de forçar 0 via
--    COALESCE: fica NULL quando não há nenhum processo com o campo
--    preenchido no grupo, e a tela (app/admin/bdi/page.tsx) mostra "—" em
--    vez de "0.0" — não mais fingir um dado que não existe.

CREATE OR REPLACE VIEW public.vw_bdi_analistas_desempenho AS
 WITH retornos AS (
         SELECT DISTINCT analises_mac.processo_codigo
           FROM analises_mac
          WHERE analises_mac.excluido_em IS NULL AND analises_mac.numero_analise > 1
        )
 SELECT u.nome AS analista,
    u.gerencia,
    count(DISTINCT p.id) AS total_processos,
    COALESCE(sum(p.area_construida), 0::numeric) AS area_total,
    avg(EXTRACT(epoch FROM p.tempo_total_analise) / 3600::numeric) AS tempo_medio_horas,
    count(DISTINCT
        CASE
            WHEN r.processo_codigo IS NOT NULL THEN p.id
            ELSE NULL::uuid
        END) AS total_retornos,
    COALESCE(sum(m.pontos), 0::numeric) AS pontos_totais_mrp,
    count(DISTINCT m.id) AS despachos_mrp,
    a.nome AS assunto
   FROM processos p
     LEFT JOIN usuarios u ON p.analista_id = u.id
     LEFT JOIN assuntos a ON p.assunto_id = a.id
     LEFT JOIN mrp_registros m ON m.usuario_id = u.id AND m.processo_codigo = p.codigo
     LEFT JOIN retornos r ON r.processo_codigo = p.codigo
  WHERE a.nome !~~ 'Slot%'::text OR a.nome IS NULL
  GROUP BY u.id, u.nome, u.gerencia, a.id, a.nome;

CREATE OR REPLACE VIEW public.vw_bdi_por_analista AS
 SELECT u.nome AS analista,
    u.gerencia,
    count(p.id) AS total_processos,
    COALESCE(sum(p.area_construida), 0::numeric) AS area_total,
    avg(EXTRACT(epoch FROM p.tempo_total_analise) / 3600::numeric) AS tempo_medio_horas
   FROM processos p
     JOIN usuarios u ON p.analista_id = u.id
     JOIN assuntos a ON p.assunto_id = a.id
  WHERE a.nome !~~ 'Slot%'::text
  GROUP BY u.id, u.nome, u.gerencia;

CREATE OR REPLACE VIEW public.vw_bdi_por_assunto AS
 WITH retornos AS (
         SELECT DISTINCT analises_mac.processo_codigo
           FROM analises_mac
          WHERE analises_mac.excluido_em IS NULL AND analises_mac.numero_analise > 1
        )
 SELECT a.nome AS assunto,
    count(p.id) AS total_processos,
    COALESCE(sum(p.area_construida), 0::numeric) AS area_total,
    COALESCE(avg(p.area_construida), 0::numeric) AS area_media,
    count(
        CASE
            WHEN r.processo_codigo IS NOT NULL THEN 1
            ELSE NULL::integer
        END) AS total_retornos,
    p.porte,
    count(p.id) AS count_porte
   FROM processos p
     JOIN assuntos a ON p.assunto_id = a.id
     LEFT JOIN retornos r ON r.processo_codigo = p.codigo
  WHERE a.nome !~~ 'Slot%'::text
  GROUP BY a.id, a.nome, p.porte;

CREATE OR REPLACE VIEW public.vw_bdi_resumo_geral AS
 WITH retornos AS (
         SELECT DISTINCT analises_mac.processo_codigo
           FROM analises_mac
          WHERE analises_mac.excluido_em IS NULL AND analises_mac.numero_analise > 1
        )
 SELECT count(DISTINCT p.id) AS total_processos,
    count(DISTINCT p.analista_id) AS total_analistas,
    COALESCE(sum(p.area_construida), 0::numeric) AS area_total_construida,
    COALESCE(avg(p.area_construida), 0::numeric) AS area_media,
    count(
        CASE
            WHEN r.processo_codigo IS NOT NULL THEN 1
            ELSE NULL::integer
        END) AS total_retornos,
    count(DISTINCT (p.dados -> 'bairro'::text) ->> 'valor'::text) AS total_bairros
   FROM processos p
     JOIN assuntos a ON p.assunto_id = a.id
     LEFT JOIN retornos r ON r.processo_codigo = p.codigo
  WHERE a.nome !~~ 'Slot%'::text;
