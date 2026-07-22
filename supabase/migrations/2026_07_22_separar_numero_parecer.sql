-- Separa o número de parecer do número de despacho na análise.
--
-- Despacho e Parecer são séries de numeração INDEPENDENTES (faixas
-- distintas em urbis_numeracao_faixas: tipo='despacho' e tipo='parecer').
-- A mesma análise pode emitir os dois — hoje já existem 4 processos com
-- despacho e indeferimento na mesma análise. Com uma coluna só, o segundo
-- documento sobrescrevia o número do primeiro.
--
-- Vale para Regularização SEI e Aceite SEI.

ALTER TABLE analises_mac
  ADD COLUMN IF NOT EXISTS numero_parecer TEXT;

COMMENT ON COLUMN analises_mac.numero_parecer IS
  'Número do último parecer (indeferimento/arquivamento) emitido por esta análise. Série independente da de despacho.';

COMMENT ON COLUMN analises_mac.numero_despacho IS
  'Número do último despacho emitido por esta análise. Série independente da de parecer. Histórico completo em urbis_numeracao_uso.';

-- Nada a mover: o backfill anterior só encontrou números em tags de tipo
-- 'despacho' (as de indeferimento nunca gravaram número — corrigido no
-- mesmo commit desta migration), então numero_despacho já contém apenas
-- números da série de despacho.
