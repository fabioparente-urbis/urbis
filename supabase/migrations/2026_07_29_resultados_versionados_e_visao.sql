-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-07-29 (2ª do dia) · RESULTADO VERSIONADO + INTERPRETAÇÃO VISUAL POR CONTEÚDO
--
-- Duas correções estruturais feitas ANTES da primeira gravação de valor de visão,
-- porque depois dela as duas viram migração com perda.
--
-- ┌─ 1) mhd_resultados_campo era ESTADO ATUAL num sistema append-only ──────────┐
-- │ Todo o resto do MHD preserva: mhd_versoes cria a versão N+1 e marca a       │
-- │ anterior como não-vigente, mhd_eventos só insere, mhd_conteudos deduplica   │
-- │ mas nunca apaga. A tabela de resultados fazia upsert e SOBRESCREVIA.        │
-- │                                                                            │
-- │ Para extrator determinístico isso é quase inofensivo: mesma entrada, mesma  │
-- │ saída. Para visão não é — duas execuções do mesmo modelo sobre o mesmo      │
-- │ recorte podem divergir, e essa divergência é o sinal mais forte de que o    │
-- │ campo não é confiável. Sobrescrevendo, perdia-se: (a) o valor que           │
-- │ fundamentou o laudo no dia em que ele saiu, (b) o indicador de instabilidade│
-- │ do modelo, e (c) a série histórica de que a detecção de deriva depende.     │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ 2) Interpretação visual é propriedade do CONTEÚDO, não do processo ────────┐
-- │ mhd_conteudos existe porque o mesmo Uso do Solo aparece em dez processos e  │
-- │ extrair dez vezes é desperdício. O recorte de um PDF de hash X, na mesma    │
-- │ região, com a mesma receita e o mesmo modelo, sempre diz a mesma coisa.     │
-- │ Preso ao processo, o mesmo documento pagaria visão de novo a cada processo  │
-- │ e a cada releitura — agora com custo em DINHEIRO por chamada, não em CPU.   │
-- │ É o erro que a migration mhd_conteudos_por_hash já corrigiu uma vez, para   │
-- │ texto. Não repetir com visão.                                              │
-- └────────────────────────────────────────────────────────────────────────────┘
-- ─────────────────────────────────────────────────────────────────────────────


-- 1) RESULTADO POR CAMPO, VERSIONADO ──────────────────────────────────────────
-- Espelha o padrão de mhd_versoes: nunca apaga, marca a anterior como não-vigente.

alter table mhd_resultados_campo
  add column if not exists execucao_id uuid not null default gen_random_uuid(),
  add column if not exists vigente     boolean not null default true,
  add column if not exists custo_ia    numeric,
  add column if not exists confianca   numeric,
  add column if not exists interpretacao_id uuid;

-- a chave antiga impedia guardar histórico: (processo,modulo,slot,chave) era único
alter table mhd_resultados_campo
  drop constraint if exists mhd_resultados_campo_processo_codigo_modulo_slot_chave_key;

-- unicidade agora é por EXECUÇÃO...
create unique index if not exists uq_mhd_resultados_execucao
  on mhd_resultados_campo (processo_codigo, modulo, slot, chave, execucao_id);

-- ...e só pode haver UM vigente por campo. É esta trava que garante que "o valor
-- de agora" continua sendo uma pergunta com resposta única, mesmo com histórico.
create unique index if not exists uq_mhd_resultados_vigente
  on mhd_resultados_campo (processo_codigo, modulo, slot, chave)
  where vigente;

create index if not exists idx_mhd_resultados_execucao on mhd_resultados_campo (execucao_id);

comment on column mhd_resultados_campo.execucao_id is
  'Identifica a rodada de leitura/aceite. Uma execução produz até 136 linhas com o mesmo valor aqui.';
comment on column mhd_resultados_campo.vigente is
  'true = é o resultado corrente deste campo. As execuções anteriores ficam com false e NUNCA são apagadas.';
comment on column mhd_resultados_campo.interpretacao_id is
  'Quando o resultado veio de visão, aponta para a interpretação reaproveitável em mhd_interpretacoes_visao.';


-- 2) INTERPRETAÇÃO VISUAL, DEDUPLICADA POR CONTEÚDO ───────────────────────────
-- A chave de reuso é o que a torna reaproveitável entre processos e entre releituras.

create table if not exists mhd_interpretacoes_visao (
  id              uuid primary key default gen_random_uuid(),

  -- ── CHAVE DE REUSO ──────────────────────────────────────────────────────────
  -- Mudou qualquer um destes cinco, é outra interpretação e precisa rodar de novo.
  hash_documento  text not null,   -- SHA-256 do arquivo: a identidade do conteúdo
  pagina          int  not null,
  regiao          jsonb not null,  -- {x0,y0,x1,y1} em pontos + dpi do recorte
  regiao_hash     text not null,   -- hash canônico de `regiao`, para caber no índice
  receita_versao  int  not null,   -- versão da receita de percepção
  receita_hash    text not null,   -- hash funcional da receita INTEIRA (âncoras,
                                   -- geometria, dpi, pré-processamento, prompt, parser)
  modelo          text not null,   -- identidade do modelo: 'gemini-2.5-flash', etc.

  -- ── O QUE O MODELO DEVOLVEU ─────────────────────────────────────────────────
  -- `abstencao` é cidadã de primeira classe: modelo que não consegue ler DEVE
  -- dizer isso, e isso vira FONTE_ILEGIVEL — nunca um número plausível.
  abstencao       boolean not null default false,
  valores         jsonb,           -- {chaveDoCampo: valor} — um recorte pode responder vários campos
  confianca       numeric,
  bruto           text,            -- resposta crua, para depurar sem reprocessar

  -- ── PROCEDÊNCIA E CUSTO ─────────────────────────────────────────────────────
  custo_ia        numeric,
  ms_recorte      int,
  ms_modelo       int,
  criado_em       timestamptz not null default now(),

  unique (hash_documento, pagina, regiao_hash, receita_hash, modelo)
);

create index if not exists idx_mhd_visao_documento on mhd_interpretacoes_visao (hash_documento);

comment on table mhd_interpretacoes_visao is
  'Interpretação de uma região de documento por modelo de visão. Global por hash de conteúdo, como mhd_conteudos: o mesmo recorte do mesmo PDF não é reinterpretado nem repago, em nenhum processo.';
comment on column mhd_interpretacoes_visao.abstencao is
  'true = o modelo declarou que não consegue ler a região. Vira FONTE_ILEGIVEL no campo, jamais um valor inventado.';

-- NÃO guarda a imagem. Guarda a GEOMETRIA que permite recortá-la de novo a partir
-- do documento. Imagem só é persistida no aceite, quando deixa de ser processamento
-- e vira prova de decisão administrativa (ver D2).

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSÃO:
--   drop table if exists mhd_interpretacoes_visao;
--   drop index if exists uq_mhd_resultados_vigente;
--   drop index if exists uq_mhd_resultados_execucao;
--   alter table mhd_resultados_campo
--     drop column if exists execucao_id, drop column if exists vigente,
--     drop column if exists custo_ia, drop column if exists confianca,
--     drop column if exists interpretacao_id;
-- ─────────────────────────────────────────────────────────────────────────────
