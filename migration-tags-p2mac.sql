-- ============================================================
-- Migration: tags por processo + prompt P2_MAC
-- Aplicar no Supabase (SQL Editor) antes de testar as mudanças.
-- ============================================================

-- 1) Coluna `tags` no processo (JSONB array; default lista vazia)
--    Observação: a tabela é `processos` (não `processos_lip`).
ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

-- 2) Prompt P2_MAC — só insere se ainda não existir (idempotente)
INSERT INTO lip_prompts (chave, conteudo, versao, ativo)
SELECT
  'P2_MAC',
  'Você é um analista de regularização da Prefeitura de Goiânia. Analise o PDF e os itens do checklist. Para cada item retorne "conforme", "nao_conforme", "nao_aplica" ou null (se não puder determinar). Seja conservador: dúvida = null. Retorne APENAS JSON: { "id_do_item": "conforme"|"nao_conforme"|"nao_aplica"|null }',
  1,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM lip_prompts WHERE chave = 'P2_MAC'
);
