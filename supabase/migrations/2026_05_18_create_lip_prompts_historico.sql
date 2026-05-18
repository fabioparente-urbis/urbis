-- Histórico de versões dos prompts de IA do LIP.
-- A cada PUT em /api/admin/prompts, o conteúdo atual de lip_prompts
-- (antes de ser sobrescrito) é arquivado aqui como snapshot.
-- A tela /admin/prompts lê desta tabela para popular a coluna
-- "BACKUP / HISTÓRICO" do lado esquerdo, ordenada por salvo_em desc.

create table if not exists lip_prompts_historico (
  id            bigserial   primary key,
  prompt_chave  text        not null,
  conteudo      text        not null,
  salvo_em      timestamptz not null default now(),
  salvo_por     text
);

create index if not exists idx_lip_prompts_historico_chave_salvo_em
  on lip_prompts_historico (prompt_chave, salvo_em desc);

comment on table  lip_prompts_historico is 'Snapshots de cada versão anterior de lip_prompts, gravados antes de cada atualização (PUT /api/admin/prompts).';
comment on column lip_prompts_historico.prompt_chave is 'Chave do prompt (P1_TRIAGEM, P2_EXTRACAO). P2_MAC é ignorado pela aplicação.';
comment on column lip_prompts_historico.salvo_por    is 'Nome do administrador que executou o salvamento que originou este snapshot.';
