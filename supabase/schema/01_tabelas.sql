-- TABELAS — colunas, defaults e constraints
-- Gerado por scripts/extrair_schema.mts em 2026-09-01.
-- NAO EDITE A MAO: regenere.

-- ======================================================================
-- admin_users
-- ======================================================================
CREATE TABLE public.admin_users (
    user_id uuid NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_pkey PRIMARY KEY (user_id);

-- ======================================================================
-- alertas
-- ======================================================================
CREATE TABLE public.alertas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid,
    tabela text NOT NULL,
    tipo text NOT NULL,
    mensagem text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_por_auth_uid uuid,
    visto boolean DEFAULT false NOT NULL
);
ALTER TABLE public.alertas ADD CONSTRAINT alertas_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.alertas ADD CONSTRAINT alertas_pkey PRIMARY KEY (id);

-- ======================================================================
-- analise_itens
-- ======================================================================
CREATE TABLE public.analise_itens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analise_id uuid NOT NULL,
    processo_checklist_item_id uuid NOT NULL,
    status status_item_enum DEFAULT 'NAO_VERIFICADO'::status_item_enum NOT NULL,
    comentario text,
    pendencia_texto_custom text,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.analise_itens ADD CONSTRAINT analise_itens_processo_checklist_item_id_fkey FOREIGN KEY (processo_checklist_item_id) REFERENCES processo_checklist_itens(id) ON DELETE RESTRICT;
ALTER TABLE public.analise_itens ADD CONSTRAINT analise_itens_pkey PRIMARY KEY (id);

-- ======================================================================
-- analises
-- ======================================================================
CREATE TABLE public.analises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid NOT NULL,
    numero smallint NOT NULL,
    iniciado_em timestamp with time zone DEFAULT now(),
    finalizado_em timestamp with time zone,
    realizado_por_papel text NOT NULL,
    resumo text,
    recomendacao text,
    observacoes_por_aba jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE public.analises ADD CONSTRAINT analises_recomendacao_check CHECK ((recomendacao = ANY (ARRAY['CONTINUAR'::text, 'PARAR_E_INDEFERIR'::text, 'PARAR_E_INELEGIVEL'::text, 'DEVOLVER_PARA_AJUSTE'::text])));
ALTER TABLE public.analises ADD CONSTRAINT analises_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.analises ADD CONSTRAINT analises_pkey PRIMARY KEY (id);
ALTER TABLE public.analises ADD CONSTRAINT analises_processo_id_numero_key UNIQUE (processo_id, numero);

-- ======================================================================
-- analises_mac
-- ======================================================================
CREATE TABLE public.analises_mac (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_codigo text NOT NULL,
    analista_id uuid,
    numero_analise integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'em_andamento'::text NOT NULL,
    itens jsonb DEFAULT '{}'::jsonb NOT NULL,
    observacoes text,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now(),
    modelo_id uuid,
    numero_revisao smallint DEFAULT 1,
    historico_analises text,
    tipo_processo text DEFAULT 'REGULARIZACAO'::text,
    observacoes_por_aba jsonb DEFAULT '{}'::jsonb,
    assunto_id uuid,
    aceites jsonb DEFAULT '{}'::jsonb,
    fontes jsonb DEFAULT '{}'::jsonb,
    cau_responsavel text,
    crea_responsavel text,
    numero_despacho text,
    numero_parecer text,
    numero_despacho_interno text,
    excluido_em timestamp with time zone,
    excluido_por uuid,
    excluido_motivo text,
    data_despacho text,
    data_parecer text,
    observacoes_por_item jsonb DEFAULT '{}'::jsonb NOT NULL
);
ALTER TABLE public.analises_mac ADD CONSTRAINT analises_mac_analista_id_fkey FOREIGN KEY (analista_id) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE public.analises_mac ADD CONSTRAINT analises_mac_assunto_id_fkey FOREIGN KEY (assunto_id) REFERENCES assuntos(id);
ALTER TABLE public.analises_mac ADD CONSTRAINT analises_mac_modelo_id_fkey FOREIGN KEY (modelo_id) REFERENCES mac_checklist_modelos(id);
ALTER TABLE public.analises_mac ADD CONSTRAINT analises_mac_pkey PRIMARY KEY (id);
COMMENT ON COLUMN public.analises_mac.cau_responsavel IS "Número do CAU do responsável técnico do projeto (arquiteto).";
COMMENT ON COLUMN public.analises_mac.crea_responsavel IS "Número do CREA do responsável técnico do projeto (engenheiro).";

-- ======================================================================
-- assinaturas
-- ======================================================================
CREATE TABLE public.assinaturas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    decisao_id uuid NOT NULL,
    papel_assinante text NOT NULL,
    matricula_no_momento text,
    assinado_em timestamp with time zone,
    status text DEFAULT 'PENDENTE'::text NOT NULL,
    observacao text
);
ALTER TABLE public.assinaturas ADD CONSTRAINT assinaturas_status_check CHECK ((status = ANY (ARRAY['PENDENTE'::text, 'ASSINADO'::text, 'REJEITADO'::text])));
ALTER TABLE public.assinaturas ADD CONSTRAINT assinaturas_decisao_id_fkey FOREIGN KEY (decisao_id) REFERENCES decisoes(id) ON DELETE CASCADE;
ALTER TABLE public.assinaturas ADD CONSTRAINT assinaturas_pkey PRIMARY KEY (id);
ALTER TABLE public.assinaturas ADD CONSTRAINT assinaturas_decisao_id_papel_assinante_key UNIQUE (decisao_id, papel_assinante);

-- ======================================================================
-- assuntos
-- ======================================================================
CREATE TABLE public.assuntos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true,
    ordem integer DEFAULT 0,
    criado_em timestamp with time zone DEFAULT now(),
    nome_documento text,
    numeracao text DEFAULT 'sei'::text NOT NULL
);
ALTER TABLE public.assuntos ADD CONSTRAINT assuntos_pkey PRIMARY KEY (id);
ALTER TABLE public.assuntos ADD CONSTRAINT assuntos_slug_key UNIQUE (slug);

-- ======================================================================
-- auditoria_eventos
-- ======================================================================
CREATE TABLE public.auditoria_eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analista_id uuid,
    analista_nome text,
    sessao_id uuid,
    modulo text,
    acao text,
    processo_codigo text,
    assunto_id uuid,
    detalhe jsonb,
    origem text,
    criado_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.auditoria_eventos ADD CONSTRAINT auditoria_eventos_assunto_id_fkey FOREIGN KEY (assunto_id) REFERENCES assuntos(id);
ALTER TABLE public.auditoria_eventos ADD CONSTRAINT auditoria_eventos_pkey PRIMARY KEY (id);

-- ======================================================================
-- auditoria_eventos_backup
-- ======================================================================
CREATE TABLE public.auditoria_eventos_backup (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analista_id uuid,
    analista_nome text,
    sessao_id uuid,
    modulo text,
    acao text,
    processo_codigo text,
    assunto_id uuid,
    detalhe jsonb,
    origem text,
    criado_em timestamp with time zone DEFAULT now(),
    backup_em timestamp with time zone DEFAULT now(),
    backup_motivo text DEFAULT 'delete'::text
);
ALTER TABLE public.auditoria_eventos_backup ADD CONSTRAINT auditoria_eventos_backup_pkey PRIMARY KEY (id);

-- ======================================================================
-- auditoria_log
-- ======================================================================
CREATE TABLE public.auditoria_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tabela text NOT NULL,
    operacao text NOT NULL,
    registro_id uuid,
    usuario_auth_uid uuid,
    dados_antes jsonb,
    dados_depois jsonb,
    criado_em timestamp with time zone DEFAULT now(),
    ip text,
    user_agent text,
    request_headers jsonb
);
ALTER TABLE public.auditoria_log ADD CONSTRAINT auditoria_log_pkey PRIMARY KEY (id);

-- ======================================================================
-- auditoria_log_backup
-- ======================================================================
CREATE TABLE public.auditoria_log_backup (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tabela text NOT NULL,
    operacao text NOT NULL,
    registro_id uuid,
    usuario_auth_uid uuid,
    dados_antes jsonb,
    dados_depois jsonb,
    criado_em timestamp with time zone DEFAULT now(),
    ip text,
    user_agent text,
    request_headers jsonb,
    backup_em timestamp with time zone DEFAULT now(),
    backup_motivo text DEFAULT 'delete'::text
);
ALTER TABLE public.auditoria_log_backup ADD CONSTRAINT auditoria_log_backup_pkey PRIMARY KEY (id);

-- ======================================================================
-- auditoria_sessoes
-- ======================================================================
CREATE TABLE public.auditoria_sessoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analista_id uuid,
    analista_nome text,
    iniciada_em timestamp with time zone DEFAULT now(),
    encerrada_em timestamp with time zone,
    tempo_bruto_s integer,
    tempo_liquido_s integer,
    ultimo_evento timestamp with time zone
);
ALTER TABLE public.auditoria_sessoes ADD CONSTRAINT auditoria_sessoes_analista_id_fkey FOREIGN KEY (analista_id) REFERENCES auth.users(id);
ALTER TABLE public.auditoria_sessoes ADD CONSTRAINT auditoria_sessoes_pkey PRIMARY KEY (id);

-- ======================================================================
-- auditoria_sessoes_backup
-- ======================================================================
CREATE TABLE public.auditoria_sessoes_backup (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analista_id uuid,
    analista_nome text,
    iniciada_em timestamp with time zone DEFAULT now(),
    encerrada_em timestamp with time zone,
    tempo_bruto_s integer,
    tempo_liquido_s integer,
    ultimo_evento timestamp with time zone,
    backup_em timestamp with time zone DEFAULT now(),
    backup_motivo text DEFAULT 'delete'::text
);
ALTER TABLE public.auditoria_sessoes_backup ADD CONSTRAINT auditoria_sessoes_backup_pkey PRIMARY KEY (id);

-- ======================================================================
-- bdi_documentos_lei
-- ======================================================================
CREATE TABLE public.bdi_documentos_lei (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    titulo text NOT NULL,
    tipo text NOT NULL,
    numero text,
    ementa text,
    url_pdf text,
    status_indexacao text DEFAULT 'pendente'::text,
    criado_em timestamp with time zone DEFAULT now(),
    ano text
);
ALTER TABLE public.bdi_documentos_lei ADD CONSTRAINT bdi_documentos_lei_pkey PRIMARY KEY (id);

-- ======================================================================
-- bdi_documentos_lei_backup
-- ======================================================================
CREATE TABLE public.bdi_documentos_lei_backup (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    titulo text NOT NULL,
    tipo text NOT NULL,
    numero text,
    ementa text,
    url_pdf text,
    status_indexacao text DEFAULT 'pendente'::text,
    criado_em timestamp with time zone DEFAULT now(),
    ano text,
    backup_em timestamp with time zone DEFAULT now(),
    backup_motivo text DEFAULT 'delete'::text
);
ALTER TABLE public.bdi_documentos_lei_backup ADD CONSTRAINT bdi_documentos_lei_backup_pkey PRIMARY KEY (id);

-- ======================================================================
-- bdi_lei_fragmentos
-- ======================================================================
CREATE TABLE public.bdi_lei_fragmentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    documento_id uuid NOT NULL,
    referencia text NOT NULL,
    texto text NOT NULL,
    embedding vector(768),
    criado_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.bdi_lei_fragmentos ADD CONSTRAINT bdi_lei_fragmentos_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES bdi_documentos_lei(id) ON DELETE CASCADE;
ALTER TABLE public.bdi_lei_fragmentos ADD CONSTRAINT bdi_lei_fragmentos_pkey PRIMARY KEY (id);

-- ======================================================================
-- bdi_lei_fragmentos_backup
-- ======================================================================
CREATE TABLE public.bdi_lei_fragmentos_backup (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    documento_id uuid NOT NULL,
    referencia text NOT NULL,
    texto text NOT NULL,
    embedding vector(768),
    criado_em timestamp with time zone DEFAULT now(),
    backup_em timestamp with time zone DEFAULT now(),
    backup_motivo text DEFAULT 'delete'::text
);
ALTER TABLE public.bdi_lei_fragmentos_backup ADD CONSTRAINT bdi_lei_fragmentos_backup_pkey PRIMARY KEY (id);

-- ======================================================================
-- bdi_snapshots
-- ======================================================================
CREATE TABLE public.bdi_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text DEFAULT 'mrp_registros'::text NOT NULL,
    origem text,
    gerado_em timestamp with time zone DEFAULT now() NOT NULL,
    gerado_por_id uuid,
    gerado_por_nome text,
    total_registros integer DEFAULT 0 NOT NULL,
    dados jsonb DEFAULT '[]'::jsonb NOT NULL,
    observacoes text
);
ALTER TABLE public.bdi_snapshots ADD CONSTRAINT bdi_snapshots_gerado_por_id_fkey FOREIGN KEY (gerado_por_id) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE public.bdi_snapshots ADD CONSTRAINT bdi_snapshots_pkey PRIMARY KEY (id);

