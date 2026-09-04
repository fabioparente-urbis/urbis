-- 2026_09_04_urbi_historico_fontes.sql
--
-- Fase AB do plano de Inteligência URBIS — contrato de resposta do Co-Analista com evidência
-- verificável. Pedido explícito: "Registre no histórico do URBI o código, slot e tipos de
-- fonte usados na interação, sem duplicar dados pessoais."
--
-- `urbi_historico` (app/api/urbi/historico/route.ts) hoje só guarda usuário/mensagem/resposta/
-- linha/pose — nada liga uma conversa a QUAL processo/slot ela leu nem a QUE TIPOS de fonte
-- (LIP/MAC/BIP/Documentos) alimentaram aquela resposta. Sem isso não dá pra auditar depois "o
-- Co-Analista usou fonte real nesta conversa?" sem reler o texto inteiro e adivinhar.
--
-- Três colunas aditivas, todas NULLABLE (NULL pra toda linha existente e pra qualquer conversa
-- sem processo em contexto — papo geral): `processo_codigo` e `tipo_processo` espelham o mesmo
-- vocabulário de urbi_sugestoes.slot (migration 2026_09_04_urbi_sugestoes_slot.sql, mesmo CHECK
-- de slots conhecidos). `fontes_tipos` é só a lista de CATEGORIAS de fonte (ex.: ["LIP", "MAC",
-- "BIP"]) que o manifesto (lib/urbi/manifestoFontes.ts) reportou pra aquela resposta — nunca o
-- detalhe da fonte nem o conteúdo do dossiê, então não duplica dado pessoal nenhum (o dossiê já
-- filtra nome/CPF/contato antes de chegar até aqui).
--
-- ✅ APLICADA — testada em transação com ROLLBACK antes de aplicar de verdade (ver rodapé).

BEGIN;

ALTER TABLE urbi_historico ADD COLUMN IF NOT EXISTS processo_codigo TEXT;
ALTER TABLE urbi_historico ADD COLUMN IF NOT EXISTS tipo_processo TEXT;
ALTER TABLE urbi_historico ADD CONSTRAINT urbi_historico_tipo_processo_check
  CHECK (tipo_processo IS NULL OR tipo_processo IN ('regularizacao', 'aceite_sei', 'slot_05'));
ALTER TABLE urbi_historico ADD COLUMN IF NOT EXISTS fontes_tipos TEXT[];

CREATE INDEX IF NOT EXISTS urbi_historico_processo_codigo_idx ON urbi_historico(processo_codigo);

COMMENT ON COLUMN urbi_historico.processo_codigo IS
  'Código do processo em contexto quando esta mensagem foi respondida (app/api/urbi/chat/route.ts,
   campo `codigo` — sempre derivado da URL atual, nunca de texto digitado). NULL = papo geral,
   sem processo em contexto, ou linha gravada antes desta coluna existir.';
COMMENT ON COLUMN urbi_historico.tipo_processo IS
  'tipo_processo (slot) do processo acima no momento da resposta — mesmo vocabulário de
   urbi_sugestoes.slot. NULL nas mesmas condições da coluna processo_codigo.';
COMMENT ON COLUMN urbi_historico.fontes_tipos IS
  'Categorias de fonte usadas nesta resposta (ex.: {LIP,MAC,BIP,Documentos}), do manifesto
   calculado em código (lib/urbi/manifestoFontes.ts) — nunca o detalhe da fonte nem o conteúdo
   do dossiê, só a classificação. NULL/vazio quando não houve dossiê nesta resposta.';

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 04/09/2026, transação com ROLLBACK antes de aplicar de verdade
-- ======================================================================
-- ADD COLUMN x3 + CHECK + índice rodados dentro de transação de teste: insert com
-- tipo_processo='slot_05' e fontes_tipos=ARRAY['LIP','MAC'] confirmado aceito; insert com
-- tipo_processo='slot_99' confirmado REJEITADO pelo CHECK; insert sem nenhum dos três campos
-- (NULL) confirmado aceito, igual a uma linha antiga. SELECT de uma linha antiga confirma as
-- três colunas novas NULL (não quebra leitura existente). Tudo desfeito por ROLLBACK,
-- confirmado por fora que as colunas não existiam — só então aplicada de verdade.
-- ======================================================================
