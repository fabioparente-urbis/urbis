-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-08-27 · PADRÕES DE DESPACHO
--
-- Textos reutilizáveis para Despacho Interno e Despacho/Parecer Externo
-- ("indeferimento 180 dias", "solicitando busca", "solicitando manifestação da
-- CHEADV/chefia" etc.), pra parar de redigir o mesmo texto do zero toda vez.
--
-- Isolamento é regra deliberada aqui, não um descuido: cada combinação de
-- módulo (LIP|MAC) × slot (assunto_id) × tipo (interno|externo) tem sua
-- própria lista, sem nenhum fallback global. É o OPOSTO do padrão nullable
-- de mac_checklist_modelos.assunto_id (onde assunto_id=null cai em todos os
-- slots) — decisão explícita do Fábio: "cada tipo de despacho de cada slot o
-- seu". `modulo` existe como coluna própria porque assunto_id sozinho não
-- distingue despacho interno do LIP do despacho interno do MAC do MESMO
-- slot — são buckets isolados pela regra do projeto (ver CLAUDE.md).
--
-- LIP nunca teve despacho externo na tela (ProcessoClient.tsx não tem esse
-- modal) — o CHECK abaixo trava essa combinação também no banco, não só na UI.
--
-- Delete é sempre soft (`ativo=false`): um padrão referenciado por padrao_id
-- num mdp_registros antigo não pode sumir da rastreabilidade histórica.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists despacho_padroes (
  id                   uuid primary key default gen_random_uuid(),
  assunto_id           uuid not null references assuntos(id),
  modulo               text not null check (modulo in ('LIP', 'MAC')),
  tipo_despacho        text not null check (tipo_despacho in ('interno', 'externo')),

  titulo               text not null,
  corpo                text not null,
  destinatario_padrao  text,          -- só relevante quando tipo_despacho='interno'

  ativo                boolean not null default true,
  criado_por           uuid references usuarios(id),
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),

  check (not (modulo = 'LIP' and tipo_despacho = 'externo'))
);

create index if not exists idx_despacho_padroes_bucket
  on despacho_padroes (assunto_id, modulo, tipo_despacho) where ativo;

-- Título único só entre os ativos do mesmo bucket — permite reusar um título
-- depois de soft-deletar o padrão antigo.
create unique index if not exists idx_despacho_padroes_titulo_unico
  on despacho_padroes (assunto_id, modulo, tipo_despacho, titulo) where ativo;

-- REVERSÃO (não rodar junto):
--   drop table if exists despacho_padroes;
