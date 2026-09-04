-- FUNCOES E PROCEDURES
-- Gerado por scripts/extrair_schema.mts em 2026-09-04.
-- NAO EDITE A MAO: regenere.

CREATE OR REPLACE FUNCTION public._get_checklist_itens_modelo_table()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare
  candidates text[] := array[
    'public.checklist_itens_modelo',
    'public.checklist_modelo_itens',
    'public.checklist_itens_modelos',
    'public.checklist_itens',
    'public.checklist_modelos_itens'
  ];
  t text;
begin
  foreach t in array candidates loop
    if to_regclass(t) is not null then
      return t;
    end if;
  end loop;

  -- não achou: retorna null e a clonagem cria instância vazia (sem quebrar)
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public._norm_txt(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select nullif(upper(btrim(p)), '');
$function$
;

CREATE OR REPLACE FUNCTION public.array_to_halfvec(integer[], integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_halfvec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_halfvec(real[], integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_halfvec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_halfvec(double precision[], integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_halfvec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_halfvec(numeric[], integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_halfvec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_sparsevec(integer[], integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_sparsevec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_sparsevec(real[], integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_sparsevec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_sparsevec(double precision[], integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_sparsevec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_sparsevec(numeric[], integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_sparsevec$function$
;

CREATE OR REPLACE FUNCTION public.array_to_vector(integer[], integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_vector$function$
;

CREATE OR REPLACE FUNCTION public.array_to_vector(real[], integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_vector$function$
;

CREATE OR REPLACE FUNCTION public.array_to_vector(double precision[], integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_vector$function$
;

CREATE OR REPLACE FUNCTION public.array_to_vector(numeric[], integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_vector$function$
;

CREATE OR REPLACE FUNCTION public.assinar_processo(pid uuid, papel text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin

  insert into public.assinaturas(
    id,
    processo_id,
    papel_assinatura,
    assinado_em
  )
  values(
    gen_random_uuid(),
    pid,
    upper(papel),
    now()
  );

end;
$function$
;

CREATE OR REPLACE FUNCTION public.avancar_processo(p_processo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
    v_ordem_atual int;
    v_ordem_proxima int;
begin

    -- etapa atual
    select ordem_atual
    into v_ordem_atual
    from v_lip_responsabilidade_humana
    where processo_id = p_processo_id;

    if v_ordem_atual is null then
        raise exception 'Processo sem etapa atual';
    end if;

    -- próxima etapa
    v_ordem_proxima := v_ordem_atual + 1;

    -- registra movimentação (exemplo)
    insert into processo_etapas (
        processo_id,
        ordem,
        criado_em
    )
    values (
        p_processo_id,
        v_ordem_proxima,
        now()
    );

end;
$function$
;

CREATE OR REPLACE FUNCTION public.binary_quantize(vector)
 RETURNS bit
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$binary_quantize$function$
;

CREATE OR REPLACE FUNCTION public.binary_quantize(halfvec)
 RETURNS bit
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_binary_quantize$function$
;

CREATE OR REPLACE FUNCTION public.block_all_processo_updates_non_admin()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- Libera em ambiente "admin técnico" (SQL Editor / postgres)
  if current_role = 'postgres' or auth.uid() is null then
    return new;
  end if;

  -- (mantém sua regra original aqui embaixo)
  raise exception 'Somente ADMIN pode editar processos.';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.block_processo_critical_updates()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if public.is_admin() then
    return new;
  end if;

  if (new.numero_sei is distinct from old.numero_sei)
     or (new.numero_processo_fisico is distinct from old.numero_processo_fisico)
     or (new.numero_os is distinct from old.numero_os)
     or (new.numero_projeto is distinct from old.numero_projeto)
  then
    raise exception 'Somente ADMIN pode editar campos críticos do processo.';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.buscar_bip_fragmentos_similares(query_embedding vector, match_count integer DEFAULT 8, filtro_documento_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(id uuid, documento_id uuid, referencia text, texto text, distancia double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT f.id, f.documento_id, f.referencia, f.texto, (f.embedding <=> query_embedding) AS distancia
  FROM bdi_lei_fragmentos f
  WHERE f.embedding IS NOT NULL
    AND (filtro_documento_ids IS NULL OR f.documento_id = ANY(filtro_documento_ids))
  ORDER BY f.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 50);
$function$
;

CREATE OR REPLACE FUNCTION public.calcular_duracao_sessao()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = 'encerrada' AND OLD.status = 'ativa' THEN
    NEW.encerrada_em := COALESCE(NEW.encerrada_em, now());
    NEW.duracao_min := GREATEST(0, ROUND(
      (EXTRACT(EPOCH FROM (NEW.encerrada_em - NEW.iniciada_em)) - COALESCE(NEW.tempo_pausado, 0))
      / 60.0,
      2
    ));
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_limite_despachos()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  total smallint;
begin
  -- Só valida se a etapa for DESPACHO
  if new.tipo_etapa <> 'DESPACHO'::public.tipo_etapa_enum then
    return new;
  end if;

  select count(*)
    into total
  from public.processo_etapas
  where processo_id = new.processo_id
    and tipo_etapa = 'DESPACHO'::public.tipo_etapa_enum;

  if total >= 5 then
    raise exception 'Limite máximo de 5 DESPACHOS atingido.';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.concluir_analise_force(p_processo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  update public.processos
     set status = 'AGUARDANDO_ASSINATURAS'::public.status_processo_enum,
         analise_concluida_em = coalesce(analise_concluida_em, now()),
         atualizado_em = now()
   where id = p_processo_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.concluir_analise_processo_safe(p_processo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  update public.processos
  set
    status = 'AGUARDANDO_ASSINATURAS'::public.status_processo_enum,
    analise_concluida_em = coalesce(analise_concluida_em, now()),
    atualizado_em = now()
  where id = p_processo_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cosine_distance(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$cosine_distance$function$
;

CREATE OR REPLACE FUNCTION public.cosine_distance(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_cosine_distance$function$
;

CREATE OR REPLACE FUNCTION public.cosine_distance(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_cosine_distance$function$
;

CREATE OR REPLACE FUNCTION public.current_diretoria()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(e.diretoria, 'DIRAAP')
  from public.equipe e
  where e.auth_uid = auth.uid()
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.current_equipe_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select e.id
  from public.equipe e
  where e.auth_uid = auth.uid()
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.current_gerencia()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.gerencia
  from public.equipe e
  where e.auth_uid = auth.uid()
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.despachos_permitidos(processo_uuid uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  select 5 + coalesce((
    select sum(s.quantidade_extra)::int
    from public.solicitacoes_despacho_extra s
    where s.processo_id = processo_uuid
      and s.status = 'APROVADO'
  ), 0);
$function$
;

CREATE OR REPLACE FUNCTION public.fila_do_analista(p_matricula text)
 RETURNS TABLE(pos integer, processo_id uuid, status text, eh_retorno boolean, fila_ts timestamp with time zone, override_pos integer, override_motivo text)
 LANGUAGE plpgsql
AS $function$
declare
  v_analista_id uuid;
begin
  select e.id
    into v_analista_id
  from public.equipe e
  where e.matricula = p_matricula
    and e.ativo = true
  limit 1;

  if v_analista_id is null then
    raise exception 'Matrícula não encontrada/ativa na equipe: %', p_matricula;
  end if;

  -- chama a função existente (UUID)
  return query
  select *
  from public.fila_do_analista(v_analista_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fila_do_analista(p_analista_id uuid)
 RETURNS TABLE(pos integer, processo_id uuid, status text, eh_retorno boolean, fila_ts timestamp with time zone, override_posicao integer, override_motivo text)
 LANGUAGE sql
AS $function$
  select
    row_number() over (order by vf.fila_tipo, vf.override_posicao nulls last, vf.fila_ts) as pos,
    vf.processo_id,
    vf.status::text,
    vf.eh_retorno,
    vf.fila_ts,
    vf.override_posicao,
    vf.override_motivo
  from public.v_fila_por_analista vf
  where vf.analista_id = p_analista_id
  order by vf.fila_tipo, vf.override_posicao nulls last, vf.fila_ts;
$function$
;

CREATE OR REPLACE FUNCTION public.finalizar_analise_processo(pid uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin

  update public.processos
  set status = 'AGUARDANDO_ASSINATURAS'
  where id = pid
  and status = 'EM_ANALISE';

end;
$function$
;

CREATE OR REPLACE FUNCTION public.finalizar_se_assinado()
 RETURNS TABLE(processo_id uuid, acao text, status_antes text, status_depois text, msg text)
 LANGUAGE plpgsql
AS $function$
declare
    v_processo record;
    v_qtd integer;
begin

for v_processo in
    select p.id, p.status
    from public.processos p
    where p.status = 'AGUARDANDO_ASSINATURAS'
loop

    /* conta papéis únicos assinados */
    select count(distinct a.papel_assinatura)
    into v_qtd
    from public.assinaturas a
    where a.processo_id = v_processo.id
      and a.assinado_em is not null;

    /* regra: 3 assinaturas obrigatórias */
    if v_qtd >= 3 then

        update public.processos
        set status = 'CONCLUIDO'
        where id = v_processo.id;

        return query
        select
            v_processo.id,
            'FINALIZAR',
            v_processo.status::text,
            'CONCLUIDO',
            'Processo concluído automaticamente (assinaturas completas)';

    end if;

end loop;

return;

end;
$function$
;

CREATE OR REPLACE FUNCTION public.fmt_doc_sei(p_sei_doc_id text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_sei_doc_id is null then null
    when trim(p_sei_doc_id) ~ '^\d{6,12}$' then '(' || trim(p_sei_doc_id) || ')'
    else null
  end
$function$
;

CREATE OR REPLACE FUNCTION public.fn_backup_before_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'auditoria_eventos' THEN
    INSERT INTO auditoria_eventos_backup SELECT OLD.*, now(), 'delete';
  ELSIF TG_TABLE_NAME = 'auditoria_log' THEN
    INSERT INTO auditoria_log_backup SELECT OLD.*, now(), 'delete';
  ELSIF TG_TABLE_NAME = 'auditoria_sessoes' THEN
    INSERT INTO auditoria_sessoes_backup SELECT OLD.*, now(), 'delete';
  ELSIF TG_TABLE_NAME = 'bdi_documentos_lei' THEN
    INSERT INTO bdi_documentos_lei_backup SELECT OLD.*, now(), 'delete';
  ELSIF TG_TABLE_NAME = 'bdi_lei_fragmentos' THEN
    INSERT INTO bdi_lei_fragmentos_backup SELECT OLD.*, now(), 'delete';
  ELSIF TG_TABLE_NAME = 'mrp_calendario' THEN
    INSERT INTO mrp_calendario_backup SELECT OLD.*, now(), 'delete';
  ELSIF TG_TABLE_NAME = 'mrp_pontuacao' THEN
    INSERT INTO mrp_pontuacao_backup SELECT OLD.*, now(), 'delete';
  END IF;
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_backup_mrp_antes_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO mrp_registros_backup (
    id, usuario_id, processo_codigo, tipo_processo, interessado, assunto,
    porte, area_construida, bairro, setor, tipo_despacho, numero_despacho,
    numero_analise, numero_revisao, revisao, data_inicio, data_despacho,
    pontos, observacoes, mes, ano, auto_gerado, criado_em,
    numero_sei, numero_fisico, backup_em, backup_motivo
  )
  VALUES (
    OLD.id, OLD.usuario_id, OLD.processo_codigo, OLD.tipo_processo, OLD.interessado, OLD.assunto,
    OLD.porte, OLD.area_construida, OLD.bairro, OLD.setor, OLD.tipo_despacho, OLD.numero_despacho,
    OLD.numero_analise, OLD.numero_revisao, OLD.revisao, OLD.data_inicio, OLD.data_despacho,
    OLD.pontos, OLD.observacoes, OLD.mes, OLD.ano, OLD.auto_gerado, OLD.criado_em,
    OLD.numero_sei, OLD.numero_fisico, now(), 'delete'
  );
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_backup_sessoes_antes_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO urbis_sessoes_backup
  SELECT OLD.*, now(), 'delete';
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_evento_documento_anexado()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  insert into public.eventos (
    processo_id,
    tipo,
    etapa,
    descricao,
    cor,
    data_evento,
    criado_por,
    criado_em
  )
  values (
    new.processo_id,
    'DOCUMENTO',
    'ANEXO',
    'Documento anexado: ' || coalesce(new.nome_arquivo, '(sem nome)'),
    'green',
    now(),
    auth.uid(),
    now()
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_evento_processo_criado()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- evita duplicar o evento de criação
  if exists (
    select 1
    from public.eventos e
    where e.processo_id = new.id
      and e.tipo = 'SISTEMA'
      and e.etapa = 'CADASTRO'
      and e.descricao = 'Processo criado no URBIS'
  ) then
    return new;
  end if;

  insert into public.eventos (
    processo_id, tipo, etapa, descricao, cor, data_evento, criado_por, criado_em
  )
  values (
    new.id,
    'SISTEMA',
    'CADASTRO',
    'Processo criado no URBIS',
    'blue',
    now(),
    null,
    now()
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_evento_status_alterado()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$begin
  if new.status is distinct from old.status then

    insert into public.eventos
      (processo_id, tipo, etapa, descricao, cor, data_evento, criado_por, criado_em)
    values
      (
        new.id,
        'STATUS',
        'STATUS',
        'Status alterado: '
          || coalesce(old.status::text, '(vazio)')
          || ' → '
          || coalesce(new.status::text, '(vazio)'),
        'orange',
        now(),
        auth.uid(),
        now()
      )
    on conflict (processo_id, tipo, etapa, descricao) do nothing;

  end if;

  return new;
end;$function$
;

CREATE OR REPLACE FUNCTION public.fn_lip_sync_indice(p_processo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  insert into public.urbis_lip_indice
  (processo_id, item_tipo, item_titulo, item_referencia, ordem, status_item, criado_em)
  select
    pdi.processo_id,
    'DOCUMENTO' as item_tipo,
    coalesce(nullif(trim(pdi.tipo_documento), ''), 'DOCUMENTO') as item_titulo,
    '(' || pdi.sei_doc_id || ')' as item_referencia,
    row_number() over (order by pdi.coletado_em, pdi.nome_arquivo) as ordem,
    'ATIVO' as status_item,
    now()
  from public.processo_documento_ingestao pdi
  where pdi.processo_id = p_processo_id
    and pdi.sei_doc_id is not null
  on conflict (processo_id, item_referencia)
  do update set
    item_titulo = excluded.item_titulo,
    ordem = excluded.ordem,
    status_item = excluded.status_item;

end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_notificar_decisao()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_assunto text;
  v_msg text;
begin
  -- Só dispara para decisões “fortes”
  if new.tipo_decisao in ('INELEGIVEL','INDEFERIMENTO') then
    v_assunto := 'URBIS: ' || new.tipo_decisao || ' - Assinatura necessária';
    v_msg := 'Processo: ' || new.processo_id::text ||
             E'\nMotivo principal: ' || new.motivo_principal ||
             E'\nStatus: ' || new.status_assinatura;

    insert into public.notificacoes (processo_id, decisao_id, para_papel, assunto, mensagem)
    values
      (new.processo_id, new.id, 'ADM', v_assunto, v_msg),
      (new.processo_id, new.id, 'GERENTE', v_assunto, v_msg),
      (new.processo_id, new.id, 'DIRETOR', v_assunto, v_msg);
  end if;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_urbis_atualiza_lip()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.status_doc = 'ATIVO' then
    insert into public.urbis_lip_indice (
      processo_id,
      item_tipo,
      item_titulo,
      item_referencia,
      ordem,
      status_item
    )
    values (
      new.processo_id,
      new.tipo_documento,
      new.nome_arquivo,
      new.id,
      1,
      'ATIVO'
    )
    on conflict do nothing;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_urbis_atualiza_lip_por_doc()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- Só indexa quando o documento está ATIVO
  if new.status_doc = 'ATIVO' then
    insert into public.urbis_lip_indice (
      processo_id,
      item_tipo,
      item_titulo,
      item_referencia,
      ordem,
      status_item
    )
    values (
      new.processo_id,
      new.tipo_documento,
      new.nome_arquivo,
      new.id,          -- referência = id do registro em processo_documento_ingestao
      1,               -- depois refinamos a ordem (prioridade por tipo/data)
      'ATIVO'
    )
    on conflict (processo_id, item_referencia)
    do update set
      item_tipo   = excluded.item_tipo,
      item_titulo = excluded.item_titulo,
      status_item = excluded.status_item,
      ordem       = excluded.ordem;

  else
    -- Se deixou de ser ATIVO, marca no índice como HISTORICO (não apaga)
    update public.urbis_lip_indice
    set status_item = 'HISTORICO'
    where processo_id = new.processo_id
      and item_referencia = new.id;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_inatividade_horas()
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce((select valor::int from public.config_urbis where chave='inatividade_horas'), 72);
$function$
;

CREATE OR REPLACE FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_query_trgm$function$
;

CREATE OR REPLACE FUNCTION public.gin_extract_value_trgm(text, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_value_trgm$function$
;

CREATE OR REPLACE FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal)
 RETURNS "char"
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_triconsistent$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_compress$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_decompress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_decompress$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_distance$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_in(cstring)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_in$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_options(internal)
 RETURNS void
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE
AS '$libdir/pg_trgm', $function$gtrgm_options$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_out(gtrgm)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_out$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_same(gtrgm, gtrgm, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_same$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_union(internal, internal)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_union$function$
;

CREATE OR REPLACE FUNCTION public.halfvec(halfvec, integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_accum(double precision[], halfvec)
 RETURNS double precision[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_accum$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_add(halfvec, halfvec)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_add$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_avg(double precision[])
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_avg$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_cmp(halfvec, halfvec)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_cmp$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_combine(double precision[], double precision[])
 RETURNS double precision[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_combine$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_concat(halfvec, halfvec)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_concat$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_eq(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_eq$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_ge(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_ge$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_gt(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_gt$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_in(cstring, oid, integer)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_in$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_l2_squared_distance(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l2_squared_distance$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_le(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_le$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_lt(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_lt$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_mul(halfvec, halfvec)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_mul$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_ne(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_ne$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_negative_inner_product(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_negative_inner_product$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_out(halfvec)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_out$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_recv(internal, oid, integer)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_recv$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_send(halfvec)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_send$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_spherical_distance(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_spherical_distance$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_sub(halfvec, halfvec)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_sub$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_to_float4(halfvec, integer, boolean)
 RETURNS real[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_to_float4$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_to_sparsevec(halfvec, integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_to_sparsevec$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_to_vector(halfvec, integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_to_vector$function$
;

CREATE OR REPLACE FUNCTION public.halfvec_typmod_in(cstring[])
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_typmod_in$function$
;

CREATE OR REPLACE FUNCTION public.hamming_distance(bit, bit)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$hamming_distance$function$
;

CREATE OR REPLACE FUNCTION public.has_role(p_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select p_role = any(public.user_roles());
$function$
;

CREATE OR REPLACE FUNCTION public.hnsw_bit_support(internal)
 RETURNS internal
 LANGUAGE c
AS '$libdir/vector', $function$hnsw_bit_support$function$
;

CREATE OR REPLACE FUNCTION public.hnsw_halfvec_support(internal)
 RETURNS internal
 LANGUAGE c
AS '$libdir/vector', $function$hnsw_halfvec_support$function$
;

CREATE OR REPLACE FUNCTION public.hnsw_sparsevec_support(internal)
 RETURNS internal
 LANGUAGE c
AS '$libdir/vector', $function$hnsw_sparsevec_support$function$
;

CREATE OR REPLACE FUNCTION public.hnswhandler(internal)
 RETURNS index_am_handler
 LANGUAGE c
AS '$libdir/vector', $function$hnswhandler$function$
;

CREATE OR REPLACE FUNCTION public.incrementar_tempo_pausado(p_sessao_id uuid, p_usuario_id uuid, p_segundos integer)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  UPDATE urbis_sessoes
  SET tempo_pausado = tempo_pausado + p_segundos
  WHERE id          = p_sessao_id
    AND usuario_id  = p_usuario_id
    AND status      = 'ativa';
$function$
;

CREATE OR REPLACE FUNCTION public.iniciar_analise_force(p_processo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  update public.processos
     set status = 'EM_ANALISE'::public.status_processo_enum,
         analise_iniciada_em = coalesce(analise_iniciada_em, now()),
         atualizado_em = now()
   where id = p_processo_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.iniciar_analise_processo(p_processo_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
    v_status text;
    v_instancia_id uuid;
begin

    ----------------------------------------------------------------
    -- 1. Verifica se processo existe
    ----------------------------------------------------------------
    select status
    into v_status
    from public.processos
    where id = p_processo_id;

    if v_status is null then
        raise exception 'Processo não encontrado.';
    end if;

    ----------------------------------------------------------------
    -- 2. Só permite iniciar se NÃO INICIADO ou PAUSADO
    ----------------------------------------------------------------
    if v_status not in ('NAO_INICIADO','PAUSADO') then
        raise exception
        'Processo não pode iniciar análise no status atual (%).',
        v_status;
    end if;

    ----------------------------------------------------------------
    -- 3. Atualiza STATUS automaticamente
    ----------------------------------------------------------------
    update public.processos
    set
        status = 'EM_ANALISE',
        analise_iniciada_em = now(),
        atualizado_em = now()
    where id = p_processo_id;

    ----------------------------------------------------------------
    -- 4. Cria automaticamente a análise
    ----------------------------------------------------------------
    select public.start_analise(p_processo_id)
    into v_instancia_id;

    ----------------------------------------------------------------
    -- 5. Retorna ID da análise criada
    ----------------------------------------------------------------
    return v_instancia_id;

end;
$function$
;

CREATE OR REPLACE FUNCTION public.iniciar_analise_respeitando_fila(p_processo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  a uuid;
  prox uuid;
begin
  select analista_id into a
  from public.processos
  where id = p_processo_id;

  if a is null then
    raise exception 'Processo % não tem analista vinculado.', p_processo_id;
  end if;

  prox := public.proximo_processo_da_fila(a);

  if prox is null then
    raise exception 'Fila vazia para o analista %.', a;
  end if;

  if prox <> p_processo_id then
    raise exception 'BLOQUEADO: você deve iniciar primeiro o processo % (fila obrigatória).', prox;
  end if;

  update public.processos
     set iniciado_em = now()
   where id = p_processo_id
     and iniciado_em is null;

  begin
    perform public.log_processo_evento(p_processo_id, 'INICIO_ANALISE_FILA_OK', jsonb_build_object('analista_id', a));
  exception when undefined_function then
    null;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.inner_product(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$inner_product$function$
;

CREATE OR REPLACE FUNCTION public.inner_product(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_inner_product$function$
;

CREATE OR REPLACE FUNCTION public.inner_product(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_inner_product$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_diretor_ou_adm()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (
    select 1
    from public.equipe e
    join public.equipe_roles er on er.equipe_id = e.id
    where e.auth_uid = auth.uid()
      and coalesce(e.ativo, true) = true
      and upper(er.role) in ('DIRETOR', 'ADM', 'ADMIN')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.ivfflat_bit_support(internal)
 RETURNS internal
 LANGUAGE c
AS '$libdir/vector', $function$ivfflat_bit_support$function$
;

CREATE OR REPLACE FUNCTION public.ivfflat_halfvec_support(internal)
 RETURNS internal
 LANGUAGE c
AS '$libdir/vector', $function$ivfflat_halfvec_support$function$
;

CREATE OR REPLACE FUNCTION public.ivfflathandler(internal)
 RETURNS index_am_handler
 LANGUAGE c
AS '$libdir/vector', $function$ivfflathandler$function$
;

CREATE OR REPLACE FUNCTION public.jaccard_distance(bit, bit)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$jaccard_distance$function$
;

CREATE OR REPLACE FUNCTION public.l1_distance(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$l1_distance$function$
;

CREATE OR REPLACE FUNCTION public.l1_distance(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l1_distance$function$
;

CREATE OR REPLACE FUNCTION public.l1_distance(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l1_distance$function$
;

CREATE OR REPLACE FUNCTION public.l2_distance(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$l2_distance$function$
;

CREATE OR REPLACE FUNCTION public.l2_distance(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l2_distance$function$
;

CREATE OR REPLACE FUNCTION public.l2_distance(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l2_distance$function$
;

CREATE OR REPLACE FUNCTION public.l2_norm(halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l2_norm$function$
;

CREATE OR REPLACE FUNCTION public.l2_norm(sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l2_norm$function$
;

CREATE OR REPLACE FUNCTION public.l2_normalize(vector)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$l2_normalize$function$
;

CREATE OR REPLACE FUNCTION public.l2_normalize(halfvec)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l2_normalize$function$
;

CREATE OR REPLACE FUNCTION public.l2_normalize(sparsevec)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l2_normalize$function$
;

CREATE OR REPLACE FUNCTION public.limpar_dados_ficticios()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  DELETE FROM mrp_registros WHERE processo_codigo IN (
    SELECT codigo FROM processos WHERE numero_sei LIKE '99%'
  );
  DELETE FROM analises_mac WHERE processo_codigo IN (
    SELECT codigo FROM processos WHERE numero_sei LIKE '99%'
  );
  DELETE FROM processos WHERE numero_sei LIKE '99%';
  -- analistas fictícios marcados com '* Analista Teste'
  DELETE FROM usuarios
   WHERE perfil = 'Analista'
     AND nome LIKE '* Analista Teste %';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.lip_abrir_processo(p_processo uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
    delete from public.lip_processo_atual;
    insert into public.lip_processo_atual(processo_id)
    values (p_processo);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.lip_add_evento(p_processo_id uuid, p_evento_tipo text, p_motivo text DEFAULT NULL::text, p_ator_tipo text DEFAULT 'SISTEMA'::text, p_ator_nome text DEFAULT NULL::text, p_cor_base text DEFAULT NULL::text, p_numero_sei text DEFAULT NULL::text, p_referencia_documento text DEFAULT NULL::text, p_iniciado_em timestamp with time zone DEFAULT now(), p_finalizado_em timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_id uuid;
begin
  insert into public.urbis_lip_eventos (
    processo_id, evento_tipo, motivo, ator_tipo, ator_nome,
    cor_base, numero_sei, referencia_documento,
    iniciado_em, finalizado_em, criado_em
  ) values (
    p_processo_id, p_evento_tipo, p_motivo, p_ator_tipo, p_ator_nome,
    p_cor_base, p_numero_sei, p_referencia_documento,
    p_iniciado_em, p_finalizado_em, now()
  )
  returning id into v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.lip_documentos_do_processo(p_processo uuid)
 RETURNS TABLE(processo_id uuid, ordem integer, item_tipo text, item_titulo text, nome_arquivo text, tipo_documento text, status_doc text, criado_em timestamp with time zone)
 LANGUAGE sql
AS $function$
    select *
    from public.v_lip_processo_aberto
    where processo_id = p_processo
    order by ordem;
$function$
;

CREATE OR REPLACE FUNCTION public.log_processo_evento(p_processo uuid, p_acao text, p_detalhe jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  insert into public.processo_historico (
    processo_id,
    usuario_id,
    acao,
    detalhe
  )
  values (
    p_processo,
    auth.uid(),
    p_acao,
    p_detalhe
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marcar_processo_como_retorno(p_processo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  update public.processos
     set eh_retorno = true,
         retorno_em = coalesce(retorno_em, now())
   where id = p_processo_id;

  -- log (se você já rodou o script anterior)
  begin
    perform public.log_processo_evento(p_processo_id, 'RETORNO_MARCADO', jsonb_build_object('retorno_em', now()));
  exception when undefined_function then
    -- se ainda não existe log_processo_evento, ignora
    null;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.motor_concluir_analise(p_processo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin

  update public.processos
  set
    status = 'AGUARDANDO_ASSINATURAS',
    analise_concluida_em = now(),
    atualizado_em = now()
  where id = p_processo_id
    and status = 'EM_ANALISE';

end;
$function$
;

CREATE OR REPLACE FUNCTION public.motor_iniciar_analise(p_processo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin

  update public.processos
  set
    status = 'EM_ANALISE',
    analise_iniciada_em = coalesce(analise_iniciada_em, now()),
    atualizado_em = now()
  where id = p_processo_id;

end;
$function$
;

CREATE OR REPLACE FUNCTION public.motor_pausar_processo(p_processo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin

  update public.processos
  set
    status = 'PAUSADO',
    atualizado_em = now()
  where id = p_processo_id
    and status = 'EM_ANALISE';

end;
$function$
;

CREATE OR REPLACE FUNCTION public.motor_retomar_processo(p_processo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin

  update public.processos
  set
    status = 'EM_ANALISE',
    atualizado_em = now()
  where id = p_processo_id
    and status = 'PAUSADO';

end;
$function$
;

CREATE OR REPLACE FUNCTION public.motor_tick()
 RETURNS TABLE(processo_id uuid, acao text, status_antes text, status_depois text, instancia_id uuid, msg text)
 LANGUAGE plpgsql
AS $function$
declare
  v_id uuid;
  v_status public.status_processo_enum;
  v_inst uuid;
begin
  -- 1) pega o processo "mais recente elegível" para o motor atuar
  -- prioridade: EM_ANALISE (pra fechar ciclo) depois NAO_INICIADO (pra iniciar)
  select p.id, p.status
    into v_id, v_status
  from public.processos p
  where
    -- só pega processos que têm modelo de checklist associado
    p.checklist_modelo_id is not null
    and p.status in (
      'EM_ANALISE'::public.status_processo_enum,
      'NAO_INICIADO'::public.status_processo_enum
    )
  order by
    case when p.status = 'EM_ANALISE'::public.status_processo_enum then 0 else 1 end,
    coalesce(p.atualizado_em, p.criado_em) desc nulls last
  limit 1;

  if v_id is null then
    processo_id   := null;
    acao          := 'NENHUMA';
    status_antes  := null;
    status_depois := null;
    instancia_id  := null;
    msg           := 'Nenhum processo elegível (precisa ter checklist_modelo_id e estar EM_ANALISE ou NAO_INICIADO).';
    return next;
    return;
  end if;

  -- status antes
  processo_id  := v_id;
  status_antes := v_status::text;
  instancia_id := null;

  -- 2) decide a ação
  if v_status = 'NAO_INICIADO'::public.status_processo_enum then
    acao := 'INICIAR_ANALISE';
    v_inst := public.iniciar_analise_processo(v_id);
    instancia_id := v_inst;
    msg := 'OK: análise iniciada e instância criada.';

  elsif v_status = 'EM_ANALISE'::public.status_processo_enum then
    acao := 'CONCLUIR_ANALISE';
    -- essa função já fecha timestamps e muda status para AGUARDANDO_ASSINATURAS (no seu fluxo)
    perform public.concluir_analise_processo_safe(v_id);
    msg := 'OK: análise concluída (deve ir para AGUARDANDO_ASSINATURAS).';

  else
    acao := 'NENHUMA';
    msg := 'Status não elegível para ação do motor.';
  end if;

  -- 3) status depois
  select p.status::text
    into status_depois
  from public.processos p
  where p.id = v_id;

  return next;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mrp_calendario_touch()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.atualizado_em = now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.next_doc_version(p_processo_id uuid, p_tipo text)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(max(d.versao), 0) + 1
  from public.documentos d
  where d.processo_id = p_processo_id
    and upper(d.tipo) = upper(p_tipo);
$function$
;

CREATE OR REPLACE FUNCTION public.normaliza_sei_doc_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.sei_doc_id is null then
    return new;
  end if;

  -- normaliza: remove tudo que não for dígito (tira parênteses, espaços, etc.)
  new.sei_doc_id := regexp_replace(new.sei_doc_id, '\D', '', 'g');

  -- se ficar vazio, vira null
  if new.sei_doc_id = '' then
    new.sei_doc_id := null;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pausar_force(p_processo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  update public.processos
     set status = 'PAUSADO'::public.status_processo_enum,
         atualizado_em = now()
   where id = p_processo_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.processos_after_update_status_fn()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
  begin
    return new;
  end;
  $function$
;

CREATE OR REPLACE FUNCTION public.proximo_processo_da_fila(p_analista_id uuid)
 RETURNS uuid
 LANGUAGE sql
AS $function$
  select x.processo_id
  from (
    select
      vf.processo_id,
      vf.fila_tipo,
      vf.override_posicao,
      vf.fila_ts
    from public.v_fila_por_analista vf
    where vf.analista_id = p_analista_id
  ) x
  order by
    x.fila_tipo asc,
    x.override_posicao asc nulls last,
    x.fila_ts asc
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.recalcular_porte_processo(p_processo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_area numeric;
  v_carater text;
  v_tipologia text;
  v_unidades integer;

  v_pp_max_unidades integer;
  v_mp_max_area numeric;
  v_gp_min_area numeric;

  v_porte_text text;
  v_porte_regtype regtype;
begin
  -- pega config
  select pp_max_unidades, mp_max_area_m2, gp_min_area_m2
    into v_pp_max_unidades, v_mp_max_area, v_gp_min_area
  from public.porte_config
  where id = true;

  -- dados do processo
  select
    area_construida,
    carater,
    tipologia_habitacional,
    numero_unidades
  into
    v_area, v_carater, v_tipologia, v_unidades
  from public.processos
  where id = p_processo_id;

  if not found then
    raise exception 'Processo % não existe', p_processo_id;
  end if;

  -- normaliza
  v_carater := upper(coalesce(v_carater, ''));
  v_tipologia := upper(coalesce(v_tipologia, ''));
  v_unidades := coalesce(v_unidades, 0);
  v_area := coalesce(v_area, 0);

  -- calcula porte (texto)
  if v_area >= v_gp_min_area then
    v_porte_text := 'GP';

  elsif v_carater = 'HABITACIONAL'
        and v_tipologia in ('UNIFAMILIAR','GEMINADA','SERIADA')
        and v_unidades > 0
        and v_unidades <= v_pp_max_unidades then
    v_porte_text := 'PP';

  elsif (v_carater = 'COMERCIAL' and v_area <= v_mp_max_area)
        or (v_tipologia = 'SERIADA' and v_unidades >= (v_pp_max_unidades + 1) and v_area <= v_mp_max_area) then
    v_porte_text := 'MP';

  else
    -- fallback (dados incompletos): decide por área
    if v_area >= v_gp_min_area then
      v_porte_text := 'GP';
    else
      v_porte_text := 'MP';
    end if;
  end if;

  -- descobre o tipo real do campo processos.porte (enum/udt) e atualiza com cast correto
  select a.atttypid::regtype
    into v_porte_regtype
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public' and c.relname='processos' and a.attname='porte'
    and a.attnum>0 and not a.attisdropped;

  execute format(
    'update public.processos set porte = %L::%s, atualizado_em = now() where id = %L::uuid',
    v_porte_text,
    v_porte_regtype,
    p_processo_id::text
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.recalcular_porte_todos()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  r record;
begin
  for r in select id from public.processos loop
    perform public.recalcular_porte_processo(r.id);
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.registrar_fim_analise()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin

  -- saiu de EM_ANALISE
  if old.status = 'EM_ANALISE'
     and new.status <> 'EM_ANALISE'
     and old.analise_iniciada_em is not null then

     new.tempo_total_analise :=
       now() - old.analise_iniciada_em;

  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.registrar_inicio_analise()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin

  -- entrou em EM_ANALISE
  if new.status = 'EM_ANALISE'
     and old.status <> 'EM_ANALISE' then

     new.analise_iniciada_em := now();

  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.registrar_mudanca_catalogo_mac_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo_processo TEXT;
  v_acao TEXT;
  v_campos JSONB := '{}'::jsonb;
  v_algo_mudou BOOLEAN := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_acao := 'criado';
    v_campos := jsonb_build_object(
      'grupo', jsonb_build_object('de', NULL, 'para', NEW.grupo),
      'texto', jsonb_build_object('de', NULL, 'para', NEW.texto),
      'ref', jsonb_build_object('de', NULL, 'para', NEW.ref),
      'chave_lip', jsonb_build_object('de', NULL, 'para', NEW.chave_lip),
      'fundamento_legal', jsonb_build_object('de', NULL, 'para', NEW.fundamento_legal),
      'condicao_aplicabilidade', jsonb_build_object('de', NULL, 'para', NEW.condicao_aplicabilidade)
    );
    v_algo_mudou := true;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.grupo IS DISTINCT FROM OLD.grupo THEN
      v_campos := v_campos || jsonb_build_object('grupo', jsonb_build_object('de', OLD.grupo, 'para', NEW.grupo));
      v_algo_mudou := true;
    END IF;
    IF NEW.texto IS DISTINCT FROM OLD.texto THEN
      v_campos := v_campos || jsonb_build_object('texto', jsonb_build_object('de', OLD.texto, 'para', NEW.texto));
      v_algo_mudou := true;
    END IF;
    IF NEW.ref IS DISTINCT FROM OLD.ref THEN
      v_campos := v_campos || jsonb_build_object('ref', jsonb_build_object('de', OLD.ref, 'para', NEW.ref));
      v_algo_mudou := true;
    END IF;
    IF NEW.chave_lip IS DISTINCT FROM OLD.chave_lip THEN
      v_campos := v_campos || jsonb_build_object('chave_lip', jsonb_build_object('de', OLD.chave_lip, 'para', NEW.chave_lip));
      v_algo_mudou := true;
    END IF;
    IF NEW.fundamento_legal IS DISTINCT FROM OLD.fundamento_legal THEN
      v_campos := v_campos || jsonb_build_object('fundamento_legal', jsonb_build_object('de', OLD.fundamento_legal, 'para', NEW.fundamento_legal));
      v_algo_mudou := true;
    END IF;
    IF NEW.condicao_aplicabilidade IS DISTINCT FROM OLD.condicao_aplicabilidade THEN
      v_campos := v_campos || jsonb_build_object('condicao_aplicabilidade', jsonb_build_object('de', OLD.condicao_aplicabilidade, 'para', NEW.condicao_aplicabilidade));
      v_algo_mudou := true;
    END IF;
    IF NEW.ordem IS DISTINCT FROM OLD.ordem THEN
      v_campos := v_campos || jsonb_build_object('ordem', jsonb_build_object('de', OLD.ordem, 'para', NEW.ordem));
      v_algo_mudou := true;
    END IF;
    IF NEW.ativo IS DISTINCT FROM OLD.ativo THEN
      v_campos := v_campos || jsonb_build_object('ativo', jsonb_build_object('de', OLD.ativo, 'para', NEW.ativo));
      v_algo_mudou := true;
    END IF;

    IF NOT v_algo_mudou THEN
      RETURN NEW;
    END IF;

    IF OLD.ativo IS TRUE AND NEW.ativo IS FALSE THEN
      v_acao := 'desativado';
    ELSIF OLD.ativo IS FALSE AND NEW.ativo IS TRUE THEN
      v_acao := 'reativado';
    ELSE
      v_acao := 'atualizado';
    END IF;

  ELSE
    RETURN NEW;
  END IF;

  SELECT tipo_processo INTO v_tipo_processo FROM mac_checklist_modelos WHERE id = NEW.modelo_id;

  -- Único ajuste desta migration em relação à Fase D: prefere NEW.alterado_por (a rota
  -- identificou o usuário de verdade) e só cai pra auth.uid() se a rota não informou.
  INSERT INTO mac_checklist_itens_historico (item_id, modelo_id, tipo_processo, acao, campos_alterados, registrado_por)
  VALUES (NEW.id, NEW.modelo_id, v_tipo_processo, v_acao, v_campos, COALESCE(NEW.alterado_por, auth.uid()));

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.req_headers()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
$function$
;

CREATE OR REPLACE FUNCTION public.req_ip()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(
    public.req_headers()->>'x-forwarded-for',
    public.req_headers()->>'x-real-ip',
    public.req_headers()->>'cf-connecting-ip',
    null
  );
$function$
;

CREATE OR REPLACE FUNCTION public.req_user_agent()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select public.req_headers()->>'user-agent';
$function$
;

CREATE OR REPLACE FUNCTION public.retomar_force(p_processo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  update public.processos
     set status = 'EM_ANALISE'::public.status_processo_enum,
         atualizado_em = now()
   where id = p_processo_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_atualizado_em()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.atualizado_em = NOW(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_limit(real)
 RETURNS real
 LANGUAGE c
 STRICT
AS '$libdir/pg_trgm', $function$set_limit$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.show_limit()
 RETURNS real
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_limit$function$
;

CREATE OR REPLACE FUNCTION public.show_trgm(text)
 RETURNS text[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_trgm$function$
;

CREATE OR REPLACE FUNCTION public.similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity$function$
;

CREATE OR REPLACE FUNCTION public.similarity_dist(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_dist$function$
;

CREATE OR REPLACE FUNCTION public.similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_op$function$
;

CREATE OR REPLACE FUNCTION public.solicitar_etapa6(p_processo_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  sid uuid;
begin
  insert into public.solicitacoes_etapa6 (processo_id, solicitado_por_equipe_id, observacao)
  values (p_processo_id, public.current_equipe_id(), p_observacao)
  returning id into sid;

  return sid;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec(sparsevec, integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_cmp(sparsevec, sparsevec)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_cmp$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_eq(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_eq$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_ge(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_ge$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_gt(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_gt$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_in(cstring, oid, integer)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_in$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_l2_squared_distance(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l2_squared_distance$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_le(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_le$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_lt(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_lt$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_ne(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_ne$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_negative_inner_product(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_negative_inner_product$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_out(sparsevec)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_out$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_recv(internal, oid, integer)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_recv$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_send(sparsevec)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_send$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_to_halfvec(sparsevec, integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_to_halfvec$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_to_vector(sparsevec, integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_to_vector$function$
;

CREATE OR REPLACE FUNCTION public.sparsevec_typmod_in(cstring[])
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_typmod_in$function$
;

CREATE OR REPLACE FUNCTION public.start_analise(p_processo_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_modelo_id uuid;
  v_instancia_id uuid;

  v_fk_col text;            -- coluna FK do modelo em checklist_modelo_itens
  v_sql text;
begin
  -- 1) modelo do processo
  select p.checklist_modelo_id
    into v_modelo_id
  from public.processos p
  where p.id = p_processo_id;

  if v_modelo_id is null then
    raise exception 'Processo não possui checklist_modelo_id (associe um modelo antes de iniciar).';
  end if;

  -- 2) cria instância (modelo_id é NOT NULL, então aqui é obrigatório preencher)
  insert into public.checklist_instancias (id, processo_id, modelo_id, criado_em)
  values (gen_random_uuid(), p_processo_id, v_modelo_id, now())
  returning id into v_instancia_id;

  -- 3) descobrir como a tabela public.checklist_modelo_itens referencia o modelo:
  --    pode ser checklist_modelo_id OU modelo_id (vamos aceitar os dois)
  if exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='checklist_modelo_itens'
      and column_name='checklist_modelo_id'
  ) then
    v_fk_col := 'checklist_modelo_id';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='checklist_modelo_itens'
      and column_name='modelo_id'
  ) then
    v_fk_col := 'modelo_id';
  else
    raise exception 'A tabela public.checklist_modelo_itens não tem nem checklist_modelo_id nem modelo_id.';
  end if;

  -- 4) clonar itens do modelo para a instância
  --    Obs: vamos inserir o máximo de campos comuns. Se sua checklist_itens_instancia tiver mais colunas,
  --    isso não quebra (colunas extras ficam com default/null).
  --
  --    Esperado existir (pelo menos): instancia_id, item_modelo_id, ordem
  v_sql := format($f$
    insert into public.checklist_itens_instancia
      (instancia_id, item_modelo_id, ordem, tema, base_normativa, item_texto, pendencia_texto_padrao, atualizado_por_auth_uid)
    select
      %L::uuid as instancia_id,
      i.id::uuid as item_modelo_id,
      i.ordem::int as ordem,
      i.tema::text,
      i.base_normativa::text,
      i.item_texto::text,
      i.pendencia_texto_padrao::text,
      auth.uid() as atualizado_por_auth_uid
    from public.checklist_modelo_itens i
    where i.%I = %L::uuid
      and coalesce(i.ativo, true) = true
    order by i.ordem;
  $f$, v_instancia_id::text, v_fk_col, v_modelo_id::text);

  execute v_sql;

  return v_instancia_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_etapa_timer(p_etapa_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_processo uuid;
begin
  select processo_id into v_processo from public.processo_etapas where id = p_etapa_id;

  if v_processo is null then
    raise exception 'Etapa não encontrada.';
  end if;

  if exists (
    select 1 from public.etapa_tempo_sessoes
    where etapa_id = p_etapa_id and finalizado_em is null
  ) then
    return;
  end if;

  insert into public.etapa_tempo_sessoes (processo_id, etapa_id, iniciado_por_auth_uid)
  values (v_processo, p_etapa_id, auth.uid());
end;
$function$
;

CREATE OR REPLACE FUNCTION public.stop_etapa_timer(p_etapa_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.etapa_tempo_sessoes
  set finalizado_em = now(),
      finalizado_por_auth_uid = auth.uid(),
      motivo_pausa = p_motivo
  where etapa_id = p_etapa_id
    and finalizado_em is null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_op$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_op$function$
;

CREATE OR REPLACE FUNCTION public.subvector(vector, integer, integer)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$subvector$function$
;

CREATE OR REPLACE FUNCTION public.subvector(halfvec, integer, integer)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_subvector$function$
;

CREATE OR REPLACE FUNCTION public.trg_alerta_processos_sensiveis()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (new.porte is distinct from old.porte)
     or (new.tipo_processo is distinct from old.tipo_processo)
     or (new.gerencia is distinct from old.gerencia)
     or (new.diretoria is distinct from old.diretoria)
  then
    insert into public.alertas (processo_id, tabela, tipo, mensagem, criado_por_auth_uid)
    values (
      new.id,
      'processos',
      'SENSIVEL',
      'Alteração sensível em PROCESSOS (porte/tipo/gerência/diretoria). Ver auditoria.',
      auth.uid()
    );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_auditoria_generica()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'INSERT') then
    insert into public.auditoria_log
      (tabela, operacao, registro_id, usuario_auth_uid, dados_depois, ip, user_agent, request_headers)
    values
      (tg_table_name, tg_op, new.id, auth.uid(), to_jsonb(new), public.req_ip(), public.req_user_agent(), public.req_headers());
    return new;

  elsif (tg_op = 'UPDATE') then
    insert into public.auditoria_log
      (tabela, operacao, registro_id, usuario_auth_uid, dados_antes, dados_depois, ip, user_agent, request_headers)
    values
      (tg_table_name, tg_op, new.id, auth.uid(), to_jsonb(old), to_jsonb(new), public.req_ip(), public.req_user_agent(), public.req_headers());
    return new;

  elsif (tg_op = 'DELETE') then
    insert into public.auditoria_log
      (tabela, operacao, registro_id, usuario_auth_uid, dados_antes, ip, user_agent, request_headers)
    values
      (tg_table_name, tg_op, old.id, auth.uid(), to_jsonb(old), public.req_ip(), public.req_user_agent(), public.req_headers());
    return old;
  end if;

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_block_checklist_model_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_has_instancia boolean;
  v_has_despacho boolean;
begin
  if new.checklist_modelo_id is distinct from old.checklist_modelo_id then
    select exists(
      select 1 from public.checklist_instancias ci
      where ci.processo_id = old.id
    ) into v_has_instancia;

    select exists(
      select 1 from public.processo_etapas pe
      where pe.processo_id = old.id
        and pe.tipo_etapa = 'DESPACHO'::public.tipo_etapa_enum
    ) into v_has_despacho;

    if v_has_instancia or v_has_despacho then
      raise exception
        'Não pode trocar checklist_modelo_id: análise já iniciada (instância criada) ou já houve DESPACHO no processo.';
    end if;
  end if;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_bloquear_etapa6()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  -- ajuste aqui se você usa outro critério pra “etapa 6”:
  -- (a) numero = 6  OU  (b) tipo_etapa = 'DESPACHO'
  if (new.numero = 6) or (new.tipo_etapa::text = 'DESPACHO') then
    if not (public.has_role('ADM') or public.has_role('DIRETOR')) then
      raise exception 'Somente DIRETOR ou ADM pode criar/alterar a etapa 6 (DESPACHO).';
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_bloqueia_etapa6_sem_autorizacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- numero é o contador da etapa (int2). Se for 6, exige ADM ou DIRETOR
  if new.numero = 6 then
    if not (public.has_role('ADM') or public.has_role('DIRETOR')) then
      raise exception 'Etapa 6 exige autorização de DIRETOR ou ADM.';
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_contar_interacao_checklist()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin

  insert into public.checklist_item_estatistica (
    item_modelo_id,
    total_cliques,
    total_pendencias
  )
  values (
    new.item_modelo_id,
    1,
    case when new.status = 'PENDENTE' then 1 else 0 end
  )
  on conflict (item_modelo_id)
  do update set
    total_cliques = checklist_item_estatistica.total_cliques + 1,
    total_pendencias =
      checklist_item_estatistica.total_pendencias +
      case when new.status = 'PENDENTE' then 1 else 0 end,
    atualizado_em = now();

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_fill_gerencia_diretoria_processos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.analista_id is not null then
    select e.gerencia, coalesce(e.diretoria,'DIRAAP')
      into new.gerencia, new.diretoria
    from public.equipe e
    where e.id = new.analista_id;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_fill_processo_id_assinatura()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.processo_id is null then
    select pe.processo_id into new.processo_id
    from public.processo_etapas pe
    where pe.id = new.etapa_id;

    if new.processo_id is null then
      raise exception 'Etapa inválida: não encontrei processo_id.';
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_limpar_retorno_ao_iniciar()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- quando o processo ganha iniciado_em pela primeira vez, deixa de ser retorno
  if new.iniciado_em is not null and old.iniciado_em is null then
    new.eh_retorno := false;
    -- mantém retorno_em para histórico, mas não usa mais na fila
    begin
      perform public.log_processo_evento(new.id, 'ANALISE_INICIADA', jsonb_build_object('iniciado_em', new.iniciado_em));
    exception when undefined_function then
      null;
    end;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_pause_timer_na_assinatura()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.stop_etapa_timer(new.etapa_id, 'Assinatura: ' || new.papel_assinatura);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_processos_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  insert into public.processo_tempo (processo_id, em_execucao, total_segundos, ultimo_movimento, finalizado)
  values (new.id, false, 0, now(), false)
  on conflict (processo_id) do nothing;

  insert into public.processo_eventos (processo_id, equipe_id, evento, detalhe)
  values (new.id, public.current_equipe_id(), 'CRIADO', 'Processo cadastrado');

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_processos_after_update_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  delta_seconds bigint;
begin
  -- só roda quando status mudar
  if new.status is distinct from old.status then

    -- 1) Se estava rodando, acumula tempo até agora (antes de qualquer mudança)
    if exists (select 1 from public.processo_tempo pt where pt.processo_id = new.id and pt.em_execucao = true) then
      update public.processo_tempo
      set
        total_segundos = total_segundos + extract(epoch from (now() - inicio_at))::bigint,
        em_execucao = false,
        inicio_at = null,
        ultimo_movimento = now()
      where processo_id = new.id;
    else
      -- mesmo sem rodar, marca movimento
      update public.processo_tempo
      set ultimo_movimento = now()
      where processo_id = new.id;
    end if;

    -- 2) Registra evento de troca de status
    insert into public.processo_eventos (processo_id, equipe_id, evento, detalhe)
    values (
      new.id,
      public.current_equipe_id(),
      'STATUS',
      'De ' || coalesce(old.status::text,'(null)') || ' para ' || coalesce(new.status::text,'(null)')
    );

    -- 3) Ações por status novo
    if new.status = 'EM_ANALISE'::public.status_processo_enum then
      -- inicia/retoma
      update public.processo_tempo
      set em_execucao = true, inicio_at = now(), ultimo_movimento = now()
      where processo_id = new.id and finalizado = false;

      insert into public.processo_eventos (processo_id, equipe_id, evento, detalhe)
      values (new.id, public.current_equipe_id(), 'INICIO_ANALISE', 'Cronômetro iniciado/retomado');

    elsif new.status = 'AGUARDANDO_INTERESSADO'::public.status_processo_enum then
      -- já pausou acima (se estava rodando)
      insert into public.processo_eventos (processo_id, equipe_id, evento, detalhe)
      values (new.id, public.current_equipe_id(), 'PAUSA', 'Aguardando interessado');

    elsif new.status in (
      'APROVADO'::public.status_processo_enum,
      'INDEFERIDO'::public.status_processo_enum,
      'ARQUIVADO'::public.status_processo_enum
    ) then
      -- finaliza
      update public.processo_tempo
      set finalizado = true, finalizado_em = now(), ultimo_movimento = now()
      where processo_id = new.id;

      insert into public.processo_eventos (processo_id, equipe_id, evento, detalhe)
      values (new.id, public.current_equipe_id(), 'FINALIZADO', 'Processo finalizado pelo status');
    end if;

  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_processos_imutavel_final()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if old.status in (
    'CONCLUIDO'::public.status_processo_enum,
    'ARQUIVADO'::public.status_processo_enum,
    'INDEFERIDO'::public.status_processo_enum
  ) then

    if coalesce(new.edicao_autorizada,false) is true then
      if coalesce(nullif(trim(new.edicao_autorizada_motivo),''),'') = '' then
        raise exception 'Edição autorizada exige MOTIVO (edicao_autorizada_motivo).';
      end if;

      -- consome a autorização (volta pra false) depois da edição
      new.edicao_autorizada := false;
      new.edicao_autorizada_por := null;
      new.edicao_autorizada_motivo := null;

    else
      if (new.numero_sei is distinct from old.numero_sei)
      or (new.numero_processo_fisico is distinct from old.numero_processo_fisico)
      or (new.numero_os is distinct from old.numero_os)
      or (new.numero_projeto is distinct from old.numero_projeto)
      or (new.tipo_processo is distinct from old.tipo_processo)
      or (new.porte is distinct from old.porte)
      or (new.area_construida is distinct from old.area_construida)
      or (new.analista_id is distinct from old.analista_id)
      or (new.gerencia is distinct from old.gerencia)
      or (new.diretoria is distinct from old.diretoria)
      then
        raise exception 'Processo finalizado: campos-chave imutáveis. Necessário edicao_autorizada=true + motivo.';
      end if;
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_processos_status_precisa_assinatura()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  ok_analista boolean;
  ok_gerente  boolean;
  ok_diradm   boolean;
  doc public.tipo_documento_enum;
begin
  if new.status is distinct from old.status then

    if new.status in (
      'CONCLUIDO'::public.status_processo_enum,
      'ARQUIVADO'::public.status_processo_enum,
      'INDEFERIDO'::public.status_processo_enum
    ) then

      if new.status = 'CONCLUIDO'::public.status_processo_enum then
        doc := 'LAUDO'::public.tipo_documento_enum;
      elsif new.status = 'ARQUIVADO'::public.status_processo_enum then
        doc := 'ARQUIVAMENTO'::public.tipo_documento_enum;
      else
        doc := 'INDEFERIMENTO'::public.tipo_documento_enum;
      end if;

      select exists (
        select 1 from public.assinaturas a
        where a.processo_id = old.id
          and a.tipo_documento = doc
          and a.papel_assinatura = 'ANALISTA'::public.papel_assinatura_enum
          and a.assinado_em is not null
      ) into ok_analista;

      select exists (
        select 1 from public.assinaturas a
        where a.processo_id = old.id
          and a.tipo_documento = doc
          and a.papel_assinatura = 'GERENTE'::public.papel_assinatura_enum
          and a.assinado_em is not null
      ) into ok_gerente;

      select exists (
        select 1 from public.assinaturas a
        where a.processo_id = old.id
          and a.tipo_documento = doc
          and a.papel_assinatura in ('DIRETOR'::public.papel_assinatura_enum,'ADM'::public.papel_assinatura_enum)
          and a.assinado_em is not null
      ) into ok_diradm;

      if not (ok_analista and ok_gerente and ok_diradm) then
        raise exception 'Para mudar STATUS para %, exige assinaturas (%): ANALISTA + GERENTE + DIRETOR/ADM.', new.status, doc;
      end if;

    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_processos_validar_ids()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- valida cada campo se estiver preenchido
  perform public.validar_identificador('SEI',     new.numero_sei);
  perform public.validar_identificador('OS',      new.numero_os);
  perform public.validar_identificador('PROJETO', new.numero_projeto);
  perform public.validar_identificador('FISICO',  new.numero_processo_fisico);

  -- opcional: já salvar normalizado (maiúsculo/trim)
  new.numero_sei := public._norm_txt(new.numero_sei);
  new.numero_os := public._norm_txt(new.numero_os);
  new.numero_projeto := public._norm_txt(new.numero_projeto);
  new.numero_processo_fisico := public._norm_txt(new.numero_processo_fisico);

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_rh_log_equipe()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  insert into public.rh_log(
    usuario_afetado,
    acao,
    dados_anteriores,
    dados_novos,
    executado_por
  )
  values (
    coalesce(new.matricula, old.matricula),
    case
      when tg_op = 'INSERT' then 'CRIACAO'
      when tg_op = 'UPDATE' then 'ATUALIZACAO'
      when tg_op = 'DELETE' then 'EXCLUSAO'
      else tg_op
    end,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old.*) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new.*) else null end,
    current_user::text
  );

  return coalesce(new, old);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_set_etapa_numero()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  prox smallint;
begin
  select coalesce(max(numero), 0) + 1
    into prox
  from public.processo_etapas
  where processo_id = new.processo_id
    and tipo_etapa = new.tipo_etapa;

  new.numero := prox;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_status_por_etapa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text;
begin
  -- mapeamento (ajuste os textos como você quiser)
  v_status :=
    case new.numero
      when 1 then 'Cadastrado'
      when 2 then 'Em análise'
      when 3 then 'Em diligência'
      when 4 then 'Despacho'
      when 5 then 'Aguardando autorização'
      when 6 then 'Finalizado'
      else null
    end;

  if v_status is not null then
    update public.processos
    set status = v_status
    where id = new.processo_id;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_validar_assinatura()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_etapa_tipo public.tipo_etapa_enum;
  v_analista_id uuid;
begin
  -- quem está assinando
  new.assinado_por_auth_uid := auth.uid();

  -- pega tipo da etapa e analista do processo
  select pe.tipo_etapa, p.analista_id
    into v_etapa_tipo, v_analista_id
  from public.processo_etapas pe
  join public.processos p on p.id = pe.processo_id
  where pe.id = new.etapa_id;

  if v_etapa_tipo is null then
    raise exception 'Etapa não encontrada para assinatura.';
  end if;

  -- override: ADM ou DIRETOR assina qualquer coisa
  if public.has_role('ADM') or public.has_role('DIRETOR') then
    return new;
  end if;

  -- regra: o analista do processo pode assinar como ANALISTA
  if new.papel_assinatura = 'ANALISTA' then
    if public.current_equipe_id() <> v_analista_id then
      raise exception 'Somente o analista responsável pode assinar como ANALISTA.';
    end if;
  end if;

  -- DESPACHO: somente ANALISTA (no MVP)
  if v_etapa_tipo = 'DESPACHO'::public.tipo_etapa_enum then
    if new.papel_assinatura <> 'ANALISTA' then
      raise exception 'Despacho é assinado apenas pelo ANALISTA.';
    end if;
    return new;
  end if;

  -- LAUDO/INDEFERIMENTO/ARQUIVAMENTO: cada papel assina o seu
  if new.papel_assinatura = 'GERENTE' then
    if not public.has_role('GERENTE') then
      raise exception 'Somente GERENTE pode assinar como GERENTE.';
    end if;
  elsif new.papel_assinatura = 'DIRETOR' then
    if not public.has_role('DIRETOR') then
      raise exception 'Somente DIRETOR pode assinar como DIRETOR.';
    end if;
  elsif new.papel_assinatura = 'ADM' then
    if not public.has_role('ADM') then
      raise exception 'Somente ADM pode assinar como ADM.';
    end if;
  elsif new.papel_assinatura = 'ANALISTA' then
    -- já validado acima
    null;
  else
    raise exception 'papel_assinatura inválido.';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_atualizado_em()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.urbis_admin_desativar_usuario(p_matricula text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  update public.equipe
     set ativo = false
   where matricula = p_matricula;
$function$
;

CREATE OR REPLACE FUNCTION public.urbis_admin_upsert_usuario(p_nome text, p_email text, p_matricula text, p_papel text, p_gerencia text, p_diretoria text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin

    insert into public.equipe (
        id,
        nome,
        email,
        matricula,
        papel,
        gerencia,
        diretoria,
        ativo
    )
    values (
        gen_random_uuid(),
        p_nome,
        p_email,
        p_matricula,
        p_papel,
        p_gerencia,
        p_diretoria,
        true
    )
    on conflict (matricula)
    do update set
        nome = excluded.nome,
        email = excluded.email,
        papel = excluded.papel,
        gerencia = excluded.gerencia,
        diretoria = excluded.diretoria;

end;
$function$
;

CREATE OR REPLACE FUNCTION public.urbis_admin_upsert_usuario(p_nome text, p_email text, p_matricula text, p_papel text, p_gerencia text, p_diretoria text, p_executor text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
    v_antigo jsonb;
begin

    select to_jsonb(e.*)
    into v_antigo
    from public.equipe e
    where e.matricula = p_matricula;

    insert into public.equipe (
        id,
        nome,
        email,
        matricula,
        papel,
        gerencia,
        diretoria,
        ativo
    )
    values (
        gen_random_uuid(),
        p_nome,
        p_email,
        p_matricula,
        p_papel,
        p_gerencia,
        p_diretoria,
        true
    )
    on conflict (matricula)
    do update set
        nome = excluded.nome,
        email = excluded.email,
        papel = excluded.papel,
        gerencia = excluded.gerencia,
        diretoria = excluded.diretoria;

    insert into public.rh_log (
        usuario_afetado,
        acao,
        dados_anteriores,
        dados_novos,
        executado_por
    )
    values (
        p_matricula,
        case when v_antigo is null then 'CRIACAO' else 'ATUALIZACAO' end,
        v_antigo,
        jsonb_build_object(
            'nome', p_nome,
            'email', p_email,
            'papel', p_papel,
            'gerencia', p_gerencia,
            'diretoria', p_diretoria
        ),
        p_executor
    );

end;
$function$
;

CREATE OR REPLACE FUNCTION public.urbis_aplicar_regra_181(p_processo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_dias int;
  v_bloqueado boolean;
  v_sev text := 'INFO';
begin
  perform public.urbis_recalcular_prazo_181(p_processo_id);

  select dias_corridos_sem_retorno, bloqueado
    into v_dias, v_bloqueado
  from public.processo_prazo_interessado
  where processo_id = p_processo_id;

  if v_dias is null then
    return;
  end if;

  if v_dias >= 180 then
    v_sev := 'VERMELHO';
  elsif v_dias >= 170 then
    v_sev := 'LARANJA';
  elsif v_dias >= 160 then
    v_sev := 'AMARELO';
  end if;

  -- Notificação preventiva (160/170/180)
  if v_dias >= 160 then
    insert into public.urbis_notificacoes (processo_id, titulo, mensagem, severidade, destino, payload)
    values (
      p_processo_id,
      'Prazo do interessado avançado',
      format('Processo com %s dias corridos sem retorno do interessado.', v_dias),
      v_sev,
      'DIRETORIA',
      jsonb_build_object('dias', v_dias, 'regra', 'RDP_181')
    );
  end if;

  -- Bloqueio efetivo
  if v_dias >= 180 and coalesce(v_bloqueado,false) = false then
    update public.processo_prazo_interessado
      set bloqueado = true,
          bloqueado_em = now(),
          atualizado_em = now(),
          atualizado_por_auth_uid = auth.uid()
    where processo_id = p_processo_id;

    -- tenta mudar status do processo, se existir coluna status e enum
    begin
      update public.processos
         set status = 'BLOQUEADO_PRAZO_181'::public.status_processo_enum
       where id = p_processo_id;
    exception when others then
      -- se não conseguir (schema diferente), não quebra o motor do prazo
      null;
    end;

    insert into public.urbis_logs (processo_id, acao, detalhe, actor_auth_uid)
    values (
      p_processo_id,
      'BLOQUEIO_PRAZO_181',
      jsonb_build_object('dias', v_dias, 'motivo', 'Decurso de prazo em poder do interessado (>=180 dias)'),
      auth.uid()
    );

    insert into public.urbis_notificacoes (processo_id, titulo, mensagem, severidade, destino, payload)
    values (
      p_processo_id,
      'Processo BLOQUEADO por prazo (Regra 181)',
      format('Processo bloqueado: %s dias sem retorno do interessado. Única ação permitida: despacho padrão de prazo (salvo liberação excepcional).', v_dias),
      'VERMELHO',
      'DIRETORIA',
      jsonb_build_object('dias', v_dias, 'regra', 'RDP_181', 'acao_permitida', 'DESPACHO_PADRAO_PRAZO')
    );
  end if;

end $function$
;

CREATE OR REPLACE FUNCTION public.urbis_iniciar_analise(p_matricula text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
    v_processo uuid;
begin

    -- pega automaticamente o próximo processo da fila
    select processo_id
    into v_processo
    from public.fila_do_analista(p_matricula)
    order by pos
    limit 1;

    if v_processo is null then
        raise exception 'Nenhum processo disponível na fila';
    end if;

    -- atualiza status do processo
    update public.processos
    set
        status = 'EM_ANALISE',
        atualizado_em = now()
    where id = v_processo;

    -- grava histórico obrigatório
    insert into public.processo_eventos (
        id,
        processo_id,
        matricula,
        evento,
        criado_em
    )
    values (
        gen_random_uuid(),
        v_processo,
        p_matricula,
        'INICIO_ANALISE',
        now()
    );

    return v_processo;

end;
$function$
;

CREATE OR REPLACE FUNCTION public.urbis_liberar_prazo_181(p_processo_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  update public.processo_prazo_interessado
    set bloqueado = false,
        desbloqueado_em = now(),
        desbloqueado_motivo = p_motivo,
        desbloqueado_por_auth_uid = auth.uid(),
        atualizado_em = now(),
        atualizado_por_auth_uid = auth.uid()
  where processo_id = p_processo_id;

  insert into public.urbis_logs (processo_id, acao, detalhe, actor_auth_uid)
  values (
    p_processo_id,
    'LIBERACAO_EXCEPCIONAL_PRAZO_181',
    jsonb_build_object('motivo', p_motivo),
    auth.uid()
  );

  insert into public.urbis_notificacoes (processo_id, titulo, mensagem, severidade, destino, payload)
  values (
    p_processo_id,
    'Liberação excepcional do bloqueio de prazo',
    'Diretoria/ADM liberou a análise excepcionalmente (log sensível).',
    'INFO',
    'ADM',
    jsonb_build_object('regra', 'RDP_181', 'motivo', p_motivo)
  );

end $function$
;

CREATE OR REPLACE FUNCTION public.urbis_lip_set_ultima_versao()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_next_versao int;
begin
  -- doc_chave automática (se não vier)
  if new.doc_chave is null then
    new.doc_chave :=
      case
        when coalesce(nullif(new.numero_sei,''), '') <> '' then new.numero_sei
        else coalesce(nullif(new.nome_documento,''), new.tipo_documento)
      end;
  end if;

  -- próxima versão
  select coalesce(max(versao), 0) + 1
    into v_next_versao
  from public.urbis_lip_documentos
  where processo_id = new.processo_id
    and tipo_documento = new.tipo_documento
    and doc_chave = new.doc_chave;

  if new.versao is null then
    new.versao := v_next_versao;
  end if;

  -- derruba as antigas
  update public.urbis_lip_documentos
     set eh_ultima_versao = false
   where processo_id = new.processo_id
     and tipo_documento = new.tipo_documento
     and doc_chave = new.doc_chave;

  -- o novo vira a última
  new.eh_ultima_versao := true;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.urbis_notificacao_arquivar(p_id uuid, p_matricula text)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
begin
  update public.notificacoes
     set arquivada_em = coalesce(arquivada_em, now())
   where id = p_id
     and para_matricula = p_matricula;

  return found;
end $function$
;

CREATE OR REPLACE FUNCTION public.urbis_notificacao_marcar_lida(p_id uuid, p_matricula text)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
begin
  update public.notificacoes
     set lida_em = coalesce(lida_em, now())
   where id = p_id
     and para_matricula = p_matricula
     and arquivada_em is null;

  return found;
end $function$
;

CREATE OR REPLACE FUNCTION public.urbis_notificar(p_para_matricula text, p_tipo notificacao_tipo_enum, p_titulo text, p_mensagem text, p_prioridade smallint DEFAULT 3, p_processo_id uuid DEFAULT NULL::uuid, p_documento_id uuid DEFAULT NULL::uuid, p_etapa_id uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_criado_por_matricula text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_id uuid;
begin
  insert into public.notificacoes (
    para_matricula, tipo, prioridade, titulo, mensagem,
    processo_id, documento_id, etapa_id, payload, criado_por_matricula
  )
  values (
    p_para_matricula, p_tipo, coalesce(p_prioridade,3), p_titulo, p_mensagem,
    p_processo_id, p_documento_id, p_etapa_id, coalesce(p_payload,'{}'::jsonb), p_criado_por_matricula
  )
  returning id into v_id;

  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.urbis_notificar_inelegibilidade(p_processo_id uuid, p_motivo_curto text, p_matricula_gerente text, p_matricula_diretor text, p_matricula_adm text, p_matricula_analista text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_titulo text;
  v_msg text;
  v_payload jsonb;
begin
  v_titulo := 'Inelegibilidade decretada — assinatura necessária';
  v_msg := 'Processo ' || p_processo_id::text ||
           '. Motivo: ' || coalesce(p_motivo_curto,'(sem motivo informado)') ||
           '. Parecer de indeferimento deve ser assinado (GERENTE → DIRETOR).';

  v_payload := jsonb_build_object(
    'motivo', coalesce(p_motivo_curto,''),
    'acao', 'ASSINAR_INDEFERIMENTO',
    'ordem_assinatura', jsonb_build_array('GERENTE','DIRETOR')
  );

  -- Gerente
  perform public.urbis_notificar(
    p_matricula_gerente, 'INELEGIBILIDADE', v_titulo, v_msg, 1,
    p_processo_id, null, null, v_payload, p_matricula_analista
  );

  -- Diretor
  perform public.urbis_notificar(
    p_matricula_diretor, 'INELEGIBILIDADE', v_titulo, v_msg, 1,
    p_processo_id, null, null, v_payload, p_matricula_analista
  );

  -- ADM (sempre informado)
  perform public.urbis_notificar(
    p_matricula_adm, 'INELEGIBILIDADE', v_titulo, v_msg, 1,
    p_processo_id, null, null, v_payload, p_matricula_analista
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.urbis_proximo_processo_para_analista(p_auth_uid uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select f.processo_id
  from public.fila_do_analista(
    (select e.id from public.equipe e where e.auth_uid = p_auth_uid)
  ) f
  order by f.pos
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.urbis_recalcular_prazo_181(p_processo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_envio timestamptz;
  v_retorno timestamptz;
  v_dias int;
begin
  insert into public.processo_prazo_interessado (processo_id)
  values (p_processo_id)
  on conflict (processo_id) do nothing;

  select data_envio_ao_interessado, data_retorno_do_interessado
    into v_envio, v_retorno
  from public.processo_prazo_interessado
  where processo_id = p_processo_id;

  if v_envio is null then
    -- nunca foi enviado ao interessado -> não conta prazo
    update public.processo_prazo_interessado
      set dias_corridos_sem_retorno = 0,
          atualizado_em = now(),
          atualizado_por_auth_uid = auth.uid()
    where processo_id = p_processo_id;
    return;
  end if;

  if v_retorno is not null and v_retorno >= v_envio then
    -- houve retorno -> zera contagem
    update public.processo_prazo_interessado
      set dias_corridos_sem_retorno = 0,
          bloqueado = false,
          bloqueado_em = null,
          atualizado_em = now(),
          atualizado_por_auth_uid = auth.uid()
    where processo_id = p_processo_id;
    return;
  end if;

  -- sem retorno: calcula dias corridos
  v_dias := (now()::date - v_envio::date);

  update public.processo_prazo_interessado
    set dias_corridos_sem_retorno = greatest(v_dias, 0),
        atualizado_em = now(),
        atualizado_por_auth_uid = auth.uid()
  where processo_id = p_processo_id;

end $function$
;

CREATE OR REPLACE FUNCTION public.urbis_registrar_envio_interessado(p_processo_id uuid, p_data_envio timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  insert into public.processo_prazo_interessado (processo_id, data_envio_ao_interessado, data_retorno_do_interessado, atualizado_em, atualizado_por_auth_uid)
  values (p_processo_id, p_data_envio, null, now(), auth.uid())
  on conflict (processo_id) do update
    set data_envio_ao_interessado = excluded.data_envio_ao_interessado,
        data_retorno_do_interessado = null,
        atualizado_em = now(),
        atualizado_por_auth_uid = auth.uid();

  insert into public.urbis_logs (processo_id, acao, detalhe, actor_auth_uid)
  values (p_processo_id, 'ENVIO_AO_INTERESSADO', jsonb_build_object('data_envio', p_data_envio), auth.uid());

  perform public.urbis_recalcular_prazo_181(p_processo_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.urbis_registrar_retorno_interessado(p_processo_id uuid, p_data_retorno timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  insert into public.processo_prazo_interessado (processo_id, data_retorno_do_interessado, atualizado_em, atualizado_por_auth_uid)
  values (p_processo_id, p_data_retorno, now(), auth.uid())
  on conflict (processo_id) do update
    set data_retorno_do_interessado = excluded.data_retorno_do_interessado,
        atualizado_em = now(),
        atualizado_por_auth_uid = auth.uid();

  insert into public.urbis_logs (processo_id, acao, detalhe, actor_auth_uid)
  values (p_processo_id, 'RETORNO_DO_INTERESSADO', jsonb_build_object('data_retorno', p_data_retorno), auth.uid());

  perform public.urbis_recalcular_prazo_181(p_processo_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.urbis_trim_numero_sei()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.numero_sei is not null then
    new.numero_sei := btrim(new.numero_sei);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.user_roles()
 RETURNS text[]
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(array_agg(distinct er.role order by er.role), '{}'::text[])
  from public.equipe e
  join public.equipe_roles er on er.equipe_id = e.id
  where e.auth_uid = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.validar_identificador(p_tipo text, p_valor text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_valor text;
  v_regex text;
begin
  v_valor := public._norm_txt(p_valor);

  -- se vier vazio/nulo, não valida (campo opcional)
  if v_valor is null then
    return;
  end if;

  select fi.regex_validacao
    into v_regex
  from public.formato_identificadores fi
  where fi.ativo = true
    and upper(fi.tipo_identificador) = upper(p_tipo)
  order by fi.criado_em desc
  limit 1;

  if v_regex is null then
    raise exception 'Sem regex ativa para tipo_identificador="%" (configure em formato_identificadores).', p_tipo
      using errcode = '23514';
  end if;

  if not (v_valor ~ v_regex) then
    raise exception 'Identificador inválido para tipo="%": "%" (regex: %).', p_tipo, v_valor, v_regex
      using errcode = '23514';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.vector(vector, integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector$function$
;

CREATE OR REPLACE FUNCTION public.vector_accum(double precision[], vector)
 RETURNS double precision[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_accum$function$
;

CREATE OR REPLACE FUNCTION public.vector_add(vector, vector)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_add$function$
;

CREATE OR REPLACE FUNCTION public.vector_avg(double precision[])
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_avg$function$
;

CREATE OR REPLACE FUNCTION public.vector_cmp(vector, vector)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_cmp$function$
;

CREATE OR REPLACE FUNCTION public.vector_combine(double precision[], double precision[])
 RETURNS double precision[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_combine$function$
;

CREATE OR REPLACE FUNCTION public.vector_concat(vector, vector)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_concat$function$
;

CREATE OR REPLACE FUNCTION public.vector_dims(vector)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_dims$function$
;

CREATE OR REPLACE FUNCTION public.vector_dims(halfvec)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_vector_dims$function$
;

CREATE OR REPLACE FUNCTION public.vector_eq(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_eq$function$
;

CREATE OR REPLACE FUNCTION public.vector_ge(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_ge$function$
;

CREATE OR REPLACE FUNCTION public.vector_gt(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_gt$function$
;

CREATE OR REPLACE FUNCTION public.vector_in(cstring, oid, integer)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_in$function$
;

CREATE OR REPLACE FUNCTION public.vector_l2_squared_distance(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_l2_squared_distance$function$
;

CREATE OR REPLACE FUNCTION public.vector_le(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_le$function$
;

CREATE OR REPLACE FUNCTION public.vector_lt(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_lt$function$
;

CREATE OR REPLACE FUNCTION public.vector_mul(vector, vector)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_mul$function$
;

CREATE OR REPLACE FUNCTION public.vector_ne(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_ne$function$
;

CREATE OR REPLACE FUNCTION public.vector_negative_inner_product(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_negative_inner_product$function$
;

CREATE OR REPLACE FUNCTION public.vector_norm(vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_norm$function$
;

CREATE OR REPLACE FUNCTION public.vector_out(vector)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_out$function$
;

CREATE OR REPLACE FUNCTION public.vector_recv(internal, oid, integer)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_recv$function$
;

CREATE OR REPLACE FUNCTION public.vector_send(vector)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_send$function$
;

CREATE OR REPLACE FUNCTION public.vector_spherical_distance(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_spherical_distance$function$
;

CREATE OR REPLACE FUNCTION public.vector_sub(vector, vector)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_sub$function$
;

CREATE OR REPLACE FUNCTION public.vector_to_float4(vector, integer, boolean)
 RETURNS real[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_to_float4$function$
;

CREATE OR REPLACE FUNCTION public.vector_to_halfvec(vector, integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_to_halfvec$function$
;

CREATE OR REPLACE FUNCTION public.vector_to_sparsevec(vector, integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_to_sparsevec$function$
;

CREATE OR REPLACE FUNCTION public.vector_typmod_in(cstring[])
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_typmod_in$function$
;

CREATE OR REPLACE FUNCTION public.verificar_conclusao_processo(pid uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  total int;
begin

  select count(distinct papel_assinatura)
  into total
  from public.assinaturas
  where processo_id = pid
  and papel_assinatura in ('ANALISTA','GERENTE','DIRETOR');

  if total = 3 then
     update public.processos
     set status = 'CONCLUIDO'
     where id = pid;
  end if;

end;
$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_op$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_op$function$
;
