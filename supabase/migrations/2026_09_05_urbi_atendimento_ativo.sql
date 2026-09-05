-- 2026_09_05_urbi_atendimento_ativo.sql
--
-- "Atendimento ativo" (Fase 2, rodada de independência de sessão do Radar, 05/09/2026): enquanto
-- um analista tem o URBI aberto DENTRO de um processo específico, o job de servidor do Radar
-- evita reprocessar (recalcular dossiê/motor para) ESSE processo, pra não fazer trabalho
-- duplicado nem pisar na leitura ao vivo do analista. Escopo é só o processo em atendimento —
-- nunca pausa o Radar inteiro (outros processos continuam sendo processados normalmente).
--
-- Expira por LEASE técnico (campo `expira_em`, renovado pelo cliente enquanto a tela continua
-- aberta) — se o navegador for fechado/travar sem avisar, o lease expira sozinho e o Radar volta
-- a poder processar aquele processo, sem depender de um "fechar" explícito. Totalmente separado
-- de `urbi_presenca_eventos` (telemetria de presença humana) — nunca lido/escrito por aquele
-- módulo nem pelo contrário.
--
-- ✅ APLICADA — testada em transação com ROLLBACK antes de aplicar de verdade (ver rodapé).

BEGIN;

CREATE TABLE IF NOT EXISTS urbi_atendimento_ativo (
  processo_codigo   TEXT PRIMARY KEY,
  usuario_id        UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em         TIMESTAMPTZ NOT NULL,
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS urbi_atendimento_ativo_expira_idx ON urbi_atendimento_ativo (expira_em);

ALTER TABLE public.urbi_atendimento_ativo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.urbi_atendimento_ativo FROM anon, authenticated, PUBLIC;

COMMENT ON TABLE urbi_atendimento_ativo IS
  'Lease técnico de "atendimento ativo" — enquanto um processo tem lease válido (expira_em no
   futuro), o job de servidor do Radar evita reprocessá-lo. Expira sozinho se o cliente parar de
   renovar (navegador fechado/travado) — nunca depende de um sinal explícito de fechamento.
   Separado por completo de urbi_presenca_eventos (telemetria de presença humana).';

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 05/09/2026, transação com ROLLBACK antes de aplicar de verdade
-- ======================================================================
-- CREATE TABLE + índice + RLS + REVOKE rodados dentro de transação de teste: insert de exemplo
-- aceito; upsert (ON CONFLICT DO UPDATE) por processo_codigo confirmado funcionando (renovação de
-- lease); SELECT como anon (chave publishable) confirmado 401/vazio. Tudo desfeito por ROLLBACK,
-- confirmado por fora que a tabela não existia — só então aplicada de verdade.
-- ======================================================================
