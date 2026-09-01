-- 2026_08_31_trava_rls_anon.sql
--
-- Auditoria de 31/08/2026 confirmou acesso direto de anon a sete tabelas e
-- onze views. O app autentica por cookie proprio e acessa esses objetos apenas
-- por rotas de servidor com service_role; anon/authenticated nao sao
-- consumidores legitimos deles.
--
-- As policies existentes sao preservadas. O bloqueio ocorre pelos privilegios
-- das roles e pelo RLS, sem destruir regras que possam ser uteis no futuro.
-- As views recebem security_invoker para respeitarem o acesso das tabelas-base.
-- service_role nao e alterada. A migration e transacional e idempotente.

BEGIN;

ALTER TABLE public.processos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analises_mac       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lip_prompts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lip_resultados     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processo_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbis_config       ENABLE ROW LEVEL SECURITY;

-- Cinto e suspensório: revoga o privilégio de tabela em si (independe de RLS).
REVOKE ALL ON public.processos          FROM anon, authenticated;
REVOKE ALL ON public.usuarios           FROM anon, authenticated;
REVOKE ALL ON public.analises_mac       FROM anon, authenticated;
REVOKE ALL ON public.lip_prompts        FROM anon, authenticated;
REVOKE ALL ON public.lip_resultados     FROM anon, authenticated;
REVOKE ALL ON public.processo_historico FROM anon, authenticated;
REVOKE ALL ON public.urbis_config       FROM anon, authenticated;

-- Views nao herdam automaticamente o RLS das tabelas-base. security_invoker
-- impede que sejam executadas com os privilegios do proprietario postgres.
ALTER VIEW public.mrp_painel_diario           SET (security_invoker = true);
ALTER VIEW public.vw_bdi_analistas_desempenho SET (security_invoker = true);
ALTER VIEW public.vw_bdi_autores               SET (security_invoker = true);
ALTER VIEW public.vw_bdi_nao_conformidades     SET (security_invoker = true);
ALTER VIEW public.vw_bdi_por_analista          SET (security_invoker = true);
ALTER VIEW public.vw_bdi_por_assunto           SET (security_invoker = true);
ALTER VIEW public.vw_bdi_por_bairro            SET (security_invoker = true);
ALTER VIEW public.vw_bdi_produtividade_mensal  SET (security_invoker = true);
ALTER VIEW public.vw_bdi_resumo_geral          SET (security_invoker = true);
ALTER VIEW public.vw_bdi_sessoes               SET (security_invoker = true);
ALTER VIEW public.vw_bdi_tempo_analista        SET (security_invoker = true);

REVOKE ALL ON public.mrp_painel_diario           FROM anon, authenticated;
REVOKE ALL ON public.vw_bdi_analistas_desempenho FROM anon, authenticated;
REVOKE ALL ON public.vw_bdi_autores               FROM anon, authenticated;
REVOKE ALL ON public.vw_bdi_nao_conformidades     FROM anon, authenticated;
REVOKE ALL ON public.vw_bdi_por_analista          FROM anon, authenticated;
REVOKE ALL ON public.vw_bdi_por_assunto           FROM anon, authenticated;
REVOKE ALL ON public.vw_bdi_por_bairro            FROM anon, authenticated;
REVOKE ALL ON public.vw_bdi_produtividade_mensal  FROM anon, authenticated;
REVOKE ALL ON public.vw_bdi_resumo_geral          FROM anon, authenticated;
REVOKE ALL ON public.vw_bdi_sessoes               FROM anon, authenticated;
REVOKE ALL ON public.vw_bdi_tempo_analista        FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
