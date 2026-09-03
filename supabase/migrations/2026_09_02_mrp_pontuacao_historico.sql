-- 2026_09_02_mrp_pontuacao_historico.sql
--
-- Histórico de vigência para a tabela de pontuação do MRP (mrp_pontuacao),
-- no MESMO padrão que mrp_meta_historico já usa pra meta: cada edição de
-- pontos gera uma linha nova com vigente_desde, nunca sobrescreve.
-- mrp_pontuacao.pontos continua existindo como CACHE do valor vigente HOJE
-- (o que a tela admin e o simulador leem direto); o cálculo do despacho passa
-- a resolver o valor pela vigência NA DATA DO DESPACHO, não pelo cache.
--
-- Também unifica os dois caminhos de cálculo que hoje divergem
-- (lib/mrp-pontuacao.ts, usado por /api/mrp/registros, x lib/mrp.ts
-- hardcoded, usado por lib/mrpGravar.ts) — essa parte é só no código
-- (ver commit), aqui é só o schema + dados.
--
-- Passos desta migration:
--   1) mrp_registros.pontos ganha 2ª casa decimal — numeric(4,1) só guardava
--      1 casa; 3,75/5,25/6,75 arredondariam pra 3,8/5,3/6,8 sem isso. Três
--      views (mrp_painel_diario, vw_bdi_produtividade_mensal,
--      vw_bdi_analistas_desempenho) dependem dessa coluna e bloqueiam ALTER
--      COLUMN TYPE direto — são derrubadas antes e recriadas idênticas
--      (mesma opção security_invoker=true) depois.
--   2) cria mrp_pontuacao_historico.
--   3) semeia o histórico: 1 linha por regra existente, com o valor ATUAL
--      (antes desta mudança), vigente_desde num piso seguro anterior a
--      qualquer despacho real do sistema.
--   4a) regra ATENDIMENTO não existe hoje em mrp_pontuacao (o comentário
--      antigo no código, "ATENDIMENTO -> 0,5", estava desatualizado — não
--      há row nenhuma pra ela). Cria a regra agora, com 1 pt, vigente
--      01/09/2026.
--   4b) grava a mudança nas 3 regras de área, vigente 01/09/2026:
--      área<540 -> 3,75 · 540-2000 -> 5,25 · área>2000 -> 6,75.
--   5) atualiza o cache mrp_pontuacao.pontos pros novos valores (01/09/2026
--      já passou — a mudança já está vigente hoje).
--   6) meta: nada a fazer — já está 150, vigente desde 2026-07-01 (conferido
--      antes de escrever esta migration, não é parte dela).
--   7) backfill: despachos AUTO-GERADOS já gravados com data_despacho a
--      partir de 01/09/2026 que ainda têm o ponto antigo são recalculados
--      pro valor novo. Registros manuais (auto_gerado = false) não são
--      tocados — podem ter pontos deliberadamente diferentes da tabela.
--
-- Testada em transação com ROLLBACK antes de aplicar (script à parte, não
-- fica no repo). Candidatos ao backfill hoje: 1 registro (INTERNO, 2,5 pts).
-- Nenhum despacho ATENDIMENTO gravado desde 01/09/2026 — regra nova entra
-- só pra frente.
--
-- Idempotente. Reversão no fim (não roda automaticamente).

-- ── 1. Precisão ──────────────────────────────────────────────
-- mrp_painel_diario, vw_bdi_produtividade_mensal e
-- vw_bdi_analistas_desempenho dependem de mrp_registros.pontos (rule
-- _RETURN) e bloqueiam ALTER COLUMN TYPE diretamente. Derruba as três,
-- muda o tipo, recria idênticas.
drop view if exists public.mrp_painel_diario;
drop view if exists public.vw_bdi_produtividade_mensal;
drop view if exists public.vw_bdi_analistas_desempenho;

alter table mrp_registros alter column pontos type numeric(6,2);
alter table mrp_registros_backup alter column pontos type numeric(6,2);

create view public.mrp_painel_diario
  with (security_invoker = true) as
 SELECT usuario_id,
    ano,
    mes,
    date_trunc('day'::text, data_despacho)::date AS dia,
    count(*)::integer AS despachos,
    sum(pontos)::numeric(8,1) AS pontos,
    sum(area_construida)::numeric(14,2) AS area_total
   FROM mrp_registros r
  GROUP BY usuario_id, ano, mes, (date_trunc('day'::text, data_despacho));
