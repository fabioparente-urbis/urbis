-- Uso real da API Gemini (por chamada) e aportes de crédito no AI Studio.
--
-- urbis_api_calls já era referenciada em app/api/lip/s3/route.ts para a trava de budget
-- (50 chamadas/hora), mas só existia criada manualmente no banco (fora de qualquer migration)
-- com um schema mínimo — por isso os ADD COLUMN IF NOT EXISTS abaixo em vez de um CREATE TABLE
-- normal, que não alteraria uma tabela já existente.

create table if not exists urbis_api_calls (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  status text
);

alter table urbis_api_calls add column if not exists modulo text;
alter table urbis_api_calls add column if not exists slot text;
alter table urbis_api_calls add column if not exists operacao text;
alter table urbis_api_calls add column if not exists processo_codigo text;
alter table urbis_api_calls add column if not exists tamanho_bytes bigint;
alter table urbis_api_calls add column if not exists duracao_ms integer;
alter table urbis_api_calls add column if not exists modelo text;
alter table urbis_api_calls add column if not exists tokens_entrada integer;
alter table urbis_api_calls add column if not exists tokens_saida integer;
alter table urbis_api_calls add column if not exists custo_estimado_usd numeric(10, 5);
alter table urbis_api_calls add column if not exists motivo_erro text;

create index if not exists urbis_api_calls_criado_em_idx on urbis_api_calls (criado_em);
create index if not exists urbis_api_calls_modulo_idx on urbis_api_calls (modulo);
create index if not exists urbis_api_calls_processo_idx on urbis_api_calls (processo_codigo);

create table if not exists urbis_aportes (
  id uuid primary key default gen_random_uuid(),
  data_hora timestamptz not null,
  email text not null,
  valor_reais numeric(10, 2) not null,
  conta_faturamento text,
  projeto text,
  observacao text,
  origem text not null default 'manual' check (origem in ('manual', 'historico')),
  criado_em timestamptz not null default now()
);

create index if not exists urbis_aportes_data_hora_idx on urbis_aportes (data_hora);

-- Dados anteriores, levantados na tela de Faturamento do AI Studio (conta "My Billing
-- Account 1", projeto "urbis-gemini") ao investigar o esgotamento de crédito de 27/08/2026.
-- Guarda condicional por e-mail+data+valor pra este INSERT não duplicar se a migration
-- for reexecutada manualmente (não tem constraint única na tabela pra usar ON CONFLICT).
insert into urbis_aportes (data_hora, email, valor_reais, conta_faturamento, projeto, observacao, origem)
select * from (values
  ('2026-06-25T12:00:00-03:00'::timestamptz, 'fabio.parente@gmail.com', 60.00::numeric(10,2), 'My Billing Account 1', 'urbis-gemini',
   'Recarga identificada no histórico do AI Studio — horário exato do dia não confirmado, só a data.', 'historico'),
  ('2026-08-27T09:20:00-03:00'::timestamptz, 'fabio.parente@gmail.com', 200.00::numeric(10,2), 'My Billing Account 1', 'urbis-gemini',
   'Recarga via PIX depois que o saldo zerou (-R$ 0,08) e travou a leitura de PDF do Slot 1 com 429 RESOURCE_EXHAUSTED.', 'manual')
) as novos(data_hora, email, valor_reais, conta_faturamento, projeto, observacao, origem)
where not exists (
  select 1 from urbis_aportes a
  where a.email = novos.email and a.data_hora = novos.data_hora and a.valor_reais = novos.valor_reais
);
