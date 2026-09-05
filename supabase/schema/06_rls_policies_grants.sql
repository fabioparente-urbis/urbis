-- RLS, POLICIES E GRANTS — estado real apos a trava de 01/09/2026
-- Gerado por scripts/extrair_schema.mts em 2026-09-05.
-- NAO EDITE A MAO: regenere.

-- Tabelas sem RLS ativo (3 de 125):
--   mac_checklist_itens_historico
--   mac_vinculos_propostas
--   urbi_sugestoes

-- RLS ativo:
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analise_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analises_mac ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assuntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_eventos_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_log_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_sessoes_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bdi_documentos_lei ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bdi_documentos_lei_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bdi_lei_fragmentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bdi_lei_fragmentos_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bdi_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bip_anotacoes_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bip_historico_anotacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadastro_processo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_instancias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_item_estatistica ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_itens_instancia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_modelo_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_modelos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_respostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_urbis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decisoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despacho_padroes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despachos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diretorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_lidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_processo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe_gerencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etapa_tempo_sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formato_identificadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gerencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impeditivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.limites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lip_abas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lip_campos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lip_decisoes_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lip_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lip_processo_atual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lip_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lip_prompts_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lip_resultados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logradouros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mac_bip_vinculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mac_checklist_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mac_checklist_modelos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mac_execucoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mac_glossario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mac_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mac_lip_vinculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mac_resultados_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mac_resultados_revisoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mac_slot5_filtros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mdp_registros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mhd_conteudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mhd_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mhd_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mhd_interpretacoes_visao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mhd_resultados_campo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mhd_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrp_calendario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrp_calendario_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrp_meta_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrp_pontuacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrp_pontuacao_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrp_pontuacao_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrp_registros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrp_registros_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obs_cod ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.papeis_ativos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.porte_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processo_checklist_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processo_documento_ingestao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processo_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processo_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processo_fila_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processo_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processo_prazo_interessado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processo_profissionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processo_tempo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profissionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profissionais_backfill_execucoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes_despacho_extra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes_etapa6 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipos_documento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbi_comandos_voz ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbi_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbi_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbi_legislacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbi_radar_retratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbis_api_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbis_aportes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbis_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbis_lip_cores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbis_lip_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbis_lip_evento_tipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbis_lip_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbis_lip_fluxo_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbis_lip_indice ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbis_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbis_notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbis_numeracao_faixas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbis_numeracao_uso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbis_sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbis_sessoes_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

-- Policies (32):
CREATE POLICY admin_users_no_access ON public.admin_users AS PERMISSIVE FOR ALL TO {public}
  USING (false)
  WITH CHECK (false);
CREATE POLICY ae_admin ON public.auditoria_eventos AS PERMISSIVE FOR SELECT TO {public}
  USING ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.perfil = 'admin'::text)))));
CREATE POLICY ae_insert ON public.auditoria_eventos AS PERMISSIVE FOR INSERT TO {public}
  WITH CHECK ((analista_id = auth.uid()));
CREATE POLICY ae_own ON public.auditoria_eventos AS PERMISSIVE FOR SELECT TO {public}
  USING ((analista_id = auth.uid()));
CREATE POLICY auditoria_select ON public.auditoria_log AS PERMISSIVE FOR SELECT TO {authenticated}
  USING (has_role('ADM'::text));
CREATE POLICY as_admin ON public.auditoria_sessoes AS PERMISSIVE FOR SELECT TO {public}
  USING ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.perfil = 'admin'::text)))));
CREATE POLICY as_insert ON public.auditoria_sessoes AS PERMISSIVE FOR INSERT TO {public}
  WITH CHECK ((analista_id = auth.uid()));
CREATE POLICY as_own ON public.auditoria_sessoes AS PERMISSIVE FOR SELECT TO {public}
  USING ((analista_id = auth.uid()));
CREATE POLICY as_update ON public.auditoria_sessoes AS PERMISSIVE FOR UPDATE TO {public}
  USING ((analista_id = auth.uid()));
CREATE POLICY bip_usuario_proprio_anotacoes ON public.bip_anotacoes_usuario AS PERMISSIVE FOR ALL TO {public}
  USING ((usuario_id = auth.uid()))
  WITH CHECK ((usuario_id = auth.uid()));
CREATE POLICY bip_usuario_proprio_historico ON public.bip_historico_anotacoes AS PERMISSIVE FOR ALL TO {public}
  USING ((usuario_id = auth.uid()))
  WITH CHECK ((usuario_id = auth.uid()));
CREATE POLICY usuario_autenticado_insere ON public.chat_mensagens AS PERMISSIVE FOR INSERT TO {public}
  WITH CHECK ((remetente_id = auth.uid()));
CREATE POLICY usuario_autenticado_le ON public.chat_mensagens AS PERMISSIVE FOR SELECT TO {public}
  USING ((auth.uid() IS NOT NULL));
CREATE POLICY permitir_insert_documentos ON public.documentos_processo AS PERMISSIVE FOR INSERT TO {public}
  WITH CHECK (true);
