-- VIEWS — definicao real (o repo nao tem o SQL de nenhuma delas)
-- Gerado por scripts/extrair_schema.mts em 2026-09-05.
-- NAO EDITE A MAO: regenere.

-- ======================================================================
-- mrp_painel_diario
-- opcoes: security_invoker=true
-- ======================================================================
CREATE OR REPLACE VIEW public.mrp_painel_diario AS
 SELECT usuario_id,
    ano,
    mes,
    date_trunc('day'::text, data_despacho)::date AS dia,
    count(*)::integer AS despachos,
    sum(pontos)::numeric(8,1) AS pontos,
    sum(area_construida)::numeric(14,2) AS area_total
   FROM mrp_registros r
  GROUP BY usuario_id, ano, mes, (date_trunc('day'::text, data_despacho));

-- ======================================================================
-- v_diretoria_mes
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_diretoria_mes AS
 WITH base AS (
         SELECT p.id,
            p.porte,
            p.status,
            p.analista_id,
            p.gerencia,
            p.diretoria,
            e.nome AS analista_nome
           FROM processos p
             JOIN equipe e ON e.id = p.analista_id
          WHERE date_trunc('month'::text, p.criado_em) = date_trunc('month'::text, now())
        ), t AS (
         SELECT etapa_tempo_sessoes.processo_id,
            sum(EXTRACT(epoch FROM COALESCE(etapa_tempo_sessoes.finalizado_em, now()) - etapa_tempo_sessoes.iniciado_em)) / 3600.0 AS horas_trabalhadas
           FROM etapa_tempo_sessoes
          GROUP BY etapa_tempo_sessoes.processo_id
        )
 SELECT date_trunc('month'::text, now())::date AS mes,
    base.diretoria,
    base.gerencia,
    base.analista_id,
    base.analista_nome,
    count(*) AS total_processos_mes,
    sum(
        CASE
            WHEN base.status = ANY (ARRAY['CONCLUIDO'::status_processo_enum, 'ARQUIVADO'::status_processo_enum, 'INDEFERIDO'::status_processo_enum]) THEN 1
            ELSE 0
        END) AS finalizados_mes,
    sum(
        CASE base.porte
            WHEN 'PP'::porte_enum THEN 1
            WHEN 'MP'::porte_enum THEN 2
            WHEN 'GP'::porte_enum THEN 3
            ELSE 0
        END) AS pontuacao_mes,
    COALESCE(sum(t.horas_trabalhadas), 0::numeric) AS horas_trabalhadas_mes
   FROM base
     LEFT JOIN t ON t.processo_id = base.id
  GROUP BY base.diretoria, base.gerencia, base.analista_id, base.analista_nome
  ORDER BY (sum(
        CASE base.porte
            WHEN 'PP'::porte_enum THEN 1
            WHEN 'MP'::porte_enum THEN 2
            WHEN 'GP'::porte_enum THEN 3
            ELSE 0
        END)) DESC, (sum(
        CASE
            WHEN base.status = ANY (ARRAY['CONCLUIDO'::status_processo_enum, 'ARQUIVADO'::status_processo_enum, 'INDEFERIDO'::status_processo_enum]) THEN 1
            ELSE 0
        END)) DESC;

-- ======================================================================
-- v_documento_vigente_por_tipo
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_documento_vigente_por_tipo AS
 SELECT DISTINCT ON (processo_id, tipo_documento) processo_id,
    tipo_documento,
    id AS ingestao_id_vigente,
    status_doc,
    data_documento,
    coletado_em,
    sei_doc_id,
    sei_numero,
    nome_arquivo,
    hash_conteudo,
    extraido_json
   FROM processo_documento_ingestao
  WHERE status_doc = 'ATIVO'::text
  ORDER BY processo_id, tipo_documento, (COALESCE(data_documento, coletado_em)) DESC, coletado_em DESC;

-- ======================================================================
-- v_equipe_publica
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_equipe_publica AS
 SELECT id,
    nome,
    matricula,
    papel,
    gerencia,
    diretoria,
    ativo
   FROM equipe;

-- ======================================================================
-- v_fila_por_analista
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_fila_por_analista AS
 WITH ov AS (
         SELECT o.processo_id,
            o.analista_id,
            o.posicao,
            o.motivo,
            o.expira_em,
            o.criado_em,
            row_number() OVER (PARTITION BY o.processo_id, o.analista_id ORDER BY o.criado_em DESC) AS rn
           FROM processo_fila_overrides o
          WHERE o.expira_em IS NULL OR o.expira_em > now()
        ), ov1 AS (
         SELECT ov.processo_id,
            ov.analista_id,
            ov.posicao,
            ov.motivo,
            ov.expira_em,
            ov.criado_em,
            ov.rn
           FROM ov
          WHERE ov.rn = 1
        )
 SELECT p.id AS processo_id,
    p.analista_id,
    p.status,
    p.criado_em,
    p.iniciado_em,
    p.eh_retorno,
    p.retorno_em,
    COALESCE(ov1.posicao, NULL::integer) AS override_posicao,
    ov1.motivo AS override_motivo,
        CASE
            WHEN p.iniciado_em IS NULL AND p.eh_retorno IS TRUE THEN 0
            WHEN p.iniciado_em IS NULL THEN 1
            ELSE 9
        END AS fila_tipo,
        CASE
            WHEN p.iniciado_em IS NULL AND p.eh_retorno IS TRUE THEN COALESCE(p.retorno_em, p.criado_em::timestamp with time zone)
            WHEN p.iniciado_em IS NULL THEN p.criado_em::timestamp with time zone
            ELSE p.criado_em::timestamp with time zone
        END AS fila_ts
   FROM processos p
     LEFT JOIN ov1 ON ov1.processo_id = p.id AND ov1.analista_id = p.analista_id
  WHERE p.analista_id IS NOT NULL AND p.iniciado_em IS NULL;

-- ======================================================================
-- v_lip_documentos
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_documentos AS
 SELECT id,
    processo_id,
    ordem,
    item_tipo,
    item_titulo,
    item_referencia,
    status_item,
    criado_em
   FROM urbis_lip_indice l;

-- ======================================================================
-- v_lip_documentos_ativos
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_documentos_ativos AS
 SELECT i.id,
    i.processo_id,
    i.ordem,
    i.item_tipo,
    i.item_titulo,
    i.item_referencia,
    pdi.nome_arquivo,
    pdi.tipo_documento,
    pdi.status_doc,
    i.criado_em
   FROM urbis_lip_indice i
     JOIN processo_documento_ingestao pdi ON pdi.id = i.item_referencia::uuid
  WHERE pdi.status_doc = 'ATIVO'::text;

-- ======================================================================
-- v_lip_etapa_atual
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_etapa_atual AS
 WITH e AS (
         SELECT urbis_lip_eventos.processo_id,
            max(
                CASE
                    WHEN urbis_lip_eventos.evento_tipo = 'CHEADV'::text AND urbis_lip_eventos.finalizado_em IS NOT NULL THEN 2
                    ELSE 0
                END) AS passou_cheadv,
            max(
                CASE
                    WHEN urbis_lip_eventos.evento_tipo = 'GERFEP'::text AND urbis_lip_eventos.finalizado_em IS NOT NULL THEN 3
                    ELSE 0
                END) AS passou_gerfep,
            max(
                CASE
                    WHEN (urbis_lip_eventos.evento_tipo = ANY (ARRAY['BUSCA_ARQ'::text, 'BUSCA_ARQUIVO'::text])) AND urbis_lip_eventos.finalizado_em IS NOT NULL THEN 4
                    ELSE 0
                END) AS passou_busca,
            max(
                CASE
                    WHEN (urbis_lip_eventos.evento_tipo = ANY (ARRAY['ANALISE'::text, 'MINHA_ANALISE'::text])) AND urbis_lip_eventos.iniciado_em IS NOT NULL AND urbis_lip_eventos.finalizado_em IS NULL THEN 5
                    ELSE 0
                END) AS em_analise,
            max(
                CASE
                    WHEN (urbis_lip_eventos.evento_tipo = ANY (ARRAY['ARQUIVAMENTO'::text, 'LAUDO'::text, 'SAIDA'::text])) AND urbis_lip_eventos.finalizado_em IS NOT NULL THEN 6
                    ELSE 0
                END) AS saiu
           FROM urbis_lip_eventos
          GROUP BY urbis_lip_eventos.processo_id
        ), etapa AS (
         SELECT e.processo_id,
            GREATEST(COALESCE(e.passou_cheadv, 0), COALESCE(e.passou_gerfep, 0), COALESCE(e.passou_busca, 0), COALESCE(e.em_analise, 0), COALESCE(e.saiu, 0), 1) AS ordem_etapa
           FROM e
        )
 SELECT etapa.processo_id,
    fe.ordem,
    fe.etapa_codigo,
    fe.etapa_nome,
    fe.cor
   FROM etapa
     JOIN urbis_lip_fluxo_etapas fe ON fe.ordem = etapa.ordem_etapa
  WHERE fe.ativo = true;

