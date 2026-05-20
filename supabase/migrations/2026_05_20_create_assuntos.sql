-- 2026_05_20_create_assuntos.sql
--
-- Cria a tabela `assuntos` — registro mestre dos 15 trilhos de processo
-- que o sistema URBIS vai suportar. Cada assunto tera seu proprio LIP e
-- MAC nas Sessoes 4 e 5.
--
-- - Slot 1 (`regularizacao`) e fixo, sempre ativo e nao pode ser
--   renomeado/desativado pela UI (regra aplicada no front e na API).
-- - Slots 2 a 15 nascem inativos e com nomes genericos; o
--   Administrador renomeia/ativa em /admin/configuracoes.

CREATE TABLE IF NOT EXISTS assuntos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  ordem INTEGER DEFAULT 0,
  criado_em TIMESTAMPTZ DEFAULT now()
);

INSERT INTO assuntos (slug, nome, ativo, ordem) VALUES
  ('regularizacao', 'Regularização', true,  1),
  ('slot_02',       'Slot 02',       false, 2),
  ('slot_03',       'Slot 03',       false, 3),
  ('slot_04',       'Slot 04',       false, 4),
  ('slot_05',       'Slot 05',       false, 5),
  ('slot_06',       'Slot 06',       false, 6),
  ('slot_07',       'Slot 07',       false, 7),
  ('slot_08',       'Slot 08',       false, 8),
  ('slot_09',       'Slot 09',       false, 9),
  ('slot_10',       'Slot 10',       false, 10),
  ('slot_11',       'Slot 11',       false, 11),
  ('slot_12',       'Slot 12',       false, 12),
  ('slot_13',       'Slot 13',       false, 13),
  ('slot_14',       'Slot 14',       false, 14),
  ('slot_15',       'Slot 15',       false, 15)
ON CONFLICT (slug) DO NOTHING;
