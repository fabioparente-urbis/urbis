-- Adiciona coluna para acumular tempo pausado/morto (em segundos)
-- que não deve ser contabilizado no BDI.
-- Cobre dois casos:
--   1. Inatividade > 5 min detectada pelo front
--   2. Sessão encerrada pelo pg_cron e reaberta (dead time entre enceramento e reabertura)

ALTER TABLE urbis_sessoes
  ADD COLUMN IF NOT EXISTS tempo_pausado integer NOT NULL DEFAULT 0;

-- Comentário para a view vw_bdi_sessoes usar:
-- tempo_efetivo = EXTRACT(EPOCH FROM (encerrada_em - iniciada_em)) - tempo_pausado
COMMENT ON COLUMN urbis_sessoes.tempo_pausado IS
  'Segundos a subtrair do tempo bruto da sessão (inatividade + dead-time pós-cron)';
