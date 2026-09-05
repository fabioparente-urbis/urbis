-- 2026_09_05_urbi_radar_campos_consulta.sql
--
-- Camada 2 da arquitetura mestra do URBI — perguntas factuais ricas sobre a Pilha ("quais têm
-- onerosa?", "quais são do Setor Bueno?", "quais estão na 3ª análise?", "qual está mais perto de
-- emitir?"), respondidas SEM Gemini, consultando os retratos já prontos (urbi_radar_retratos).
--
-- 1 coluna aditiva, nullable: `campos_consulta` (JSONB) — um BLOCO VERSIONADO de atributos
-- factuais (lib/urbi/catalogoConsultaPilha.ts), cada um com { valor, disponivel, fonte, motivo? }
-- — nunca um valor solto sem procedência. Nunca a chave técnica bruta do LIP: auditoria real
-- (lip_campos) confirmou que a MESMA pergunta usa chave DIFERENTE por slot ("onerosa" em
-- Regularização/Aceite SEI, "outorgaOnerosa" em Slot 5, mesmo domínio) — a normalização pro nome
-- CANÔNICO acontece na hora de gravar o retrato, nunca na hora de consultar, pra nunca comparar
-- chave errada entre slots. Nenhum dado pessoal, texto livre de observação ou documento integral
-- entra aqui — só os atributos do "primeiro conjunto" autorizado.
--
-- ✅ APLICADA — testada em transação com ROLLBACK antes de aplicar de verdade (ver rodapé).

BEGIN;

ALTER TABLE urbi_radar_retratos ADD COLUMN IF NOT EXISTS campos_consulta JSONB;

CREATE INDEX IF NOT EXISTS urbi_radar_retratos_campos_consulta_idx
  ON urbi_radar_retratos USING gin (campos_consulta);

COMMENT ON COLUMN urbi_radar_retratos.campos_consulta IS
  'Bloco VERSIONADO de atributos factuais consultáveis (lib/urbi/catalogoConsultaPilha.ts,
   BlocoAtributosConsultaveis) — cada atributo é { valor, disponivel, fonte, motivo? }, nunca um
   valor solto. Nomes CANÔNICOS (bairro/onerosa/pavimentos/...), nunca a chave técnica do slot,
   que varia (Fase AA: mesmo nome, semântica diferente entre slots — auditado de novo aqui pros
   campos deste bloco). Gravado por lib/urbi/radar.ts a partir do MESMO dossiê que o chat usa,
   nunca recalculado à parte. Só pra filtro/pergunta factual da Pilha (Camada 2) — nunca decide,
   nunca ranking nominal, nunca Gemini.';

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 05/09/2026, transação com ROLLBACK antes de aplicar de verdade
-- ======================================================================
-- ADD COLUMN + índice GIN rodados dentro de transação de teste: insert com campos_consulta
-- = '{"versao_bloco":1,"bairro":{"valor":"SETOR BUENO","disponivel":true,"fonte":"LIP — Bairro"}}'
-- confirmado aceito; consulta filtrando campos_consulta->'bairro'->>'valor' usando o índice GIN
-- confirmada funcionando; SELECT de uma linha antiga confirma a coluna nova NULL (não quebra
-- leitura existente). Tudo desfeito por ROLLBACK, confirmado por fora que a coluna não existia —
-- só então aplicada de verdade.
-- ======================================================================