-- ======================================================================
-- v_lip_indice_documentos
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_indice_documentos AS
 SELECT processo_id,
    ('('::text || sei_doc_id) || ')'::text AS documento_sei,
    tipo_documento,
    nome_arquivo,
    status_doc,
    coletado_em
   FROM processo_documento_ingestao pdi
  WHERE sei_doc_id IS NOT NULL
  ORDER BY coletado_em;

-- ======================================================================
-- v_lip_indice_json
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_indice_json AS
 SELECT processo_id,
    COALESCE(jsonb_agg(jsonb_build_object('ordem', ordem, 'item_tipo', item_tipo, 'item_titulo', item_titulo, 'item_referencia', item_referencia, 'status_item', status_item, 'criado_em', criado_em) ORDER BY ordem), '[]'::jsonb) AS indice_json
   FROM urbis_lip_indice
  GROUP BY processo_id;

-- ======================================================================
-- v_lip_indice_preview
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_indice_preview AS
 SELECT p.id AS processo_id,
    p.numero_sei AS processo_sei,
    i.tipo_documento,
    i.nome_documento,
    fmt_doc_sei(pdi.sei_doc_id) AS documento_sei,
    i.pagina_inicial,
    i.pagina_final,
    i.total_paginas,
    COALESCE(i.data_emissao::text, ''::text) AS data_emissao,
    COALESCE(i.emitido_por, ''::text) AS emitido_por,
    COALESCE(i.departamento_origem, ''::text) AS departamento_origem,
    i.versao,
    i.eh_ultima_versao,
    i.status_documento
   FROM processos p
     LEFT JOIN v_urbis_lip_indice i ON i.processo_id = p.id
     LEFT JOIN processo_documento_ingestao pdi ON pdi.processo_id = p.id AND pdi.tipo_documento = i.tipo_documento AND pdi.nome_arquivo = i.nome_documento
  WHERE p.id IS NOT NULL;

-- ======================================================================
-- v_lip_lista
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_lista AS
 SELECT processo_id,
    total_documentos,
    ultimo_movimento
   FROM v_lip_lista_processos;

-- ======================================================================
-- v_lip_lista_processos
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_lista_processos AS
 SELECT processo_id,
    count(*) AS total_documentos,
    max(criado_em) AS ultimo_movimento
   FROM v_lip_processo_aberto
  GROUP BY processo_id
  ORDER BY (max(criado_em)) DESC;

-- ======================================================================
-- v_lip_painel
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_painel AS
 SELECT p.processo_id,
    jsonb_build_object('etapa_codigo', ea.etapa_codigo) AS etapa_atual,
    jsonb_build_object('total', COALESCE(da.total_docs, 0)) AS documentos_ativos,
    ij.indice_json
   FROM v_lip_lista_processos p
     LEFT JOIN v_lip_etapa_atual ea ON ea.processo_id = p.processo_id
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS total_docs
           FROM v_lip_documentos_ativos d
          WHERE d.processo_id = p.processo_id) da ON true
     LEFT JOIN v_lip_indice_json ij ON ij.processo_id = p.processo_id;

-- ======================================================================
-- v_lip_processo_aberto
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_processo_aberto AS
 SELECT processo_id,
    ordem,
    item_tipo,
    item_titulo,
    nome_arquivo,
    tipo_documento,
    status_doc,
    criado_em
   FROM v_lip_documentos_ativos
  ORDER BY processo_id, ordem;

-- ======================================================================
-- v_lip_processo_ativo_auto
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_processo_ativo_auto AS
 SELECT processo_id,
    ordem,
    item_tipo,
    item_titulo,
    nome_arquivo,
    tipo_documento,
    status_doc,
    criado_em
   FROM v_lip_processo_aberto d
  WHERE processo_id = (( SELECT lip_processo_atual.processo_id
           FROM lip_processo_atual
          ORDER BY lip_processo_atual.aberto_em DESC
         LIMIT 1))
  ORDER BY ordem;

-- ======================================================================
-- v_lip_processo_em_tela
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_processo_em_tela AS
 SELECT d.processo_id,
    d.ordem,
    d.item_tipo,
    d.item_titulo,
    d.nome_arquivo,
    d.tipo_documento,
    d.status_doc,
    d.criado_em
   FROM v_lip_processo_aberto d
     JOIN lip_processo_atual a ON a.processo_id = d.processo_id
  ORDER BY d.ordem;

-- ======================================================================
-- v_lip_processo_em_tela_com_decisao
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_processo_em_tela_com_decisao AS
 SELECT t.processo_id,
    t.ordem,
    t.item_tipo,
    t.item_titulo,
    t.nome_arquivo,
    t.tipo_documento,
    t.status_doc,
    t.criado_em,
    di.status_analise AS decisao_status,
    di.observacao AS decisao_observacao,
    COALESCE(di.criado_em, di.updated_at, di.created_at) AS decisao_quando
   FROM v_lip_processo_em_tela t
     LEFT JOIN LATERAL ( SELECT li.status_analise,
            li.observacao,
            li.criado_em,
            li.updated_at,
            li.created_at
           FROM lip_decisoes_item li
          WHERE li.processo_id = t.processo_id AND li.ordem = t.ordem
          ORDER BY li.criado_em DESC NULLS LAST, li.updated_at DESC NULLS LAST, li.created_at DESC NULLS LAST
         LIMIT 1) di ON true;

-- ======================================================================
-- v_lip_processo_interface
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_processo_interface AS
 SELECT processo_id,
    ordem,
    item_tipo,
    item_titulo,
    nome_arquivo,
    tipo_documento,
    status_doc,
    criado_em
   FROM v_lip_documentos_ativos
  ORDER BY processo_id, ordem;

-- ======================================================================
-- v_lip_processos_com_itens
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_processos_com_itens AS
 SELECT processo_id,
    count(*) AS total_itens,
    max(criado_em) AS atualizado_em
   FROM v_lip_processo_interface
  GROUP BY processo_id
  ORDER BY (max(criado_em)) DESC;

-- ======================================================================
-- v_lip_responsabilidade
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_responsabilidade AS
 WITH atual AS (
         SELECT ea.processo_id,
            ea.ordem AS ordem_atual,
            ea.etapa_codigo AS etapa_codigo_atual,
            ea.etapa_nome AS etapa_nome_atual
           FROM v_lip_etapa_atual ea
        ), prox AS (
         SELECT a_1.processo_id,
            f2.ordem AS ordem_proxima,
            f2.etapa_codigo AS etapa_codigo_proxima,
            f2.etapa_nome AS etapa_nome_proxima
           FROM atual a_1
             LEFT JOIN urbis_lip_fluxo_etapas f2 ON f2.ordem = (a_1.ordem_atual + 1)
        )
 SELECT a.processo_id,
    a.ordem_atual,
    a.etapa_codigo_atual,
    a.etapa_nome_atual,
    p.ordem_proxima,
    p.etapa_codigo_proxima,
    p.etapa_nome_proxima
   FROM atual a
     LEFT JOIN prox p ON p.processo_id = a.processo_id;

-- ======================================================================
-- v_lip_responsabilidade_humana
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_responsabilidade_humana AS
 SELECT processo_id,
    ordem_atual,
    etapa_codigo_atual,
    etapa_nome_atual,
    ordem_proxima,
    etapa_codigo_proxima,
    etapa_nome_proxima,
        CASE etapa_codigo_atual
            WHEN 'ABERTURA'::text THEN 'ATENDE FÁCIL'::text
            WHEN 'CHEADV'::text THEN 'CHEADV (Análise Documental)'::text
            WHEN 'GERFEP'::text THEN 'GERFEP (Vistoria Fiscal)'::text
            WHEN 'BUSCA_ARQ'::text THEN 'DIRAAP (Busca Arquivo)'::text
            WHEN 'ANALISE'::text THEN 'DIRAAP (Análise Técnica)'::text
            WHEN 'SAIDA'::text THEN 'SAÍDA (Arquivamento/Laudo)'::text
            ELSE 'NÃO MAPEADO'::text
        END AS responsavel_atual,
        CASE etapa_codigo_proxima
            WHEN 'ABERTURA'::text THEN 'ATENDE FÁCIL'::text
            WHEN 'CHEADV'::text THEN 'CHEADV (Análise Documental)'::text
            WHEN 'GERFEP'::text THEN 'GERFEP (Vistoria Fiscal)'::text
            WHEN 'BUSCA_ARQ'::text THEN 'DIRAAP (Busca Arquivo)'::text
            WHEN 'ANALISE'::text THEN 'DIRAAP (Análise Técnica)'::text
            WHEN 'SAIDA'::text THEN 'SAÍDA (Arquivamento/Laudo)'::text
            ELSE 'NÃO MAPEADO'::text
        END AS proximo_responsavel
   FROM v_lip_responsabilidade r;

