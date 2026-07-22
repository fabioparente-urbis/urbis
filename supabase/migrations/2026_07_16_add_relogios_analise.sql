-- Módulo Profissionais — Bloco A (fundação de dados).
-- Sem os dois campos abaixo, nunca é possível calcular tempo de análise
-- de nenhum processo, novo ou antigo. Colunas gravadas daqui pra frente
-- pelas rotas de análise/despacho/laudo; os 33 processos existentes hoje
-- ficam NULL (honesto), sem estimativa retroativa.
ALTER TABLE IF EXISTS processos
  ADD COLUMN IF NOT EXISTS analise_iniciada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS analise_concluida_em TIMESTAMPTZ;

COMMENT ON COLUMN processos.analise_iniciada_em IS
  'Data/hora da criação do 1º ciclo de análise MAC do processo (gravado pela rota de criação da análise). NULL = ainda não iniciou ou processo anterior à implantação deste campo.';
COMMENT ON COLUMN processos.analise_concluida_em IS
  'Data/hora da conclusão definitiva do processo: laudo emitido, indeferimento ou arquivamento (gravado pela rota correspondente, apenas na 1ª ocorrência — não é sobrescrito em reemissão de documento).';
