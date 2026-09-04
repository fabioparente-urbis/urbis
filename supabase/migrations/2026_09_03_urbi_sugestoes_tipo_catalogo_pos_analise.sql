-- 2026_09_03_urbi_sugestoes_tipo_catalogo_pos_analise.sql
--
-- Fase E do plano de Inteligência URBIS: liga a trilha real de mudança de catálogo
-- (mac_checklist_itens_historico, Fase D) a uma sugestão determinística nova em
-- urbi_sugestoes — "o catálogo mudou depois que esta análise (já com documento emitido)
-- marcou este item". Mesmo espírito dos 6 tipos já existentes: fato puro derivado do que o
-- dossiê já calcula (lib/urbi/sugestoes.ts), nunca opinião de IA, nunca ação em LIP/MAC.
--
-- Por que "vale_conferir" e não "confirmado": o EVENTO de mudança de catálogo é fato
-- confirmado (trigger de banco), mas se ele afeta de verdade a análise já fechada é
-- interpretação — cabe a um humano conferir, o URBI não decide isso.
--
-- ✅ APLICADA — testada em transação com ROLLBACK antes de aplicar de verdade (ver rodapé).

BEGIN;

ALTER TABLE urbi_sugestoes DROP CONSTRAINT urbi_sugestoes_tipo_check;
ALTER TABLE urbi_sugestoes ADD CONSTRAINT urbi_sugestoes_tipo_check CHECK (tipo IN (
  'item_voltou_nao_conforme', 'documento_sem_registro',
  'aguardando_retorno_base_insuficiente', 'incoerencia_lip_mac',
  'divergencia_lip_documento', 'item_sem_base_juridica',
  'catalogo_alterado_apos_analise'
));

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 03/09/2026, transação com ROLLBACK antes de aplicar de verdade
-- ======================================================================
-- DROP+ADD CONSTRAINT rodado dentro de transação de teste: insert com tipo
-- 'catalogo_alterado_apos_analise' confirmado aceito (falhava antes da mudança), insert com
-- tipo fora da lista continua rejeitado, os 6 tipos antigos continuam aceitos. Tudo desfeito
-- por ROLLBACK, confirmado por fora que a constraint antiga ainda valia — só então aplicada
-- de verdade.
-- ======================================================================
