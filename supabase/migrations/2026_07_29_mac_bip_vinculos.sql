-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-07-29 · MAC × BIP — relacionamento N:N entre itens do checklist e
--              FRAGMENTOS do BDI (artigos, seções, trechos indexados).
--
-- Hierarquia: MAC Item → Fragmento BIP → Documento BIP
-- O documento é obtido via bdi_lei_fragmentos.documento_id — não há FK duplicada.
--
-- Princípio: ausência de vínculo não é erro.
-- Itens SEM_FUNDAMENTO_BIP representam procedimento administrativo ou operacional
-- legítimo que não possui entrada específica no BIP.
-- ─────────────────────────────────────────────────────────────────────────────

-- Classificação por item (resultado da análise institucional)
ALTER TABLE mac_checklist_itens
  ADD COLUMN IF NOT EXISTS classificacao_bip     TEXT,
  -- 'VINCULADO_BIP' | 'SEM_FUNDAMENTO_BIP' | 'REVISAO_MANUAL' | NULL (não analisado)
  ADD COLUMN IF NOT EXISTS classificacao_bip_em  TIMESTAMPTZ;

COMMENT ON COLUMN mac_checklist_itens.classificacao_bip IS
  'Resultado da análise MAC×BIP: VINCULADO_BIP | SEM_FUNDAMENTO_BIP | REVISAO_MANUAL.
   NULL = ainda não analisado.';

-- Relacionamento N:N — item do MAC ↔ fragmento do BIP
-- O documento (lei) é obtido via bdi_lei_fragmentos.documento_id — sem duplicação.
CREATE TABLE IF NOT EXISTS mac_bip_vinculos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mac_item_id     UUID NOT NULL REFERENCES mac_checklist_itens(id) ON DELETE CASCADE,
  bip_fragmento_id UUID NOT NULL REFERENCES bdi_lei_fragmentos(id) ON DELETE CASCADE,
  confianca       TEXT NOT NULL CHECK (confianca IN ('ALTA','MEDIA','BAIXA')),
  -- 'ALTA'  = fundamento_legal cita o artigo/seção e o fragmento corresponde exatamente
  -- 'MEDIA' = correspondência por tema/grupo confirmada via conteúdo do fragmento
  -- 'BAIXA' = inferida por contexto de grupo; fragmento é representativo, não exato
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mac_item_id, bip_fragmento_id)
);

CREATE INDEX IF NOT EXISTS mac_bip_vinculos_item_idx ON mac_bip_vinculos(mac_item_id);
CREATE INDEX IF NOT EXISTS mac_bip_vinculos_frag_idx ON mac_bip_vinculos(bip_fragmento_id);

COMMENT ON TABLE mac_bip_vinculos IS
  'Relacionamento N:N entre itens do MAC (mac_checklist_itens) e fragmentos do BIP
   (bdi_lei_fragmentos). O documento da lei fica em bdi_lei_fragmentos.documento_id.
   Ausência de linha = sem fundamento BIP confirmado, não erro.';

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSÃO:
--   DROP TABLE IF EXISTS mac_bip_vinculos;
--   ALTER TABLE mac_checklist_itens
--     DROP COLUMN IF EXISTS classificacao_bip,
--     DROP COLUMN IF EXISTS classificacao_bip_em;
-- ─────────────────────────────────────────────────────────────────────────────