grant all on public.mrp_painel_diario to service_role;

create view public.vw_bdi_produtividade_mensal
  with (security_invoker = true) as
 SELECT u.nome AS analista,
    u.gerencia,
    r.mes,
    r.ano,
    r.tipo_processo,
    count(r.id) AS total_despachos,
    COALESCE(sum(r.pontos), 0::numeric) AS total_pontos
   FROM mrp_registros r
     JOIN usuarios u ON r.usuario_id = u.id
  GROUP BY u.id, u.nome, u.gerencia, r.mes, r.ano, r.tipo_processo;
grant all on public.vw_bdi_produtividade_mensal to service_role;

create view public.vw_bdi_analistas_desempenho
  with (security_invoker = true) as
 SELECT u.nome AS analista,
    u.gerencia,
    count(DISTINCT p.id) AS total_processos,
    COALESCE(sum(p.area_construida), 0::numeric) AS area_total,
    COALESCE(avg(EXTRACT(epoch FROM p.tempo_total_analise) / 3600::numeric), 0::numeric) AS tempo_medio_horas,
    count(DISTINCT
        CASE
            WHEN p.eh_retorno THEN p.id
            ELSE NULL::uuid
        END) AS total_retornos,
    COALESCE(sum(m.pontos), 0::numeric) AS pontos_totais_mrp,
    count(DISTINCT m.id) AS despachos_mrp,
    a.nome AS assunto
   FROM processos p
     LEFT JOIN usuarios u ON p.analista_id = u.id
     LEFT JOIN assuntos a ON p.assunto_id = a.id
     LEFT JOIN mrp_registros m ON m.usuario_id = u.id AND m.processo_codigo = p.codigo
  WHERE a.nome !~~ 'Slot%'::text OR a.nome IS NULL
  GROUP BY u.id, u.nome, u.gerencia, a.id, a.nome;
grant all on public.vw_bdi_analistas_desempenho to service_role;

-- ── 2. Histórico de vigência da tabela de regras ─────────────
create table if not exists mrp_pontuacao_historico (
  id uuid default gen_random_uuid() primary key,
  regra_id uuid not null references mrp_pontuacao(id) on delete cascade,
  pontos numeric not null,
  vigente_desde date not null,
  criado_por uuid references usuarios(id),
  criado_em timestamptz default now()
);

create index if not exists idx_mrp_pontuacao_historico_regra
  on mrp_pontuacao_historico (regra_id, vigente_desde desc);

comment on table mrp_pontuacao_historico is
  'Histórico de vigência de mrp_pontuacao. Cada edição de pontos gera uma '
  'linha nova aqui (nunca sobrescreve); mrp_pontuacao.pontos guarda só o '
  'valor vigente HOJE, como cache. O cálculo de um despacho resolve o valor '
  'pela vigência NA DATA DO DESPACHO, não pelo cache.';

-- ── 3. Semeia o valor atual de cada regra como "vigente desde sempre" ──
insert into mrp_pontuacao_historico (regra_id, pontos, vigente_desde)
select p.id, p.pontos, date '2000-01-01'
from mrp_pontuacao p
where not exists (
  select 1 from mrp_pontuacao_historico h where h.regra_id = p.id
);

-- ── 4a. Regra ATENDIMENTO não existe hoje ────────────────────
-- Conferido antes de escrever esta migration: mrp_pontuacao só tem as 3
-- regras de área (o comentário antigo no código, "ATENDIMENTO -> 0,5",
-- estava desatualizado — não existe row nenhuma pra ATENDIMENTO). Cria a
-- regra agora, já com o valor pedido, vigente 01/09/2026.
insert into mrp_pontuacao (tipo_despacho, area_min, area_max, pontos, descricao, ordem)
select 'ATENDIMENTO', null, null, 1, 'Atendimento', 1
where not exists (select 1 from mrp_pontuacao where tipo_despacho = 'ATENDIMENTO');

insert into mrp_pontuacao_historico (regra_id, pontos, vigente_desde)
select p.id, 1, date '2026-09-01'
from mrp_pontuacao p
where p.tipo_despacho = 'ATENDIMENTO'
  and not exists (
    select 1 from mrp_pontuacao_historico h
    where h.regra_id = p.id and h.vigente_desde = date '2026-09-01'
  );

