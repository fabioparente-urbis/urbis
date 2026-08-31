-- 2026_08_31_trava_rls_anon.sql
--
-- Achado da auditoria de segurança de 31/08/2026, motivada pelo processo
-- 25.5.000081077-0 (Antônia Meneses Rodrigues) "sumindo" da pilha.
--
-- O processo em si nunca foi apagado — os 75 campos do LIP e o histórico em
-- auditoria_log seguiam intactos o tempo todo (confirmado com a service role).
-- O susto real, achado ao investigar, é outro e mais grave: sete tabelas
-- estavam de fato abertas para a ANON KEY (a chave pública, a mesma que o
-- app expõe em NEXT_PUBLIC_SUPABASE_ANON_KEY) sem NENHUMA policy de RLS
-- restringindo. Testado direto contra o Supabase, sem passar pelo app:
--
--   processos            → SELECT liberado (83/83 linhas), e pior:
--                           UPDATE e DELETE também liberados. Uma linha de
--                           teste sofreu soft-delete E hard-delete via anon,
--                           sem tocar em urbis_id, sem checar dono, sem virar
--                           lixeira — o processo simplesmente deixa de
--                           existir, sem rastro em auditoria_log (que é
--                           alimentado por trigger, mas não impede o DELETE).
--   usuarios              → SELECT liberado: nome, e-mail, telefone,
--                           matrícula, cargo, perfis de todo mundo.
--   analises_mac          → SELECT liberado (118 linhas): conteúdo de
--                           análise inteiro.
--   lip_prompts            → SELECT liberado (10 linhas).
--   lip_resultados          → SELECT liberado (8 linhas).
--   processo_historico     → SELECT liberado (4 linhas).
--   urbis_config            → SELECT liberado (1 linha).
--
-- As outras ~48 tabelas do projeto (mdp_registros, mrp_registros,
-- auditoria_log, mhd_documentos, urbis_api_calls, assuntos, etc.) já
-- devolviam vazio para a mesma chave — RLS funcionando como esperado nelas.
-- Isto aqui fecha só as sete que estavam abertas.
--
-- O app NUNCA usa Supabase Auth (login é cookie próprio `urbis_id`, checado
-- em lib/auth.ts) — então `anon` e `authenticated` não têm nenhuma razão
-- legítima para tocar essas tabelas. Toda leitura/escrita de verdade já
-- passa pelas rotas de servidor com a SERVICE ROLE KEY (que ignora RLS por
-- natureza — é por isso que este arquivo não quebra nada do app: as sete
-- rotas que ainda liam `processos`/`lip_prompts` pela chave anônima
-- (lib/supabaseClient.ts) foram trocadas para supabaseAdmin no mesmo commit
-- desta migration — rodar este SQL ANTES desse deploy quebraria
-- /api/processo/carregar, /api/processo/salvar, /api/processo/tag e as
-- leituras de prompt do LIP/MAC).
--
-- Efeito de ENABLE ROW LEVEL SECURITY sem nenhuma policy: nega tudo por
-- padrão para quem não é o dono da tabela nem BYPASSRLS — cobre anon e
-- authenticated de uma vez, mesmo que apareça uma policy solta que não foi
-- encontrada nesta auditoria (não há acesso a psql/pg_policies neste
-- ambiente, só ao client-side via supabase-js). O REVOKE explícito abaixo é
-- cinto e suspensório: mesmo que RLS seja desabilitado por engano no futuro,
-- essas duas roles continuam sem privilégio nenhum na tabela.
--
-- Aditiva e idempotente — pode rodar mais de uma vez sem efeito colateral.

ALTER TABLE public.processos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analises_mac       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lip_prompts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lip_resultados     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processo_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urbis_config       ENABLE ROW LEVEL SECURITY;

-- Derruba qualquer policy permissiva que hoje concede acesso a anon/authenticated
-- nessas sete tabelas — é isso que efetivamente deixava o SELECT (e, em
-- processos, o UPDATE/DELETE) passar apesar do RLS já poder estar ligado.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'processos', 'usuarios', 'analises_mac', 'lip_prompts',
        'lip_resultados', 'processo_historico', 'urbis_config'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- Cinto e suspensório: revoga o privilégio de tabela em si (independe de RLS).
REVOKE ALL ON public.processos          FROM anon, authenticated;
REVOKE ALL ON public.usuarios           FROM anon, authenticated;
REVOKE ALL ON public.analises_mac       FROM anon, authenticated;
REVOKE ALL ON public.lip_prompts        FROM anon, authenticated;
REVOKE ALL ON public.lip_resultados     FROM anon, authenticated;
REVOKE ALL ON public.processo_historico FROM anon, authenticated;
REVOKE ALL ON public.urbis_config       FROM anon, authenticated;

-- ── REVERSÃO (não rodar junto) ───────────────────────────────────────
-- GRANT ALL ON public.processos          TO anon, authenticated;
-- GRANT ALL ON public.usuarios           TO anon, authenticated;
-- GRANT ALL ON public.analises_mac       TO anon, authenticated;
-- GRANT ALL ON public.lip_prompts        TO anon, authenticated;
-- GRANT ALL ON public.lip_resultados     TO anon, authenticated;
-- GRANT ALL ON public.processo_historico TO anon, authenticated;
-- GRANT ALL ON public.urbis_config       TO anon, authenticated;
-- ALTER TABLE public.processos          DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.usuarios           DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.analises_mac       DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.lip_prompts        DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.lip_resultados     DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.processo_historico DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.urbis_config       DISABLE ROW LEVEL SECURITY;
