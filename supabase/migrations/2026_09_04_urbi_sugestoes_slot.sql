-- 2026_09_04_urbi_sugestoes_slot.sql
--
-- Fase M do plano de Inteligência URBIS — auditoria dos campos que toda sugestão deve sempre
-- carregar (processo, SLOT, tipo, fonte, grau de certeza, estado humano, data). Achado real:
-- `slot` não existia como coluna — só era derivável em tempo de leitura fazendo JOIN com
-- `processos.tipo_processo` (ver app/api/admin/urbi/sugestoes/route.ts, Fase F). Isso deixa a
-- linha auditável incompleta sozinha: se o processo for excluído/renomeado depois, a sugestão
-- perde a informação de slot pra sempre, mesmo sendo um fato que já era conhecido no momento em
-- que a sugestão nasceu.
--
-- Coluna aditiva, nullable — nenhuma linha existente muda de comportamento (hoje a tabela tem 0
-- linhas, confirmado antes desta migration). CHECK opcional pros 3 slots conhecidos hoje, sem
-- travar a porta pra um slot futuro: NULL continua permitido pra quem não informar.
--
-- ✅ APLICADA — testada em transação com ROLLBACK antes de aplicar de verdade (ver rodapé).

BEGIN;

ALTER TABLE urbi_sugestoes ADD COLUMN IF NOT EXISTS slot TEXT;
ALTER TABLE urbi_sugestoes ADD CONSTRAINT urbi_sugestoes_slot_check
  CHECK (slot IS NULL OR slot IN ('regularizacao', 'aceite_sei', 'slot_05'));

CREATE INDEX IF NOT EXISTS urbi_sugestoes_slot_idx ON urbi_sugestoes(slot);

COMMENT ON COLUMN urbi_sugestoes.slot IS
  'tipo_processo do processo no momento em que a sugestão foi gravada (lib/urbi/sugestoes.ts,
   registrarSugestoesAutomaticas) — self-contido, não depende de JOIN com processos pra
   auditoria. NULL só em linha gravada antes desta coluna existir (nenhuma hoje).';

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 04/09/2026, transação com ROLLBACK antes de aplicar de verdade
-- ======================================================================
-- ADD COLUMN + CHECK + índice rodados dentro de transação de teste: insert com slot='slot_05'
-- confirmado aceito, insert com slot fora da lista (ex.: 'slot_99') confirmado REJEITADO,
-- insert sem informar slot (NULL) confirmado aceito. Tudo desfeito por ROLLBACK, confirmado
-- por fora que a coluna não existia — só então aplicada de verdade.
-- ======================================================================