-- ── 4b. Mudança nas 3 regras de área, vigente 01/09/2026 ─────
insert into mrp_pontuacao_historico (regra_id, pontos, vigente_desde)
select p.id, novo.pontos, date '2026-09-01'
from mrp_pontuacao p
join (values
  (null::numeric, 540::numeric, 3.75::numeric),
  (540, 2000, 5.25),
  (2000, null, 6.75)
) as novo(area_min, area_max, pontos)
  on coalesce(p.area_min, -1) = coalesce(novo.area_min, -1)
 and coalesce(p.area_max, -1) = coalesce(novo.area_max, -1)
where p.tipo_despacho is null
  and not exists (
    select 1 from mrp_pontuacao_historico h
    where h.regra_id = p.id and h.vigente_desde = date '2026-09-01'
  );

-- ── 5. Atualiza o cache pros novos valores ───────────────────
update mrp_pontuacao p
set pontos = h.pontos
from mrp_pontuacao_historico h
where h.regra_id = p.id and h.vigente_desde = date '2026-09-01';

-- ── 6. Meta ───────────────────────────────────────────────────
-- NADA A FAZER: conferido antes de aplicar — mrp_meta_historico já tem
-- meta=150 vigente desde 2026-07-01 (alguém já salvou isso antes desta
-- mudança), e urbis_config.meta_processos_mensal já está em 150. A meta
-- pedida já está em vigor, não é parte desta migration.

-- ── 7. Backfill de despachos já gravados em 01-02/09/2026 ────
-- ATENDIMENTO: sem backfill — a regra não existia antes desta migration
-- (item 4a), então nenhum despacho ATENDIMENTO foi gravado com um pontos
-- "antigo" dela pra corrigir. Conferido antes de aplicar: 0 despachos
-- ATENDIMENTO com data_despacho >= 01/09/2026 no banco hoje.

-- área < 540: 2,5 -> 3,75
update mrp_registros r
set pontos = 3.75
where r.auto_gerado = true
  and r.data_despacho >= timestamptz '2026-09-01 00:00:00-03'
  and upper(r.tipo_despacho) <> 'ATENDIMENTO'
  and r.area_construida < 540
  and r.pontos = 2.5;

-- 540 <= área < 2000: 3,5 -> 5,25
update mrp_registros r
set pontos = 5.25
where r.auto_gerado = true
  and r.data_despacho >= timestamptz '2026-09-01 00:00:00-03'
  and upper(r.tipo_despacho) <> 'ATENDIMENTO'
  and r.area_construida > 540 and r.area_construida < 2000
  and r.pontos = 3.5;

-- área >= 2000: 4,5 -> 6,75
update mrp_registros r
set pontos = 6.75
where r.auto_gerado = true
  and r.data_despacho >= timestamptz '2026-09-01 00:00:00-03'
  and upper(r.tipo_despacho) <> 'ATENDIMENTO'
  and r.area_construida > 2000
  and r.pontos = 4.5;

-- ─────────────────────────────────────────────────────────────────────
-- REVERSÃO (não rodar junto):
--   update mrp_pontuacao p set pontos = h.pontos from mrp_pontuacao_historico h
--     where h.regra_id = p.id and h.vigente_desde = date '2000-01-01';
--   delete from mrp_pontuacao where tipo_despacho = 'ATENDIMENTO'; -- regra criada nesta migration (item 4a)
--   delete from mrp_pontuacao_historico where vigente_desde = date '2026-09-01';
--   drop table if exists mrp_pontuacao_historico;
--   drop view if exists public.mrp_painel_diario;
--   drop view if exists public.vw_bdi_produtividade_mensal;
--   drop view if exists public.vw_bdi_analistas_desempenho;
--   alter table mrp_registros alter column pontos type numeric(4,1);
--   alter table mrp_registros_backup alter column pontos type numeric(4,1);
--   -- recriar as três views com CREATE VIEW ... WITH (security_invoker = true)
--   -- AS <definição original, ver supabase/schema/03_views.sql> + os GRANTs.
--   (o backfill do passo 7 não tem reversão automática — restaurar do backup)
-- ─────────────────────────────────────────────────────────────────────
