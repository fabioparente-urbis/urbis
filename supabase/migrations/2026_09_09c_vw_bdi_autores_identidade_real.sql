-- Achado da auditoria de 01-02/09/2026 (memória urbis_bdi_fundacao_dados),
-- nunca corrigido: `vw_bdi_autores` derivava autor/registro direto de
-- `processos.dados ->> 'campo'`, mas esses campos são objetos
-- {fonte, valor, origem} (mesmo padrão de `dados->'bairro'->>'valor'` usado
-- em vw_bdi_por_bairro) — `->>` sem o passo `->'valor'` devolvia o JSON
-- inteiro serializado como texto no lugar do nome/registro. Confirmado ao
-- vivo em 09/09/2026: `autor` chegava como
-- '{"fonte": "...", "valor": "FULANO", "origem": "urbis"}'.
--
-- Segundo achado, também nunca corrigido: agregava por texto livre do nome
-- em vez da identidade validada. Desde então (Fase 9 do mandato de 12 fases,
-- 05/09/2026) o projeto já tem `profissionais` + `processo_profissionais`
-- com sincronização ao vivo (lib/profissionais/sincronizar.ts) — é a fonte
-- correta de identidade, não algo a reinventar aqui.
--
-- Esta view passa a ler de `processo_profissionais`/`profissionais` em vez
-- de reparsear `processos.dados`. Também passa a filtrar `p.excluido_em IS
-- NULL` (mesmo bug de processo excluído ainda contar, já corrigido em
-- vw_bdi_por_assunto/vw_bdi_resumo_geral em 02/09) e expõe `validado` como
-- coluna própria.
--
-- NÃO reabre a torneira pro painel: a regra já decidida (mesma memória,
-- aplicada no commit c56c179 antes mesmo da auditoria) é "nenhum agregado
-- nominal sai sem identidade validada" — hoje `profissionais.validado` é
-- false em 26/26, então mesmo corrigida a view continua fora de
-- app/api/bdi/stats/route.ts. Corrige o dado na fonte; a decisão de expor
-- fica pra quando (e se) o Fábio validar profissionais.

CREATE OR REPLACE VIEW public.vw_bdi_autores AS
 WITH nao_conf AS (
         SELECT am.processo_codigo,
            count(*) FILTER (WHERE v.status = 'nao_conforme'::text) AS total_nao_conformidades
           FROM analises_mac am,
            LATERAL jsonb_each_text(COALESCE(am.itens, '{}'::jsonb)) v(chave, status)
          GROUP BY am.processo_codigo
        ), analises_count AS (
         SELECT analises_mac.processo_codigo,
            count(*) AS total_analises
           FROM analises_mac
          GROUP BY analises_mac.processo_codigo
        ), vinculos AS (
         SELECT prof.id AS profissional_id,
            prof.nome_normalizado AS autor,
            COALESCE(prof.cau, prof.crea) AS registro,
                CASE pp.papel
                    WHEN 'autor_arquiteto' THEN 'CAU'
                    WHEN 'responsavel_engenheiro' THEN 'CREA'
                    ELSE upper(pp.papel)
                END AS tipo_registro,
            prof.validado,
            p.codigo AS processo_codigo,
            p.status AS status_processo,
            a.nome AS assunto
           FROM processo_profissionais pp
             JOIN profissionais prof ON prof.id = pp.profissional_id AND prof.merged_into_id IS NULL
             JOIN processos p ON p.id = pp.processo_id AND p.excluido_em IS NULL
             LEFT JOIN assuntos a ON a.id = p.assunto_id
          WHERE pp.ativo
        )
 SELECT v.autor,
    v.registro,
    v.tipo_registro,
    v.assunto,
    v.status_processo,
    count(DISTINCT v.processo_codigo) AS total_processos,
    COALESCE(sum(ac.total_analises), 0::numeric)::bigint AS total_analises,
    COALESCE(sum(nc.total_nao_conformidades), 0::numeric) AS total_nao_conformidades,
        CASE
            WHEN count(DISTINCT v.processo_codigo) > 0 THEN round(COALESCE(sum(nc.total_nao_conformidades), 0::numeric) / count(DISTINCT v.processo_codigo)::numeric, 2)
            ELSE 0::numeric
        END AS erros_por_processo,
    v.validado
   FROM vinculos v
     LEFT JOIN analises_count ac ON ac.processo_codigo = v.processo_codigo
     LEFT JOIN nao_conf nc ON nc.processo_codigo = v.processo_codigo
  GROUP BY v.profissional_id, v.autor, v.registro, v.tipo_registro, v.assunto, v.status_processo, v.validado
  ORDER BY (
        CASE
            WHEN count(DISTINCT v.processo_codigo) > 0 THEN round(COALESCE(sum(nc.total_nao_conformidades), 0::numeric) / count(DISTINCT v.processo_codigo)::numeric, 2)
            ELSE 0::numeric
        END) DESC;
