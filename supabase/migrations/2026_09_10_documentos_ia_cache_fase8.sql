-- ============================================================================
-- Fase 8 do plano docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md — "Não pagar
-- duas vezes": reimportar o mesmo arquivo (mesmos bytes) não gera cobrança
-- nova de IA. Chave é o SHA-256 do arquivo inteiro (lib/documentosSei/
-- hashOrigem.ts:hashCompletoBytes) — mesmo arquivo re-enviado ao LIP
-- (app/processo/ProcessoClient.tsx:lerLip) encontra o resultado já pronto e
-- pula S1/S2/S3 (upload + chamadas ao Gemini).
--
-- Escopo desta fase: só a leitura do LIP (S1/S2/S3). O MAC (/api/mac/p3)
-- continua incondicional — é pipeline separado (Fase 9, futura, é quem une
-- os dois). Cache é GLOBAL por hash de bytes (não por processo): o mesmo PDF
-- de um documento padronizado (ex.: um DUAM, uma certidão) que se repete
-- entre processos diferentes também é reaproveitado.
-- ============================================================================

create table if not exists documentos_ia_cache (
  hash          text primary key,
  processo_codigo text,
  resultado     jsonb not null,
  criado_em     timestamptz not null default now()
);

comment on table documentos_ia_cache is
  'Fase 8: cache de leitura Gemini do LIP por hash de bytes do arquivo. Mesmo arquivo reimportado não é enviado à IA de novo.';
comment on column documentos_ia_cache.hash is
  'SHA-256 completo (64 hex) dos bytes do arquivo — lib/documentosSei/hashOrigem.ts:hashCompletoBytes.';
comment on column documentos_ia_cache.resultado is
  'Mesmo formato que o S3 devolve: {campos, alertasMAC, validacoes, pendencias, marcoTemporal, tipoProcesso, documentos}.';
