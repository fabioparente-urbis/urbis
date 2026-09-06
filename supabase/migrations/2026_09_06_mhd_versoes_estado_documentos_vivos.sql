-- 2026_09_06_mhd_versoes_estado_documentos_vivos.sql
--
-- Pré-requisito da Fase 6/7 do plano Documentos Vivos (docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md §20):
-- o Organizador de PDF SEI (Slots 1/2) passa a gravar `mhd_documentos`/`mhd_versoes` de verdade
-- por documento (hoje só grava 1 evento por organização, com tudo dentro de um JSON solto).
--
-- `lib/documentosSei/motorVersoes.ts` (Fase 4) já resolve vigente/substituído/sem-efeito/histórico
-- dentro de um fatiamento — estas 3 colunas guardam esse resultado quando a versão é gravada.
--
-- NULLABLE e SEM CHECK de propósito: o Slot 5 (`lib/mhd.ts` `registrarLeitura`) nunca preenche
-- essas colunas e continua decidindo tudo por `vigente` (boolean, já existente) — isolamento entre
-- slots do CLAUDE.md. Só o Organizador de PDF SEI (Slots 1/2) escreve aqui.

BEGIN;

ALTER TABLE public.mhd_versoes
  ADD COLUMN IF NOT EXISTS estado text,
  ADD COLUMN IF NOT EXISTS motivo_estado text,
  ADD COLUMN IF NOT EXISTS confianca_estado text;

COMMENT ON COLUMN public.mhd_versoes.estado IS
  'vigente | substituido | complementar | sem_efeito | historico | duplicado | pendente — só
   preenchido pelo Organizador de PDF SEI (Slots 1/2, lib/documentosSei/persistencia.ts). NULL
   para versões do Slot 5 (lerPastaSlot5/registrarLeitura), que continuam decidindo por `vigente`.';
COMMENT ON COLUMN public.mhd_versoes.motivo_estado IS
  'Motivo textual da resolução de estado (lib/documentosSei/motorVersoes.ts) — auditável, nunca
   "confia e esquece".';
COMMENT ON COLUMN public.mhd_versoes.confianca_estado IS
  'alta | media | baixa — confiança da resolução de estado. "baixa" sinaliza a tela pra pedir
   conferência do analista (nunca declarar vigente no escuro).';

COMMIT;