-- ======================================================================
-- v_lip_status_final
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_status_final AS
 SELECT t.processo_id,
    t.dias_parado,
        CASE
            WHEN t.dias_parado >= l.limite_180 THEN 'VERMELHO'::text
            WHEN t.dias_parado >= l.limite_170 THEN 'LARANJA'::text
            WHEN t.dias_parado >= l.limite_160 THEN 'AMARELO'::text
            ELSE 'OK'::text
        END AS status_lip
   FROM v_lip_tempo_processo t
     CROSS JOIN urbis_lip_cores l;

-- ======================================================================
-- v_lip_status_final_v2
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_status_final_v2 AS
 WITH itens AS (
         SELECT t.processo_id,
            t.ordem,
            t.decisao_status
           FROM v_lip_processo_em_tela_com_decisao t
        ), agg AS (
         SELECT itens.processo_id,
            count(*) AS total_itens,
            sum(
                CASE
                    WHEN itens.decisao_status = 'REPROVAR'::text THEN 1
                    ELSE 0
                END) AS qtd_reprovar,
            sum(
                CASE
                    WHEN itens.decisao_status = 'PENDENCIA'::text THEN 1
                    ELSE 0
                END) AS qtd_pendencia,
            sum(
                CASE
                    WHEN itens.decisao_status = 'OK'::text THEN 1
                    ELSE 0
                END) AS qtd_ok,
            sum(
                CASE
                    WHEN itens.decisao_status IS NULL THEN 1
                    ELSE 0
                END) AS qtd_sem_decisao
           FROM itens
          GROUP BY itens.processo_id
        )
 SELECT processo_id,
    total_itens,
    qtd_ok,
    qtd_pendencia,
    qtd_reprovar,
    qtd_sem_decisao,
        CASE
            WHEN total_itens = 0 THEN 'SEM_ITENS'::text
            WHEN qtd_reprovar > 0 THEN 'REPROVADO'::text
            WHEN qtd_pendencia > 0 THEN 'PENDENTE'::text
            WHEN qtd_ok = total_itens THEN 'OK'::text
            ELSE 'EM_ANALISE'::text
        END AS status_final
   FROM agg;

-- ======================================================================
-- v_lip_status_processo
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_status_processo AS
 SELECT processo_id,
    count(*) AS total_itens,
    count(*) FILTER (WHERE status_item = 'ATIVO'::text) AS itens_ativos,
    count(*) FILTER (WHERE status_item <> 'ATIVO'::text) AS itens_inativos,
    max(criado_em) AS ultimo_movimento,
        CASE
            WHEN count(*) FILTER (WHERE status_item = 'ATIVO'::text) = 0 THEN 'SEM_DOCUMENTOS'::text
            WHEN count(*) FILTER (WHERE status_item <> 'ATIVO'::text) > 0 THEN 'PENDENTE'::text
            ELSE 'PRONTO'::text
        END AS status_processo
   FROM urbis_lip_indice
  GROUP BY processo_id;

-- ======================================================================
-- v_lip_tempo_processo
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_tempo_processo AS
 SELECT p.id AS processo_id,
    max(e.criado_em) AS ultimo_movimento,
    now() - max(e.criado_em) AS tempo_sem_movimento,
    EXTRACT(day FROM now() - max(e.criado_em))::integer AS dias_parado
   FROM processos p
     LEFT JOIN processo_eventos e ON e.processo_id = p.id
  GROUP BY p.id;

-- ======================================================================
-- v_lip_timeline_auto
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_timeline_auto AS
 SELECT id,
    processo_id,
    evento_tipo,
    motivo,
    ator_tipo,
    ator_nome,
    numero_sei,
    referencia_documento,
    cor_base,
    iniciado_em,
    finalizado_em,
    criado_em
   FROM urbis_lip_eventos e
  WHERE processo_id = (( SELECT lip_processo_atual.processo_id
           FROM lip_processo_atual
          ORDER BY lip_processo_atual.aberto_em DESC
         LIMIT 1))
  ORDER BY (COALESCE(iniciado_em, criado_em)), (COALESCE(finalizado_em, criado_em));

-- ======================================================================
-- v_lip_timeline_preview
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_timeline_preview AS
 SELECT processo_id,
    iniciado_em,
    finalizado_em,
    ator_tipo,
    ator_nome,
    evento_tipo,
    COALESCE(motivo, ''::text) AS motivo,
    COALESCE(cor_base, ''::text) AS cor_base,
        CASE
            WHEN referencia_documento IS NOT NULL AND TRIM(BOTH FROM referencia_documento) <> ''::text THEN referencia_documento
            WHEN numero_sei IS NOT NULL AND TRIM(BOTH FROM numero_sei) ~ '^\d{6,12}$'::text THEN fmt_doc_sei(numero_sei)
            ELSE NULL::text
        END AS documento_referencia
   FROM urbis_lip_eventos e
  ORDER BY iniciado_em;

-- ======================================================================
-- v_lip_ultimo_documento
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_lip_ultimo_documento AS
 SELECT processo_id,
    item_titulo,
    item_tipo,
    criado_em
   FROM v_lip_documentos
  ORDER BY criado_em DESC;

-- ======================================================================
-- v_meu_mes
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_meu_mes AS
 WITH base AS (
         SELECT processos.id,
            processos.porte,
            processos.status
           FROM processos
          WHERE date_trunc('month'::text, processos.criado_em) = date_trunc('month'::text, now())
        ), t AS (
         SELECT etapa_tempo_sessoes.processo_id,
            sum(EXTRACT(epoch FROM COALESCE(etapa_tempo_sessoes.finalizado_em, now()) - etapa_tempo_sessoes.iniciado_em)) / 3600.0 AS horas_trabalhadas
           FROM etapa_tempo_sessoes
          GROUP BY etapa_tempo_sessoes.processo_id
        )
 SELECT date_trunc('month'::text, now())::date AS mes,
    count(*) AS total_processos_mes,
    sum(
        CASE
            WHEN b.status = ANY (ARRAY['CONCLUIDO'::status_processo_enum, 'ARQUIVADO'::status_processo_enum, 'INDEFERIDO'::status_processo_enum]) THEN 1
            ELSE 0
        END) AS finalizados_mes,
    sum(
        CASE b.porte
            WHEN 'PP'::porte_enum THEN 1
            WHEN 'MP'::porte_enum THEN 2
            WHEN 'GP'::porte_enum THEN 3
            ELSE 0
        END) AS pontuacao_mes,
    COALESCE(sum(t.horas_trabalhadas), 0::numeric) AS horas_trabalhadas_mes
   FROM base b
     LEFT JOIN t ON t.processo_id = b.id;

-- ======================================================================
-- v_minha_gerencia_mes
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_minha_gerencia_mes AS
 WITH base AS (
         SELECT p.id,
            p.porte,
            p.status,
            p.analista_id,
            p.gerencia,
            e.nome AS analista_nome
           FROM processos p
             JOIN equipe e ON e.id = p.analista_id
          WHERE date_trunc('month'::text, p.criado_em) = date_trunc('month'::text, now())
        ), t AS (
         SELECT etapa_tempo_sessoes.processo_id,
            sum(EXTRACT(epoch FROM COALESCE(etapa_tempo_sessoes.finalizado_em, now()) - etapa_tempo_sessoes.iniciado_em)) / 3600.0 AS horas_trabalhadas
           FROM etapa_tempo_sessoes
          GROUP BY etapa_tempo_sessoes.processo_id
        )
 SELECT date_trunc('month'::text, now())::date AS mes,
    base.gerencia,
    base.analista_id,
    base.analista_nome,
    count(*) AS total_processos_mes,
    sum(
        CASE
            WHEN base.status = ANY (ARRAY['CONCLUIDO'::status_processo_enum, 'ARQUIVADO'::status_processo_enum, 'INDEFERIDO'::status_processo_enum]) THEN 1
            ELSE 0
        END) AS finalizados_mes,
    sum(
        CASE base.porte
            WHEN 'PP'::porte_enum THEN 1
            WHEN 'MP'::porte_enum THEN 2
            WHEN 'GP'::porte_enum THEN 3
            ELSE 0
        END) AS pontuacao_mes,
    COALESCE(sum(t.horas_trabalhadas), 0::numeric) AS horas_trabalhadas_mes
   FROM base
     LEFT JOIN t ON t.processo_id = base.id
  GROUP BY base.gerencia, base.analista_id, base.analista_nome
  ORDER BY (sum(
        CASE base.porte
            WHEN 'PP'::porte_enum THEN 1
            WHEN 'MP'::porte_enum THEN 2
            WHEN 'GP'::porte_enum THEN 3
            ELSE 0
        END)) DESC, (sum(
        CASE
            WHEN base.status = ANY (ARRAY['CONCLUIDO'::status_processo_enum, 'ARQUIVADO'::status_processo_enum, 'INDEFERIDO'::status_processo_enum]) THEN 1
            ELSE 0
        END)) DESC;

