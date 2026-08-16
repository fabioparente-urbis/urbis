-- Data atômica de cada análise (Regularização SEI e Aceite SEI — mesmas
-- tabelas nos dois, diferenciadas por analises_mac.tipo_processo).
--
-- Antes, a data de emissão do despacho/parecer de cada análise só existia
-- em processos.tags (JSONB gravado client-side, best-effort, sem retry,
-- com catch silencioso). Se essa gravação falhasse ou o cache da tela
-- (tagsProcesso) estivesse desatualizado, dataDaAnalise() caía num
-- fallback errado (criado_em = data de ABERTURA da análise, não de
-- EMISSÃO do despacho), fazendo a data de análises anteriores "sumir"/
-- aparecer errada ao reemitir o despacho numa análise posterior.
--
-- Agora a data é gravada na mesma UPDATE que já grava numero_despacho/
-- numero_parecer em app/api/numeracao/proximo/route.ts — atômica com o
-- número, sem depender de rede/cache do cliente.
ALTER TABLE analises_mac
  ADD COLUMN IF NOT EXISTS data_despacho text,
  ADD COLUMN IF NOT EXISTS data_parecer text;
