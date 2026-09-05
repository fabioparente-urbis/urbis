-- TRIGGERS — inclui os que alimentam tabelas que nenhum codigo escreve
-- Gerado por scripts/extrair_schema.mts em 2026-09-05.
-- NAO EDITE A MAO: regenere.

-- auditoria_eventos
CREATE TRIGGER trg_backup_auditoria_eventos BEFORE DELETE ON public.auditoria_eventos FOR EACH ROW EXECUTE FUNCTION fn_backup_before_delete();

-- auditoria_log
CREATE TRIGGER trg_backup_auditoria_log BEFORE DELETE ON public.auditoria_log FOR EACH ROW EXECUTE FUNCTION fn_backup_before_delete();

-- auditoria_sessoes
CREATE TRIGGER trg_backup_auditoria_sessoes BEFORE DELETE ON public.auditoria_sessoes FOR EACH ROW EXECUTE FUNCTION fn_backup_before_delete();

-- bdi_documentos_lei
CREATE TRIGGER trg_backup_bdi_documentos_lei BEFORE DELETE ON public.bdi_documentos_lei FOR EACH ROW EXECUTE FUNCTION fn_backup_before_delete();

-- bdi_lei_fragmentos
CREATE TRIGGER trg_backup_bdi_lei_fragmentos BEFORE DELETE ON public.bdi_lei_fragmentos FOR EACH ROW EXECUTE FUNCTION fn_backup_before_delete();

-- bip_anotacoes_usuario
CREATE TRIGGER trg_bip_anotacoes_atualizado_em BEFORE UPDATE ON public.bip_anotacoes_usuario FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

-- checklist_itens_instancia
CREATE TRIGGER contar_interacao_checklist AFTER UPDATE ON public.checklist_itens_instancia FOR EACH ROW EXECUTE FUNCTION trg_contar_interacao_checklist();

-- decisoes
CREATE TRIGGER trg_notificar_decisao AFTER INSERT ON public.decisoes FOR EACH ROW EXECUTE FUNCTION fn_notificar_decisao();

-- documentos_processo
CREATE TRIGGER trg_evento_documento_anexado AFTER INSERT ON public.documentos_processo FOR EACH ROW EXECUTE FUNCTION fn_evento_documento_anexado();

-- documentos_processo
CREATE TRIGGER trg_set_atualizado_em_documentos BEFORE UPDATE ON public.documentos_processo FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- equipe
CREATE TRIGGER rh_log_equipe AFTER INSERT OR DELETE OR UPDATE ON public.equipe FOR EACH ROW EXECUTE FUNCTION trg_rh_log_equipe();

-- lip_decisoes_item
CREATE TRIGGER trg_lip_decisoes_item_updated BEFORE UPDATE ON public.lip_decisoes_item FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- lip_prompts
CREATE TRIGGER trg_lip_prompts_atualizado BEFORE UPDATE ON public.lip_prompts FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- mac_checklist_itens
CREATE TRIGGER trg_registrar_mudanca_catalogo_mac_item AFTER INSERT OR UPDATE ON public.mac_checklist_itens FOR EACH ROW EXECUTE FUNCTION registrar_mudanca_catalogo_mac_item();

-- mrp_calendario
CREATE TRIGGER trg_backup_mrp_calendario BEFORE DELETE ON public.mrp_calendario FOR EACH ROW EXECUTE FUNCTION fn_backup_before_delete();

-- mrp_calendario
CREATE TRIGGER trg_mrp_calendario_touch BEFORE UPDATE ON public.mrp_calendario FOR EACH ROW EXECUTE FUNCTION mrp_calendario_touch();

-- mrp_pontuacao
CREATE TRIGGER trg_backup_mrp_pontuacao BEFORE DELETE ON public.mrp_pontuacao FOR EACH ROW EXECUTE FUNCTION fn_backup_before_delete();

-- mrp_registros
CREATE TRIGGER trg_backup_mrp_delete BEFORE DELETE ON public.mrp_registros FOR EACH ROW EXECUTE FUNCTION fn_backup_mrp_antes_delete();

-- processo_documento_ingestao
CREATE TRIGGER trg_normaliza_sei_doc_id BEFORE INSERT OR UPDATE ON public.processo_documento_ingestao FOR EACH ROW EXECUTE FUNCTION normaliza_sei_doc_id();

-- processo_documento_ingestao
CREATE TRIGGER trg_urbis_lip_sync AFTER INSERT OR UPDATE OF status_doc, tipo_documento, nome_arquivo ON public.processo_documento_ingestao FOR EACH ROW EXECUTE FUNCTION fn_urbis_atualiza_lip_por_doc();

-- processo_etapas
CREATE TRIGGER a_set_etapa_numero BEFORE INSERT ON public.processo_etapas FOR EACH ROW EXECUTE FUNCTION trg_set_etapa_numero();

-- processo_etapas
CREATE TRIGGER b_autoriza_etapa6 BEFORE INSERT OR UPDATE ON public.processo_etapas FOR EACH ROW EXECUTE FUNCTION trg_bloquear_etapa6();

