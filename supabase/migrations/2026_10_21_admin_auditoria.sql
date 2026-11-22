-- 2026_10_21_admin_auditoria.sql — C1, etapa E3.
--
-- Registro das ações de administração de contas (criar, editar, desativar, reativar, trocar
-- senha, enviar redefinição, tentativas recusadas). Gravado por lib/adminAuditoria.ts.
--
-- SÓ ACRÉSCIMO: ninguém altera nem apaga uma linha depois de gravada — nem a aplicação, nem a
-- service_role. Três camadas, porque cada uma sozinha tem furo:
--   1. privilégio: service_role (e anon/authenticated) ficam só com SELECT + INSERT;
--   2. gatilho BEFORE UPDATE/DELETE (linha) e BEFORE TRUNCATE (comando): recusa mesmo para quem
--      tiver recebido o privilégio por engano depois;
--   3. a importação de backup (/api/admin/backup) exporta esta tabela mas nunca a sobrescreve.
--
-- LIMITE TÉCNICO (documentado, não resolvido aqui): o dono da tabela (`postgres`) pode desligar o
-- gatilho, devolver privilégios ou apagar a tabela. Detectar isso exige encadeamento por hash com
-- cópia externa (item A6 do relatório de auditoria).
--
-- Aditiva: não altera nenhuma tabela existente. Idempotente. Transacional.

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_auditoria (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em        timestamptz NOT NULL DEFAULT now(),
  correlacao_id    uuid        NOT NULL,
  ator_usuario_id  uuid,
  ator_nome        text,
  ator_ip          text,
  ator_user_agent  text,
  acao             text        NOT NULL CHECK (acao IN (
                     'criar', 'editar', 'desativar', 'reativar', 'alterar_senha',
                     'enviar_reset_senha', 'exclusao_bloqueada', 'acesso_negado')),
  alvo_usuario_id  uuid,
  alvo_nome        text,
  alteracoes       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  resultado        text        NOT NULL CHECK (resultado IN (
                     'intencao', 'sucesso', 'falha', 'falha_parcial', 'recusa')),
  erro             text
);

COMMENT ON TABLE public.admin_auditoria IS
  'Ações de administração de contas (C1, 21/10/2026). Só acréscimo: UPDATE/DELETE/TRUNCATE recusados por privilégio e por gatilho. Nunca contém senha ou token. Gravada por lib/adminAuditoria.ts.';

-- O relógio é do banco: um INSERT não consegue escolher a própria data.
CREATE OR REPLACE FUNCTION public.admin_auditoria_carimbar()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.criado_em := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.admin_auditoria_somente_acrescimo()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'admin_auditoria é só de acréscimo: % não é permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

DROP TRIGGER IF EXISTS trg_admin_auditoria_carimbar ON public.admin_auditoria;
CREATE TRIGGER trg_admin_auditoria_carimbar
  BEFORE INSERT ON public.admin_auditoria
  FOR EACH ROW EXECUTE FUNCTION public.admin_auditoria_carimbar();

DROP TRIGGER IF EXISTS trg_admin_auditoria_imutavel ON public.admin_auditoria;
CREATE TRIGGER trg_admin_auditoria_imutavel
  BEFORE UPDATE OR DELETE ON public.admin_auditoria
  FOR EACH ROW EXECUTE FUNCTION public.admin_auditoria_somente_acrescimo();

DROP TRIGGER IF EXISTS trg_admin_auditoria_sem_truncate ON public.admin_auditoria;
CREATE TRIGGER trg_admin_auditoria_sem_truncate
  BEFORE TRUNCATE ON public.admin_auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION public.admin_auditoria_somente_acrescimo();

CREATE INDEX IF NOT EXISTS admin_auditoria_criado_em_idx ON public.admin_auditoria (criado_em DESC);
CREATE INDEX IF NOT EXISTS admin_auditoria_alvo_idx      ON public.admin_auditoria (alvo_usuario_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS admin_auditoria_correlacao_idx ON public.admin_auditoria (correlacao_id);

-- RLS ligado como em todo o schema (trava de 01/09/2026). service_role ignora RLS; o que a
-- limita aqui são os privilégios abaixo.
ALTER TABLE public.admin_auditoria ENABLE ROW LEVEL SECURITY;

-- No Supabase, os default privileges dão ALL à service_role em tabela nova. Tira tudo e devolve
-- só leitura e inclusão.
REVOKE ALL ON public.admin_auditoria FROM PUBLIC;
REVOKE ALL ON public.admin_auditoria FROM anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.admin_auditoria TO service_role;

-- As funções do gatilho não precisam ser chamáveis por ninguém via API.
REVOKE ALL ON FUNCTION public.admin_auditoria_carimbar() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_auditoria_somente_acrescimo() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.admin_auditoria_carimbar() FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.admin_auditoria_somente_acrescimo() FROM anon, authenticated';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Conferência pós-aplicação (só leitura) — esperado: t, t, f, f, f, f
-- select has_table_privilege('service_role','public.admin_auditoria','SELECT'),
--        has_table_privilege('service_role','public.admin_auditoria','INSERT'),
--        has_table_privilege('service_role','public.admin_auditoria','UPDATE'),
--        has_table_privilege('service_role','public.admin_auditoria','DELETE'),
--        has_table_privilege('service_role','public.admin_auditoria','TRUNCATE'),
--        has_table_privilege('anon','public.admin_auditoria','SELECT');