-- ======================================================================
-- v_pontuacao_mensal
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_pontuacao_mensal AS
 SELECT p.analista_id,
    e.nome AS analista_nome,
    date_trunc('month'::text, p.criado_em)::date AS mes,
    count(*) AS total_processos,
    sum(
        CASE p.porte
            WHEN 'PP'::porte_enum THEN 1
            WHEN 'MP'::porte_enum THEN 2
            WHEN 'GP'::porte_enum THEN 3
            ELSE 0
        END) AS pontuacao_total
   FROM processos p
     JOIN equipe e ON e.id = p.analista_id
  WHERE p.status = ANY (ARRAY['CONCLUIDO'::status_processo_enum, 'ARQUIVADO'::status_processo_enum, 'INDEFERIDO'::status_processo_enum])
  GROUP BY p.analista_id, e.nome, (date_trunc('month'::text, p.criado_em)::date);

-- ======================================================================
-- v_processo_documento_ingestao_fmt
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_processo_documento_ingestao_fmt AS
 SELECT id,
    processo_id,
    sei_doc_id,
    sei_numero,
    nome_arquivo,
    tipo_documento,
    fonte,
    status_doc,
    data_documento,
    coletado_em,
    hash_conteudo,
    extraido_json,
    sei_doc_evidencia,
        CASE
            WHEN sei_doc_id IS NULL THEN NULL::text
            ELSE ('('::text || sei_doc_id) || ')'::text
        END AS sei_doc_id_fmt
   FROM processo_documento_ingestao pdi;

-- ======================================================================
-- v_ranking_12_meses
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_ranking_12_meses AS
 SELECT analista_id,
    analista_nome,
    mes,
    total_processos,
    pontuacao_total,
    posicao
   FROM v_ranking_mensal
  WHERE mes >= (date_trunc('month'::text, now()) - '11 mons'::interval)::date
  ORDER BY mes DESC, posicao;

-- ======================================================================
-- v_ranking_mensal
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_ranking_mensal AS
 SELECT analista_id,
    analista_nome,
    mes,
    total_processos,
    pontuacao_total,
    rank() OVER (PARTITION BY mes ORDER BY pontuacao_total DESC, total_processos DESC) AS posicao
   FROM v_pontuacao_mensal v;

-- ======================================================================
-- v_tempo_etapa
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_tempo_etapa AS
 SELECT etapa_id,
    processo_id,
    sum(EXTRACT(epoch FROM COALESCE(finalizado_em, now()) - iniciado_em))::bigint AS tempo_segundos
   FROM etapa_tempo_sessoes
  GROUP BY etapa_id, processo_id;

-- ======================================================================
-- v_tempo_medio_etapa
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_tempo_medio_etapa AS
 SELECT pe.tipo_etapa,
    avg(EXTRACT(epoch FROM COALESCE(s.finalizado_em, now()) - s.iniciado_em)) / 3600.0 AS horas_medias
   FROM etapa_tempo_sessoes s
     JOIN processo_etapas pe ON pe.id = s.etapa_id
  GROUP BY pe.tipo_etapa
  ORDER BY (avg(EXTRACT(epoch FROM COALESCE(s.finalizado_em, now()) - s.iniciado_em)) / 3600.0) DESC;

-- ======================================================================
-- v_tempo_medio_processo
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_tempo_medio_processo AS
 WITH t AS (
         SELECT etapa_tempo_sessoes.processo_id,
            sum(EXTRACT(epoch FROM COALESCE(etapa_tempo_sessoes.finalizado_em, now()) - etapa_tempo_sessoes.iniciado_em)) / 3600.0 AS horas_trabalhadas
           FROM etapa_tempo_sessoes
          GROUP BY etapa_tempo_sessoes.processo_id
        )
 SELECT p.analista_id,
    e.nome AS analista_nome,
    avg(COALESCE(t.horas_trabalhadas, 0::numeric)) AS horas_medias_trabalhadas
   FROM processos p
     JOIN equipe e ON e.id = p.analista_id
     LEFT JOIN t ON t.processo_id = p.id
  GROUP BY p.analista_id, e.nome;

-- ======================================================================
-- v_urbis_lip_eventos_fmt
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_urbis_lip_eventos_fmt AS
 SELECT id,
    processo_id,
    ator_tipo,
    ator_nome,
    evento_tipo,
    motivo,
    iniciado_em,
    finalizado_em,
    cor_base,
    numero_sei,
    referencia_documento,
    criado_em,
        CASE
            WHEN referencia_documento IS NULL THEN NULL::text
            ELSE ('('::text || btrim(referencia_documento)) || ')'::text
        END AS referencia_documento_fmt
   FROM urbis_lip_eventos e;

-- ======================================================================
-- v_urbis_lip_indice
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_urbis_lip_indice AS
 SELECT processo_id,
    tipo_documento,
    nome_documento,
    numero_sei,
    departamento_origem,
    emitido_por,
    data_emissao,
    pagina_inicial,
    pagina_final,
    total_paginas,
    versao,
    eh_ultima_versao,
        CASE
            WHEN eh_ultima_versao = true THEN 'ATIVO'::text
            ELSE 'SUBSTITUIDO'::text
        END AS status_documento
   FROM urbis_lip_documentos d
  ORDER BY data_emissao, pagina_inicial;

-- ======================================================================
-- v_urbis_lip_kpi
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_urbis_lip_kpi AS
 SELECT count(*) AS total_processos,
    sum(
        CASE
            WHEN status_regra_181 = 'VERMELHO'::text THEN 1
            ELSE 0
        END) AS qtd_vermelho,
    sum(
        CASE
            WHEN status_regra_181 = 'LARANJA'::text THEN 1
            ELSE 0
        END) AS qtd_laranja,
    sum(
        CASE
            WHEN status_regra_181 = 'AMARELO'::text THEN 1
            ELSE 0
        END) AS qtd_amarelo,
    sum(
        CASE
            WHEN status_regra_181 = 'OK'::text THEN 1
            ELSE 0
        END) AS qtd_ok
   FROM v_urbis_lip_status;

-- ======================================================================
-- v_urbis_lip_limites
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_urbis_lip_limites AS
 SELECT limite_160,
    limite_170,
    limite_180
   FROM urbis_lip_cores
  WHERE ator_nome = 'PREFEITURA'::text
 LIMIT 1;

-- ======================================================================
-- v_urbis_lip_resumo_181
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_urbis_lip_resumo_181 AS
 WITH base AS (
         SELECT v_urbis_lip_timeline.processo_id,
            v_urbis_lip_timeline.ator,
            v_urbis_lip_timeline.dias_no_ator
           FROM v_urbis_lip_timeline
        ), interessado AS (
         SELECT base.processo_id,
            sum(base.dias_no_ator) AS dias_interessado_total
           FROM base
          WHERE upper(base.ator) ~~ '%INTERESS%'::text
          GROUP BY base.processo_id
        ), limites AS (
         SELECT urbis_lip_cores.limite_160,
            urbis_lip_cores.limite_170,
            urbis_lip_cores.limite_180
           FROM urbis_lip_cores
          WHERE urbis_lip_cores.ator_nome = 'INTERESSADO'::text
         LIMIT 1
        )
 SELECT i.processo_id,
    i.dias_interessado_total,
        CASE
            WHEN i.dias_interessado_total >= l.limite_180 THEN 'VERMELHO'::text
            WHEN i.dias_interessado_total >= l.limite_170 THEN 'LARANJA'::text
            WHEN i.dias_interessado_total >= l.limite_160 THEN 'AMARELO'::text
            ELSE 'OK'::text
        END AS status_regra_181
   FROM interessado i
     CROSS JOIN limites l;

-- ======================================================================
-- v_urbis_lip_risco_pre_analise
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_urbis_lip_risco_pre_analise AS
 SELECT e.processo_id,
    count(*) FILTER (WHERE t.fase = 'PRE_ANALISE'::text AND t.gera_risco = true) AS eventos_risco_pre,
        CASE
            WHEN count(*) FILTER (WHERE t.fase = 'PRE_ANALISE'::text AND t.gera_risco = true) >= 3 THEN 'ALTO'::text
            WHEN count(*) FILTER (WHERE t.fase = 'PRE_ANALISE'::text AND t.gera_risco = true) >= 1 THEN 'MEDIO'::text
            ELSE 'BAIXO'::text
        END AS nivel_risco
   FROM processo_eventos e
     JOIN urbis_lip_evento_tipos t ON t.nome_evento = e.evento
  GROUP BY e.processo_id;

