-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-07-29 · MAC — compatibilização com o Despacho Geral Oficial
--
-- O checklist do MAC (mac_checklist_itens) hoje só guarda `texto` — um campo só
-- para duas naturezas diferentes: a EXIGÊNCIA que vai ao interessado no
-- despacho, e a ORIENTAÇÃO interna ("OBS. AO ANALISTA") que nunca pode
-- aparecer nele. Compatibilizar o checklist com o Despacho Geral Oficial exige
-- separar isso — sem isso, uma nota interna vira exigência por acidente.
--
-- Aditiva. Nenhuma coluna existente muda de tipo ou significado. Reversão
-- comentada no fim.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE mac_checklist_itens
  -- de onde este item veio nesta compatibilização — nunca reescreve histórico,
  -- só documenta a proveniência do texto atual
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'BANCO_LEGADO',
  -- 'DOCUMENTO_OFICIAL' | 'PLANILHA' | 'BANCO_LEGADO'

  -- orientação interna ao analista. NUNCA sai no despacho ao interessado —
  -- é o que separa "OBS. AO ANALISTA" de exigência de verdade
  ADD COLUMN IF NOT EXISTS nota_analista TEXT,

  -- lei, artigo, parágrafo, inciso, tabela ou norma, quando o documento
  -- oficial os cita explicitamente. Texto livre de propósito — a extração
  -- estruturada (lei × artigo × inciso em colunas próprias) é assunto da
  -- evolução arquitetural do MAC, ainda pausada
  ADD COLUMN IF NOT EXISTS fundamento_legal TEXT,

  -- a condição textual do item ("se for o caso", "quando necessário", "para
  -- projetos de..."), preservada explicitamente — para não virar exigência
  -- universal por reescrita
  ADD COLUMN IF NOT EXISTS condicao_aplicabilidade TEXT,

  -- referências ao glossário do Plano Diretor que este item usa (ADD, AA,
  -- AOS, ARAU, PDU...) — nunca vira aba operacional, só consulta interna
  ADD COLUMN IF NOT EXISTS termos_glossario TEXT[],

  -- qual rodada de compatibilização tocou este item pela última vez, e quando
  ADD COLUMN IF NOT EXISTS versao_compatibilizacao TEXT,
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ;

COMMENT ON COLUMN mac_checklist_itens.origem IS
  'Proveniência do texto atual desta compatibilização: DOCUMENTO_OFICIAL | PLANILHA | BANCO_LEGADO.';
COMMENT ON COLUMN mac_checklist_itens.nota_analista IS
  'Orientação interna (ex.: "OBS. AO ANALISTA"). NUNCA aparece no despacho ao interessado.';
COMMENT ON COLUMN mac_checklist_itens.condicao_aplicabilidade IS
  'Condição textual do item ("se for o caso", "quando necessário"...), preservada — nunca vira exigência universal.';


-- ── GLOSSÁRIO DO PLANO DIRETOR ────────────────────────────────────────────────
-- Referência interna, não aba operacional do checklist (regra 6 da
-- compatibilização). Vinculado a itens via `mac_checklist_itens.termos_glossario`.
CREATE TABLE IF NOT EXISTS mac_glossario (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  termo      TEXT NOT NULL UNIQUE,   -- 'ADD', 'AA', 'AOS', 'ARAU', 'PDU'...
  definicao  TEXT NOT NULL,
  origem     TEXT NOT NULL DEFAULT 'DOCUMENTO_OFICIAL',
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE mac_glossario IS
  'Termos do Plano Diretor citados pelos itens do MAC. Referência interna — nunca aparece ao interessado, nunca é aba de checklist.';

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSÃO:
--   DROP TABLE IF EXISTS mac_glossario;
--   ALTER TABLE mac_checklist_itens
--     DROP COLUMN IF EXISTS origem, DROP COLUMN IF EXISTS nota_analista,
--     DROP COLUMN IF EXISTS fundamento_legal, DROP COLUMN IF EXISTS condicao_aplicabilidade,
--     DROP COLUMN IF EXISTS termos_glossario, DROP COLUMN IF EXISTS versao_compatibilizacao,
--     DROP COLUMN IF EXISTS atualizado_em;
-- ─────────────────────────────────────────────────────────────────────────────
