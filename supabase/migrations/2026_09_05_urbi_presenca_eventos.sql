-- 2026_09_05_urbi_presenca_eventos.sql
--
-- Telemetria NEUTRA de presença no URBIS (rodada isolada, autorizada explicitamente pelo Fábio em
-- 05/09/2026, separada da linha de evidência). Objetivo único permitido: saber se houve
-- INTERAÇÃO no URBIS — nunca produtividade, nunca "analista não está trabalhando", nunca
-- ranking. Só duas transições existem: 'sem_interacao_urbis' (30 min sem qualquer interação) e
-- 'interacao_retomada' (primeira interação depois disso). Nada além de usuário/tipo/data é
-- gravado — sem tecla digitada, sem conteúdo de campo, sem LIP/MAC/documento/conversa.
--
-- Separada de propósito de `urbis_sessoes`/`/api/sessao/*` (essa sim mede tempo/produtividade
-- pra MRP) — esta tabela nunca é lida por aquela lógica nem o contrário.
--
-- ✅ APLICADA — testada em transação com ROLLBACK antes de aplicar de verdade (ver rodapé).

BEGIN;

CREATE TABLE IF NOT EXISTS urbi_presenca_eventos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id        UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo_evento       TEXT NOT NULL CHECK (tipo_evento IN ('sem_interacao_urbis', 'interacao_retomada')),
  sessao_efemera    TEXT,
  origem            TEXT NOT NULL DEFAULT 'web',
  versao_contrato   SMALLINT NOT NULL DEFAULT 1,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS urbi_presenca_eventos_usuario_idx
  ON urbi_presenca_eventos(usuario_id, criado_em DESC);

ALTER TABLE public.urbi_presenca_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.urbi_presenca_eventos FROM anon, authenticated, PUBLIC;

COMMENT ON TABLE urbi_presenca_eventos IS
  'Telemetria neutra de interação com o URBIS — só duas transições (sem_interacao_urbis /
   interacao_retomada), nunca produtividade/ranking/punição. Visível só a Administrador/Diretora
   em /admin/urbi (aba Presença). Escrita só por lib/urbi/presenca.ts via service role.';
COMMENT ON COLUMN urbi_presenca_eventos.sessao_efemera IS
  'Id aleatório gerado no cliente por carregamento de página (nunca persistente, nunca ligado a
   cookie de autenticação) — só pra distinguir abas no log bruto, nunca usado em lógica alguma.';

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 05/09/2026, transação com ROLLBACK antes de aplicar de verdade
-- ======================================================================
-- CREATE TABLE + índice + RLS + REVOKE + COMMENT rodados dentro de transação de teste: insert de
-- exemplo com tipo_evento='interacao_retomada' confirmado aceito; insert com tipo fora do enum
-- ('ocioso') confirmado REJEITADO pelo CHECK; SELECT como anon (chave publishable) confirmado
-- 401/vazio, nunca dado real. Tudo desfeito por ROLLBACK, confirmado por fora que a tabela não
-- existia — só então aplicada de verdade.
-- ======================================================================