-- ======================================================================
-- v_urbis_lip_status
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_urbis_lip_status AS
 WITH lim AS (
         SELECT v_urbis_lip_limites.limite_160,
            v_urbis_lip_limites.limite_170,
            v_urbis_lip_limites.limite_180
           FROM v_urbis_lip_limites
        ), cores_interessado AS (
         SELECT urbis_lip_cores.cor_ok,
            urbis_lip_cores.cor_alerta_160,
            urbis_lip_cores.cor_alerta_170,
            urbis_lip_cores.cor_alerta_180
           FROM urbis_lip_cores
          WHERE urbis_lip_cores.ator_nome = 'INTERESSADO'::text
         LIMIT 1
        )
 SELECT r.processo_id,
    r.dias_interessado_total,
        CASE
            WHEN r.dias_interessado_total >= lim.limite_180 THEN 'VERMELHO'::text
            WHEN r.dias_interessado_total >= lim.limite_170 THEN 'LARANJA'::text
            WHEN r.dias_interessado_total >= lim.limite_160 THEN 'AMARELO'::text
            ELSE 'OK'::text
        END AS status_regra_181,
        CASE
            WHEN r.dias_interessado_total >= lim.limite_180 THEN ( SELECT cores_interessado.cor_alerta_180
               FROM cores_interessado)
            WHEN r.dias_interessado_total >= lim.limite_170 THEN ( SELECT cores_interessado.cor_alerta_170
               FROM cores_interessado)
            WHEN r.dias_interessado_total >= lim.limite_160 THEN ( SELECT cores_interessado.cor_alerta_160
               FROM cores_interessado)
            ELSE ( SELECT cores_interessado.cor_ok
               FROM cores_interessado)
        END AS cor_hex
   FROM v_urbis_lip_resumo_181 r
     CROSS JOIN lim;

-- ======================================================================
-- v_urbis_lip_status_v2
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_urbis_lip_status_v2 AS
 WITH cfg AS (
         SELECT max(
                CASE
                    WHEN urbis_lip_cores.ator_nome = 'INTERESSADO'::text THEN urbis_lip_cores.cor_ok
                    ELSE NULL::text
                END) AS cor_ok,
            max(
                CASE
                    WHEN urbis_lip_cores.ator_nome = 'INTERESSADO'::text THEN urbis_lip_cores.cor_alerta_160
                    ELSE NULL::text
                END) AS cor_160,
            max(
                CASE
                    WHEN urbis_lip_cores.ator_nome = 'INTERESSADO'::text THEN urbis_lip_cores.cor_alerta_170
                    ELSE NULL::text
                END) AS cor_170,
            max(
                CASE
                    WHEN urbis_lip_cores.ator_nome = 'INTERESSADO'::text THEN urbis_lip_cores.cor_alerta_180
                    ELSE NULL::text
                END) AS cor_180,
            max(
                CASE
                    WHEN urbis_lip_cores.ator_nome = 'INTERESSADO'::text THEN urbis_lip_cores.limite_160
                    ELSE NULL::integer
                END) AS lim_160,
            max(
                CASE
                    WHEN urbis_lip_cores.ator_nome = 'INTERESSADO'::text THEN urbis_lip_cores.limite_170
                    ELSE NULL::integer
                END) AS lim_170,
            max(
                CASE
                    WHEN urbis_lip_cores.ator_nome = 'INTERESSADO'::text THEN urbis_lip_cores.limite_180
                    ELSE NULL::integer
                END) AS lim_180
           FROM urbis_lip_cores
        ), base AS (
         SELECT r.processo_id,
            r.dias_interessado_total
           FROM v_urbis_lip_resumo_181 r
        )
 SELECT b.processo_id,
    b.dias_interessado_total,
    b.dias_interessado_total >= c.lim_180 AS bloqueado_regra_181,
        CASE
            WHEN b.dias_interessado_total >= c.lim_180 THEN 'VERMELHO'::text
            WHEN b.dias_interessado_total >= c.lim_170 THEN 'LARANJA'::text
            WHEN b.dias_interessado_total >= c.lim_160 THEN 'AMARELO'::text
            ELSE 'OK'::text
        END AS status_regra_181,
        CASE
            WHEN b.dias_interessado_total >= c.lim_180 THEN c.cor_180
            WHEN b.dias_interessado_total >= c.lim_170 THEN c.cor_170
            WHEN b.dias_interessado_total >= c.lim_160 THEN c.cor_160
            ELSE c.cor_ok
        END AS cor_hex_regra_181
   FROM base b
     CROSS JOIN cfg c;

-- ======================================================================
-- v_urbis_lip_timeline
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.v_urbis_lip_timeline AS
 WITH eventos_ordenados AS (
         SELECT processo_eventos.processo_id,
            processo_eventos.evento,
            processo_eventos.criado_em AS inicio,
            lead(processo_eventos.criado_em) OVER (PARTITION BY processo_eventos.processo_id ORDER BY processo_eventos.criado_em) AS proximo_evento_data
           FROM processo_eventos
        ), intervalos AS (
         SELECT eventos_ordenados.processo_id,
            eventos_ordenados.evento AS ator,
            eventos_ordenados.inicio,
            COALESCE(eventos_ordenados.proximo_evento_data, now()) AS fim,
            EXTRACT(day FROM COALESCE(eventos_ordenados.proximo_evento_data, now()) - eventos_ordenados.inicio)::integer AS dias_no_ator
           FROM eventos_ordenados
        )
 SELECT processo_id,
    ator,
    inicio,
    fim,
    dias_no_ator
   FROM intervalos
  ORDER BY processo_id, inicio;

-- ======================================================================
-- vw_bdi_aguardando_retorno
-- opcoes: security_invoker=true
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_aguardando_retorno AS
 WITH candidatos AS (
         SELECT u.processo_codigo,
            u.numero_analise,
            u.emitido_em,
            u.numero,
            a.numero_despacho AS despacho_confirmado
           FROM urbis_numeracao_uso u
             LEFT JOIN analises_mac a ON a.processo_codigo = u.processo_codigo AND a.numero_analise = u.numero_analise AND a.excluido_em IS NULL
          WHERE u.tipo_documento = 'despacho'::text
        )
 SELECT c.processo_codigo,
    lower(p.tipo_processo) AS tipo_processo,
    c.numero_analise AS analise_que_gerou_despacho,
    c.emitido_em AS despacho_emitido_em,
    prox.numero_analise AS proxima_analise,
    prox.criado_em AS proxima_analise_iniciada_em,
        CASE
            WHEN c.numero_analise IS NULL THEN NULL::numeric
            WHEN c.despacho_confirmado IS DISTINCT FROM c.numero::text THEN NULL::numeric
            WHEN prox.criado_em IS NOT NULL THEN round(EXTRACT(epoch FROM prox.criado_em - c.emitido_em) / 86400.0, 1)
            ELSE round(EXTRACT(epoch FROM now() - c.emitido_em) / 86400.0, 1)
        END AS dias_aguardando_retorno,
        CASE
            WHEN c.numero_analise IS NULL THEN 'base insuficiente'::text
            WHEN c.despacho_confirmado IS DISTINCT FROM c.numero::text THEN 'base insuficiente'::text
            WHEN prox.criado_em IS NOT NULL THEN 'retornou'::text
            ELSE 'ainda aguardando'::text
        END AS situacao
   FROM candidatos c
     JOIN processos p ON p.codigo = c.processo_codigo AND p.excluido_em IS NULL
     LEFT JOIN analises_mac prox ON prox.processo_codigo = c.processo_codigo AND prox.numero_analise = (c.numero_analise + 1) AND prox.excluido_em IS NULL
  ORDER BY (
        CASE
            WHEN c.numero_analise IS NULL THEN 'base insuficiente'::text
            WHEN c.despacho_confirmado IS DISTINCT FROM c.numero::text THEN 'base insuficiente'::text
            WHEN prox.criado_em IS NOT NULL THEN 'retornou'::text
            ELSE 'ainda aguardando'::text
        END), (
        CASE
            WHEN c.numero_analise IS NULL THEN NULL::numeric
            WHEN c.despacho_confirmado IS DISTINCT FROM c.numero::text THEN NULL::numeric
            WHEN prox.criado_em IS NOT NULL THEN round(EXTRACT(epoch FROM prox.criado_em - c.emitido_em) / 86400.0, 1)
            ELSE round(EXTRACT(epoch FROM now() - c.emitido_em) / 86400.0, 1)
        END) DESC NULLS LAST;

