-- ============================================================
-- BDI Snapshots — consolidação histórica de mrp_registros
-- ============================================================
-- Cada linha é uma "fotografia" estática (JSON) dos registros
-- MRP no momento em que o botão de "Gerar Backup" foi acionado.
--
-- Idempotente: pode rodar várias vezes.
-- ============================================================

create table if not exists bdi_snapshots (
  id uuid default gen_random_uuid() primary key,
  tipo text not null default 'mrp_registros',     -- origem do snapshot
  origem text,                                    -- ex: 'backup_tudo', 'backup_processos'
  gerado_em timestamptz default now() not null,
  gerado_por_id uuid references usuarios(id) on delete set null,
  gerado_por_nome text,
  total_registros integer not null default 0,
  dados jsonb not null default '[]'::jsonb,       -- JSON estático com os registros consolidados
  observacoes text
);

create index if not exists idx_bdi_snapshots_gerado_em
  on bdi_snapshots (gerado_em desc);
create index if not exists idx_bdi_snapshots_tipo
  on bdi_snapshots (tipo);

comment on table bdi_snapshots is
  'Fotografias estáticas (JSON) de mrp_registros, criadas automaticamente '
  'ao acionar o botão de Gerar Backup. Servem como histórico imutável '
  'para o BDI (Banco de Dados e Inteligência).';

comment on column bdi_snapshots.dados is
  'Array JSON com os registros consolidados no momento da geração.';