CREATE POLICY permitir_leitura_documentos_processo ON public.documentos_processo AS PERMISSIVE FOR SELECT TO {public}
  USING (true);
CREATE POLICY equipe_admin_read ON public.equipe AS PERMISSIVE FOR SELECT TO {public}
  USING (is_admin());
CREATE POLICY equipe_admin_write ON public.equipe AS PERMISSIVE FOR ALL TO {public}
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY anon_all ON public.lip_decisoes_item AS PERMISSIVE FOR ALL TO {anon}
  USING (true)
  WITH CHECK (true);
CREATE POLICY anon_insert ON public.lip_decisoes_item AS PERMISSIVE FOR INSERT TO {anon}
  WITH CHECK (true);
CREATE POLICY anon_select ON public.lip_decisoes_item AS PERMISSIVE FOR SELECT TO {anon}
  USING (true);
CREATE POLICY anon_update ON public.lip_decisoes_item AS PERMISSIVE FOR UPDATE TO {anon}
  USING (true)
  WITH CHECK (true);
CREATE POLICY escrita_admin ON public.lip_prompts AS PERMISSIVE FOR ALL TO {public}
  USING ((auth.role() = 'authenticated'::text));
CREATE POLICY leitura_publica ON public.lip_prompts AS PERMISSIVE FOR SELECT TO {public}
  USING (true);
CREATE POLICY analista_ve_apenas_seus_processos ON public.processos AS PERMISSIVE FOR SELECT TO {public}
  USING ((analista_id IN ( SELECT equipe.id
   FROM equipe
  WHERE ((equipe.auth_uid = auth.uid()) AND (equipe.papel = 'Analista'::text)))));
CREATE POLICY processos_delete_admin_only ON public.processos AS PERMISSIVE FOR DELETE TO {authenticated}
  USING (is_admin_user());
CREATE POLICY processos_insert ON public.processos AS PERMISSIVE FOR INSERT TO {authenticated}
  WITH CHECK ((has_role('ADM'::text) OR has_role('DIRETOR'::text) OR has_role('GERENTE'::text) OR has_role('ANALISTA'::text)));
CREATE POLICY processos_insert_authenticated ON public.processos AS PERMISSIVE FOR INSERT TO {authenticated}
  WITH CHECK (true);
CREATE POLICY processos_select ON public.processos AS PERMISSIVE FOR SELECT TO {authenticated}
  USING ((has_role('ADM'::text) OR (has_role('DIRETOR'::text) AND (diretoria = current_diretoria())) OR (has_role('GERENTE'::text) AND (gerencia = current_gerencia())) OR (analista_id = current_equipe_id())));
CREATE POLICY processos_select_authenticated ON public.processos AS PERMISSIVE FOR SELECT TO {authenticated}
  USING (true);
CREATE POLICY processos_select_public ON public.processos AS PERMISSIVE FOR SELECT TO {public}
  USING (true);
CREATE POLICY processos_update ON public.processos AS PERMISSIVE FOR UPDATE TO {authenticated}
  USING ((has_role('ADM'::text) OR (has_role('DIRETOR'::text) AND (diretoria = current_diretoria())) OR (has_role('GERENTE'::text) AND (gerencia = current_gerencia())) OR (analista_id = current_equipe_id())))
  WITH CHECK ((has_role('ADM'::text) OR (has_role('DIRETOR'::text) AND (diretoria = current_diretoria())) OR (has_role('GERENTE'::text) AND (gerencia = current_gerencia())) OR (analista_id = current_equipe_id())));
CREATE POLICY processos_update_admin_only ON public.processos AS PERMISSIVE FOR UPDATE TO {authenticated}
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

