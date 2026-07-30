-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-07-29 · MAC × LIP — relacionamento N:N entre itens do checklist e os
--              136 campos da matriz de rastreabilidade do LIP.
--
-- O MAC nunca volta ao documento original: consome apenas fatos ESTRUTURADOS
-- que o LIP já produziu (ou vai produzir). `lip_chave` é a mesma string de
-- `lib/rastreabilidade/lipSlot5.ts` — não há tabela normalizada de campos do
-- LIP (eles vivem em código, como toda a matriz de rastreabilidade), então o
-- vínculo referencia por texto, mesmo padrão já usado em `chave_lip` de
-- mac_checklist_itens.
--
-- Princípio: ausência de vínculo não é erro. Item procedimental, documental
-- ou visual pode continuar válido e permanecer MANUAL_SEM_DADO_LIP.
-- ─────────────────────────────────────────────────────────────────────────────

-- Classificação por item (o que o LIP entrega HOJE para este item)
ALTER TABLE mac_checklist_itens
  ADD COLUMN IF NOT EXISTS classificacao_lip     TEXT,
  -- 'AUTOMATIZAVEL' | 'PARCIALMENTE_AUTOMATIZAVEL' | 'MANUAL_COM_EVIDENCIA_LIP'
  -- | 'MANUAL_SEM_DADO_LIP' | 'REVISAO_MANUAL' | NULL (não analisado)
  ADD COLUMN IF NOT EXISTS classificacao_lip_em  TIMESTAMPTZ;

COMMENT ON COLUMN mac_checklist_itens.classificacao_lip IS
  'Resultado da análise MAC×LIP: AUTOMATIZAVEL | PARCIALMENTE_AUTOMATIZAVEL |
   MANUAL_COM_EVIDENCIA_LIP | MANUAL_SEM_DADO_LIP | REVISAO_MANUAL. NULL = não analisado.
   Reflete o que o LIP entrega HOJE — um vínculo para campo ainda não implementado
   (PENDENTE_VISAO/BLOQUEADO) não conta como evidência viva.';

-- Relacionamento N:N — item do MAC ↔ campo do LIP
CREATE TABLE IF NOT EXISTS mac_lip_vinculos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mac_item_id   UUID NOT NULL REFERENCES mac_checklist_itens(id) ON DELETE CASCADE,
  lip_chave     TEXT NOT NULL,
  -- papel que o campo do LIP exerce PARA ESTE item do MAC
  papel         TEXT NOT NULL CHECK (papel IN (
                  'ENTRADA_REGRA', 'CONDICAO_APLICABILIDADE', 'EVIDENCIA',
                  'PARAMETRO_CALCULO', 'CONTEXTO', 'RESULTADO_ESPERADO'
                )),
  -- se este fato é indispensável para avaliar o item, ou só apoio/contexto
  obrigatorio   BOOLEAN NOT NULL DEFAULT false,
  confianca     TEXT NOT NULL CHECK (confianca IN ('ALTA','MEDIA','BAIXA')),
  justificativa TEXT NOT NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mac_item_id, lip_chave)
);

CREATE INDEX IF NOT EXISTS mac_lip_vinculos_item_idx ON mac_lip_vinculos(mac_item_id);
CREATE INDEX IF NOT EXISTS mac_lip_vinculos_chave_idx ON mac_lip_vinculos(lip_chave);

COMMENT ON TABLE mac_lip_vinculos IS
  'Relacionamento N:N entre itens do MAC (mac_checklist_itens) e campos do LIP
   (lib/rastreabilidade/lipSlot5.ts, por lip_chave). Não é motor de decisão — apenas
   modela quais fatos do LIP cada item usa, com que papel e obrigatoriedade.
   Ausência de linha = sem dependência de LIP identificada, não erro.';

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSÃO:
--   DROP TABLE IF EXISTS mac_lip_vinculos;
--   ALTER TABLE mac_checklist_itens
--     DROP COLUMN IF EXISTS classificacao_lip,
--     DROP COLUMN IF EXISTS classificacao_lip_em;
-- ─────────────────────────────────────────────────────────────────────────────
