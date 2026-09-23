-- Funções de apoio ao painel "Radar" do Admin (22/09/2026). O schema `cron` não é exposto pela
-- API do Supabase (só `public`/`graphql_public`) — sem isto, nem ler nem trocar o liga/desliga do
-- job do Radar (jobid=1) é possível pela aplicação, só manualmente no SQL Editor.
--
-- SECURITY DEFINER porque o dono da função enxerga `cron.job`, mesmo que quem chama (service_role
-- via PostgREST) não tenha select/update direto nessa tabela do sistema — mesmo padrão de
-- permissão mínima já usado no resto do URBIS: a função existe pra fazer EXATAMENTE uma coisa
-- (ler ou trocar o estado deste job específico, jobid fixo), não abre a tabela inteira.

create or replace function public.urbi_radar_estado()
returns table(schedule text, active boolean, ultima_execucao timestamptz)
language sql
security definer
set search_path = public, cron
as $$
  select j.schedule, j.active,
         (select max(start_time) from cron.job_run_details d where d.jobid = j.jobid)
  from cron.job j
  where j.jobid = 1;
$$;

create or replace function public.urbi_radar_definir_ativo(ativo boolean)
returns void
language sql
security definer
set search_path = public, cron
as $$
  select cron.alter_job(job_id := 1, active := ativo);
$$;

revoke all on function public.urbi_radar_estado() from public, anon, authenticated;
revoke all on function public.urbi_radar_definir_ativo(boolean) from public, anon, authenticated;
grant execute on function public.urbi_radar_estado() to service_role;
grant execute on function public.urbi_radar_definir_ativo(boolean) to service_role;