-- ======================================================================
-- bip_anotacoes_usuario
-- ======================================================================
CREATE TABLE public.bip_anotacoes_usuario (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    lei_id uuid NOT NULL,
    pagina integer NOT NULL,
    camada_vetorial jsonb DEFAULT '[]'::jsonb NOT NULL,
    clipes_marcadores jsonb DEFAULT '[]'::jsonb NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.bip_anotacoes_usuario ADD CONSTRAINT bip_anotacoes_usuario_lei_id_fkey FOREIGN KEY (lei_id) REFERENCES bdi_documentos_lei(id) ON DELETE CASCADE;
ALTER TABLE public.bip_anotacoes_usuario ADD CONSTRAINT bip_anotacoes_usuario_pkey PRIMARY KEY (id);
ALTER TABLE public.bip_anotacoes_usuario ADD CONSTRAINT bip_anotacoes_usuario_usuario_id_lei_id_pagina_key UNIQUE (usuario_id, lei_id, pagina);

-- ======================================================================
-- bip_historico_anotacoes
-- ======================================================================
CREATE TABLE public.bip_historico_anotacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    lei_id uuid NOT NULL,
    acao text NOT NULL,
    pagina integer,
    elemento_id uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.bip_historico_anotacoes ADD CONSTRAINT bip_historico_anotacoes_lei_id_fkey FOREIGN KEY (lei_id) REFERENCES bdi_documentos_lei(id) ON DELETE CASCADE;
ALTER TABLE public.bip_historico_anotacoes ADD CONSTRAINT bip_historico_anotacoes_pkey PRIMARY KEY (id);

-- ======================================================================
-- cadastro_processo
-- ======================================================================
CREATE TABLE public.cadastro_processo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id text NOT NULL,
    dados jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);
ALTER TABLE public.cadastro_processo ADD CONSTRAINT cadastro_processo_pkey PRIMARY KEY (id);
ALTER TABLE public.cadastro_processo ADD CONSTRAINT cadastro_processo_processo_id_key UNIQUE (processo_id);

-- ======================================================================
-- chat_mensagens
-- ======================================================================
CREATE TABLE public.chat_mensagens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    remetente_id uuid NOT NULL,
    canal_tipo text NOT NULL,
    canal_referencia_id uuid,
    conteudo text NOT NULL,
    criado_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.chat_mensagens ADD CONSTRAINT chat_mensagens_canal_tipo_check CHECK ((canal_tipo = ANY (ARRAY['ministerio_proprio'::text, 'ministerio_externo'::text, 'privado'::text, 'coordenadores'::text, 'padre_admin'::text])));
ALTER TABLE public.chat_mensagens ADD CONSTRAINT chat_mensagens_remetente_id_fkey FOREIGN KEY (remetente_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.chat_mensagens ADD CONSTRAINT chat_mensagens_pkey PRIMARY KEY (id);

-- ======================================================================
-- checklist_instancias
-- ======================================================================
CREATE TABLE public.checklist_instancias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid NOT NULL,
    modelo_id uuid NOT NULL,
    versao_modelo integer DEFAULT 1 NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_por_auth_uid uuid
);
ALTER TABLE public.checklist_instancias ADD CONSTRAINT checklist_instancias_modelo_id_fkey FOREIGN KEY (modelo_id) REFERENCES checklist_modelos(id) ON DELETE RESTRICT;
ALTER TABLE public.checklist_instancias ADD CONSTRAINT checklist_instancias_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.checklist_instancias ADD CONSTRAINT checklist_instancias_pkey PRIMARY KEY (id);
ALTER TABLE public.checklist_instancias ADD CONSTRAINT checklist_instancias_processo_id_key UNIQUE (processo_id);

-- ======================================================================
-- checklist_item_estatistica
-- ======================================================================
CREATE TABLE public.checklist_item_estatistica (
    item_modelo_id uuid NOT NULL,
    total_cliques integer DEFAULT 0,
    total_pendencias integer DEFAULT 0,
    atualizado_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.checklist_item_estatistica ADD CONSTRAINT checklist_item_estatistica_pkey PRIMARY KEY (item_modelo_id);

-- ======================================================================
-- checklist_items
-- ======================================================================
CREATE TABLE public.checklist_items (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    procedimento text NOT NULL,
    parte text NOT NULL,
    codigo text NOT NULL,
    titulo text NOT NULL,
    referencia_legal text,
    obrigatorio boolean DEFAULT true
);
ALTER TABLE public.checklist_items ADD CONSTRAINT checklist_items_pkey PRIMARY KEY (id);
ALTER TABLE public.checklist_items ADD CONSTRAINT checklist_items_codigo_key UNIQUE (codigo);

-- ======================================================================
-- checklist_itens
-- ======================================================================
CREATE TABLE public.checklist_itens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    procedimento text NOT NULL,
    parte text NOT NULL,
    codigo text NOT NULL,
    titulo text NOT NULL,
    referencia_legal text,
    obrigatorio boolean DEFAULT true
);
ALTER TABLE public.checklist_itens ADD CONSTRAINT checklist_itens_procedimento_check CHECK ((procedimento = ANY (ARRAY['APROVACAO'::text, 'REGULARIZACAO'::text, 'ACEITE'::text])));
ALTER TABLE public.checklist_itens ADD CONSTRAINT checklist_itens_pkey PRIMARY KEY (id);
ALTER TABLE public.checklist_itens ADD CONSTRAINT checklist_itens_codigo_unique UNIQUE (codigo);
ALTER TABLE public.checklist_itens ADD CONSTRAINT checklist_itens_procedimento_codigo_key UNIQUE (procedimento, codigo);

-- ======================================================================
-- checklist_itens_instancia
-- ======================================================================
CREATE TABLE public.checklist_itens_instancia (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instancia_id uuid NOT NULL,
    item_modelo_id uuid,
    ordem integer,
    titulo text,
    descricao text,
    referencia text,
    regra text,
    status checklist_item_status_enum DEFAULT 'NAO_VERIFICADO'::checklist_item_status_enum NOT NULL,
    comentario text,
    solicitado_qtd integer DEFAULT 0 NOT NULL,
    resolvido_em timestamp with time zone,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_por_auth_uid uuid,
    tema text,
    base_normativa text,
    item_texto text,
    pendencia_texto_padrao text
);
ALTER TABLE public.checklist_itens_instancia ADD CONSTRAINT checklist_itens_instancia_instancia_id_fkey FOREIGN KEY (instancia_id) REFERENCES checklist_instancias(id) ON DELETE CASCADE;
ALTER TABLE public.checklist_itens_instancia ADD CONSTRAINT checklist_itens_instancia_pkey PRIMARY KEY (id);

-- ======================================================================
-- checklist_modelo_itens
-- ======================================================================
CREATE TABLE public.checklist_modelo_itens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    modelo_id uuid NOT NULL,
    tema text NOT NULL,
    base_normativa text,
    item_texto text NOT NULL,
    pendencia_texto_padrao text NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    checklist_modelo_id uuid
);
ALTER TABLE public.checklist_modelo_itens ADD CONSTRAINT checklist_modelo_itens_fk_modelo FOREIGN KEY (checklist_modelo_id) REFERENCES checklist_modelos(id) ON DELETE CASCADE;
ALTER TABLE public.checklist_modelo_itens ADD CONSTRAINT checklist_modelo_itens_modelo_id_fkey FOREIGN KEY (modelo_id) REFERENCES checklist_modelos(id) ON DELETE CASCADE;
ALTER TABLE public.checklist_modelo_itens ADD CONSTRAINT checklist_modelo_itens_pkey PRIMARY KEY (id);

-- ======================================================================
-- checklist_modelos
-- ======================================================================
CREATE TABLE public.checklist_modelos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_equipe_id uuid,
    base_modelo_id uuid,
    tipo_processo tipo_processo_enum NOT NULL,
    gerencia_id uuid,
    versao smallint DEFAULT 1 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    justificativa text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_por uuid
);
ALTER TABLE public.checklist_modelos ADD CONSTRAINT checklist_modelos_base_modelo_id_fkey FOREIGN KEY (base_modelo_id) REFERENCES checklist_modelos(id) ON DELETE SET NULL;
ALTER TABLE public.checklist_modelos ADD CONSTRAINT checklist_modelos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES equipe(id) ON DELETE SET NULL;
ALTER TABLE public.checklist_modelos ADD CONSTRAINT checklist_modelos_gerencia_id_fkey FOREIGN KEY (gerencia_id) REFERENCES gerencias(id) ON DELETE RESTRICT;
ALTER TABLE public.checklist_modelos ADD CONSTRAINT checklist_modelos_owner_equipe_id_fkey FOREIGN KEY (owner_equipe_id) REFERENCES equipe(id) ON DELETE SET NULL;
ALTER TABLE public.checklist_modelos ADD CONSTRAINT checklist_modelos_pkey PRIMARY KEY (id);

-- ======================================================================
-- checklist_respostas
-- ======================================================================
CREATE TABLE public.checklist_respostas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid NOT NULL,
    checklist_item_id uuid NOT NULL,
    analise_id uuid,
    status_item text NOT NULL,
    observacao text,
    evidencias text,
    marcado_por_papel text NOT NULL,
    marcado_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.checklist_respostas ADD CONSTRAINT checklist_respostas_status_item_check CHECK ((status_item = ANY (ARRAY['OK'::text, 'PENDENCIA'::text, 'NAO_VERIFICADO'::text, 'NAO_PERTINENTE'::text])));
ALTER TABLE public.checklist_respostas ADD CONSTRAINT checklist_respostas_analise_id_fkey FOREIGN KEY (analise_id) REFERENCES analises(id) ON DELETE SET NULL;
ALTER TABLE public.checklist_respostas ADD CONSTRAINT checklist_respostas_checklist_item_id_fkey FOREIGN KEY (checklist_item_id) REFERENCES checklist_itens(id);
ALTER TABLE public.checklist_respostas ADD CONSTRAINT checklist_respostas_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.checklist_respostas ADD CONSTRAINT checklist_respostas_pkey PRIMARY KEY (id);
ALTER TABLE public.checklist_respostas ADD CONSTRAINT checklist_respostas_processo_id_checklist_item_id_analise_i_key UNIQUE (processo_id, checklist_item_id, analise_id);

-- ======================================================================
-- config_urbis
-- ======================================================================
CREATE TABLE public.config_urbis (
    chave text NOT NULL,
    valor text NOT NULL
);
ALTER TABLE public.config_urbis ADD CONSTRAINT config_urbis_pkey PRIMARY KEY (chave);

-- ======================================================================
-- decisoes
-- ======================================================================
CREATE TABLE public.decisoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid NOT NULL,
    analise_id uuid,
    tipo_decisao text NOT NULL,
    motivo_principal text NOT NULL,
    fundamentos text,
    criado_em timestamp with time zone DEFAULT now(),
    status_assinatura text DEFAULT 'PENDENTE'::text NOT NULL
);
ALTER TABLE public.decisoes ADD CONSTRAINT decisoes_status_assinatura_check CHECK ((status_assinatura = ANY (ARRAY['PENDENTE'::text, 'ASSINADO'::text, 'REJEITADO'::text])));
ALTER TABLE public.decisoes ADD CONSTRAINT decisoes_tipo_decisao_check CHECK ((tipo_decisao = ANY (ARRAY['INELEGIVEL'::text, 'INDEFERIMENTO'::text, 'ARQUIVAMENTO'::text, 'DEFERIMENTO'::text, 'DEVOLUCAO'::text])));
ALTER TABLE public.decisoes ADD CONSTRAINT decisoes_analise_id_fkey FOREIGN KEY (analise_id) REFERENCES analises(id) ON DELETE SET NULL;
ALTER TABLE public.decisoes ADD CONSTRAINT decisoes_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.decisoes ADD CONSTRAINT decisoes_pkey PRIMARY KEY (id);

-- ======================================================================
-- despacho_padroes
-- ======================================================================
CREATE TABLE public.despacho_padroes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assunto_id uuid NOT NULL,
    modulo text NOT NULL,
    tipo_despacho text NOT NULL,
    titulo text NOT NULL,
    corpo text NOT NULL,
    destinatario_padrao text,
    ativo boolean DEFAULT true NOT NULL,
    criado_por uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.despacho_padroes ADD CONSTRAINT despacho_padroes_check CHECK ((NOT ((modulo = 'LIP'::text) AND (tipo_despacho = 'externo'::text))));
ALTER TABLE public.despacho_padroes ADD CONSTRAINT despacho_padroes_modulo_check CHECK ((modulo = ANY (ARRAY['LIP'::text, 'MAC'::text])));
ALTER TABLE public.despacho_padroes ADD CONSTRAINT despacho_padroes_tipo_despacho_check CHECK ((tipo_despacho = ANY (ARRAY['interno'::text, 'externo'::text])));
ALTER TABLE public.despacho_padroes ADD CONSTRAINT despacho_padroes_assunto_id_fkey FOREIGN KEY (assunto_id) REFERENCES assuntos(id);
ALTER TABLE public.despacho_padroes ADD CONSTRAINT despacho_padroes_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE public.despacho_padroes ADD CONSTRAINT despacho_padroes_pkey PRIMARY KEY (id);

