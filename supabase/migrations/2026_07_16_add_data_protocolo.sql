-- Módulo Profissionais — Bloco A (fundação de dados).
-- Data oficial de protocolo do processo (SEI ou físico), distinta de
-- processos.criado_em (que é só a data de cadastro no URBIS, podendo ser
-- muito posterior à entrada real do processo na prefeitura).
-- Preenchimento manual pelo analista via LIP — nunca derivado
-- automaticamente de criado_em.
ALTER TABLE IF EXISTS processos
  ADD COLUMN IF NOT EXISTS data_protocolo DATE,
  ADD COLUMN IF NOT EXISTS data_protocolo_origem TEXT;

COMMENT ON COLUMN processos.data_protocolo IS
  'Data oficial de protocolo do processo (SEI ou físico). NULL até o analista preencher no LIP — nunca inferida automaticamente de criado_em.';
COMMENT ON COLUMN processos.data_protocolo_origem IS
  'Origem do valor de data_protocolo. Hoje só existe "analista_lip" (preenchimento manual). Reservado para futuras origens (ex: extração automática do SEI) que deverão vir com confiança mais baixa marcada explicitamente.';
