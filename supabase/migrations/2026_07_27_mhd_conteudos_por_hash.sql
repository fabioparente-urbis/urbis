-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-07-27 (2ª migration do MHD) · CONTEÚDO POR HASH + ESCOPO DO DOCUMENTO
--
-- ┌─ POR QUE ─────────────────────────────────────────────────────────────────┐
-- │ A 1ª migration guardava `texto`, `linhas` e `dados` DENTRO de mhd_versoes.│
-- │ A justificativa era que conteúdo é 1-para-1 com versão. ISSO DEIXOU DE    │
-- │ SER VERDADE no momento em que o módulo passou a reaproveitar por hash     │
-- │ GLOBALMENTE, entre processos:                                             │
-- │                                                                           │
-- │  · uma ART que exerce dois papéis gravava o texto e as coordenadas DUAS   │
-- │    vezes (medido: 8 arquivos distintos → 9 versões);                      │
-- │  · o mesmo Uso do Solo em dez processos gravaria dez cópias.              │
-- │                                                                           │
-- │ Agora a extração é guardada UMA VEZ por hash, e a versão documental de    │
-- │ cada processo apenas aponta para ela. Continua não guardando arquivo:     │
-- │ PDF, DWG e imagem seguem fora do banco.                                   │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- SEGURANÇA: o conteúdo é global, mas o VÍNCULO com o processo continua em
-- mhd_versoes. A autorização se aplica ao vínculo, nunca ao conteúdo — sem isso,
-- reaproveitar por hash vazaria texto de um processo para outro.
--
-- DADOS: as três tabelas do MHD estão com ZERO linhas (os dados de teste foram
-- removidos). Não há nada a preservar, e por isso esta reestruturação é gratuita
-- agora — com processos dentro, seria migração de dados com risco.
-- ─────────────────────────────────────────────────────────────────────────────


-- 1) A EXTRAÇÃO, UMA VEZ POR HASH ─────────────────────────────────────────────
create table if not exists mhd_conteudos (
  id              uuid primary key default gen_random_uuid(),
  hash            text not null unique,       -- SHA-256 do arquivo: a identidade
  bytes           bigint,
  paginas         int,

  -- o conhecimento. `linhas` guarda os itens COM COORDENADA: em CAD o texto é
  -- posicionado, e no carimbo rótulo e valor só se ligam por posição. Sem isso,
  -- reanalisar no futuro exigiria o arquivo de volta.
  texto           text,
  linhas          jsonb,
  dados           jsonb,

  -- DERIVADO DO CONTEÚDO, e por isso mora aqui e não na versão: são os mesmos
  -- valores em qualquer processo onde este arquivo apareça. Mantê-los na versão
  -- recriaria a duplicação que esta migration existe para eliminar.
  papeis          text[],
  revisao         text,
  data_documento  text,   -- a data que o extrator elegeu como principal
  data_elaboracao text,
  data_revisao    text,
  data_assinatura text,
  data_registro   text,

  -- procedência: como foi extraído, quanto custou, e com qual versão do extrator
  origem          text not null default 'texto',   -- texto | visao | manual
  modelo          text,                            -- modelo de IA, quando houver
  paginas_ia      int  not null default 0,
  extrator_versao text not null default 'v1',      -- diz QUANDO vale reextrair
  status          text not null default 'ok',      -- ok | parcial | erro
  erro            text,
  extraido_em     timestamptz not null default now()
);

create index if not exists idx_mhd_conteudos_extrator on mhd_conteudos (extrator_versao);

comment on table mhd_conteudos is
  'Extração de um arquivo, guardada UMA VEZ por hash e compartilhada entre processos e papéis. Não guarda o arquivo.';
comment on column mhd_conteudos.extrator_versao is
  'Versão do extrator que produziu isto. É o que permite saber o que reextrair quando o parser melhorar.';


-- 2) A VERSÃO PASSA A APONTAR PARA O CONTEÚDO ─────────────────────────────────
alter table mhd_versoes
  add column if not exists conteudo_id uuid references mhd_conteudos(id);

create index if not exists idx_mhd_versoes_conteudo on mhd_versoes (conteudo_id);

-- as colunas de conteúdo e de custo saem daqui: agora vivem em mhd_conteudos
-- sai daqui tudo que é derivado do conteúdo. Fica na versão apenas o que é do
-- PROCESSO: qual documento lógico, qual rodada, qual versão, se é a vigente,
-- com que nome o arquivo chegou, quem leu e quando.
alter table mhd_versoes
  drop column if exists texto,
  drop column if exists linhas,
  drop column if exists dados,
  drop column if exists bytes,
  drop column if exists paginas,
  drop column if exists origem,
  drop column if exists custo_paginas_ia,
  drop column if exists papeis,
  drop column if exists revisao,
  drop column if exists data_documento,
  drop column if exists data_arquivo;

-- `hash` permanece em mhd_versoes por conveniência de consulta e auditoria.
-- `nome_arquivo` também: o MESMO conteúdo pode chegar com nomes diferentes em
-- processos diferentes, e é o nome que o analista reconhece na tela.


-- 3) ESCOPO: um processo pode ter DOIS documentos do mesmo papel ──────────────
-- `unique (processo_codigo, papel)` impedia duas ART de execução, dois blocos,
-- projetos por disciplina, dois responsáveis técnicos. Pior: o segundo documento
-- era tratado como CORREÇÃO do primeiro, criando uma versão falsa.
--
-- Um campo de texto livre, e não uma taxonomia de sete dimensões: aceita
-- qualquer discriminante que apareça (bloco, disciplina, unidade, profissional)
-- sem obrigar a decidir hoje o que ainda não se sabe. Vazio = o caso normal.
alter table mhd_documentos
  add column if not exists escopo text not null default '';

alter table mhd_documentos
  drop constraint if exists mhd_documentos_processo_codigo_papel_key;

alter table mhd_documentos
  add constraint mhd_documentos_identidade unique (processo_codigo, papel, escopo);

comment on column mhd_documentos.escopo is
  'Discriminante quando o processo tem mais de um documento do mesmo papel (bloco, disciplina, profissional). Vazio no caso normal.';


-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSÃO
--   alter table mhd_documentos drop constraint mhd_documentos_identidade;
--   alter table mhd_documentos add constraint mhd_documentos_processo_codigo_papel_key
--     unique (processo_codigo, papel);
--   alter table mhd_documentos drop column escopo;
--   alter table mhd_versoes drop column conteudo_id,
--     add column texto text, add column linhas jsonb, add column dados jsonb,
--     add column bytes bigint, add column paginas int, add column papeis text[],
--     add column revisao text, add column data_documento text,
--     add column data_arquivo timestamptz,
--     add column origem text not null default 'texto',
--     add column custo_paginas_ia int not null default 0;
--   drop table mhd_conteudos;
-- ─────────────────────────────────────────────────────────────────────────────