-- ======================================================================
-- despachos
-- ======================================================================
CREATE TABLE public.despachos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid NOT NULL,
    analise_id uuid NOT NULL,
    numero smallint NOT NULL,
    texto_gerado text NOT NULL,
    texto_editado text,
    gerado_em timestamp with time zone DEFAULT now() NOT NULL,
    emitido_em timestamp with time zone,
    emitido_por uuid,
    pdf_ref text,
    assunto_id uuid NOT NULL
);
ALTER TABLE public.despachos ADD CONSTRAINT despachos_numero_check CHECK (((numero >= 1) AND (numero <= 6)));
ALTER TABLE public.despachos ADD CONSTRAINT despachos_assunto_id_fkey FOREIGN KEY (assunto_id) REFERENCES assuntos(id);
ALTER TABLE public.despachos ADD CONSTRAINT despachos_emitido_por_fkey FOREIGN KEY (emitido_por) REFERENCES equipe(id) ON DELETE SET NULL;
ALTER TABLE public.despachos ADD CONSTRAINT despachos_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.despachos ADD CONSTRAINT despachos_pkey PRIMARY KEY (id);

-- ======================================================================
-- diretorias
-- ======================================================================
CREATE TABLE public.diretorias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.diretorias ADD CONSTRAINT diretorias_pkey PRIMARY KEY (id);

-- ======================================================================
-- documentos
-- ======================================================================
CREATE TABLE public.documentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid NOT NULL,
    tipo text NOT NULL,
    versao integer NOT NULL,
    titulo text,
    storage_path text,
    hash_sha256 text,
    motivo_revisao text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_por_auth_uid uuid NOT NULL
);
ALTER TABLE public.documentos ADD CONSTRAINT documentos_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.documentos ADD CONSTRAINT documentos_pkey PRIMARY KEY (id);
ALTER TABLE public.documentos ADD CONSTRAINT documentos_processo_id_tipo_versao_key UNIQUE (processo_id, tipo, versao);

-- ======================================================================
-- documentos_lidos
-- ======================================================================
CREATE TABLE public.documentos_lidos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    documento_id uuid NOT NULL,
    processo_id uuid NOT NULL,
    nome_arquivo text,
    tipo_documento text,
    texto_extraido text,
    status_leitura text DEFAULT 'PENDENTE'::text,
    erro_leitura text,
    criado_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.documentos_lidos ADD CONSTRAINT documentos_lidos_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES documentos_processo(id) ON DELETE CASCADE;
ALTER TABLE public.documentos_lidos ADD CONSTRAINT documentos_lidos_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.documentos_lidos ADD CONSTRAINT documentos_lidos_pkey PRIMARY KEY (id);

-- ======================================================================
-- documentos_processo
-- ======================================================================
CREATE TABLE public.documentos_processo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid NOT NULL,
    nome_arquivo text NOT NULL,
    caminho_storage text NOT NULL,
    tipo_documento text DEFAULT 'NAO_CLASSIFICADO'::text NOT NULL,
    origem text DEFAULT 'UPLOAD'::text NOT NULL,
    hash_arquivo text,
    tamanho_bytes bigint,
    mime_type text,
    eh_duplicado boolean DEFAULT false NOT NULL,
    eh_mais_recente boolean DEFAULT false NOT NULL,
    observacao text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    assunto_id uuid NOT NULL
);
ALTER TABLE public.documentos_processo ADD CONSTRAINT documentos_processo_assunto_id_fkey FOREIGN KEY (assunto_id) REFERENCES assuntos(id);
ALTER TABLE public.documentos_processo ADD CONSTRAINT documentos_processo_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.documentos_processo ADD CONSTRAINT documentos_processo_pkey PRIMARY KEY (id);

-- ======================================================================
-- equipe
-- ======================================================================
CREATE TABLE public.equipe (
    matricula text DEFAULT ''::text NOT NULL,
    nome text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    papel text DEFAULT ''::text NOT NULL,
    gerencia text DEFAULT ''::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_uid uuid,
    diretoria text,
    registro text
);
ALTER TABLE public.equipe ADD CONSTRAINT equipe_pkey PRIMARY KEY (id);
ALTER TABLE public.equipe ADD CONSTRAINT equipe_email_key UNIQUE (email);
ALTER TABLE public.equipe ADD CONSTRAINT equipe_matricula_key UNIQUE (matricula);
ALTER TABLE public.equipe ADD CONSTRAINT equipe_matricula_unique UNIQUE (matricula);

-- ======================================================================
-- equipe_gerencias
-- ======================================================================
CREATE TABLE public.equipe_gerencias (
    equipe_id uuid NOT NULL,
    gerencia_id uuid NOT NULL
);
ALTER TABLE public.equipe_gerencias ADD CONSTRAINT equipe_gerencias_equipe_id_fkey FOREIGN KEY (equipe_id) REFERENCES equipe(id) ON DELETE CASCADE;
ALTER TABLE public.equipe_gerencias ADD CONSTRAINT equipe_gerencias_gerencia_id_fkey FOREIGN KEY (gerencia_id) REFERENCES gerencias(id) ON DELETE CASCADE;
ALTER TABLE public.equipe_gerencias ADD CONSTRAINT equipe_gerencias_pkey PRIMARY KEY (equipe_id, gerencia_id);

-- ======================================================================
-- equipe_roles
-- ======================================================================
CREATE TABLE public.equipe_roles (
    equipe_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.equipe_roles ADD CONSTRAINT equipe_roles_equipe_id_fkey FOREIGN KEY (equipe_id) REFERENCES equipe(id) ON DELETE CASCADE;
ALTER TABLE public.equipe_roles ADD CONSTRAINT equipe_roles_pkey PRIMARY KEY (equipe_id, role);

-- ======================================================================
-- etapa_tempo_sessoes
-- ======================================================================
CREATE TABLE public.etapa_tempo_sessoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid NOT NULL,
    etapa_id uuid NOT NULL,
    iniciado_em timestamp with time zone DEFAULT now() NOT NULL,
    finalizado_em timestamp with time zone,
    iniciado_por_auth_uid uuid NOT NULL,
    finalizado_por_auth_uid uuid,
    motivo_pausa text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.etapa_tempo_sessoes ADD CONSTRAINT etapa_tempo_sessoes_etapa_id_fkey FOREIGN KEY (etapa_id) REFERENCES processo_etapas(id) ON DELETE CASCADE;
ALTER TABLE public.etapa_tempo_sessoes ADD CONSTRAINT etapa_tempo_sessoes_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.etapa_tempo_sessoes ADD CONSTRAINT etapa_tempo_sessoes_pkey PRIMARY KEY (id);

-- ======================================================================
-- eventos
-- ======================================================================
CREATE TABLE public.eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid NOT NULL,
    tipo text NOT NULL,
    etapa text,
    descricao text NOT NULL,
    cor text DEFAULT 'gray'::text,
    data_evento timestamp with time zone DEFAULT now() NOT NULL,
    criado_por uuid,
    criado_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.eventos ADD CONSTRAINT eventos_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.eventos ADD CONSTRAINT eventos_pkey PRIMARY KEY (id);
ALTER TABLE public.eventos ADD CONSTRAINT eventos_unique_status UNIQUE (processo_id, tipo, etapa, descricao);

-- ======================================================================
-- formato_identificadores
-- ======================================================================
CREATE TABLE public.formato_identificadores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo_identificador text NOT NULL,
    regex_validacao text NOT NULL,
    descricao text,
    ativo boolean DEFAULT true,
    criado_em timestamp without time zone DEFAULT now()
);
ALTER TABLE public.formato_identificadores ADD CONSTRAINT formato_identificadores_pkey PRIMARY KEY (id);

-- ======================================================================
-- gerencias
-- ======================================================================
CREATE TABLE public.gerencias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    diretoria_id uuid NOT NULL,
    nome text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.gerencias ADD CONSTRAINT gerencias_diretoria_id_fkey FOREIGN KEY (diretoria_id) REFERENCES diretorias(id) ON DELETE CASCADE;
ALTER TABLE public.gerencias ADD CONSTRAINT gerencias_pkey PRIMARY KEY (id);

-- ======================================================================
-- impeditivos
-- ======================================================================
CREATE TABLE public.impeditivos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid NOT NULL,
    analise_id uuid,
    origem text NOT NULL,
    tipo text NOT NULL,
    descricao text NOT NULL,
    referencia_legal text,
    impacto text NOT NULL,
    sanabilidade text NOT NULL,
    acao_sugerida text NOT NULL,
    criado_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.impeditivos ADD CONSTRAINT impeditivos_acao_sugerida_check CHECK ((acao_sugerida = ANY (ARRAY['CONTINUAR_LISTANDO'::text, 'PARAR_ANALISE'::text, 'SOLICITAR_NOVA_VISTORIA'::text, 'SOLICITAR_DOC'::text, 'EXCLUIR_AREA_NOVA_DO_LEVANTAMENTO'::text])));
ALTER TABLE public.impeditivos ADD CONSTRAINT impeditivos_impacto_check CHECK ((impacto = ANY (ARRAY['BAIXO'::text, 'ALTO'::text])));
ALTER TABLE public.impeditivos ADD CONSTRAINT impeditivos_origem_check CHECK ((origem = ANY (ARRAY['CEADV'::text, 'GEFEP'::text, 'ANALISTA'::text])));
ALTER TABLE public.impeditivos ADD CONSTRAINT impeditivos_sanabilidade_check CHECK ((sanabilidade = ANY (ARRAY['SANAVEL'::text, 'INSANAVEL'::text, 'PARCIAL'::text])));
ALTER TABLE public.impeditivos ADD CONSTRAINT impeditivos_analise_id_fkey FOREIGN KEY (analise_id) REFERENCES analises(id) ON DELETE SET NULL;
ALTER TABLE public.impeditivos ADD CONSTRAINT impeditivos_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.impeditivos ADD CONSTRAINT impeditivos_pkey PRIMARY KEY (id);

-- ======================================================================
-- limites
-- ======================================================================
CREATE TABLE public.limites (
    limite_160 integer,
    limite_170 integer,
    limite_180 integer
);

-- ======================================================================
-- lip_abas
-- ======================================================================
CREATE TABLE public.lip_abas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    dica text,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now(),
    assunto_id uuid
);
ALTER TABLE public.lip_abas ADD CONSTRAINT lip_abas_assunto_id_fkey FOREIGN KEY (assunto_id) REFERENCES assuntos(id);
ALTER TABLE public.lip_abas ADD CONSTRAINT lip_abas_pkey PRIMARY KEY (id);

-- ======================================================================
-- lip_campos
-- ======================================================================
CREATE TABLE public.lip_campos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    aba_id uuid NOT NULL,
    chave text NOT NULL,
    label text NOT NULL,
    tipo text DEFAULT 'texto'::text NOT NULL,
    opcoes text[],
    placeholder text,
    valor_padrao text,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.lip_campos ADD CONSTRAINT lip_campos_aba_id_fkey FOREIGN KEY (aba_id) REFERENCES lip_abas(id) ON DELETE CASCADE;
ALTER TABLE public.lip_campos ADD CONSTRAINT lip_campos_pkey PRIMARY KEY (id);