-- Grants para anon/authenticated/service_role/PUBLIC (194 linhas):
-- admin_users                                service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- alertas                                    service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- analise_itens                              service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- analises                                   service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- analises_mac                               service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- assinaturas                                service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- assuntos                                   service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- auditoria_eventos                          service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- auditoria_eventos_backup                   service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- auditoria_log                              service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- auditoria_log_backup                       service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- auditoria_sessoes                          service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- auditoria_sessoes_backup                   service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- bdi_documentos_lei                         service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- bdi_documentos_lei_backup                  service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- bdi_lei_fragmentos                         service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- bdi_lei_fragmentos_backup                  service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- bdi_snapshots                              service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- bip_anotacoes_usuario                      service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- bip_historico_anotacoes                    service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- cadastro_processo                          service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- chat_mensagens                             service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- checklist_instancias                       service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- checklist_item_estatistica                 service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- checklist_items                            service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- checklist_itens                            service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- checklist_itens_instancia                  service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- checklist_modelo_itens                     service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- checklist_modelos                          service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- checklist_respostas                        service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- config_urbis                               service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- decisoes                                   service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- despacho_padroes                           service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- despachos                                  service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- diretorias                                 service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- documentos                                 service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- documentos_lidos                           service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- documentos_processo                        service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- equipe                                     service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- equipe_gerencias                           service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- equipe_roles                               service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- etapa_tempo_sessoes                        service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- eventos                                    service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- formato_identificadores                    service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- gerencias                                  service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- impeditivos                                service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- limites                                    service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- lip_abas                                   service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- lip_campos                                 service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- lip_decisoes_item                          service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- lip_jobs                                   service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- lip_processo_atual                         service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- lip_prompts                                service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- lip_prompts_historico                      service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- lip_resultados                             service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- logradouros                                service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mac_bip_vinculos                           service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mac_checklist_itens                        service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mac_checklist_itens_historico              service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mac_checklist_modelos                      service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mac_execucoes                              service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mac_glossario                              service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mac_historico                              service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mac_lip_vinculos                           service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mac_resultados_item                        service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mac_resultados_revisoes                    service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mac_slot5_filtros                          service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mac_vinculos_propostas                     service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mdp_registros                              service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mhd_conteudos                              service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mhd_documentos                             service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mhd_eventos                                service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mhd_interpretacoes_visao                   service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mhd_resultados_campo                       service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mhd_versoes                                service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mrp_calendario                             service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mrp_calendario_backup                      service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mrp_meta_historico                         service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mrp_painel_diario                          service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mrp_pontuacao                              service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mrp_pontuacao_backup                       service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mrp_pontuacao_historico                    service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mrp_registros                              service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- mrp_registros_backup                       service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- notificacoes                               service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- obs_cod                                    service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- papeis_ativos                              service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- porte_config                               service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- processo_checklist_itens                   service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- processo_documento_ingestao                service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- processo_etapas                            service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- processo_eventos                           service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- processo_fila_overrides                    service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- processo_historico                         service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- processo_prazo_interessado                 service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- processo_profissionais                     service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- processo_tempo                             service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- processos                                  service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- profissionais                              service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- profissionais_backfill_execucoes           service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- rh_log                                     service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- solicitacoes_despacho_extra                service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- solicitacoes_etapa6                        service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- tipos_documento                            service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- urbi_comandos_voz                          service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- urbi_config                                service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- urbi_historico                             service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- urbi_legislacao                            service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- urbi_radar_retratos                        service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- urbi_sugestoes                             service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- urbis_api_calls                            service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- urbis_aportes                              service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- urbis_config                               service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- urbis_lip_cores                            service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- urbis_lip_documentos                       service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- urbis_lip_evento_tipos                     service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- urbis_lip_eventos                          service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- urbis_lip_fluxo_etapas                     service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- urbis_lip_indice                           service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- urbis_logs                                 service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- urbis_notificacoes                         service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- urbis_numeracao_faixas                     service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- urbis_numeracao_uso                        service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- urbis_sessoes                              service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- urbis_sessoes_backup                       service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- usuarios                                   service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_diretoria_mes                            service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_documento_vigente_por_tipo               service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_equipe_publica                           service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_fila_por_analista                        service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_documentos                           service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_documentos_ativos                    service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_etapa_atual                          service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_indice_documentos                    service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_indice_json                          service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_indice_preview                       service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_lista                                service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_lista_processos                      service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_painel                               service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_processo_aberto                      service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_processo_ativo_auto                  service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_processo_em_tela                     service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_processo_em_tela_com_decisao         service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_processo_interface                   service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_processos_com_itens                  service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_responsabilidade                     service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_responsabilidade_humana              service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_status_final                         service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_status_final_v2                      service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_status_processo                      service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_tempo_processo                       service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_timeline_auto                        service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_timeline_preview                     service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_lip_ultimo_documento                     service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_meu_mes                                  service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_minha_gerencia_mes                       service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_pontuacao_mensal                         service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_processo_documento_ingestao_fmt          service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_ranking_12_meses                         service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_ranking_mensal                           service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_tempo_etapa                              service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_tempo_medio_etapa                        service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_tempo_medio_processo                     service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_urbis_lip_eventos_fmt                    service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_urbis_lip_indice                         service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_urbis_lip_kpi                            service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_urbis_lip_limites                        service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_urbis_lip_resumo_181                     service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_urbis_lip_risco_pre_analise              service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_urbis_lip_status                         service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_urbis_lip_status_v2                      service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- v_urbis_lip_timeline                       service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_bdi_aguardando_retorno                  service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_bdi_analises_em_andamento               service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_bdi_analistas_desempenho                service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_bdi_autores                             service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_bdi_campos_criticos                     service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_bdi_cobertura_satelite                  service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_bdi_desempenho_referencia               service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_bdi_exigencias_por_contexto             service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_bdi_nao_conformidades                   service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_bdi_numeracao_saldo                     service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_bdi_por_analista                        service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_bdi_por_assunto                         service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_bdi_por_bairro                          service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_bdi_produtividade_mensal                service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_bdi_resumo_geral                        service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_bdi_retorno_por_slot                    service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_bdi_retrabalho                          service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_bdi_retrabalho_por_passada              service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_bdi_sessoes                             service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_bdi_tempo_analista                      service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_bdi_tempo_etapas                        service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- vw_timeline_processo                       service_role    DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

-- ATENCAO: 0 grant(s) ainda concedidos a anon/authenticated/PUBLIC.
