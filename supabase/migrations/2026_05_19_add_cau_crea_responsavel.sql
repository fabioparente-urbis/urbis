-- Item 3 (briefing Cowork): CAU e CREA do responsável técnico do projeto
-- capturados na análise MAC. Persistidos na tabela analises_mac (uma análise
-- pode ter um responsável técnico distinto por revisão).
ALTER TABLE IF EXISTS analises_mac
  ADD COLUMN IF NOT EXISTS cau_responsavel TEXT,
  ADD COLUMN IF NOT EXISTS crea_responsavel TEXT;

COMMENT ON COLUMN analises_mac.cau_responsavel IS
  'Número do CAU do responsável técnico do projeto (arquiteto).';
COMMENT ON COLUMN analises_mac.crea_responsavel IS
  'Número do CREA do responsável técnico do projeto (engenheiro).';