-- ======================================================================
-- lip_decisoes_item
-- ======================================================================
CREATE TABLE public.lip_decisoes_item (
    processo_id uuid NOT NULL,
    ordem integer NOT NULL,
    status_analise text NOT NULL,
    observacao text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    criado_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.lip_decisoes_item ADD CONSTRAINT lip_decisoes_item_status_analise_check CHECK ((status_analise = ANY (ARRAY['OK'::text, 'PENDENCIA'::text, 'REPROVAR'::text])));
ALTER TABLE public.lip_decisoes_item ADD CONSTRAINT lip_decisoes_item_pkey PRIMARY KEY (processo_id, ordem);
ALTER TABLE public.lip_decisoes_item ADD CONSTRAINT lip_decisoes_item_unique_processo_ordem UNIQUE (processo_id, ordem);

-- ======================================================================
-- lip_jobs
-- ======================================================================
CREATE TABLE public.lip_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_codigo text,
    status text DEFAULT 'processando'::text NOT NULL,
    resultado jsonb,
    erro text,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.lip_jobs ADD CONSTRAINT lip_jobs_pkey PRIMARY KEY (id);

-- ======================================================================
-- lip_processo_atual
-- ======================================================================
CREATE TABLE public.lip_processo_atual (
    id integer DEFAULT nextval('lip_processo_atual_id_seq'::regclass) NOT NULL,
    processo_id uuid NOT NULL,
    aberto_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.lip_processo_atual ADD CONSTRAINT lip_processo_atual_pkey PRIMARY KEY (id);

-- ======================================================================
-- lip_prompts
-- ======================================================================
CREATE TABLE public.lip_prompts (
    id integer DEFAULT nextval('lip_prompts_id_seq'::regclass) NOT NULL,
    nome text DEFAULT 'prompt_s3'::text NOT NULL,
    versao integer DEFAULT 1 NOT NULL,
    conteudo text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    chave text DEFAULT 'P2_EXTRACAO'::text,
    versao_anterior text,
    conteudo_backup text DEFAULT ''::text,
    assunto_id uuid
);
ALTER TABLE public.lip_prompts ADD CONSTRAINT lip_prompts_assunto_id_fkey FOREIGN KEY (assunto_id) REFERENCES assuntos(id);
ALTER TABLE public.lip_prompts ADD CONSTRAINT lip_prompts_pkey PRIMARY KEY (id);

-- ======================================================================
-- lip_prompts_historico
-- ======================================================================
CREATE TABLE public.lip_prompts_historico (
    id bigint DEFAULT nextval('lip_prompts_historico_id_seq'::regclass) NOT NULL,
    prompt_chave text NOT NULL,
    conteudo text NOT NULL,
    salvo_em timestamp with time zone DEFAULT now() NOT NULL,
    salvo_por text,
    assunto_id uuid
);
ALTER TABLE public.lip_prompts_historico ADD CONSTRAINT lip_prompts_historico_assunto_id_fkey FOREIGN KEY (assunto_id) REFERENCES assuntos(id);
ALTER TABLE public.lip_prompts_historico ADD CONSTRAINT lip_prompts_historico_pkey PRIMARY KEY (id);
COMMENT ON COLUMN public.lip_prompts_historico.prompt_chave IS "Chave do prompt (P1_TRIAGEM, P2_EXTRACAO). P2_MAC é ignorado pela aplicação.";
COMMENT ON COLUMN public.lip_prompts_historico.salvo_por IS "Nome do administrador que executou o salvamento que originou este snapshot.";

-- ======================================================================
-- lip_resultados
-- ======================================================================
CREATE TABLE public.lip_resultados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id text,
    documento_id text,
    nome_arquivo text,
    paginas integer,
    dados jsonb,
    criado_em timestamp without time zone DEFAULT now()
);
ALTER TABLE public.lip_resultados ADD CONSTRAINT lip_resultados_pkey PRIMARY KEY (id);

-- ======================================================================
-- logradouros
-- ======================================================================
CREATE TABLE public.logradouros (
    id integer DEFAULT nextval('logradouros_id_seq'::regclass) NOT NULL,
    bairro text,
    nome_logradouro text,
    nome_corredor text,
    hierarquia_viaria text,
    larg_calcada numeric,
    largura_pista numeric,
    largura_ilha numeric,
    largura_via numeric,
    area numeric
);
ALTER TABLE public.logradouros ADD CONSTRAINT logradouros_pkey PRIMARY KEY (id);

-- ======================================================================
-- mac_bip_vinculos
-- ======================================================================
CREATE TABLE public.mac_bip_vinculos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mac_item_id uuid NOT NULL,
    bip_fragmento_id uuid NOT NULL,
    confianca text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.mac_bip_vinculos ADD CONSTRAINT mac_bip_vinculos_confianca_check CHECK ((confianca = ANY (ARRAY['ALTA'::text, 'MEDIA'::text, 'BAIXA'::text])));
ALTER TABLE public.mac_bip_vinculos ADD CONSTRAINT mac_bip_vinculos_bip_fragmento_id_fkey FOREIGN KEY (bip_fragmento_id) REFERENCES bdi_lei_fragmentos(id) ON DELETE CASCADE;
ALTER TABLE public.mac_bip_vinculos ADD CONSTRAINT mac_bip_vinculos_mac_item_id_fkey FOREIGN KEY (mac_item_id) REFERENCES mac_checklist_itens(id) ON DELETE CASCADE;
ALTER TABLE public.mac_bip_vinculos ADD CONSTRAINT mac_bip_vinculos_pkey PRIMARY KEY (id);
ALTER TABLE public.mac_bip_vinculos ADD CONSTRAINT mac_bip_vinculos_mac_item_id_bip_fragmento_id_key UNIQUE (mac_item_id, bip_fragmento_id);

-- ======================================================================
-- mac_checklist_itens
-- ======================================================================
CREATE TABLE public.mac_checklist_itens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    modelo_id uuid,
    grupo text NOT NULL,
    texto text NOT NULL,
    ref text,
    ordem integer DEFAULT 0,
    ativo boolean DEFAULT true,
    chave_lip text,
    gera_indeferimento boolean DEFAULT false NOT NULL,
    origem text DEFAULT 'BANCO_LEGADO'::text NOT NULL,
    nota_analista text,
    fundamento_legal text,
    condicao_aplicabilidade text,
    termos_glossario text[],
    versao_compatibilizacao text,
    atualizado_em timestamp with time zone,
    classificacao_bip text,
    classificacao_bip_em timestamp with time zone,
    classificacao_lip text,
    classificacao_lip_em timestamp with time zone
);
ALTER TABLE public.mac_checklist_itens ADD CONSTRAINT mac_checklist_itens_modelo_id_fkey FOREIGN KEY (modelo_id) REFERENCES mac_checklist_modelos(id) ON DELETE CASCADE;
ALTER TABLE public.mac_checklist_itens ADD CONSTRAINT mac_checklist_itens_pkey PRIMARY KEY (id);
COMMENT ON COLUMN public.mac_checklist_itens.origem IS "Proveniência do texto atual desta compatibilização: DOCUMENTO_OFICIAL | PLANILHA | BANCO_LEGADO.";
COMMENT ON COLUMN public.mac_checklist_itens.nota_analista IS "Orientação interna (ex.: \"OBS. AO ANALISTA\"). NUNCA aparece no despacho ao interessado.";
COMMENT ON COLUMN public.mac_checklist_itens.condicao_aplicabilidade IS "Condição textual do item (\"se for o caso\", \"quando necessário\"...), preservada — nunca vira exigência universal.";
COMMENT ON COLUMN public.mac_checklist_itens.classificacao_bip IS "Resultado da análise MAC×BIP: VINCULADO_BIP | SEM_FUNDAMENTO_BIP | REVISAO_MANUAL. NULL = não analisado.";
COMMENT ON COLUMN public.mac_checklist_itens.classificacao_lip IS "Resultado da análise MAC×LIP: AUTOMATIZAVEL | PARCIALMENTE_AUTOMATIZAVEL |\n   MANUAL_COM_EVIDENCIA_LIP | MANUAL_SEM_DADO_LIP | REVISAO_MANUAL. NULL = não analisado.\n   Reflete o que o LIP entrega HOJE — um vínculo para campo ainda não implementado\n   (PENDENTE_VISAO/BLOQUEADO) não conta como evidência viva.";

-- ======================================================================
-- mac_checklist_modelos
-- ======================================================================
CREATE TABLE public.mac_checklist_modelos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    tipo_processo text,
    dono_id uuid,
    criado_por uuid,
    criado_em timestamp with time zone DEFAULT now(),
    assunto_id uuid
);
ALTER TABLE public.mac_checklist_modelos ADD CONSTRAINT mac_checklist_modelos_assunto_id_fkey FOREIGN KEY (assunto_id) REFERENCES assuntos(id);
ALTER TABLE public.mac_checklist_modelos ADD CONSTRAINT mac_checklist_modelos_pkey PRIMARY KEY (id);

-- ======================================================================
-- mac_execucoes
-- ======================================================================
CREATE TABLE public.mac_execucoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid NOT NULL,
    versao_lip text NOT NULL,
    versao_mac text NOT NULL,
    versao_bip text NOT NULL,
    status text DEFAULT 'EM_EXECUCAO'::text NOT NULL,
    iniciado_em timestamp with time zone DEFAULT now() NOT NULL,
    concluido_em timestamp with time zone,
    duracao_ms integer,
    criado_por uuid,
    metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL
);
ALTER TABLE public.mac_execucoes ADD CONSTRAINT mac_execucoes_status_check CHECK ((status = ANY (ARRAY['EM_EXECUCAO'::text, 'CONCLUIDA'::text, 'ERRO'::text, 'CANCELADA'::text])));
ALTER TABLE public.mac_execucoes ADD CONSTRAINT mac_execucoes_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE public.mac_execucoes ADD CONSTRAINT mac_execucoes_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.mac_execucoes ADD CONSTRAINT mac_execucoes_pkey PRIMARY KEY (id);
COMMENT ON COLUMN public.mac_execucoes.versao_lip IS "Identificador reproduzível (hash ou versão) da matriz LIP usada nesta execução.";
COMMENT ON COLUMN public.mac_execucoes.versao_mac IS "Identificador reproduzível (hash ou versão) da matriz MAC (ITENS_MAC_SLOT5) usada nesta execução.";
COMMENT ON COLUMN public.mac_execucoes.versao_bip IS "Identificador reproduzível (hash ou versão) do conjunto de vínculos BIP usado nesta execução.";

