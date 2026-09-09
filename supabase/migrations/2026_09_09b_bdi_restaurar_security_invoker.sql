-- Regressão introduzida pela migration anterior
-- (2026_09_09_bdi_retornos_reais_e_tempo_honesto.sql): CREATE OR REPLACE VIEW
-- não preserva a opção security_invoker do Postgres — as 4 views recriadas
-- voltaram a rodar com privilégio do DONO da view em vez de quem consulta,
-- a mesma classe de problema que a auditoria de segurança de 01/09/2026
-- (Fase 2, urbis_fase2_seguranca_banco) já tinha corrigido uma vez.
--
-- Confirmado em 09/09/2026 no schema real (03_views.sql pós-extração): as 4
-- views abaixo saíram de "opcoes: security_invoker=true" para "(nenhuma)".
-- Reaplicando explicitamente.

ALTER VIEW public.vw_bdi_analistas_desempenho SET (security_invoker = true);
ALTER VIEW public.vw_bdi_por_analista SET (security_invoker = true);
ALTER VIEW public.vw_bdi_por_assunto SET (security_invoker = true);
ALTER VIEW public.vw_bdi_resumo_geral SET (security_invoker = true);
