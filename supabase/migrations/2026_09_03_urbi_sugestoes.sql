-- 2026_09_03_urbi_sugestoes.sql
--
-- Registro de sugestões/alertas do Co-Analista (URBI) — autorizado explicitamente pelo Fábio em
-- 03/09/2026, junto com a evolução do dossiê (mac_historico, observações do MAC, histórico raso do
-- LIP — ver lib/urbi/dossieProcesso.ts) e a correção da fonte de indeferimento em
-- app/api/profissionais/historico/route.ts.
--
-- REGRA DO FÁBIO: "somente registro de sugestão factual, nunca ação no LIP/MAC". Por isso:
--   - o CONTEÚDO de cada linha é derivado deterministicamente de fatos que o dossiê já calcula
--     (lib/urbi/sugestoes.ts, função derivarSugestoesAutomaticas) — nenhuma IA decide o que entra
--     aqui, é formatação de fato em estrutura auditável, mesmo espírito de lib/bdi/situacao.ts;
--   - esta tabela nunca é lida por nenhuma rotina de escrita em LIP/MAC, e nenhuma rota grava em
--     LIP/MAC a partir dela;
--   - `estado` (nova/vista/confirmada/descartada/insuficiente) existe pronto pra quando o módulo
--     administrativo próprio do URBI (Frente 7, ainda não implementada) ganhar tela de revisão —
--     nesta rodada as linhas nascem e ficam 'nova', sem UI pra mudar isso ainda.
--
-- Quem grava: app/api/urbi/chat/route.ts, sempre que o Co-Analista está ativo num processo
-- (dossiê carregado com sucesso), com ON CONFLICT DO NOTHING pela chave natural — não duplica a
-- cada mensagem de chat, e nunca sobrescreve um `estado` que um humano já tenha mudado.
--
-- ✅ APLICADA — testada em transação com ROLLBACK antes de aplicar de verdade (ver rodapé).

BEGIN;

CREATE TABLE IF NOT EXISTS urbi_sugestoes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_codigo    TEXT NOT NULL,

  tipo               TEXT NOT NULL CHECK (tipo IN (
                        'item_voltou_nao_conforme', 'documento_sem_registro',
                        'aguardando_retorno_base_insuficiente', 'incoerencia_lip_mac'
                      )),
  -- identifica a instância (item_id, "tipo:numero" do documento, etc.) — chave de dedupe junto com
  -- processo_codigo+tipo.
  chave              TEXT NOT NULL,

  sugestao           TEXT NOT NULL,
  motivo_factual     TEXT NOT NULL,
  campos_comparados  JSONB NOT NULL DEFAULT '[]'::jsonb,
  fontes             JSONB NOT NULL DEFAULT '[]'::jsonb,

  grau_certeza       TEXT NOT NULL CHECK (grau_certeza IN (
                        'confirmado', 'vale_conferir', 'base_insuficiente',
                        'nao_aplicavel', 'aguarda_confirmacao_humana'
                      )),
  estado             TEXT NOT NULL DEFAULT 'nova' CHECK (estado IN (
                        'nova', 'vista', 'confirmada', 'descartada', 'insuficiente'
                      )),

  gerado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  decidido_por       UUID REFERENCES usuarios(id),
  decidido_em        TIMESTAMPTZ,

  UNIQUE (processo_codigo, tipo, chave)
);

CREATE INDEX IF NOT EXISTS urbi_sugestoes_processo_idx ON urbi_sugestoes(processo_codigo);
CREATE INDEX IF NOT EXISTS urbi_sugestoes_estado_idx ON urbi_sugestoes(estado);

COMMENT ON TABLE urbi_sugestoes IS
  'Registro auditável de sugestões/alertas do Co-Analista URBI, derivados deterministicamente de
   fatos do dossiê (nunca opinião de IA solta). Nunca grava nem altera LIP/MAC. estado pronto pra
   revisão humana futura (módulo /admin/urbi), sem UI ainda nesta rodada.';

REVOKE ALL ON public.urbi_sugestoes FROM anon, authenticated, PUBLIC;

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 03/09/2026, transação com ROLLBACK antes de aplicar de verdade
-- ======================================================================
-- CREATE TABLE + índices + COMMENT + REVOKE rodados dentro de uma transação controlada
-- externamente (scratchpad/scripts, script Node com `pg` contra SUPABASE_DB_URL — apagado depois
-- de usar): inserção de exemplo respeitando os CHECKs de tipo/grau_certeza/estado confirmada,
-- tentativa de tipo/grau_certeza fora do enum confirmada REJEITADA pelo CHECK, UNIQUE
-- (processo_codigo, tipo, chave) confirmada bloqueando duplicata, tudo desfeito por ROLLBACK,
-- confirmado por fora que a tabela não existia — só então aplicada de verdade.
-- ======================================================================