-- ======================================================================
-- mac_glossario
-- ======================================================================
CREATE TABLE public.mac_glossario (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    termo text NOT NULL,
    definicao text NOT NULL,
    origem text DEFAULT 'DOCUMENTO_OFICIAL'::text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.mac_glossario ADD CONSTRAINT mac_glossario_pkey PRIMARY KEY (id);
ALTER TABLE public.mac_glossario ADD CONSTRAINT mac_glossario_termo_key UNIQUE (termo);

-- ======================================================================
-- mac_historico
-- ======================================================================
CREATE TABLE public.mac_historico (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    criado_em timestamp with time zone DEFAULT now(),
    processo_codigo text,
    tipo_processo text,
    area_total numeric,
    analista_id uuid,
    analista_nome text,
    analista_gerencia text,
    proprietario text,
    autor_levantamento text,
    autor_projeto text,
    analise_id uuid,
    checklist_item_id uuid,
    aba text,
    item_texto text,
    referencia_legal text,
    status_anterior text,
    status_novo text
);
ALTER TABLE public.mac_historico ADD CONSTRAINT mac_historico_pkey PRIMARY KEY (id);

-- ======================================================================
-- mac_lip_vinculos
-- ======================================================================
CREATE TABLE public.mac_lip_vinculos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mac_item_id uuid NOT NULL,
    lip_chave text NOT NULL,
    papel text NOT NULL,
    obrigatorio boolean DEFAULT false NOT NULL,
    confianca text NOT NULL,
    justificativa text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.mac_lip_vinculos ADD CONSTRAINT mac_lip_vinculos_confianca_check CHECK ((confianca = ANY (ARRAY['ALTA'::text, 'MEDIA'::text, 'BAIXA'::text])));
ALTER TABLE public.mac_lip_vinculos ADD CONSTRAINT mac_lip_vinculos_papel_check CHECK ((papel = ANY (ARRAY['ENTRADA_REGRA'::text, 'CONDICAO_APLICABILIDADE'::text, 'EVIDENCIA'::text, 'PARAMETRO_CALCULO'::text, 'CONTEXTO'::text, 'RESULTADO_ESPERADO'::text])));
ALTER TABLE public.mac_lip_vinculos ADD CONSTRAINT mac_lip_vinculos_mac_item_id_fkey FOREIGN KEY (mac_item_id) REFERENCES mac_checklist_itens(id) ON DELETE CASCADE;
ALTER TABLE public.mac_lip_vinculos ADD CONSTRAINT mac_lip_vinculos_pkey PRIMARY KEY (id);
ALTER TABLE public.mac_lip_vinculos ADD CONSTRAINT mac_lip_vinculos_mac_item_id_lip_chave_key UNIQUE (mac_item_id, lip_chave);

-- ======================================================================
-- mac_resultados_item
-- ======================================================================
CREATE TABLE public.mac_resultados_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    execucao_id uuid NOT NULL,
    mac_item_id uuid NOT NULL,
    aplicabilidade text NOT NULL,
    resultado text NOT NULL,
    confianca text,
    justificativa text NOT NULL,
    evidencias_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    campos_lip_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    vinculos_bip_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    regra_id text NOT NULL,
    regra_versao integer DEFAULT 1 NOT NULL,
    requer_revisao boolean DEFAULT false NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.mac_resultados_item ADD CONSTRAINT mac_resultados_item_aplicabilidade_check CHECK ((aplicabilidade = ANY (ARRAY['APLICAVEL'::text, 'NAO_APLICAVEL'::text, 'INDETERMINADO'::text, 'ERRO_DADOS'::text])));
ALTER TABLE public.mac_resultados_item ADD CONSTRAINT mac_resultados_item_confianca_check CHECK ((confianca = ANY (ARRAY['ALTA'::text, 'MEDIA'::text, 'BAIXA'::text])));
ALTER TABLE public.mac_resultados_item ADD CONSTRAINT mac_resultados_item_resultado_check CHECK ((resultado = ANY (ARRAY['CONFORME'::text, 'NAO_CONFORME'::text, 'PENDENTE'::text, 'NAO_AVALIADO'::text, 'REVISAO_MANUAL'::text])));
ALTER TABLE public.mac_resultados_item ADD CONSTRAINT mac_resultados_item_execucao_id_fkey FOREIGN KEY (execucao_id) REFERENCES mac_execucoes(id) ON DELETE CASCADE;
ALTER TABLE public.mac_resultados_item ADD CONSTRAINT mac_resultados_item_mac_item_id_fkey FOREIGN KEY (mac_item_id) REFERENCES mac_checklist_itens(id) ON DELETE CASCADE;
ALTER TABLE public.mac_resultados_item ADD CONSTRAINT mac_resultados_item_pkey PRIMARY KEY (id);
ALTER TABLE public.mac_resultados_item ADD CONSTRAINT mac_resultados_item_execucao_id_mac_item_id_key UNIQUE (execucao_id, mac_item_id);
COMMENT ON COLUMN public.mac_resultados_item.campos_lip_json IS "Snapshot dos valores do LIP efetivamente lidos por esta regra, para reproduzir o\n   resultado mesmo que o LIP mude depois.";
COMMENT ON COLUMN public.mac_resultados_item.regra_id IS "Identificador da regra declarativa que produziu este resultado (núcleo versionado\n   fora da tela — FASE 4, ainda não implementada nesta migration).";

-- ======================================================================
-- mac_resultados_revisoes
-- ======================================================================
CREATE TABLE public.mac_resultados_revisoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    resultado_item_id uuid NOT NULL,
    usuario_id uuid NOT NULL,
    resultado_anterior text NOT NULL,
    resultado_novo text NOT NULL,
    justificativa text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.mac_resultados_revisoes ADD CONSTRAINT mac_resultados_revisoes_resultado_anterior_check CHECK ((resultado_anterior = ANY (ARRAY['CONFORME'::text, 'NAO_CONFORME'::text, 'PENDENTE'::text, 'NAO_AVALIADO'::text, 'REVISAO_MANUAL'::text])));
ALTER TABLE public.mac_resultados_revisoes ADD CONSTRAINT mac_resultados_revisoes_resultado_novo_check CHECK ((resultado_novo = ANY (ARRAY['CONFORME'::text, 'NAO_CONFORME'::text, 'PENDENTE'::text, 'NAO_AVALIADO'::text, 'REVISAO_MANUAL'::text])));
ALTER TABLE public.mac_resultados_revisoes ADD CONSTRAINT mac_resultados_revisoes_resultado_item_id_fkey FOREIGN KEY (resultado_item_id) REFERENCES mac_resultados_item(id) ON DELETE CASCADE;
ALTER TABLE public.mac_resultados_revisoes ADD CONSTRAINT mac_resultados_revisoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE public.mac_resultados_revisoes ADD CONSTRAINT mac_resultados_revisoes_pkey PRIMARY KEY (id);

-- ======================================================================
-- mac_slot5_filtros
-- ======================================================================
CREATE TABLE public.mac_slot5_filtros (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    descricao text,
    ordem integer DEFAULT 100 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    tipo_condicao text DEFAULT 'MANUAL'::text NOT NULL,
    campos_lip text[] DEFAULT '{}'::text[] NOT NULL,
    valor_esperado text,
    termos text[] DEFAULT '{}'::text[] NOT NULL,
    papeis_documento text[] DEFAULT '{}'::text[] NOT NULL,
    grupos text[] DEFAULT '{}'::text[] NOT NULL,
    itens_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    termos_item text[] DEFAULT '{}'::text[] NOT NULL,
    status_alvo text DEFAULT 'nao_aplica'::text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_por uuid,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.mac_slot5_filtros ADD CONSTRAINT mac_slot5_filtros_status_alvo_check CHECK ((status_alvo = ANY (ARRAY['conforme'::text, 'nao_conforme'::text, 'nao_aplica'::text])));
ALTER TABLE public.mac_slot5_filtros ADD CONSTRAINT mac_slot5_filtros_tipo_condicao_check CHECK ((tipo_condicao = ANY (ARRAY['CAMPO_LIP_AUSENTE'::text, 'CAMPO_LIP_IGUAL'::text, 'PALAVRA_AUSENTE'::text, 'MANUAL'::text])));
ALTER TABLE public.mac_slot5_filtros ADD CONSTRAINT mac_slot5_filtros_pkey PRIMARY KEY (id);

-- ======================================================================
-- mdp_registros
-- ======================================================================
CREATE TABLE public.mdp_registros (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_codigo text NOT NULL,
    assunto_id uuid,
    tipo text NOT NULL,
    numero text,
    destinatario text,
    data_despacho text,
    conteudo jsonb DEFAULT '{}'::jsonb NOT NULL,
    usuario_id uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    interessado text,
    busca_norm text
);
ALTER TABLE public.mdp_registros ADD CONSTRAINT mdp_registros_tipo_check CHECK ((tipo = ANY (ARRAY['interno'::text, 'despacho'::text, 'indeferimento'::text, 'arquivamento'::text])));
ALTER TABLE public.mdp_registros ADD CONSTRAINT mdp_registros_assunto_id_fkey FOREIGN KEY (assunto_id) REFERENCES assuntos(id) ON DELETE SET NULL;
ALTER TABLE public.mdp_registros ADD CONSTRAINT mdp_registros_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE public.mdp_registros ADD CONSTRAINT mdp_registros_pkey PRIMARY KEY (id);
COMMENT ON COLUMN public.mdp_registros.interessado IS "Nome do interessado na emissao. Desnormalizado: reflete quem constava NA EPOCA.";
COMMENT ON COLUMN public.mdp_registros.busca_norm IS "interessado + processo_codigo em minusculas e sem acentos. Preenchido pela aplicacao.";

-- ======================================================================
-- mhd_conteudos
-- ======================================================================
CREATE TABLE public.mhd_conteudos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hash text NOT NULL,
    bytes bigint,
    paginas integer,
    texto text,
    linhas jsonb,
    dados jsonb,
    papeis text[],
    revisao text,
    data_documento text,
    data_elaboracao text,
    data_revisao text,
    data_assinatura text,
    data_registro text,
    origem text DEFAULT 'texto'::text NOT NULL,
    modelo text,
    paginas_ia integer DEFAULT 0 NOT NULL,
    extrator_versao text DEFAULT 'v1'::text NOT NULL,
    status text DEFAULT 'ok'::text NOT NULL,
    erro text,
    extraido_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.mhd_conteudos ADD CONSTRAINT mhd_conteudos_pkey PRIMARY KEY (id);
ALTER TABLE public.mhd_conteudos ADD CONSTRAINT mhd_conteudos_hash_key UNIQUE (hash);

-- ======================================================================
-- mhd_documentos
-- ======================================================================
CREATE TABLE public.mhd_documentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_codigo text NOT NULL,
    assunto_id uuid,
    papel text NOT NULL,
    rotulo text,
    status text DEFAULT 'ativo'::text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    escopo text DEFAULT ''::text NOT NULL
);
ALTER TABLE public.mhd_documentos ADD CONSTRAINT mhd_documentos_assunto_id_fkey FOREIGN KEY (assunto_id) REFERENCES assuntos(id);
ALTER TABLE public.mhd_documentos ADD CONSTRAINT mhd_documentos_pkey PRIMARY KEY (id);
ALTER TABLE public.mhd_documentos ADD CONSTRAINT mhd_documentos_identidade UNIQUE (processo_codigo, papel, escopo);

-- ======================================================================
-- mhd_eventos
-- ======================================================================
CREATE TABLE public.mhd_eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_codigo text NOT NULL,
    assunto_id uuid,
    documento_id uuid,
    versao_id uuid,
    tipo text NOT NULL,
    titulo text NOT NULL,
    detalhe jsonb,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    usuario_id uuid
);
ALTER TABLE public.mhd_eventos ADD CONSTRAINT mhd_eventos_assunto_id_fkey FOREIGN KEY (assunto_id) REFERENCES assuntos(id);
ALTER TABLE public.mhd_eventos ADD CONSTRAINT mhd_eventos_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES mhd_documentos(id) ON DELETE SET NULL;
ALTER TABLE public.mhd_eventos ADD CONSTRAINT mhd_eventos_versao_id_fkey FOREIGN KEY (versao_id) REFERENCES mhd_versoes(id) ON DELETE SET NULL;
ALTER TABLE public.mhd_eventos ADD CONSTRAINT mhd_eventos_pkey PRIMARY KEY (id);

-- ======================================================================
-- mhd_interpretacoes_visao
-- ======================================================================
CREATE TABLE public.mhd_interpretacoes_visao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hash_documento text NOT NULL,
    pagina integer NOT NULL,
    regiao jsonb NOT NULL,
    regiao_hash text NOT NULL,
    receita_versao integer NOT NULL,
    receita_hash text NOT NULL,
    modelo text NOT NULL,
    abstencao boolean DEFAULT false NOT NULL,
    valores jsonb,
    confianca numeric,
    bruto text,
    custo_ia numeric,
    ms_recorte integer,
    ms_modelo integer,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.mhd_interpretacoes_visao ADD CONSTRAINT mhd_interpretacoes_visao_pkey PRIMARY KEY (id);
ALTER TABLE public.mhd_interpretacoes_visao ADD CONSTRAINT mhd_interpretacoes_visao_hash_documento_pagina_regiao_hash__key UNIQUE (hash_documento, pagina, regiao_hash, receita_hash, modelo);
COMMENT ON COLUMN public.mhd_interpretacoes_visao.abstencao IS "true = o modelo declarou que não consegue ler a região. Vira FONTE_ILEGIVEL no campo, jamais um valor inventado.";

-- ======================================================================
-- mhd_resultados_campo
-- ======================================================================
CREATE TABLE public.mhd_resultados_campo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_codigo text NOT NULL,
    modulo text DEFAULT 'LIP'::text NOT NULL,
    slot text DEFAULT 'slot_05'::text NOT NULL,
    chave text NOT NULL,
    resultado text NOT NULL,
    valor text,
    fonte text,
    tentativa jsonb,
    evidencia text,
    versao integer NOT NULL,
    hash text NOT NULL,
    valor_manual text,
    autor_manual_id uuid,
    complementado_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    execucao_id uuid DEFAULT gen_random_uuid() NOT NULL,
    vigente boolean DEFAULT true NOT NULL,
    custo_ia numeric,
    confianca numeric,
    interpretacao_id uuid
);
ALTER TABLE public.mhd_resultados_campo ADD CONSTRAINT mhd_resultados_campo_pkey PRIMARY KEY (id);
COMMENT ON COLUMN public.mhd_resultados_campo.valor_manual IS "Valor final ajustado pelo analista, quando complementa o campo. O valor automático em `valor` continua intacto ao lado.";
COMMENT ON COLUMN public.mhd_resultados_campo.execucao_id IS "Identifica a rodada de leitura/aceite. Uma execução produz até 136 linhas com o mesmo valor aqui.";
COMMENT ON COLUMN public.mhd_resultados_campo.vigente IS "true = é o resultado corrente deste campo. As execuções anteriores ficam com false e NUNCA são apagadas.";
COMMENT ON COLUMN public.mhd_resultados_campo.interpretacao_id IS "Quando o resultado veio de visão, aponta para a interpretação reaproveitável em mhd_interpretacoes_visao.";

-- ======================================================================
-- mhd_versoes
-- ======================================================================
CREATE TABLE public.mhd_versoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    documento_id uuid NOT NULL,
    versao integer NOT NULL,
    vigente boolean DEFAULT true NOT NULL,
    hash text NOT NULL,
    nome_arquivo text NOT NULL,
    rodada integer DEFAULT 1 NOT NULL,
    lido_em timestamp with time zone DEFAULT now() NOT NULL,
    usuario_id uuid,
    conteudo_id uuid
);
ALTER TABLE public.mhd_versoes ADD CONSTRAINT mhd_versoes_conteudo_id_fkey FOREIGN KEY (conteudo_id) REFERENCES mhd_conteudos(id);
ALTER TABLE public.mhd_versoes ADD CONSTRAINT mhd_versoes_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES mhd_documentos(id) ON DELETE CASCADE;
ALTER TABLE public.mhd_versoes ADD CONSTRAINT mhd_versoes_pkey PRIMARY KEY (id);
ALTER TABLE public.mhd_versoes ADD CONSTRAINT mhd_versoes_documento_id_versao_key UNIQUE (documento_id, versao);

