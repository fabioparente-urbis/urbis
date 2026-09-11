-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-11 · FLUXO_PROCESSO_EVENTOS — Fase 10 (carga do acervo)
--
-- ┌─ POR QUE ─────────────────────────────────────────────────────────────────┐
-- │ Fase 10 do plano `docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md` (§3.3,     │
-- │ Rotina C): fatiar em lote processos JÁ ARQUIVADOS pra reconstruir a       │
-- │ jornada de cada um (setor, data, ordem, retrabalho) — base do futuro      │
-- │ Módulo de Análise de Fluxo (Fases 11-12).                                 │
-- │                                                                            │
-- │ Testado (piloto, 11/09/2026): dos 6 processos reais fatiados, só 1 já     │
-- │ existia em `processos`. A maioria do acervo é de processo que nunca       │
-- │ passou pelo sistema atual — não pode virar linha em `processos`, isso     │
-- │ misturaria processo morto com processo ativo que a Pilha, o MAC e o MDP   │
-- │ leem todo dia.                                                            │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- ISOLAMENTO: tabela nova, autônoma. `processo_codigo` é texto solto, SEM chave
-- estrangeira pra `processos` — o mesmo código pode existir aqui e não existir
-- lá (arquivado) ou existir nos dois (processo que passou pelo acervo E está
-- ativo hoje). Zero risco pro que já roda em produção: nenhuma tabela existente
-- é tocada, nenhuma rota de produção lê isto ainda.
--
-- ZERO IA: os dados vêm só de `fatiarPdfSei` (determinístico, mesmo motor da
-- Fase 0/1) rodado sobre o PDF completo do processo arquivado. Sem custo.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists fluxo_processo_eventos (
  id              uuid primary key default gen_random_uuid(),
  processo_codigo text not null,

  -- espelha EventoSei (lib/documentosSei/fatiar.ts) um-para-um: nada é
  -- recalculado nem reinterpretado aqui, só persistido como o fatiador leu.
  id_sei          text not null,
  titulo          text not null,
  pagina_ini      int not null,
  pagina_fim      int not null,
  setor           text,
  assinante       text,
  data_documento  text,
  papel_conteudo  text,

  -- de onde veio: hoje só existe uma origem (carga em lote do acervo
  -- arquivado), mas o campo já existe para o dia em que um processo ativo
  -- também alimentar isto (ex: ao ser concluído).
  origem          text not null default 'carga_acervo',
  arquivo_origem  text,   -- caminho/nome do PDF que gerou este evento — rastreabilidade do lote
  criado_em       timestamptz not null default now(),

  unique (processo_codigo, id_sei, pagina_ini)
);

create index if not exists idx_fluxo_processo_eventos_codigo
  on fluxo_processo_eventos (processo_codigo);

comment on table fluxo_processo_eventos is
  'Jornada de um processo (setor/data/ordem por documento), reconstruída fatiando o PDF completo. Fase 10 do plano de leitura de PDF — base do Módulo de Análise de Fluxo. Isolada de `processos`: processo_codigo é texto solto, sem FK.';
comment on column fluxo_processo_eventos.origem is
  'carga_acervo = veio da carga em lote de processos arquivados (Fase 10). Outros valores futuros: processo ativo que terminou.';
comment on column fluxo_processo_eventos.arquivo_origem is
  'Caminho/nome do PDF de origem, só para auditoria do lote — nunca lido de volta pelo sistema.';

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSÃO
--   drop table fluxo_processo_eventos;
-- ─────────────────────────────────────────────────────────────────────────────
