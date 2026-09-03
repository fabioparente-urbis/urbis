-- 2026_09_03_buscar_bip_fragmentos_similares.sql
--
-- Fase A do plano de Inteligência URBIS (BIP útil de verdade) — autorizado pelo Fábio em
-- 03/09/2026. Auditoria confirmou: `bdi_lei_fragmentos.embedding` já existe, é populado na
-- indexação (app/api/bdi/indexar-lei/route.ts, gemini-embedding-001, 768 dimensões) e tem
-- índice HNSW (idx_fragmentos_embedding) — mas NENHUMA função de busca por similaridade
-- exposta existe (grep em todo supabase/schema e supabase/migrations não achou nenhuma). Tanto
-- a fila de vínculos (app/api/mac/vinculos-fila/buscar-bip) quanto o chat do URBI
-- (buscarNoBip em app/api/urbi/chat/route.ts) usam só `ilike` — o índice vetorial nunca foi
-- usado. Esta função é a peça que faltava.
--
-- Só busca (SELECT) — nunca decide vínculo, nunca é chamada automaticamente sem o usuário ter
-- pedido a busca. `bdi_lei_fragmentos` já tem RLS habilitada com grant só pra service_role
-- (supabase/schema/06_rls_policies_grants.sql:23-24,224) — mesma restrição aplicada aqui.
--
-- ✅ APLICADA — testada em transação com ROLLBACK antes de aplicar de verdade (ver rodapé).

BEGIN;

CREATE OR REPLACE FUNCTION public.buscar_bip_fragmentos_similares(
  query_embedding vector(768),
  match_count int DEFAULT 8,
  filtro_documento_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  documento_id uuid,
  referencia text,
  texto text,
  distancia float8
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT f.id, f.documento_id, f.referencia, f.texto, (f.embedding <=> query_embedding) AS distancia
  FROM bdi_lei_fragmentos f
  WHERE f.embedding IS NOT NULL
    AND (filtro_documento_ids IS NULL OR f.documento_id = ANY(filtro_documento_ids))
  ORDER BY f.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 50);
$$;

COMMENT ON FUNCTION public.buscar_bip_fragmentos_similares IS
  'Top-N fragmentos do BIP mais próximos de um embedding de consulta (distância de cosseno,
   usa o índice HNSW já existente). Só leitura; quem gera o embedding da consulta decide
   quando chamar isto — nunca roda em cada tecla digitada. Resultado é sempre "candidato pra
   revisão humana", nunca vínculo automático.';

REVOKE ALL ON FUNCTION public.buscar_bip_fragmentos_similares(vector, int, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_bip_fragmentos_similares(vector, int, uuid[]) TO service_role;

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 03/09/2026, transação com ROLLBACK antes de aplicar de verdade
-- ======================================================================
-- CREATE FUNCTION + COMMENT + REVOKE/GRANT rodados dentro de transação controlada
-- externamente (script Node com `pg` contra SUPABASE_DB_URL, apagado depois de usar):
-- chamada de teste com um embedding real (de um fragmento já indexado, então a distância do
-- próprio fragmento contra si mesmo deu ~0) confirmada retornando os N mais próximos na ordem
-- certa; chamada com `filtro_documento_ids` confirmada restringindo por lei; tudo desfeito por
-- ROLLBACK, confirmado por fora que a função não existia — só então aplicada de verdade.
-- ======================================================================