-- ======================================================================
-- mrp_calendario
-- ======================================================================
CREATE TABLE public.mrp_calendario (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    mes integer NOT NULL,
    ano integer NOT NULL,
    dias_uteis integer DEFAULT 22 NOT NULL,
    ferias integer DEFAULT 0 NOT NULL,
    atestado integer DEFAULT 0 NOT NULL,
    feriados integer DEFAULT 0 NOT NULL,
    facultativo integer DEFAULT 0 NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.mrp_calendario ADD CONSTRAINT mrp_calendario_ano_check CHECK (((ano >= 2024) AND (ano <= 2100)));
ALTER TABLE public.mrp_calendario ADD CONSTRAINT mrp_calendario_atestado_check CHECK ((atestado >= 0));
ALTER TABLE public.mrp_calendario ADD CONSTRAINT mrp_calendario_dias_uteis_check CHECK ((dias_uteis >= 0));
ALTER TABLE public.mrp_calendario ADD CONSTRAINT mrp_calendario_facultativo_check CHECK ((facultativo >= 0));
ALTER TABLE public.mrp_calendario ADD CONSTRAINT mrp_calendario_feriados_check CHECK ((feriados >= 0));
ALTER TABLE public.mrp_calendario ADD CONSTRAINT mrp_calendario_ferias_check CHECK ((ferias >= 0));
ALTER TABLE public.mrp_calendario ADD CONSTRAINT mrp_calendario_mes_check CHECK (((mes >= 1) AND (mes <= 12)));
ALTER TABLE public.mrp_calendario ADD CONSTRAINT mrp_calendario_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE public.mrp_calendario ADD CONSTRAINT mrp_calendario_pkey PRIMARY KEY (id);
ALTER TABLE public.mrp_calendario ADD CONSTRAINT mrp_calendario_usuario_id_mes_ano_key UNIQUE (usuario_id, mes, ano);

-- ======================================================================
-- mrp_calendario_backup
-- ======================================================================
CREATE TABLE public.mrp_calendario_backup (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    mes integer NOT NULL,
    ano integer NOT NULL,
    dias_uteis integer DEFAULT 22 NOT NULL,
    ferias integer DEFAULT 0 NOT NULL,
    atestado integer DEFAULT 0 NOT NULL,
    feriados integer DEFAULT 0 NOT NULL,
    facultativo integer DEFAULT 0 NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now(),
    backup_em timestamp with time zone DEFAULT now(),
    backup_motivo text DEFAULT 'delete'::text
);
ALTER TABLE public.mrp_calendario_backup ADD CONSTRAINT mrp_calendario_ano_check CHECK (((ano >= 2024) AND (ano <= 2100)));
ALTER TABLE public.mrp_calendario_backup ADD CONSTRAINT mrp_calendario_atestado_check CHECK ((atestado >= 0));
ALTER TABLE public.mrp_calendario_backup ADD CONSTRAINT mrp_calendario_dias_uteis_check CHECK ((dias_uteis >= 0));
ALTER TABLE public.mrp_calendario_backup ADD CONSTRAINT mrp_calendario_facultativo_check CHECK ((facultativo >= 0));
ALTER TABLE public.mrp_calendario_backup ADD CONSTRAINT mrp_calendario_feriados_check CHECK ((feriados >= 0));
ALTER TABLE public.mrp_calendario_backup ADD CONSTRAINT mrp_calendario_ferias_check CHECK ((ferias >= 0));
ALTER TABLE public.mrp_calendario_backup ADD CONSTRAINT mrp_calendario_mes_check CHECK (((mes >= 1) AND (mes <= 12)));
ALTER TABLE public.mrp_calendario_backup ADD CONSTRAINT mrp_calendario_backup_pkey PRIMARY KEY (id);
ALTER TABLE public.mrp_calendario_backup ADD CONSTRAINT mrp_calendario_backup_usuario_id_mes_ano_key UNIQUE (usuario_id, mes, ano);

-- ======================================================================
-- mrp_meta_historico
-- ======================================================================
CREATE TABLE public.mrp_meta_historico (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meta numeric,
    vigente_desde date NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_por uuid,
    usuario_id uuid,
    isento boolean DEFAULT false NOT NULL
);
ALTER TABLE public.mrp_meta_historico ADD CONSTRAINT mrp_meta_historico_meta_check CHECK ((meta > (0)::numeric));
ALTER TABLE public.mrp_meta_historico ADD CONSTRAINT mrp_meta_historico_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE public.mrp_meta_historico ADD CONSTRAINT mrp_meta_historico_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE public.mrp_meta_historico ADD CONSTRAINT mrp_meta_historico_pkey PRIMARY KEY (id);

-- ======================================================================
-- mrp_pontuacao
-- ======================================================================
CREATE TABLE public.mrp_pontuacao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo_despacho text,
    area_min numeric,
    area_max numeric,
    pontos numeric NOT NULL,
    descricao text,
    ordem integer
);
ALTER TABLE public.mrp_pontuacao ADD CONSTRAINT mrp_pontuacao_pkey PRIMARY KEY (id);

-- ======================================================================
-- mrp_pontuacao_backup
-- ======================================================================
CREATE TABLE public.mrp_pontuacao_backup (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo_despacho text,
    area_min numeric,
    area_max numeric,
    pontos numeric NOT NULL,
    descricao text,
    ordem integer,
    backup_em timestamp with time zone DEFAULT now(),
    backup_motivo text DEFAULT 'delete'::text
);
ALTER TABLE public.mrp_pontuacao_backup ADD CONSTRAINT mrp_pontuacao_backup_pkey PRIMARY KEY (id);

-- ======================================================================
-- mrp_registros
-- ======================================================================
CREATE TABLE public.mrp_registros (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    processo_codigo text NOT NULL,
    tipo_processo text NOT NULL,
    interessado text,
    assunto text,
    porte text DEFAULT 'MP'::text NOT NULL,
    area_construida numeric(12,2) DEFAULT 0.00 NOT NULL,
    bairro text,
    setor text,
    tipo_despacho text NOT NULL,
    numero_despacho text,
    numero_analise integer,
    numero_revisao integer,
    revisao boolean DEFAULT (COALESCE(numero_revisao, 1) > 1),
    data_inicio timestamp with time zone,
    data_despacho timestamp with time zone DEFAULT now() NOT NULL,
    pontos numeric(4,1) NOT NULL,
    observacoes text,
    mes integer NOT NULL,
    ano integer NOT NULL,
    auto_gerado boolean DEFAULT false NOT NULL,
    criado_em timestamp with time zone DEFAULT now(),
    numero_sei text,
    numero_fisico text,
    assunto_id uuid,
    gerencia text
);
ALTER TABLE public.mrp_registros ADD CONSTRAINT mrp_registros_assunto_id_fkey FOREIGN KEY (assunto_id) REFERENCES assuntos(id);
ALTER TABLE public.mrp_registros ADD CONSTRAINT mrp_registros_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT;
ALTER TABLE public.mrp_registros ADD CONSTRAINT mrp_registros_pkey PRIMARY KEY (id);
ALTER TABLE public.mrp_registros ADD CONSTRAINT mrp_registros_usuario_despacho_unique UNIQUE (usuario_id, numero_despacho);
COMMENT ON COLUMN public.mrp_registros.assunto IS "Assunto da OBRA extraido do LIP. NAO e o nome do slot — para isso use assunto_id.";
COMMENT ON COLUMN public.mrp_registros.porte IS "Porte da EDIFICACAO: PP (<=540 m2), MP (<=2000 m2), GP (>2000 m2).";
COMMENT ON COLUMN public.mrp_registros.assunto_id IS "Slot (assuntos.id) que originou o despacho. Renomear o slot NAO altera o historico.";
COMMENT ON COLUMN public.mrp_registros.gerencia IS "Gerencia do analista NA DATA DA EMISSAO, copiada de usuarios.gerencia. Congelada.";

-- ======================================================================
-- mrp_registros_backup
-- ======================================================================
CREATE TABLE public.mrp_registros_backup (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    processo_codigo text NOT NULL,
    tipo_processo text NOT NULL,
    interessado text,
    assunto text,
    porte text DEFAULT 'MP'::text NOT NULL,
    area_construida numeric(12,2) DEFAULT 0.00 NOT NULL,
    bairro text,
    setor text,
    tipo_despacho text NOT NULL,
    numero_despacho text,
    numero_analise integer,
    numero_revisao integer,
    data_inicio timestamp with time zone,
    data_despacho timestamp with time zone DEFAULT now() NOT NULL,
    pontos numeric(4,1) NOT NULL,
    observacoes text,
    mes integer NOT NULL,
    ano integer NOT NULL,
    auto_gerado boolean DEFAULT false NOT NULL,
    criado_em timestamp with time zone DEFAULT now(),
    numero_sei text,
    numero_fisico text,
    backup_em timestamp with time zone DEFAULT now(),
    backup_motivo text DEFAULT 'delete'::text,
    revisao boolean
);
ALTER TABLE public.mrp_registros_backup ADD CONSTRAINT mrp_registros_backup_pkey PRIMARY KEY (id);

-- ======================================================================
-- notificacoes
-- ======================================================================
CREATE TABLE public.notificacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid,
    decisao_id uuid,
    para_papel text NOT NULL,
    assunto text NOT NULL,
    mensagem text NOT NULL,
    lida_em timestamp with time zone,
    criada_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.notificacoes ADD CONSTRAINT notificacoes_decisao_id_fkey FOREIGN KEY (decisao_id) REFERENCES decisoes(id) ON DELETE CASCADE;
ALTER TABLE public.notificacoes ADD CONSTRAINT notificacoes_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.notificacoes ADD CONSTRAINT notificacoes_pkey PRIMARY KEY (id);

-- ======================================================================
-- obs_cod
-- ======================================================================
CREATE TABLE public.obs_cod (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    titulo text NOT NULL,
    texto text DEFAULT ''::text NOT NULL,
    categoria text DEFAULT 'pendencia'::text NOT NULL,
    situacao text DEFAULT 'aberto'::text NOT NULL,
    onde text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_por uuid,
    atualizado_em timestamp with time zone,
    resolvido_em timestamp with time zone,
    resolvido_por uuid
);
ALTER TABLE public.obs_cod ADD CONSTRAINT obs_cod_pkey PRIMARY KEY (id);

-- ======================================================================
-- papeis_ativos
-- ======================================================================
CREATE TABLE public.papeis_ativos (
    papel text NOT NULL,
    matricula_atual text NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.papeis_ativos ADD CONSTRAINT papeis_ativos_pkey PRIMARY KEY (papel);

-- ======================================================================
-- porte_config
-- ======================================================================
CREATE TABLE public.porte_config (
    id boolean DEFAULT true NOT NULL,
    pp_max_unidades integer DEFAULT 4 NOT NULL,
    mp_max_area_m2 numeric DEFAULT 4999 NOT NULL,
    gp_min_area_m2 numeric DEFAULT 5000 NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_por text
);
ALTER TABLE public.porte_config ADD CONSTRAINT porte_config_pkey PRIMARY KEY (id);

-- ======================================================================
-- processo_checklist_itens
-- ======================================================================
CREATE TABLE public.processo_checklist_itens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid NOT NULL,
    checklist_modelo_id uuid NOT NULL,
    checklist_modelo_item_id uuid NOT NULL,
    tema text NOT NULL,
    base_normativa text,
    item_texto text NOT NULL,
    pendencia_texto_padrao text NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.processo_checklist_itens ADD CONSTRAINT processo_checklist_itens_checklist_modelo_id_fkey FOREIGN KEY (checklist_modelo_id) REFERENCES checklist_modelos(id) ON DELETE RESTRICT;
ALTER TABLE public.processo_checklist_itens ADD CONSTRAINT processo_checklist_itens_checklist_modelo_item_id_fkey FOREIGN KEY (checklist_modelo_item_id) REFERENCES checklist_modelo_itens(id) ON DELETE RESTRICT;
ALTER TABLE public.processo_checklist_itens ADD CONSTRAINT processo_checklist_itens_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.processo_checklist_itens ADD CONSTRAINT processo_checklist_itens_pkey PRIMARY KEY (id);

-- ======================================================================
-- processo_documento_ingestao
-- ======================================================================
CREATE TABLE public.processo_documento_ingestao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid NOT NULL,
    sei_doc_id text,
    sei_numero text,
    nome_arquivo text,
    tipo_documento text NOT NULL,
    fonte text DEFAULT 'SEI'::text NOT NULL,
    status_doc text DEFAULT 'ATIVO'::text NOT NULL,
    data_documento timestamp with time zone,
    coletado_em timestamp with time zone DEFAULT now() NOT NULL,
    hash_conteudo text,
    extraido_json jsonb,
    sei_doc_evidencia text
);
ALTER TABLE public.processo_documento_ingestao ADD CONSTRAINT processo_documento_ingestao_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.processo_documento_ingestao ADD CONSTRAINT processo_documento_ingestao_pkey PRIMARY KEY (id);
ALTER TABLE public.processo_documento_ingestao ADD CONSTRAINT processo_documento_ingestao_processo_id_tipo_documento_hash_key UNIQUE (processo_id, tipo_documento, hash_conteudo);

-- ======================================================================
-- processo_etapas
-- ======================================================================
CREATE TABLE public.processo_etapas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid NOT NULL,
    tipo_etapa tipo_etapa_enum NOT NULL,
    numero smallint DEFAULT 1 NOT NULL,
    status text DEFAULT 'RASCUNHO'::text NOT NULL,
    criada_por uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    assinado_em timestamp with time zone,
    finalizado boolean DEFAULT false NOT NULL
);
ALTER TABLE public.processo_etapas ADD CONSTRAINT processo_etapas_criada_por_fkey FOREIGN KEY (criada_por) REFERENCES equipe(id);
ALTER TABLE public.processo_etapas ADD CONSTRAINT processo_etapas_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.processo_etapas ADD CONSTRAINT processo_etapas_pkey PRIMARY KEY (id);
ALTER TABLE public.processo_etapas ADD CONSTRAINT uq_etapa_numero UNIQUE (processo_id, tipo_etapa, numero);

-- ======================================================================
-- processo_eventos
-- ======================================================================
CREATE TABLE public.processo_eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid NOT NULL,
    equipe_id uuid,
    evento text NOT NULL,
    detalhe text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    matricula text
);
ALTER TABLE public.processo_eventos ADD CONSTRAINT processo_eventos_equipe_id_fkey FOREIGN KEY (equipe_id) REFERENCES equipe(id);
ALTER TABLE public.processo_eventos ADD CONSTRAINT processo_eventos_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.processo_eventos ADD CONSTRAINT processo_eventos_pkey PRIMARY KEY (id);

-- ======================================================================
-- processo_fila_overrides
-- ======================================================================
CREATE TABLE public.processo_fila_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid NOT NULL,
    analista_id uuid NOT NULL,
    posicao integer NOT NULL,
    motivo text,
    expira_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now(),
    criado_por_auth_uid uuid DEFAULT auth.uid()
);
ALTER TABLE public.processo_fila_overrides ADD CONSTRAINT processo_fila_overrides_pkey PRIMARY KEY (id);

