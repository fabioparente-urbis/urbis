-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-07-27 · MHD — MÓDULO DE HISTÓRICO E DOCUMENTOS
--
-- Evolução do MDP (Módulo de Despachos e Pareceres). NADA do MDP é removido:
-- `mdp_registros` continua existindo, com as mesmas colunas, alimentada pelas
-- mesmas rotas. O MHD é um SUPERCONJUNTO — módulo satélite, independente do LIP
-- e do MAC, servindo todos os slots e assuntos.
--
-- O QUE O MHD GUARDA: o CONHECIMENTO extraído dos documentos.
-- O QUE ELE NÃO GUARDA: PDF, DWG, imagem ou qualquer arquivo pesado. O arquivo
-- continua onde sempre esteve — no SEI e na pasta do analista.
--
-- OBJETIVO: documento já lido não é lido de novo. Quando chega correção, cria-se
-- versão nova, compara-se com a anterior e a compatibilização roda por cima do
-- conhecimento guardado, sem tocar no arquivo e sem gastar IA.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE 3 TABELAS E NÃO 7
--
-- O desenho original propunha MHD_DOCUMENTOS, VERSOES, CONTEUDOS, HISTORICO,
-- PENDENCIAS, DEPENDENCIAS e ANALISES. Aqui elas viram três, porque:
--
--   · CONTEUDOS não precisa existir separada de VERSOES: conteúdo é sempre
--     1-para-1 com a versão, e separar só cria junção e risco de órfão.
--   · HISTORICO, PENDENCIAS e ANALISES são todos EVENTOS na linha do tempo do
--     processo, distintos apenas pelo `tipo`. Uma tabela tipada dá a mesma
--     informação, uma consulta só, e a linha do tempo sai ordenada de graça.
--   · DEPENDENCIAS é REGRA, não dado: qual análise depende de qual documento
--     não muda por processo. Vive em `lib/mhdDependencias.ts`, versionada no
--     git, revisável em code review. Vira tabela no dia em que o analista
--     precisar editá-la sem deploy — e aí é um insert, não uma refatoração.
-- ─────────────────────────────────────────────────────────────────────────────


-- 1) DOCUMENTO LÓGICO ─────────────────────────────────────────────────────────
-- "o Projeto Arquitetônico deste processo", independente de quantos arquivos já
-- o representaram. A identidade é (processo, papel).
create table if not exists mhd_documentos (
  id             uuid primary key default gen_random_uuid(),
  processo_codigo text not null,
  assunto_id     uuid references assuntos(id),
  papel          text not null,     -- 'projeto' | 'art_projeto' | 'uso_solo' | ...
  rotulo         text,              -- nome para humano: "Projeto Arquitetônico"
  status         text not null default 'ativo',   -- ativo | superado | ausente
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (processo_codigo, papel)
);

create index if not exists idx_mhd_documentos_processo on mhd_documentos (processo_codigo);
create index if not exists idx_mhd_documentos_assunto  on mhd_documentos (assunto_id);


-- 2) VERSÃO + CONHECIMENTO ────────────────────────────────────────────────────
-- Cada arquivo distinto que exerceu o papel. NUNCA se apaga versão.
create table if not exists mhd_versoes (
  id             uuid primary key default gen_random_uuid(),
  documento_id   uuid not null references mhd_documentos(id) on delete cascade,
  versao         int  not null,
  vigente        boolean not null default true,

  -- identidade do arquivo. O HASH é quem decide se já foi lido: nome e data
  -- mentem (copiar o arquivo muda a data; o requerente renomeia à vontade — na
  -- pasta de amostra a ART de execução e a de caixa são a MESMA folha com dois
  -- nomes). Nome e data ficam para o humano reconhecer na tela.
  hash           text not null,
  nome_arquivo   text not null,
  rodada         int  not null default 1,   -- a pasta é a rodada: raiz = 1
  bytes          bigint,
  paginas        int,
  data_arquivo   timestamptz,               -- lastModified, só rótulo
  data_documento text,                      -- data IMPRESSA no documento
  revisao        text,                      -- REV00, REV04...
  papeis         text[],                    -- todos os papéis deste mesmo arquivo

  -- O CONHECIMENTO. É isto que substitui guardar o arquivo.
  texto          text,     -- texto corrido, para busca e leitura humana
  linhas         jsonb,    -- linhas com células e posição — permite REEXTRAIR sem o PDF
  dados          jsonb,    -- o que o extrator produziu desta versão

  -- procedência e custo
  origem         text not null default 'texto',  -- texto | visao | manual
  custo_paginas_ia int not null default 0,       -- páginas efetivamente enviadas à IA
  lido_em        timestamptz not null default now(),
  usuario_id     uuid,

  unique (documento_id, versao)
);

-- o índice que faz a memória funcionar: "já li este arquivo?"
create index if not exists idx_mhd_versoes_hash     on mhd_versoes (hash);
create index if not exists idx_mhd_versoes_documento on mhd_versoes (documento_id, versao desc);

-- `linhas` guarda a ESTRUTURA, não só o texto. Sem posição não se relê carimbo
-- de prancha: em CAD o texto é posicionado, e rótulo e valor só se ligam por
-- coordenada. Guardando as linhas, toda reanálise futura roda sobre a memória,
-- de graça, mesmo que o arquivo original não exista mais.
comment on column mhd_versoes.linhas is
  'Linhas com células e coordenada (y, página, x). Permite reextrair sem o PDF.';


-- 3) LINHA DO TEMPO ───────────────────────────────────────────────────────────
-- Funde HISTORICO + PENDENCIAS + ANALISES. Tudo é evento; o `tipo` distingue.
create table if not exists mhd_eventos (
  id              uuid primary key default gen_random_uuid(),
  processo_codigo text not null,
  assunto_id      uuid references assuntos(id),
  documento_id    uuid references mhd_documentos(id) on delete set null,
  versao_id       uuid references mhd_versoes(id) on delete set null,

  tipo   text not null,
  --  leitura_iniciada | documento_novo | documento_conhecido | versao_criada
  --  alteracao_detectada | compatibilizacao | pendencia_aberta | pendencia_fechada
  --  documento_ausente | despacho_emitido | decisao_analista

  titulo  text not null,
  detalhe jsonb,

  criado_em  timestamptz not null default now(),
  usuario_id uuid
);

create index if not exists idx_mhd_eventos_processo on mhd_eventos (processo_codigo, criado_em desc);
create index if not exists idx_mhd_eventos_tipo     on mhd_eventos (tipo);


-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSÃO (nada do MDP é tocado por isto):
--   drop table if exists mhd_eventos;
--   drop table if exists mhd_versoes;
--   drop table if exists mhd_documentos;
-- ─────────────────────────────────────────────────────────────────────────────
