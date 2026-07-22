-- Prende também o número do Despacho Interno à análise que o emitiu.
--
-- O Despacho Interno é emitido de dentro de uma análise e consome número
-- da MESMA série do despacho ao interessado (tipo='despacho'). Por isso
-- não pode dividir a coluna numero_despacho com ele: a mesma análise pode
-- emitir os dois, e o segundo apagaria o número do primeiro.
--
-- Cada documento que consome número passa a ter sua própria coluna:
--   numero_despacho          → Despacho ao interessado   (série despacho)
--   numero_despacho_interno  → Despacho Interno          (série despacho)
--   numero_parecer           → Indeferimento/Arquivamento (série parecer)
--
-- O histórico completo, com todo número já consumido, segue em
-- urbis_numeracao_uso.
--
-- Vale para Regularização SEI e Aceite SEI.

ALTER TABLE analises_mac
  ADD COLUMN IF NOT EXISTS numero_despacho_interno TEXT;

COMMENT ON COLUMN analises_mac.numero_despacho_interno IS
  'Número do último Despacho Interno emitido por esta análise. Série de despacho, mas coluna separada do despacho ao interessado.';

-- Reconstrói o que dá a partir das tags já gravadas. As tags de
-- despacho_interno nunca guardaram numero_analise (corrigido no mesmo
-- commit desta migration), então só é possível recuperar o vínculo quando
-- o processo tem exatamente uma análise — sem ambiguidade sobre a qual
-- delas o despacho interno pertence.
WITH tags_di AS (
  SELECT p.codigo,
         tag->>'numero_despacho' AS numero_despacho
  FROM processos p
  CROSS JOIN LATERAL jsonb_array_elements(p.tags) AS tag
  WHERE jsonb_typeof(p.tags) = 'array'
    AND tag->>'tipo' = 'despacho_interno'
    AND tag->>'numero_despacho' IS NOT NULL
    AND tag->>'numero_despacho' <> ''
),
processos_com_uma_analise AS (
  SELECT processo_codigo
  FROM analises_mac
  WHERE lower(tipo_processo) IN ('regularizacao', 'aceite_sei')
  GROUP BY processo_codigo
  HAVING count(*) = 1
)
UPDATE analises_mac a
SET numero_despacho_interno = t.numero_despacho
FROM tags_di t
JOIN processos_com_uma_analise u ON u.processo_codigo = t.codigo
WHERE a.processo_codigo = t.codigo
  AND lower(a.tipo_processo) IN ('regularizacao', 'aceite_sei')
  AND a.numero_despacho_interno IS NULL;
