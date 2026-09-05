-- 2026_09_05_urbi_radar_job_servidor.sql
--
-- Radar silencioso independente de sessão/navegador (rodada isolada, 05/09/2026). Auditoria
-- prévia (só leitura, script descartável) confirmou: pg_cron (1.6.4) e pg_net (0.19.5) estão
-- DISPONÍVEIS neste projeto Supabase mas não instalados — é o mecanismo NATIVO e já suportado
-- pela plataforma pra "chamada HTTP agendada dentro do próprio banco", sem inventar
-- infraestrutura paralela (worker externo, fila, biblioteca nova). supabase_vault já estava
-- instalado — usado aqui pra nunca gravar o segredo do job em texto puro nesta migration nem em
-- nenhum arquivo versionado.
--
-- Esta migration SÓ cria a extensão + a tabela de execução/lock. O agendamento em si
-- (`cron.schedule`) e o segredo (`vault.create_secret`) são aplicados por um script separado,
-- executado uma única vez, porque dependem de um valor gerado em tempo de aplicação (o segredo)
-- que nunca deve ficar no arquivo de migration versionado.
--
-- ✅ APLICADA — testada em transação com ROLLBACK antes de aplicar de verdade (ver rodapé).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Log de execução do job E lock (impede duas execuções concorrentes): o índice único parcial
-- garante, no nível do banco, que só pode existir UMA linha com estado='em_execucao' por vez —
-- uma segunda tentativa de INSERT enquanto a primeira ainda está rodando falha por violação de
-- unicidade (capturado no código como "já em execução, saindo sem processar nada").
CREATE TABLE IF NOT EXISTS urbi_radar_execucoes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origem            TEXT NOT NULL DEFAULT 'cron',
  estado            TEXT NOT NULL CHECK (estado IN ('em_execucao', 'concluido', 'erro')),
  iniciado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em      TIMESTAMPTZ,
  detectados        INTEGER,
  enfileirados      INTEGER,
  processados       INTEGER,
  falhas            INTEGER,
  erro              TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS urbi_radar_execucoes_lock_idx
  ON urbi_radar_execucoes ((1)) WHERE estado = 'em_execucao';
CREATE INDEX IF NOT EXISTS urbi_radar_execucoes_iniciado_idx
  ON urbi_radar_execucoes (iniciado_em DESC);

ALTER TABLE public.urbi_radar_execucoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.urbi_radar_execucoes FROM anon, authenticated, PUBLIC;

COMMENT ON TABLE urbi_radar_execucoes IS
  'Log de execução do job de servidor do Radar silencioso (pg_cron -> pg_net -> /api/urbi/radar/job)
   e, ao mesmo tempo, o LOCK contra execução concorrente (índice único parcial em estado=
   ''em_execucao''). Nunca grava conteúdo de processo, texto de conversa ou dado pessoal — só
   contadores e uma mensagem de erro sanitizada.';
COMMENT ON COLUMN urbi_radar_execucoes.erro IS
  'Mensagem de erro SANITIZADA (nunca stack trace bruto, nunca payload de request) — mesmo
   padrão de urbi_radar_retratos.erro.';

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 05/09/2026, transação com ROLLBACK antes de aplicar de verdade
-- ======================================================================
-- CREATE EXTENSION (pg_cron, pg_net) + CREATE TABLE + índice único parcial + RLS + REVOKE
-- rodados dentro de transação de teste: insert de 'em_execucao' aceito; SEGUNDO insert de
-- 'em_execucao' (simulando execução concorrente) REJEITADO pelo índice único parcial, confirmado
-- com o texto exato do erro de unicidade; insert com estado fora do enum confirmado REJEITADO
-- pelo CHECK; SELECT como anon (chave publishable) confirmado 401/vazio. Tudo desfeito por
-- ROLLBACK, confirmado por fora que nem a tabela nem as extensões existiam — só então aplicado.
-- ======================================================================
