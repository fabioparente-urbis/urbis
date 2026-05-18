-- ============================================================
-- MRP — Mapa de Resultados e Produtividade
-- ============================================================
-- Este script é IDEMPOTENTE (pode rodar várias vezes).
--
-- Decisões em relação ao briefing original:
--
-- 1) NÃO criamos `usuarios.gerencia_id UUID REFERENCES usuarios(id)`.
--    A coluna `usuarios.gerencia TEXT ('PP'|'MP'|'GP'|null)` já existe
--    e o `/api/processos` já implementa "gerente vê analistas da sua
--    gerência" via perfil "Gerência {PP|MP|GP}" + match em gerencia.
--    O modelo existente é canônico; duplicar com UUID seria divergência.
--
-- 2) Acrescentamos só as 3 colunas que faltam em `usuarios` para
--    suportar a meta ajustável: reducao_meta, meta_base_legal,
--    meta_vigencia_inicio.
--
-- 3) A tabela `bdi_snapshot` do briefing foi DESCARTADA. A view
--    `mrp_painel_diario` (e queries on-the-fly) cobrem o caso. Se
--    aparecer pressão de performance, ressuscitamos o cache depois.
--
-- 4) `mrp_registros.area_construida` continua existindo na tabela
--    (auditoria/histórico), mas é populada a partir de `processos.dados`
--    (JSONB) — o app extrai de `dados.areaTotal.valor` (canônico).
--
-- 5) `revisao` aqui = `analises_mac.numero_revisao > 1`. Não há
--    coluna `revisao` em `processos`.
-- ============================================================


-- ── 1. Extensões de USUARIOS (meta ajustável por admin) ─────
alter table usuarios
  add column if not exists reducao_meta numeric(5,2) default 0.00 not null,
  add column if not exists meta_base_legal text,
  add column if not exists meta_vigencia_inicio date;

comment on column usuarios.reducao_meta is
  'Percentual de redução da meta MRP (0-100). 0 = meta cheia (100 pts/mês).';
comment on column usuarios.meta_base_legal is
  'Fundamento legal/administrativo da redução (ex: portaria, atestado).';
comment on column usuarios.meta_vigencia_inicio is
  'Data a partir da qual a redução está vigente.';


-- ── 2. Calendário operacional por analista/mês ──────────────
create table if not exists mrp_calendario (
  id uuid default gen_random_uuid() primary key,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  mes integer not null check (mes between 1 and 12),
  ano integer not null check (ano between 2024 and 2100),
  dias_uteis integer not null default 22 check (dias_uteis >= 0),
  ferias integer not null default 0 check (ferias >= 0),
  atestado integer not null default 0 check (atestado >= 0),
  feriados integer not null default 0 check (feriados >= 0),
  facultativo integer not null default 0 check (facultativo >= 0),
  atualizado_em timestamptz default now(),
  unique (usuario_id, mes, ano)
);

create index if not exists idx_mrp_calendario_usuario
  on mrp_calendario(usuario_id, ano, mes);

comment on table mrp_calendario is
  'Calendário operacional do analista por mês. Dias efetivos = '
  'dias_uteis - ferias - atestado - feriados - facultativo.';


-- ── 3. Registros MRP (gerados automaticamente pelos despachos) ─
create table if not exists mrp_registros (
  id uuid default gen_random_uuid() primary key,
  usuario_id uuid not null references usuarios(id) on delete restrict,

  -- Identificação do processo
  processo_codigo text not null,
  tipo_processo text not null,           -- ACEITE | REGULARIZACAO | APROVACAO
  interessado text,
  assunto text,

  -- Métricas físicas extraídas de processos.dados (JSONB)
  porte text not null default 'MP',      -- PP | MP | GP
  area_construida numeric(12,2) not null default 0.00,
  bairro text,
  setor text,

  -- Despacho que originou o registro
  tipo_despacho text not null,           -- 'despacho' | 'indeferimento' | 'arquivamento' | 'aceite' | 'interno'
  numero_despacho text,
  numero_analise integer,                -- copiado de analises_mac.numero_analise
  numero_revisao integer,                -- copiado de analises_mac.numero_revisao
  revisao boolean generated always as (coalesce(numero_revisao, 1) > 1) stored,

  -- Datas
  data_inicio timestamptz,               -- analises_mac.criado_em (início da análise)
  data_despacho timestamptz not null default now(),

  -- Pontos e classificação
  pontos numeric(4,1) not null,          -- 2.5 | 3.5 | 4.5

  -- Auditoria
  observacoes text,
  mes integer not null,
  ano integer not null,
  auto_gerado boolean default false not null,
  criado_em timestamptz default now()
);

-- Índice único para idempotência da gravação automática:
-- impede duplicar o mesmo despacho do mesmo processo do mesmo analista.
-- Restrição parcial (só linhas auto-geradas), permite edições manuais.
create unique index if not exists mrp_registros_auto_unico
  on mrp_registros (usuario_id, processo_codigo, tipo_despacho, numero_analise)
  where auto_gerado = true;

create index if not exists idx_mrp_registros_usuario_mes
  on mrp_registros (usuario_id, ano, mes);
create index if not exists idx_mrp_registros_processo
  on mrp_registros (processo_codigo);
create index if not exists idx_mrp_registros_data
  on mrp_registros (data_despacho desc);

comment on table mrp_registros is
  'Cada linha = um despacho emitido pelo analista. Gerado automaticamente '
  'pelos endpoints /api/despacho-*. Admin pode editar manualmente.';


-- ── 4. View auxiliar: painel diário consolidado ─────────────
-- Útil para o dashboard sem N+1 queries.
create or replace view mrp_painel_diario as
select
  r.usuario_id,
  r.ano,
  r.mes,
  date_trunc('day', r.data_despacho)::date as dia,
  count(*)::integer as despachos,
  sum(r.pontos)::numeric(8,1) as pontos,
  sum(r.area_construida)::numeric(14,2) as area_total
from mrp_registros r
group by r.usuario_id, r.ano, r.mes, date_trunc('day', r.data_despacho);


-- ── 5. Trigger: atualiza atualizado_em ──────────────────────
create or replace function mrp_calendario_touch()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end $$;

drop trigger if exists trg_mrp_calendario_touch on mrp_calendario;
create trigger trg_mrp_calendario_touch
  before update on mrp_calendario
  for each row execute function mrp_calendario_touch();