-- processo_etapas
CREATE TRIGGER b_limite_despachos BEFORE INSERT ON public.processo_etapas FOR EACH ROW EXECUTE FUNCTION check_limite_despachos();

-- processo_etapas
CREATE TRIGGER c_bloqueia_etapa6 BEFORE INSERT ON public.processo_etapas FOR EACH ROW EXECUTE FUNCTION trg_bloqueia_etapa6_sem_autorizacao();

-- processo_etapas
CREATE TRIGGER z_audit_etapas AFTER INSERT OR DELETE OR UPDATE ON public.processo_etapas FOR EACH ROW EXECUTE FUNCTION trg_auditoria_generica();

-- processo_etapas
CREATE TRIGGER z_status_por_etapa AFTER INSERT ON public.processo_etapas FOR EACH ROW EXECUTE FUNCTION trg_status_por_etapa();

-- processos
CREATE TRIGGER a_fill_gerencia_diretoria BEFORE INSERT ON public.processos FOR EACH ROW EXECUTE FUNCTION trg_fill_gerencia_diretoria_processos();

-- processos
CREATE TRIGGER b_block_checklist_model_change BEFORE UPDATE OF checklist_modelo_id ON public.processos FOR EACH ROW EXECUTE FUNCTION trg_block_checklist_model_change();

-- processos
CREATE TRIGGER limpar_retorno_ao_iniciar BEFORE UPDATE ON public.processos FOR EACH ROW EXECUTE FUNCTION trg_limpar_retorno_ao_iniciar();

-- processos
CREATE TRIGGER processos_after_insert AFTER INSERT ON public.processos FOR EACH ROW EXECUTE FUNCTION trg_processos_after_insert();

-- processos
CREATE TRIGGER processos_after_update_status AFTER UPDATE OF status ON public.processos FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION fn_evento_status_alterado();

-- processos
CREATE TRIGGER processos_imutavel_final BEFORE UPDATE ON public.processos FOR EACH ROW EXECUTE FUNCTION trg_processos_imutavel_final();

-- processos
CREATE TRIGGER processos_status_precisa_assinatura BEFORE UPDATE OF status ON public.processos FOR EACH ROW EXECUTE FUNCTION trg_processos_status_precisa_assinatura();

-- processos
CREATE TRIGGER processos_validar_ids BEFORE INSERT OR UPDATE ON public.processos FOR EACH ROW EXECUTE FUNCTION trg_processos_validar_ids();

-- processos
CREATE TRIGGER trg_block_all_processo_updates_non_admin BEFORE UPDATE ON public.processos FOR EACH ROW EXECUTE FUNCTION block_all_processo_updates_non_admin();

-- processos
CREATE TRIGGER trg_evento_status AFTER UPDATE OF status ON public.processos FOR EACH ROW EXECUTE FUNCTION fn_evento_status_alterado();

-- processos
CREATE TRIGGER trg_fim_analise AFTER UPDATE ON public.processos FOR EACH ROW EXECUTE FUNCTION registrar_fim_analise();

-- processos
CREATE TRIGGER trg_processo_criado AFTER INSERT ON public.processos FOR EACH ROW EXECUTE FUNCTION fn_evento_processo_criado();

-- processos
CREATE TRIGGER trg_registrar_fim_analise BEFORE UPDATE ON public.processos FOR EACH ROW EXECUTE FUNCTION registrar_fim_analise();

-- processos
CREATE TRIGGER trg_registrar_inicio_analise BEFORE UPDATE ON public.processos FOR EACH ROW EXECUTE FUNCTION registrar_inicio_analise();

-- processos
CREATE TRIGGER trg_trim_numero_sei BEFORE INSERT OR UPDATE ON public.processos FOR EACH ROW EXECUTE FUNCTION urbis_trim_numero_sei();

-- processos
CREATE TRIGGER y_alerta_sensiveis_processos AFTER UPDATE ON public.processos FOR EACH ROW EXECUTE FUNCTION trg_alerta_processos_sensiveis();

-- processos
CREATE TRIGGER z_audit_processos AFTER INSERT OR DELETE OR UPDATE ON public.processos FOR EACH ROW EXECUTE FUNCTION trg_auditoria_generica();

-- urbis_lip_documentos
CREATE TRIGGER trg_lip_set_ultima_versao BEFORE INSERT ON public.urbis_lip_documentos FOR EACH ROW EXECUTE FUNCTION urbis_lip_set_ultima_versao();

-- urbis_sessoes
CREATE TRIGGER trg_backup_sessoes_delete BEFORE DELETE ON public.urbis_sessoes FOR EACH ROW EXECUTE FUNCTION fn_backup_sessoes_antes_delete();

-- urbis_sessoes
CREATE TRIGGER trg_calcular_duracao_sessao BEFORE UPDATE ON public.urbis_sessoes FOR EACH ROW EXECUTE FUNCTION calcular_duracao_sessao();
