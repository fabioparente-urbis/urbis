-- ============================================================
-- URBIS — Fluxo MAC ACEITE
-- Roda no SQL editor do Supabase ANTES de subir o código.
-- Idempotente: pode rodar mais de uma vez sem duplicar.
-- ============================================================

-- 1) Clonar modelos de checklist (REGULARIZACAO -> ACEITE)
INSERT INTO mac_checklist_modelos (nome, tipo, ativo, criado_em)
SELECT m.nome || ' — ACEITE', 'ACEITE', m.ativo, now()
FROM mac_checklist_modelos m
WHERE m.tipo = 'REGULARIZACAO'
  AND NOT EXISTS (
    SELECT 1 FROM mac_checklist_modelos x
    WHERE x.nome = m.nome || ' — ACEITE' AND x.tipo = 'ACEITE'
  );

-- 2) Clonar itens vinculando aos novos modelos ACEITE
INSERT INTO mac_checklist_itens (modelo_id, grupo, ordem, texto, ref, chave_lip, ativo)
SELECT
  novo.id,
  i.grupo, i.ordem, i.texto, i.ref, i.chave_lip, i.ativo
FROM mac_checklist_itens i
JOIN mac_checklist_modelos m
  ON m.id = i.modelo_id
JOIN mac_checklist_modelos novo
  ON novo.nome = m.nome || ' — ACEITE' AND novo.tipo = 'ACEITE'
WHERE m.tipo = 'REGULARIZACAO'
  AND NOT EXISTS (
    SELECT 1 FROM mac_checklist_itens x
    WHERE x.modelo_id = novo.id
      AND x.grupo = i.grupo
      AND x.ordem = i.ordem
      AND COALESCE(x.texto,'') = COALESCE(i.texto,'')
  );

-- 3) Permitir mesmo codigo com tipos diferentes.
--    O par (codigo, tipo_processo) é único — NUNCA dois processos com o mesmo
--    codigo + tipo. Mas o mesmo codigo PODE ter um REGULARIZACAO e um ACEITE.
CREATE UNIQUE INDEX IF NOT EXISTS processos_codigo_tipo_uk
  ON processos (codigo, tipo_processo);

-- 4) Diferenciar análises do MAC por tipo de processo.
--    Sem essa coluna, o mesmo `processo_codigo` mesclaria análises de
--    REGULARIZACAO e ACEITE (porque elas se conectam por codigo).
ALTER TABLE analises_mac
  ADD COLUMN IF NOT EXISTS tipo_processo text NOT NULL DEFAULT 'REGULARIZACAO';

CREATE INDEX IF NOT EXISTS analises_mac_codigo_tipo_idx
  ON analises_mac (processo_codigo, tipo_processo);
