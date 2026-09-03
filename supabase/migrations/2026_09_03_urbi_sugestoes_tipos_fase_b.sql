-- 2026_09_03_urbi_sugestoes_tipos_fase_b.sql
--
-- Fase B do plano de Inteligência URBIS (cruzamento determinístico LIP×MAC×BIP×documentos,
-- lib/urbi/cruzamento.ts) precisa de 2 tipos novos de sugestão em urbi_sugestoes
-- (2026_09_03_urbi_sugestoes.sql), pra registrar "possível divergência" (lip_x_documento) e
-- "base jurídica ausente" (mac_item_x_bip) — mesmo espírito dos 4 tipos já existentes, sem
-- mudar mais nada da tabela.
--
-- ✅ APLICADA — testada em transação com ROLLBACK antes de aplicar de verdade (ver rodapé).

BEGIN;

ALTER TABLE urbi_sugestoes DROP CONSTRAINT urbi_sugestoes_tipo_check;
ALTER TABLE urbi_sugestoes ADD CONSTRAINT urbi_sugestoes_tipo_check CHECK (tipo IN (
  'item_voltou_nao_conforme', 'documento_sem_registro',
  'aguardando_retorno_base_insuficiente', 'incoerencia_lip_mac',
  'divergencia_lip_documento', 'item_sem_base_juridica'
));

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 03/09/2026, transação com ROLLBACK antes de aplicar de verdade
-- ======================================================================
-- DROP+ADD CONSTRAINT rodado dentro de transação de teste: insert com tipo
-- 'divergencia_lip_documento' confirmado aceito (falhava antes da mudança), insert com tipo
-- fora da lista continua rejeitado, os 4 tipos antigos continuam aceitos. Tudo desfeito por
-- ROLLBACK, confirmado por fora que a constraint antiga ainda valia — só então aplicada de
-- verdade.
-- ======================================================================
