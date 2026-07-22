-- Prende o número do documento à análise que o gerou.
--
-- Antes desta migration, o único lugar que amarrava análise ↔ número era
-- processos.tags (jsonb): gravado em best-effort (falha silenciosa) e
-- apagável pelo admin na lista de processos. Se a tag sumisse, o número
-- já tinha sido consumido e o vínculo se perdia — sem rastro.
--
-- Passam a existir dois registros independentes:
--   • urbis_numeracao_uso.numero_analise → trilha de auditoria completa,
--     com TODO número já consumido e a qual análise pertenceu. Não é
--     editável pela interface.
--   • analises_mac.numero_despacho → o número vigente da própria análise.
--
-- Vale para Regularização SEI e Aceite SEI (mesmas tabelas nos dois).

ALTER TABLE urbis_numeracao_uso
  ADD COLUMN IF NOT EXISTS numero_analise SMALLINT;

COMMENT ON COLUMN urbis_numeracao_uso.numero_analise IS
  'Análise (1..5) que consumiu este número. NULL em documentos sem análise vinculada, como Despacho Interno.';

ALTER TABLE analises_mac
  ADD COLUMN IF NOT EXISTS numero_despacho TEXT;

COMMENT ON COLUMN analises_mac.numero_despacho IS
  'Número do último documento emitido por esta análise. O histórico completo fica em urbis_numeracao_uso.';

-- Reconstrói o vínculo do que já existe, a partir das tags gravadas.
-- Só preenche o que está vazio — nunca sobrescreve.
--
-- lower(tipo_processo) alcança também as análises antigas gravadas como
-- 'REGULARIZACAO'. Nos 7 processos que têm análise 1 duplicada por causa
-- dessa grafia, as duas linhas recebem o mesmo número — é o melhor que a
-- tag permite afirmar. Daqui pra frente o vínculo é gravado no momento do
-- commit, por id da análise, sem ambiguidade.
WITH tags_expandidas AS (
  SELECT p.codigo,
         (tag->>'numero_analise')::int AS numero_analise,
         tag->>'numero_despacho'       AS numero_despacho
  FROM processos p
  CROSS JOIN LATERAL jsonb_array_elements(p.tags) AS tag
  WHERE jsonb_typeof(p.tags) = 'array'
    AND tag->>'tipo' IN ('despacho', 'indeferimento', 'arquivamento')
    AND tag->>'numero_despacho' IS NOT NULL
    AND tag->>'numero_analise' ~ '^[0-9]+$'
)
UPDATE analises_mac a
SET numero_despacho = te.numero_despacho
FROM tags_expandidas te
WHERE a.processo_codigo = te.codigo
  AND a.numero_analise  = te.numero_analise
  AND lower(a.tipo_processo) IN ('regularizacao', 'aceite_sei')
  AND a.numero_despacho IS NULL;
