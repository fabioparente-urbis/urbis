-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-07-29 · MHD — RESULTADO POR CAMPO
--
-- A matriz de rastreabilidade (lib/rastreabilidade/) já separa DECLARAÇÃO (o que
-- um campo PODE ser, no código) de RESULTADO (o que ele FOI numa execução). A
-- declaração vive no código; o resultado — que o comentário de tipos.ts já
-- prometia — nunca teve onde morar: hoje ele existe só durante a resposta HTTP
-- de /api/lip/ler-pasta, e some quando o analista aceita a proposta.
--
-- Esta tabela é onde o resultado passa a viver, um registro por (processo,
-- campo). Cada nova leitura faz upsert nas colunas AUTOMÁTICAS, preservando
-- `criado_em`. A complementação manual do analista grava só nas colunas
-- `*_manual`, e NUNCA sobrescreve o resultado automático original — é o que
-- permite responder, mesmo depois do analista corrigir um campo, o que o
-- leitor tinha concluído sozinho.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists mhd_resultados_campo (
  id              uuid primary key default gen_random_uuid(),
  processo_codigo text not null,
  modulo          text not null default 'LIP',   -- LIP | MAC
  slot            text not null default 'slot_05',
  chave           text not null,

  -- o que a execução automática concluiu
  resultado       text not null,
  -- ENCONTRADO | CALCULADO | NAO_APLICAVEL | NAO_ENCONTRADO | FONTE_ILEGIVEL |
  -- DOCUMENTO_AUSENTE | AGUARDANDO_FATO | MANUAL | BLOQUEADO | NAO_IMPLEMENTADO
  valor           text,
  fonte           text,
  tentativa       jsonb,    -- documento, hash, página, procurou[], motivo — quando NAO_ENCONTRADO/FONTE_ILEGIVEL
  evidencia       text,     -- obrigatório quando NAO_APLICAVEL

  -- versão e hash do CAMPO na matriz no momento desta execução — reproduz a regra que decidiu
  versao          int  not null,
  hash            text not null,

  -- complementação do analista — colunas à parte: nunca apaga o que o leitor concluiu
  valor_manual      text,
  autor_manual_id   uuid,
  complementado_em  timestamptz,

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  unique (processo_codigo, modulo, slot, chave)
);

create index if not exists idx_mhd_resultados_processo  on mhd_resultados_campo (processo_codigo, modulo, slot);
create index if not exists idx_mhd_resultados_resultado on mhd_resultados_campo (resultado);

comment on column mhd_resultados_campo.valor_manual is
  'Valor final ajustado pelo analista, quando complementa o campo. O valor automático em `valor` continua intacto ao lado.';

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSÃO:
--   drop table if exists mhd_resultados_campo;
-- ─────────────────────────────────────────────────────────────────────────────