-- ======================================================================
-- vw_bdi_analises_em_andamento
-- opcoes: security_invoker=true
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_analises_em_andamento AS
 WITH ultima_passada AS (
         SELECT DISTINCT ON (analises_mac.processo_codigo) analises_mac.processo_codigo,
            analises_mac.numero_analise,
            analises_mac.numero_despacho,
            analises_mac.numero_parecer
           FROM analises_mac
          WHERE analises_mac.excluido_em IS NULL
          ORDER BY analises_mac.processo_codigo, analises_mac.numero_analise DESC
        )
 SELECT lower(p.tipo_processo) AS tipo_processo,
    count(*) AS processos_em_andamento,
    round(avg(EXTRACT(epoch FROM now() - p.analise_iniciada_em) / 86400.0), 1) AS dias_media_em_aberto,
    max(round(EXTRACT(epoch FROM now() - p.analise_iniciada_em) / 86400.0, 1)) AS dias_mais_antigo
   FROM processos p
     LEFT JOIN ultima_passada up ON up.processo_codigo = p.codigo
  WHERE p.excluido_em IS NULL AND p.analise_iniciada_em IS NOT NULL AND p.analise_concluida_em IS NULL AND COALESCE(up.numero_despacho, up.numero_parecer) IS NULL
  GROUP BY (lower(p.tipo_processo))
  ORDER BY (count(*)) DESC;

-- ======================================================================
-- vw_bdi_analistas_desempenho
-- opcoes: security_invoker=true
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_analistas_desempenho AS
 SELECT u.nome AS analista,
    u.gerencia,
    count(DISTINCT p.id) AS total_processos,
    COALESCE(sum(p.area_construida), 0::numeric) AS area_total,
    COALESCE(avg(EXTRACT(epoch FROM p.tempo_total_analise) / 3600::numeric), 0::numeric) AS tempo_medio_horas,
    count(DISTINCT
        CASE
            WHEN p.eh_retorno THEN p.id
            ELSE NULL::uuid
        END) AS total_retornos,
    COALESCE(sum(m.pontos), 0::numeric) AS pontos_totais_mrp,
    count(DISTINCT m.id) AS despachos_mrp,
    a.nome AS assunto
   FROM processos p
     LEFT JOIN usuarios u ON p.analista_id = u.id
     LEFT JOIN assuntos a ON p.assunto_id = a.id
     LEFT JOIN mrp_registros m ON m.usuario_id = u.id AND m.processo_codigo = p.codigo
  WHERE a.nome !~~ 'Slot%'::text OR a.nome IS NULL
  GROUP BY u.id, u.nome, u.gerencia, a.id, a.nome;

-- ======================================================================
-- vw_bdi_autores
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_autores AS
 WITH rts AS (
         SELECT p.codigo AS processo_codigo,
            p.status AS status_processo,
            a.nome AS assunto,
            p.dados ->> 'nome_responsavel_arq'::text AS autor,
            p.dados ->> 'cau'::text AS registro,
            'CAU'::text AS tipo_registro
           FROM processos p
             LEFT JOIN assuntos a ON a.id = p.assunto_id
          WHERE (p.dados ->> 'cau'::text) IS NOT NULL AND (p.dados ->> 'cau'::text) <> ''::text
        UNION ALL
         SELECT p.codigo,
            p.status,
            a.nome,
            p.dados ->> 'nome_responsavel_eng'::text,
            p.dados ->> 'crea'::text,
            'CREA'::text AS text
           FROM processos p
             LEFT JOIN assuntos a ON a.id = p.assunto_id
          WHERE (p.dados ->> 'crea'::text) IS NOT NULL AND (p.dados ->> 'crea'::text) <> ''::text
        ), nao_conf AS (
         SELECT am_1.processo_codigo,
            count(*) FILTER (WHERE v.status = 'nao_conforme'::text) AS total_nao_conformidades
           FROM analises_mac am_1,
            LATERAL jsonb_each_text(COALESCE(am_1.itens, '{}'::jsonb)) v(chave, status)
          GROUP BY am_1.processo_codigo
        ), analises_count AS (
         SELECT analises_mac.processo_codigo,
            count(*) AS total_analises
           FROM analises_mac
          GROUP BY analises_mac.processo_codigo
        )
 SELECT r.autor,
    r.registro,
    r.tipo_registro,
    r.assunto,
    r.status_processo,
    count(DISTINCT r.processo_codigo) AS total_processos,
    COALESCE(sum(ac.total_analises), 0::numeric)::bigint AS total_analises,
    COALESCE(sum(nc.total_nao_conformidades), 0::numeric) AS total_nao_conformidades,
        CASE
            WHEN count(DISTINCT r.processo_codigo) > 0 THEN round(COALESCE(sum(nc.total_nao_conformidades), 0::numeric) / count(DISTINCT r.processo_codigo)::numeric, 2)
            ELSE 0::numeric
        END AS erros_por_processo
   FROM rts r
     LEFT JOIN analises_count ac ON ac.processo_codigo = r.processo_codigo
     LEFT JOIN nao_conf nc ON nc.processo_codigo = r.processo_codigo
  GROUP BY r.autor, r.registro, r.tipo_registro, r.assunto, r.status_processo
  ORDER BY (
        CASE
            WHEN count(DISTINCT r.processo_codigo) > 0 THEN round(COALESCE(sum(nc.total_nao_conformidades), 0::numeric) / count(DISTINCT r.processo_codigo)::numeric, 2)
            ELSE 0::numeric
        END) DESC;

-- ======================================================================
-- vw_bdi_campos_criticos
-- opcoes: security_invoker=true
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_campos_criticos AS
 SELECT p.codigo,
    p.analista_id,
    lower(p.tipo_processo) AS tipo_processo,
    count(*) FILTER (WHERE COALESCE(TRIM(BOTH FROM e.v ->> 'valor'::text), ''::text) = ''::text) AS campos_vazios,
    count(*) FILTER (WHERE upper(TRIM(BOTH FROM COALESCE(e.v ->> 'valor'::text, ''::text))) = 'X'::text) AS campos_em_x,
    count(*) AS campos_totais,
    p.area_construida > NULLIF(regexp_replace(replace((p.dados -> 'areaTerreno'::text) ->> 'valor'::text, '.'::text, ''::text), ','::text, '.'::text), ''::text)::numeric AS area_maior_que_terreno
   FROM processos p,
    LATERAL jsonb_each(p.dados) e(k, v)
  WHERE p.dados IS NOT NULL AND p.excluido_em IS NULL AND jsonb_typeof(e.v) = 'object'::text
  GROUP BY p.codigo, p.analista_id, p.tipo_processo, p.area_construida, p.dados;

-- ======================================================================
-- vw_bdi_cobertura_satelite
-- opcoes: security_invoker=true
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_cobertura_satelite AS
 WITH emissoes AS (
         SELECT a.processo_codigo,
            lower(p.tipo_processo) AS tipo_processo,
            a.numero_analise,
            COALESCE(a.numero_despacho, a.numero_parecer, a.numero_despacho_interno) AS numero_emitido,
                CASE
                    WHEN a.numero_despacho IS NOT NULL THEN 'despacho'::text
                    WHEN a.numero_parecer IS NOT NULL THEN 'parecer'::text
                    WHEN a.numero_despacho_interno IS NOT NULL THEN 'despacho_interno'::text
                    ELSE NULL::text
                END AS tipo_documento
           FROM analises_mac a
             JOIN processos p ON p.codigo = a.processo_codigo AND p.excluido_em IS NULL
          WHERE a.excluido_em IS NULL AND COALESCE(a.numero_despacho, a.numero_parecer, a.numero_despacho_interno) IS NOT NULL
        )
 SELECT e.tipo_processo,
    e.tipo_documento,
    count(*) AS emitidos,
    count(*) FILTER (WHERE m.id IS NOT NULL) AS com_mdp,
    count(*) FILTER (WHERE r.id IS NOT NULL) AS com_mrp,
    count(*) FILTER (WHERE m.id IS NULL) AS faltando_mdp,
    count(*) FILTER (WHERE r.id IS NULL) AS faltando_mrp,
    round(100.0 * count(*) FILTER (WHERE m.id IS NOT NULL)::numeric / NULLIF(count(*), 0)::numeric, 1) AS pct_mdp,
    round(100.0 * count(*) FILTER (WHERE r.id IS NOT NULL)::numeric / NULLIF(count(*), 0)::numeric, 1) AS pct_mrp
   FROM emissoes e
     LEFT JOIN mdp_registros m ON m.processo_codigo = e.processo_codigo AND m.numero = e.numero_emitido
     LEFT JOIN mrp_registros r ON r.processo_codigo = e.processo_codigo AND r.numero_despacho = e.numero_emitido
  GROUP BY e.tipo_processo, e.tipo_documento;

