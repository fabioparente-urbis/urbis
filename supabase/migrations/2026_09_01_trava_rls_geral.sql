-- 2026_09_01_trava_rls_geral.sql
--
-- LEVA 2 da trava de acesso anonimo, aplicada direto no banco em 01/09/2026 e
-- reconstruida aqui a partir do estado real do catalogo (pg_class, pg_default_acl)
-- em 01/09/2026, porque nunca tinha virado migration.
--
-- Por que isso importa: a leva 1 (2026_08_31_trava_rls_anon.sql) cobre 7 tabelas
-- e 11 views nomeadas uma a uma. A auditoria encontrou depois mais 18 tabelas
-- legadas com dado pessoal (rh_log, processo_eventos, alertas, papeis_ativos),
-- que nenhum CREATE TABLE de migration cria e nenhum .from() do app le — logo,
-- nenhuma lista escrita a mao ia alcanca-las. A trava aqui e por varredura, nao
-- por lista: pega o que existe hoje e o que aparecer amanha pelo mesmo caminho.
--
-- Sem esta migration, um banco novo criado so pelas migrations nasce exposto.
--
-- Idempotente e transacional. Nao altera service_role. Nao apaga policy nenhuma.

BEGIN;

-- 1) RLS em toda tabela de public que ainda nao tem.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r','p')
       AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;

-- 2) Revoga privilegio de tabela/view de anon e authenticated em todo o schema.
--    Cinto e suspensorio: independe de RLS e cobre as views, que nao herdam RLS
--    da tabela-base.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r','p','v','m')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', r.relname);
  END LOOP;
END $$;

-- 3) Objetos futuros: tabela nova criada por postgres nao nasce legivel por anon.
--    Todos os 177 objetos de public pertencem a postgres (conferido em 01/09/2026).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

-- Observado e NAO alterado por esta migration (mudar exige decisao explicita):
--   * DEFAULT PRIVILEGES de SEQUENCES e FUNCTIONS em public seguem concedidos a
--     anon/authenticated (pg_default_acl, dono postgres).
--   * O dono supabase_admin tem DEFAULT PRIVILEGES proprios em public dando
--     arwdDxtm a anon/authenticated — vale para objeto que ELE crie, nao postgres.
--   * 47 das 58 views nao tem security_invoker; rodam com privilegio do dono.
--     Hoje inertes (sem grant, anon nao chega nelas), mas e a camada que falta.
--   * 25 policies permissivas para o role publico e 4 para anon continuam vivas
--     (ver supabase/schema/06_rls_policies_grants.sql). Estao inertes so porque o
--     grant de tabela foi revogado: um unico GRANT reabre tudo de novo.

NOTIFY pgrst, 'reload schema';

COMMIT;
