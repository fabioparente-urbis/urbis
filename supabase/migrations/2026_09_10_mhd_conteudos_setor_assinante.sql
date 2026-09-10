-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-10 · Fase 1 do plano de leitura de PDF (docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md)
-- "Gravar departamento, assinante e data" — achado §5.4: o fatiador do Organizador de PDF SEI
-- (lib/documentosSei/fatiar.ts) já EXTRAI setor e assinante de cada documento, mostra na tela, e
-- a gravação em mhd_conteudos DESCARTA os dois (só `data_documento` já existia como coluna, e
-- também nunca era populada por este caminho). Esta migration só abre espaço: a gravação em si é
-- lib/mhd.ts + lib/documentosSei/persistencia.ts, no mesmo commit.
--
-- Por que em mhd_conteudos, não em mhd_documentos ou mhd_versoes: setor e assinante são
-- DERIVADOS DO CONTEÚDO do documento (quem assinou, de qual secretaria) — os mesmos valores em
-- qualquer processo onde este arquivo apareça, exatamente o raciocínio que já pôs
-- `data_documento` ali (ver supabase/migrations/2026_07_27_mhd_conteudos_por_hash.sql). Mantê-los
-- na versão duplicaria por processo o que é global por hash.
--
-- Nullable, sem default: são "melhor esforço" — o próprio fatiar.ts documenta que nunca bloqueiam
-- nada e podem faltar (documento do interessado, sem letreiro de órgão; assinatura não detectável).
-- ─────────────────────────────────────────────────────────────────────────────

alter table mhd_conteudos
  add column if not exists setor      text,
  add column if not exists assinante  text;

comment on column mhd_conteudos.setor is
  'Departamento/secretaria emissora, melhor esforço (lib/documentosSei/fatiar.ts: acharSetorNaPagina). Pode faltar — documento do interessado não tem letreiro de órgão.';
comment on column mhd_conteudos.assinante is
  'Quem assinou o documento, melhor esforço (lib/documentosSei/fatiar.ts: acharAssinante). Nunca bloqueia nada, só ajuda o analista a identificar.';