-- ======================================================================
-- vw_bdi_desempenho_referencia
-- opcoes: security_invoker=true
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_desempenho_referencia AS
 SELECT TRIM(BOTH FROM referencia_legal) AS referencia,
    count(*) FILTER (WHERE status_novo = 'nao_conforme'::text) AS reprovou,
    count(*) FILTER (WHERE status_novo = 'conforme'::text) AS passou,
    count(DISTINCT processo_codigo) AS processos,
    round(100.0 * count(*) FILTER (WHERE status_novo = 'nao_conforme'::text)::numeric / NULLIF(count(*) FILTER (WHERE status_novo = ANY (ARRAY['conforme'::text, 'nao_conforme'::text])), 0)::numeric, 1) AS pct_reprova
   FROM mac_historico h
  WHERE COALESCE(TRIM(BOTH FROM referencia_legal), ''::text) <> ''::text
  GROUP BY (TRIM(BOTH FROM referencia_legal))
 HAVING count(DISTINCT processo_codigo) >= 3;

-- ======================================================================
-- vw_bdi_exigencias_por_contexto
-- opcoes: security_invoker=true
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_exigencias_por_contexto AS
 SELECT lower(h.tipo_processo) AS tipo_processo,
        CASE
            WHEN p.area_construida IS NULL THEN '(sem área)'::text
            WHEN p.area_construida < 100::numeric THEN 'até 100 m²'::text
            WHEN p.area_construida < 300::numeric THEN '100 a 300 m²'::text
            WHEN p.area_construida < 1000::numeric THEN '300 a 1.000 m²'::text
            ELSE 'acima de 1.000 m²'::text
        END AS faixa_area,
    (p.dados -> 'bairro'::text) ->> 'valor'::text AS bairro,
    h.item_texto AS exigencia,
    h.checklist_item_id,
    count(*) AS vezes,
    count(DISTINCT h.processo_codigo) AS processos
   FROM mac_historico h
     JOIN processos p ON p.codigo = h.processo_codigo AND p.excluido_em IS NULL
  WHERE h.status_novo = 'nao_conforme'::text AND COALESCE(TRIM(BOTH FROM h.item_texto), ''::text) <> ''::text
  GROUP BY (lower(h.tipo_processo)), (
        CASE
            WHEN p.area_construida IS NULL THEN '(sem área)'::text
            WHEN p.area_construida < 100::numeric THEN 'até 100 m²'::text
            WHEN p.area_construida < 300::numeric THEN '100 a 300 m²'::text
            WHEN p.area_construida < 1000::numeric THEN '300 a 1.000 m²'::text
            ELSE 'acima de 1.000 m²'::text
        END), ((p.dados -> 'bairro'::text) ->> 'valor'::text), h.item_texto, h.checklist_item_id;

-- ======================================================================
-- vw_bdi_nao_conformidades
-- opcoes: security_invoker=true
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_nao_conformidades AS
 SELECT mci.grupo,
    mci.texto,
    mci.ref,
    a.nome AS assunto,
    count(*) AS frequencia
   FROM analises_mac am
     JOIN mac_checklist_itens mci ON mci.modelo_id = am.modelo_id AND mci.ativo = true AND (am.itens ->> mci.id::text) = 'nao_conforme'::text
     LEFT JOIN assuntos a ON am.assunto_id = a.id
  WHERE a.nome !~~ 'Slot%'::text OR a.nome IS NULL
  GROUP BY mci.grupo, mci.texto, mci.ref, a.id, a.nome
  ORDER BY (count(*)) DESC;

-- ======================================================================
-- vw_bdi_numeracao_saldo
-- opcoes: security_invoker=true
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_numeracao_saldo AS
 SELECT id,
    usuario_id,
    tipo,
    ano,
    numero_inicial,
    numero_final,
    proximo,
    GREATEST(numero_final - proximo + 1, 0) AS restantes,
        CASE
            WHEN proximo > numero_final THEN 'ESGOTADA'::text
            WHEN (numero_final - proximo + 1) <= 5 THEN 'CRITICO'::text
            WHEN (numero_final - proximo + 1) <= 20 THEN 'ATENCAO'::text
            ELSE 'OK'::text
        END AS situacao
   FROM urbis_numeracao_faixas f;

-- ======================================================================
-- vw_bdi_por_analista
-- opcoes: security_invoker=true
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_por_analista AS
 SELECT u.nome AS analista,
    u.gerencia,
    count(p.id) AS total_processos,
    COALESCE(sum(p.area_construida), 0::numeric) AS area_total,
    COALESCE(avg(EXTRACT(epoch FROM p.tempo_total_analise) / 3600::numeric), 0::numeric) AS tempo_medio_horas
   FROM processos p
     JOIN usuarios u ON p.analista_id = u.id
     JOIN assuntos a ON p.assunto_id = a.id
  WHERE a.nome !~~ 'Slot%'::text
  GROUP BY u.id, u.nome, u.gerencia;

-- ======================================================================
-- vw_bdi_por_assunto
-- opcoes: security_invoker=true
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_por_assunto AS
 SELECT a.nome AS assunto,
    count(p.id) AS total_processos,
    COALESCE(sum(p.area_construida), 0::numeric) AS area_total,
    COALESCE(avg(p.area_construida), 0::numeric) AS area_media,
    count(
        CASE
            WHEN p.eh_retorno THEN 1
            ELSE NULL::integer
        END) AS total_retornos,
    p.porte,
    count(p.id) AS count_porte
   FROM processos p
     JOIN assuntos a ON p.assunto_id = a.id
  WHERE a.nome !~~ 'Slot%'::text
  GROUP BY a.id, a.nome, p.porte;

-- ======================================================================
-- vw_bdi_por_bairro
-- opcoes: security_invoker=true
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_por_bairro AS
 SELECT (p.dados -> 'bairro'::text) ->> 'valor'::text AS bairro,
    count(p.id) AS total_processos,
    COALESCE(sum(p.area_construida), 0::numeric) AS area_total,
    a.nome AS assunto
   FROM processos p
     JOIN assuntos a ON p.assunto_id = a.id
  WHERE ((p.dados -> 'bairro'::text) ->> 'valor'::text) IS NOT NULL AND a.nome !~~ 'Slot%'::text
  GROUP BY ((p.dados -> 'bairro'::text) ->> 'valor'::text), a.id, a.nome;

-- ======================================================================
-- vw_bdi_produtividade_mensal
-- opcoes: security_invoker=true
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_produtividade_mensal AS
 SELECT u.nome AS analista,
    u.gerencia,
    r.mes,
    r.ano,
    r.tipo_processo,
    count(r.id) AS total_despachos,
    COALESCE(sum(r.pontos), 0::numeric) AS total_pontos
   FROM mrp_registros r
     JOIN usuarios u ON r.usuario_id = u.id
  GROUP BY u.id, u.nome, u.gerencia, r.mes, r.ano, r.tipo_processo;

-- ======================================================================
-- vw_bdi_resumo_geral
-- opcoes: security_invoker=true
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_resumo_geral AS
 SELECT count(DISTINCT p.id) AS total_processos,
    count(DISTINCT p.analista_id) AS total_analistas,
    COALESCE(sum(p.area_construida), 0::numeric) AS area_total_construida,
    COALESCE(avg(p.area_construida), 0::numeric) AS area_media,
    count(
        CASE
            WHEN p.eh_retorno THEN 1
            ELSE NULL::integer
        END) AS total_retornos,
    count(DISTINCT (p.dados -> 'bairro'::text) ->> 'valor'::text) AS total_bairros
   FROM processos p
     JOIN assuntos a ON p.assunto_id = a.id
  WHERE a.nome !~~ 'Slot%'::text;

-- ======================================================================
-- vw_bdi_retorno_por_slot
-- opcoes: security_invoker=true
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_retorno_por_slot AS
 WITH passadas AS (
         SELECT analises_mac.processo_codigo,
            max(analises_mac.numero_analise) AS max_analise
           FROM analises_mac
          WHERE analises_mac.excluido_em IS NULL
          GROUP BY analises_mac.processo_codigo
        )
 SELECT lower(p.tipo_processo) AS tipo_processo,
        CASE
            WHEN p.area_construida IS NULL THEN '(sem área)'::text
            WHEN p.area_construida < 100::numeric THEN 'até 100 m²'::text
            WHEN p.area_construida < 300::numeric THEN '100 a 300 m²'::text
            WHEN p.area_construida < 1000::numeric THEN '300 a 1.000 m²'::text
            ELSE 'acima de 1.000 m²'::text
        END AS faixa_area,
    count(*) AS processos,
    count(*) FILTER (WHERE a.max_analise > 1) AS processos_com_retorno,
    round(100.0 * count(*) FILTER (WHERE a.max_analise > 1)::numeric / NULLIF(count(*), 0)::numeric, 1) AS pct_retorno,
    round(avg(a.max_analise) FILTER (WHERE a.max_analise > 1), 2) AS media_passadas_quando_retorna,
    sum(GREATEST(a.max_analise - 1, 0)) AS passadas_extras_total
   FROM passadas a
     JOIN processos p ON p.codigo = a.processo_codigo AND p.excluido_em IS NULL
  GROUP BY (lower(p.tipo_processo)), (
        CASE
            WHEN p.area_construida IS NULL THEN '(sem área)'::text
            WHEN p.area_construida < 100::numeric THEN 'até 100 m²'::text
            WHEN p.area_construida < 300::numeric THEN '100 a 300 m²'::text
            WHEN p.area_construida < 1000::numeric THEN '300 a 1.000 m²'::text
            ELSE 'acima de 1.000 m²'::text
        END);