-- ======================================================================
-- processo_historico
-- ======================================================================
CREATE TABLE public.processo_historico (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid NOT NULL,
    usuario_id uuid,
    acao text NOT NULL,
    detalhe jsonb,
    criado_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.processo_historico ADD CONSTRAINT processo_historico_pkey PRIMARY KEY (id);

-- ======================================================================
-- processo_prazo_interessado
-- ======================================================================
CREATE TABLE public.processo_prazo_interessado (
    processo_id uuid NOT NULL,
    data_envio_ao_interessado timestamp with time zone,
    data_retorno_do_interessado timestamp with time zone,
    dias_corridos_sem_retorno integer DEFAULT 0 NOT NULL,
    bloqueado boolean DEFAULT false NOT NULL,
    bloqueado_em timestamp with time zone,
    desbloqueado_em timestamp with time zone,
    desbloqueado_motivo text,
    desbloqueado_por_auth_uid uuid,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_por_auth_uid uuid
);
ALTER TABLE public.processo_prazo_interessado ADD CONSTRAINT processo_prazo_interessado_pkey PRIMARY KEY (processo_id);

-- ======================================================================
-- processo_profissionais
-- ======================================================================
CREATE TABLE public.processo_profissionais (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid NOT NULL,
    profissional_id uuid NOT NULL,
    papel text NOT NULL,
    origem text DEFAULT 'backfill_jsonb'::text NOT NULL,
    confianca text DEFAULT 'media'::text NOT NULL,
    valor_original text,
    campo_original text,
    confirmado_por uuid,
    confirmado_em timestamp with time zone,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.processo_profissionais ADD CONSTRAINT processo_profissionais_confirmado_por_fkey FOREIGN KEY (confirmado_por) REFERENCES usuarios(id);
ALTER TABLE public.processo_profissionais ADD CONSTRAINT processo_profissionais_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.processo_profissionais ADD CONSTRAINT processo_profissionais_profissional_id_fkey FOREIGN KEY (profissional_id) REFERENCES profissionais(id);
ALTER TABLE public.processo_profissionais ADD CONSTRAINT processo_profissionais_pkey PRIMARY KEY (id);
ALTER TABLE public.processo_profissionais ADD CONSTRAINT processo_profissionais_processo_id_profissional_id_papel_key UNIQUE (processo_id, profissional_id, papel);

-- ======================================================================
-- processo_tempo
-- ======================================================================
CREATE TABLE public.processo_tempo (
    processo_id uuid NOT NULL,
    em_execucao boolean DEFAULT false NOT NULL,
    inicio_at timestamp with time zone,
    total_segundos bigint DEFAULT 0 NOT NULL,
    ultimo_movimento timestamp with time zone DEFAULT now() NOT NULL,
    finalizado boolean DEFAULT false NOT NULL,
    finalizado_em timestamp with time zone
);
ALTER TABLE public.processo_tempo ADD CONSTRAINT processo_tempo_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.processo_tempo ADD CONSTRAINT processo_tempo_pkey PRIMARY KEY (processo_id);

-- ======================================================================
-- processos
-- ======================================================================
CREATE TABLE public.processos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    numero_sei text,
    numero_processo_fisico text,
    numero_os text,
    numero_projeto text,
    porte porte_enum,
    area_construida numeric,
    status status_processo_enum DEFAULT 'CADASTRADO'::status_processo_enum NOT NULL,
    criado_em timestamp without time zone DEFAULT now(),
    vinculado_analista_matricula text,
    analista_id uuid,
    tipo_processo text NOT NULL,
    gerencia text,
    diretoria text,
    edicao_autorizada boolean DEFAULT false NOT NULL,
    edicao_autorizada_por text,
    edicao_autorizada_motivo text,
    checklist_modelo_id uuid,
    atualizado_em timestamp with time zone DEFAULT now(),
    analise_iniciada_em timestamp with time zone,
    analise_concluida_em timestamp with time zone,
    iniciado_em timestamp with time zone,
    retorno_em timestamp with time zone,
    eh_retorno boolean DEFAULT false,
    carater text,
    tipologia_habitacional text,
    numero_unidades integer,
    tempo_total_analise interval,
    dados jsonb,
    codigo text,
    sei_cheadv text,
    area_aprovada text,
    sei_procuracao text,
    sei_embargo text,
    vistoria_area_comercial text,
    vistoria_mais_12m text,
    vistoria_ocupa_recuo text,
    vistoria_estrutura_concluida text,
    vistoria_alt_max_21m text,
    vistoria_ocupa_publica text,
    vistoria_area_aeroportuaria text,
    vistoria_area_militar text,
    vistoria_aguas_pluviais text,
    vistoria_esquadrias_divisa text,
    vistoria_calcadas text,
    vistoria_levante text,
    vistoria_unidade_territorial text,
    vistoria_multa_verticalizacao text,
    vistoria_multa_recuo text,
    vistoria_max_7_pav text,
    tags jsonb DEFAULT '[]'::jsonb,
    assunto_id uuid,
    data_protocolo date,
    data_protocolo_origem text,
    excluido_em timestamp with time zone,
    excluido_por uuid,
    excluido_motivo text,
    lip_incompleto boolean DEFAULT false NOT NULL,
    laudo_campos_ocultos text[] DEFAULT '{}'::text[] NOT NULL,
    mac_incompleto boolean DEFAULT false NOT NULL
);
ALTER TABLE public.processos ADD CONSTRAINT processos_area_construida_check CHECK ((area_construida > (0)::numeric));
ALTER TABLE public.processos ADD CONSTRAINT processos_analista_id_fkey FOREIGN KEY (analista_id) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE public.processos ADD CONSTRAINT processos_assunto_id_fkey FOREIGN KEY (assunto_id) REFERENCES assuntos(id);
ALTER TABLE public.processos ADD CONSTRAINT processos_checklist_modelo_fk FOREIGN KEY (checklist_modelo_id) REFERENCES checklist_modelos(id);
ALTER TABLE public.processos ADD CONSTRAINT processos_pkey PRIMARY KEY (id);
ALTER TABLE public.processos ADD CONSTRAINT processos_codigo_unique UNIQUE (codigo);
COMMENT ON COLUMN public.processos.analise_iniciada_em IS "Data/hora da criação do 1º ciclo de análise MAC do processo (gravado pela rota de criação da análise). NULL = ainda não iniciou ou processo anterior à implantação deste campo.";
COMMENT ON COLUMN public.processos.analise_concluida_em IS "Data/hora da conclusão definitiva do processo: laudo emitido, indeferimento ou arquivamento (gravado pela rota correspondente, apenas na 1ª ocorrência — não é sobrescrito em reemissão de documento).";
COMMENT ON COLUMN public.processos.data_protocolo IS "Data oficial de protocolo do processo (SEI ou físico). NULL até o analista preencher no LIP — nunca inferida automaticamente de criado_em.";
COMMENT ON COLUMN public.processos.data_protocolo_origem IS "Origem do valor de data_protocolo. Hoje só existe \"analista_lip\" (preenchimento manual). Reservado para futuras origens (ex: extração automática do SEI) que deverão vir com confiança mais baixa marcada explicitamente.";
COMMENT ON COLUMN public.processos.mac_incompleto IS "MAC marcado como não concluído pelo analista (espelha lip_incompleto, que é do LIP).";

-- ======================================================================
-- profissionais
-- ======================================================================
CREATE TABLE public.profissionais (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome_original text NOT NULL,
    nome_normalizado text NOT NULL,
    tipo_pessoa text DEFAULT 'fisica'::text NOT NULL,
    cau text,
    crea text,
    uf_conselho text,
    cpf_cnpj text,
    validado boolean DEFAULT false NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    merged_into_id uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.profissionais ADD CONSTRAINT profissionais_merged_into_id_fkey FOREIGN KEY (merged_into_id) REFERENCES profissionais(id);
ALTER TABLE public.profissionais ADD CONSTRAINT profissionais_pkey PRIMARY KEY (id);
COMMENT ON COLUMN public.profissionais.merged_into_id IS "Se preenchido, este registro foi unificado a outro (soft merge). Nunca excluir a linha; para desfazer, zerar este campo.";

-- ======================================================================
-- profissionais_backfill_execucoes
-- ======================================================================
CREATE TABLE public.profissionais_backfill_execucoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    iniciado_em timestamp with time zone DEFAULT now() NOT NULL,
    concluido_em timestamp with time zone,
    modo text NOT NULL,
    processos_lidos integer,
    profissionais_criados integer,
    vinculos_criados integer,
    ignorados_sentinela integer,
    detalhe jsonb
);
ALTER TABLE public.profissionais_backfill_execucoes ADD CONSTRAINT profissionais_backfill_execucoes_pkey PRIMARY KEY (id);

-- ======================================================================
-- rh_log
-- ======================================================================
CREATE TABLE public.rh_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_afetado text,
    acao text,
    dados_anteriores jsonb,
    dados_novos jsonb,
    executado_por text,
    executado_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.rh_log ADD CONSTRAINT rh_log_pkey PRIMARY KEY (id);

-- ======================================================================
-- solicitacoes_despacho_extra
-- ======================================================================
CREATE TABLE public.solicitacoes_despacho_extra (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid NOT NULL,
    quantidade_extra smallint DEFAULT 1 NOT NULL,
    motivo text NOT NULL,
    status text DEFAULT 'PENDENTE'::text NOT NULL,
    solicitado_por_auth_uid uuid NOT NULL,
    aprovado_por_auth_uid uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    decidido_em timestamp with time zone,
    assunto_id uuid
);
ALTER TABLE public.solicitacoes_despacho_extra ADD CONSTRAINT solicitacoes_despacho_extra_quantidade_extra_check CHECK ((quantidade_extra >= 1));
ALTER TABLE public.solicitacoes_despacho_extra ADD CONSTRAINT solicitacoes_despacho_extra_status_check CHECK ((status = ANY (ARRAY['PENDENTE'::text, 'APROVADO'::text, 'NEGADO'::text])));
ALTER TABLE public.solicitacoes_despacho_extra ADD CONSTRAINT solicitacoes_despacho_extra_assunto_id_fkey FOREIGN KEY (assunto_id) REFERENCES assuntos(id);
ALTER TABLE public.solicitacoes_despacho_extra ADD CONSTRAINT solicitacoes_despacho_extra_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.solicitacoes_despacho_extra ADD CONSTRAINT solicitacoes_despacho_extra_pkey PRIMARY KEY (id);

-- ======================================================================
-- solicitacoes_etapa6
-- ======================================================================
CREATE TABLE public.solicitacoes_etapa6 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid NOT NULL,
    solicitado_por_equipe_id uuid NOT NULL,
    solicitado_em timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'PENDENTE'::text NOT NULL,
    analisado_por_equipe_id uuid,
    analisado_em timestamp with time zone,
    observacao text
);
ALTER TABLE public.solicitacoes_etapa6 ADD CONSTRAINT solicitacoes_etapa6_analisado_por_equipe_id_fkey FOREIGN KEY (analisado_por_equipe_id) REFERENCES equipe(id);
ALTER TABLE public.solicitacoes_etapa6 ADD CONSTRAINT solicitacoes_etapa6_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
ALTER TABLE public.solicitacoes_etapa6 ADD CONSTRAINT solicitacoes_etapa6_solicitado_por_equipe_id_fkey FOREIGN KEY (solicitado_por_equipe_id) REFERENCES equipe(id);
ALTER TABLE public.solicitacoes_etapa6 ADD CONSTRAINT solicitacoes_etapa6_pkey PRIMARY KEY (id);

-- ======================================================================
-- tipos_documento
-- ======================================================================
CREATE TABLE public.tipos_documento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    categoria text,
    obrigatorio boolean DEFAULT false,
    ordem_indice integer DEFAULT 0,
    criado_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.tipos_documento ADD CONSTRAINT tipos_documento_pkey PRIMARY KEY (id);
ALTER TABLE public.tipos_documento ADD CONSTRAINT tipos_documento_nome_key UNIQUE (nome);

-- ======================================================================
-- urbi_config
-- ======================================================================
CREATE TABLE public.urbi_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chave text NOT NULL,
    valor text,
    descricao text,
    atualizado_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.urbi_config ADD CONSTRAINT urbi_config_pkey PRIMARY KEY (id);
ALTER TABLE public.urbi_config ADD CONSTRAINT urbi_config_chave_key UNIQUE (chave);

-- ======================================================================
-- urbi_historico
-- ======================================================================
CREATE TABLE public.urbi_historico (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid,
    usuario_nome text,
    mensagem_usuario text NOT NULL,
    resposta_urbi text NOT NULL,
    linha text,
    pose_usada text,
    criado_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.urbi_historico ADD CONSTRAINT urbi_historico_linha_check CHECK ((linha = ANY (ARRAY['consultor'::text, 'calculadora'::text, 'correio'::text, 'co-analista'::text, 'geral'::text])));
ALTER TABLE public.urbi_historico ADD CONSTRAINT urbi_historico_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE public.urbi_historico ADD CONSTRAINT urbi_historico_pkey PRIMARY KEY (id);

-- ======================================================================
-- urbi_legislacao
-- ======================================================================
CREATE TABLE public.urbi_legislacao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    titulo text NOT NULL,
    tipo text,
    numero text,
    url_pdf text,
    resumo text,
    tags text[],
    ativo boolean DEFAULT true,
    criado_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.urbi_legislacao ADD CONSTRAINT urbi_legislacao_tipo_check CHECK ((tipo = ANY (ARRAY['lei'::text, 'decreto'::text, 'portaria'::text, 'resolucao'::text, 'outro'::text])));
ALTER TABLE public.urbi_legislacao ADD CONSTRAINT urbi_legislacao_pkey PRIMARY KEY (id);

-- ======================================================================
-- urbis_api_calls
-- ======================================================================
CREATE TABLE public.urbis_api_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    modelo text NOT NULL,
    processo_codigo text,
    status text NOT NULL,
    criado_em timestamp with time zone DEFAULT now(),
    modulo text,
    slot text,
    operacao text,
    tamanho_bytes bigint,
    duracao_ms integer,
    tokens_entrada integer,
    tokens_saida integer,
    custo_estimado_usd numeric(10,5),
    motivo_erro text
);
ALTER TABLE public.urbis_api_calls ADD CONSTRAINT urbis_api_calls_pkey PRIMARY KEY (id);