-- ======================================================================
-- vw_bdi_retrabalho
-- opcoes: security_invoker=true
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_retrabalho AS
 SELECT processo_codigo,
    count(*) FILTER (WHERE status_anterior = 'conforme'::text AND status_novo = 'nao_conforme'::text) AS virou_nao_conforme,
    count(*) FILTER (WHERE status_anterior = 'nao_conforme'::text AND status_novo = 'conforme'::text) AS foi_resolvido,
    count(*) FILTER (WHERE status_anterior IS NOT NULL AND status_anterior <> '-'::text AND status_novo IS NOT NULL AND status_anterior <> status_novo) AS trocas_totais,
    max(criado_em) AS ultima_troca
   FROM mac_historico h
  GROUP BY processo_codigo
 HAVING count(*) FILTER (WHERE status_anterior IS NOT NULL AND status_anterior <> '-'::text AND status_novo IS NOT NULL AND status_anterior <> status_novo) > 0;

-- ======================================================================
-- vw_bdi_retrabalho_por_passada
-- opcoes: security_invoker=true
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_retrabalho_por_passada AS
 WITH trocas AS (
         SELECT h.processo_codigo,
            h.checklist_item_id,
            h.item_texto,
            h.referencia_legal,
            h.aba,
            a.numero_analise,
            h.status_anterior,
            h.status_novo,
            h.criado_em,
            row_number() OVER (PARTITION BY h.processo_codigo, h.checklist_item_id ORDER BY h.criado_em) AS seq
           FROM mac_historico h
             JOIN analises_mac a ON a.id = h.analise_id
          WHERE h.status_anterior IS NOT NULL AND h.status_anterior <> '-'::text AND h.status_novo IS NOT NULL AND h.status_anterior <> h.status_novo
        )
 SELECT t2.processo_codigo,
    t2.item_texto AS exigencia,
    t2.aba,
    t2.referencia_legal,
    t1.numero_analise AS passada_anterior,
    t1.status_novo AS status_na_passada_anterior,
    t2.numero_analise AS passada_atual,
    t2.status_anterior AS status_antes_da_volta,
    t2.status_novo AS status_depois_da_volta,
    t2.criado_em AS voltou_em
   FROM trocas t1
     JOIN trocas t2 ON t2.processo_codigo = t1.processo_codigo AND t2.checklist_item_id = t1.checklist_item_id AND t2.seq = (t1.seq + 1)
  WHERE t2.numero_analise <> t1.numero_analise
  ORDER BY t2.processo_codigo, t2.criado_em;

-- ======================================================================
-- vw_bdi_sessoes
-- opcoes: security_invoker=true
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_sessoes AS
 SELECT u.nome AS analista,
    date_trunc('day'::text, s.iniciada_em)::date AS data,
    count(*) AS total_sessoes,
    round(sum(GREATEST(0::numeric, EXTRACT(epoch FROM COALESCE(s.encerrada_em, s.ultimo_ping, s.iniciada_em) - s.iniciada_em) / 60.0)), 1) AS minutos_totais,
    round(avg(GREATEST(0::numeric, EXTRACT(epoch FROM COALESCE(s.encerrada_em, s.ultimo_ping, s.iniciada_em) - s.iniciada_em) / 60.0)), 1) AS media_min_sessao,
    max(s.ultimo_ping) AS ultimo_acesso,
    round(sum(GREATEST(0::numeric, EXTRACT(epoch FROM COALESCE(s.encerrada_em, s.ultimo_ping, s.iniciada_em) - s.iniciada_em) / 60.0)), 1) AS minutos_brutos,
    round(sum(GREATEST(0::numeric, EXTRACT(epoch FROM COALESCE(s.encerrada_em, s.ultimo_ping, s.iniciada_em) - s.iniciada_em) / 60.0 - COALESCE(s.tempo_pausado, 0)::numeric / 60.0)), 1) AS minutos_liquidos
   FROM urbis_sessoes s
     JOIN usuarios u ON u.id = s.usuario_id
  GROUP BY u.nome, (date_trunc('day'::text, s.iniciada_em)::date)
  ORDER BY (date_trunc('day'::text, s.iniciada_em)::date) DESC, (round(sum(GREATEST(0::numeric, EXTRACT(epoch FROM COALESCE(s.encerrada_em, s.ultimo_ping, s.iniciada_em) - s.iniciada_em) / 60.0)), 1)) DESC;

-- ======================================================================
-- vw_bdi_tempo_analista
-- opcoes: security_invoker=true
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_tempo_analista AS
 SELECT u.nome AS analista,
    u.id AS usuario_id,
    s.pagina AS processo,
    date_trunc('day'::text, s.iniciada_em)::date AS dia,
    date_part('week'::text, s.iniciada_em)::integer AS semana,
    date_part('month'::text, s.iniciada_em)::integer AS mes,
    date_part('year'::text, s.iniciada_em)::integer AS ano,
    round(sum(GREATEST(0::numeric, EXTRACT(epoch FROM COALESCE(s.encerrada_em, s.ultimo_ping, s.iniciada_em) - s.iniciada_em) / 60.0)), 2) AS minutos_brutos,
    round(sum(GREATEST(0::numeric, EXTRACT(epoch FROM COALESCE(s.encerrada_em, s.ultimo_ping, s.iniciada_em) - s.iniciada_em) / 60.0 - COALESCE(s.tempo_pausado, 0)::numeric / 60.0)), 2) AS minutos_liquidos,
    count(*) AS total_sessoes,
    max(s.ultimo_ping) AS ultimo_acesso
   FROM urbis_sessoes s
     JOIN usuarios u ON u.id = s.usuario_id
  GROUP BY u.nome, u.id, s.pagina, (date_trunc('day'::text, s.iniciada_em)::date), (date_part('week'::text, s.iniciada_em)), (date_part('month'::text, s.iniciada_em)), (date_part('year'::text, s.iniciada_em))
  ORDER BY (date_part('year'::text, s.iniciada_em)::integer) DESC, (date_part('month'::text, s.iniciada_em)::integer) DESC, (date_trunc('day'::text, s.iniciada_em)::date) DESC, u.nome;

-- ======================================================================
-- vw_bdi_tempo_etapas
-- opcoes: security_invoker=true
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_bdi_tempo_etapas AS
 SELECT p.codigo,
    lower(p.tipo_processo) AS tipo_processo,
    p.analista_id,
    p.analise_iniciada_em,
    p.analise_concluida_em,
    round(EXTRACT(epoch FROM p.analise_concluida_em - p.analise_iniciada_em) / 86400.0, 1) AS dias,
    count(h.id) AS marcacoes_no_mac
   FROM processos p
     LEFT JOIN mac_historico h ON h.processo_codigo = p.codigo
  WHERE p.excluido_em IS NULL AND p.analise_iniciada_em IS NOT NULL AND p.analise_concluida_em IS NOT NULL
  GROUP BY p.codigo, (lower(p.tipo_processo)), p.analista_id, p.analise_iniciada_em, p.analise_concluida_em, (round(EXTRACT(epoch FROM p.analise_concluida_em - p.analise_iniciada_em) / 86400.0, 1));

-- ======================================================================
-- vw_timeline_processo
-- opcoes: (nenhuma — roda com privilegio do dono)
-- ======================================================================
CREATE OR REPLACE VIEW public.vw_timeline_processo AS
 SELECT id,
    processo_id,
    tipo,
    etapa,
    descricao,
    cor,
    data_evento,
    criado_por,
    criado_em,
        CASE
            WHEN tipo = 'SISTEMA'::text AND etapa = 'CADASTRO'::text THEN 10
            WHEN tipo = 'DOCUMENTO'::text THEN 20
            WHEN tipo = 'STATUS'::text THEN 30
            WHEN tipo = 'ANALISE'::text THEN 40
            ELSE 99
        END AS ordem,
        CASE
            WHEN tipo = 'SISTEMA'::text AND etapa = 'CADASTRO'::text THEN 'spark'::text
            WHEN tipo = 'DOCUMENTO'::text THEN 'paperclip'::text
            WHEN tipo = 'STATUS'::text THEN 'refresh'::text
            WHEN tipo = 'ANALISE'::text THEN 'search'::text
            ELSE 'dot'::text
        END AS icon_key
   FROM eventos e;