-- ======================================================================
-- urbis_aportes
-- ======================================================================
CREATE TABLE public.urbis_aportes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data_hora timestamp with time zone NOT NULL,
    email text NOT NULL,
    valor_reais numeric(10,2) NOT NULL,
    conta_faturamento text,
    projeto text,
    observacao text,
    origem text DEFAULT 'manual'::text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.urbis_aportes ADD CONSTRAINT urbis_aportes_origem_check CHECK ((origem = ANY (ARRAY['manual'::text, 'historico'::text])));
ALTER TABLE public.urbis_aportes ADD CONSTRAINT urbis_aportes_pkey PRIMARY KEY (id);

-- ======================================================================
-- urbis_config
-- ======================================================================
CREATE TABLE public.urbis_config (
    id integer NOT NULL,
    inatividade_horas integer DEFAULT 72 NOT NULL,
    meta_processos_mensal integer DEFAULT 100 NOT NULL,
    visao_ligada boolean DEFAULT true NOT NULL
);
ALTER TABLE public.urbis_config ADD CONSTRAINT urbis_config_pkey PRIMARY KEY (id);
COMMENT ON COLUMN public.urbis_config.visao_ligada IS "Interruptor operacional da visão localizada. false desliga a leitura por modelo; os campos caem para NAO_IMPLEMENTADO. Nunca altera regra — receitas vivem em lib/visao/receitas.ts.";

-- ======================================================================
-- urbis_lip_cores
-- ======================================================================
CREATE TABLE public.urbis_lip_cores (
    ator_nome text NOT NULL,
    cor_base text NOT NULL,
    cor_ok text,
    cor_alerta_160 text,
    cor_alerta_170 text,
    cor_alerta_180 text,
    limite_160 integer DEFAULT 160,
    limite_170 integer DEFAULT 170,
    limite_180 integer DEFAULT 180
);
ALTER TABLE public.urbis_lip_cores ADD CONSTRAINT urbis_lip_cores_pkey PRIMARY KEY (ator_nome);

-- ======================================================================
-- urbis_lip_documentos
-- ======================================================================
CREATE TABLE public.urbis_lip_documentos (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    processo_id uuid NOT NULL,
    tipo_documento text,
    nome_documento text,
    numero_sei text,
    pagina_inicial integer,
    pagina_final integer,
    total_paginas integer,
    data_emissao date,
    emitido_por text,
    departamento_origem text,
    versao integer DEFAULT 1,
    eh_ultima_versao boolean DEFAULT true,
    origem text DEFAULT 'PDF'::text,
    criado_em timestamp with time zone DEFAULT now(),
    doc_chave text
);
ALTER TABLE public.urbis_lip_documentos ADD CONSTRAINT urbis_lip_documentos_pkey PRIMARY KEY (id);

-- ======================================================================
-- urbis_lip_evento_tipos
-- ======================================================================
CREATE TABLE public.urbis_lip_evento_tipos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome_evento text NOT NULL,
    descricao text,
    fase text,
    gera_risco boolean DEFAULT false,
    criado_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.urbis_lip_evento_tipos ADD CONSTRAINT urbis_lip_evento_tipos_pkey PRIMARY KEY (id);
ALTER TABLE public.urbis_lip_evento_tipos ADD CONSTRAINT urbis_lip_evento_tipos_nome_evento_key UNIQUE (nome_evento);

-- ======================================================================
-- urbis_lip_eventos
-- ======================================================================
CREATE TABLE public.urbis_lip_eventos (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    processo_id uuid NOT NULL,
    ator_tipo text NOT NULL,
    ator_nome text NOT NULL,
    evento_tipo text NOT NULL,
    motivo text,
    iniciado_em timestamp with time zone DEFAULT now() NOT NULL,
    finalizado_em timestamp with time zone,
    cor_base text,
    numero_sei text,
    referencia_documento text,
    criado_em timestamp with time zone DEFAULT now()
);
ALTER TABLE public.urbis_lip_eventos ADD CONSTRAINT urbis_lip_eventos_ator_tipo_check CHECK ((ator_tipo = ANY (ARRAY['DEPARTAMENTO'::text, 'INTERESSADO'::text, 'SISTEMA'::text])));
ALTER TABLE public.urbis_lip_eventos ADD CONSTRAINT urbis_lip_eventos_referencia_documento_check CHECK (((referencia_documento IS NULL) OR (referencia_documento ~ '^\(\d{6,12}\)$'::text)));
ALTER TABLE public.urbis_lip_eventos ADD CONSTRAINT urbis_lip_eventos_pkey PRIMARY KEY (id);

-- ======================================================================
-- urbis_lip_fluxo_etapas
-- ======================================================================
CREATE TABLE public.urbis_lip_fluxo_etapas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ordem integer NOT NULL,
    etapa_codigo text NOT NULL,
    etapa_nome text NOT NULL,
    cor text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.urbis_lip_fluxo_etapas ADD CONSTRAINT urbis_lip_fluxo_etapas_pkey PRIMARY KEY (id);
ALTER TABLE public.urbis_lip_fluxo_etapas ADD CONSTRAINT urbis_lip_fluxo_etapas_etapa_codigo_key UNIQUE (etapa_codigo);

-- ======================================================================
-- urbis_lip_indice
-- ======================================================================
CREATE TABLE public.urbis_lip_indice (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processo_id uuid NOT NULL,
    item_tipo text NOT NULL,
    item_titulo text NOT NULL,
    item_referencia text NOT NULL,
    ordem integer,
    status_item text DEFAULT 'ATIVO'::text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.urbis_lip_indice ADD CONSTRAINT urbis_lip_indice_pkey PRIMARY KEY (id);

-- ======================================================================
-- urbis_logs
-- ======================================================================
CREATE TABLE public.urbis_logs (
    id bigint DEFAULT nextval('urbis_logs_id_seq'::regclass) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processo_id uuid,
    acao text NOT NULL,
    detalhe jsonb DEFAULT '{}'::jsonb NOT NULL,
    actor_auth_uid uuid
);
ALTER TABLE public.urbis_logs ADD CONSTRAINT urbis_logs_pkey PRIMARY KEY (id);

-- ======================================================================
-- urbis_notificacoes
-- ======================================================================
CREATE TABLE public.urbis_notificacoes (
    id bigint DEFAULT nextval('urbis_notificacoes_id_seq'::regclass) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processo_id uuid NOT NULL,
    titulo text NOT NULL,
    mensagem text NOT NULL,
    severidade text DEFAULT 'INFO'::text NOT NULL,
    lida boolean DEFAULT false NOT NULL,
    destino text DEFAULT 'DIRETORIA'::text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL
);
ALTER TABLE public.urbis_notificacoes ADD CONSTRAINT urbis_notificacoes_pkey PRIMARY KEY (id);

-- ======================================================================
-- urbis_numeracao_faixas
-- ======================================================================
CREATE TABLE public.urbis_numeracao_faixas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    tipo text NOT NULL,
    numero_inicial integer NOT NULL,
    numero_final integer NOT NULL,
    proximo integer NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    ano integer DEFAULT (EXTRACT(year FROM now()))::integer NOT NULL
);
ALTER TABLE public.urbis_numeracao_faixas ADD CONSTRAINT urbis_numeracao_faixas_tipo_check CHECK ((tipo = ANY (ARRAY['despacho'::text, 'parecer'::text])));
ALTER TABLE public.urbis_numeracao_faixas ADD CONSTRAINT urbis_numeracao_faixas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE public.urbis_numeracao_faixas ADD CONSTRAINT urbis_numeracao_faixas_pkey PRIMARY KEY (id);

-- ======================================================================
-- urbis_numeracao_uso
-- ======================================================================
CREATE TABLE public.urbis_numeracao_uso (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    faixa_id uuid NOT NULL,
    usuario_id uuid NOT NULL,
    numero integer NOT NULL,
    processo_codigo text NOT NULL,
    tipo_documento text NOT NULL,
    emitido_em timestamp with time zone DEFAULT now() NOT NULL,
    numero_analise smallint
);
ALTER TABLE public.urbis_numeracao_uso ADD CONSTRAINT urbis_numeracao_uso_tipo_documento_check CHECK ((tipo_documento = ANY (ARRAY['despacho'::text, 'parecer'::text])));
ALTER TABLE public.urbis_numeracao_uso ADD CONSTRAINT urbis_numeracao_uso_faixa_id_fkey FOREIGN KEY (faixa_id) REFERENCES urbis_numeracao_faixas(id) ON DELETE CASCADE;
ALTER TABLE public.urbis_numeracao_uso ADD CONSTRAINT urbis_numeracao_uso_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE public.urbis_numeracao_uso ADD CONSTRAINT urbis_numeracao_uso_pkey PRIMARY KEY (id);
ALTER TABLE public.urbis_numeracao_uso ADD CONSTRAINT uq_numeracao_uso_faixa_numero UNIQUE (faixa_id, numero);

-- ======================================================================
-- urbis_sessoes
-- ======================================================================
CREATE TABLE public.urbis_sessoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    iniciada_em timestamp with time zone DEFAULT now() NOT NULL,
    ultimo_ping timestamp with time zone DEFAULT now() NOT NULL,
    encerrada_em timestamp with time zone,
    pagina text,
    duracao_min numeric DEFAULT (EXTRACT(epoch FROM (COALESCE(encerrada_em, ultimo_ping) - iniciada_em)) / (60)::numeric),
    status text DEFAULT 'ativa'::text NOT NULL,
    tempo_pausado integer DEFAULT 0 NOT NULL
);
ALTER TABLE public.urbis_sessoes ADD CONSTRAINT urbis_sessoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE public.urbis_sessoes ADD CONSTRAINT urbis_sessoes_pkey PRIMARY KEY (id);
COMMENT ON COLUMN public.urbis_sessoes.tempo_pausado IS "Segundos a subtrair do tempo bruto da sessão (inatividade + dead-time pós-cron)";

-- ======================================================================
-- urbis_sessoes_backup
-- ======================================================================
CREATE TABLE public.urbis_sessoes_backup (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    iniciada_em timestamp with time zone DEFAULT now() NOT NULL,
    ultimo_ping timestamp with time zone DEFAULT now() NOT NULL,
    encerrada_em timestamp with time zone,
    pagina text,
    duracao_min numeric DEFAULT (EXTRACT(epoch FROM (COALESCE(encerrada_em, ultimo_ping) - iniciada_em)) / (60)::numeric),
    status text DEFAULT 'ativa'::text NOT NULL,
    tempo_pausado integer DEFAULT 0 NOT NULL,
    backup_em timestamp with time zone DEFAULT now(),
    backup_motivo text DEFAULT 'delete'::text
);
ALTER TABLE public.urbis_sessoes_backup ADD CONSTRAINT urbis_sessoes_backup_pkey PRIMARY KEY (id);
COMMENT ON COLUMN public.urbis_sessoes_backup.tempo_pausado IS "Segundos a subtrair do tempo bruto da sessão (inatividade + dead-time pós-cron)";

-- ======================================================================
-- usuarios
-- ======================================================================
CREATE TABLE public.usuarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    email text NOT NULL,
    matricula text,
    telefone text,
    cargo text,
    perfil text DEFAULT 'Analista'::text NOT NULL,
    status text DEFAULT 'Ativo'::text NOT NULL,
    criado_em timestamp with time zone DEFAULT now(),
    ultimo_acesso timestamp with time zone,
    descadastrado_em timestamp with time zone,
    perfis text[] DEFAULT '{}'::text[],
    gerencia text,
    cau_crea text,
    reducao_meta numeric(5,2) DEFAULT 0.00 NOT NULL,
    meta_base_legal text,
    meta_vigencia_inicio date,
    urbi_ativo boolean DEFAULT false NOT NULL,
    tema text DEFAULT 'moderno'::text,
    urbi_voz boolean DEFAULT false,
    urbi_mudo boolean DEFAULT true,
    urbi_bip boolean DEFAULT false
);
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_email_key UNIQUE (email);
COMMENT ON COLUMN public.usuarios.reducao_meta IS "Percentual de redução da meta MRP (0-100). 0 = meta cheia (100 pts/mês).";
COMMENT ON COLUMN public.usuarios.meta_base_legal IS "Fundamento legal/administrativo da redução (ex: portaria, atestado).";
COMMENT ON COLUMN public.usuarios.meta_vigencia_inicio IS "Data a partir da qual a redução está vigente.";

