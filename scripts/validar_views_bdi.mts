/**
 * Valida a LÓGICA das views novas do BDI sem criar view nenhuma.
 *
 *   npx tsx --env-file=.env.local scripts/validar_views_bdi.mts
 *
 * Roda exatamente o SELECT que cada view vai encapsular e mostra o resultado
 * real. Serve para conferir o número antes de aplicar migration — se o SELECT
 * devolve bobagem aqui, a view devolveria a mesma bobagem no painel.
 *
 * Somente leitura: nenhum CREATE, nenhum INSERT, nenhum UPDATE.
 * Custo zero: nenhuma chamada a serviço externo.
 */
import { Client } from "pg";

const SQL: { nome: string; porque: string; sql: string }[] = [
  {
    nome: "vw_bdi_tempo_etapas",
    porque: "quanto tempo cada processo levou entre abrir a análise e sair o documento",
    sql: `
      select
        p.codigo,
        p.tipo_processo,
        p.analise_iniciada_em::date              as iniciou,
        p.analise_concluida_em::date             as concluiu,
        round(extract(epoch from (p.analise_concluida_em - p.analise_iniciada_em)) / 86400.0, 1) as dias,
        count(h.id)                              as marcacoes_no_mac
      from processos p
      left join mac_historico h on h.processo_codigo = p.codigo
      where p.excluido_em is null
        and p.analise_iniciada_em is not null
        and p.analise_concluida_em is not null
      group by 1,2,3,4,5
      order by dias desc nulls last
      limit 10`,
  },
  {
    nome: "vw_bdi_retrabalho",
    porque: "item que mudou de ideia: conforme -> nao_conforme e volta. Retrabalho puro.",
    sql: `
      select
        h.processo_codigo,
        count(*) filter (where h.status_anterior = 'conforme'     and h.status_novo = 'nao_conforme') as virou_nao_conforme,
        count(*) filter (where h.status_anterior = 'nao_conforme' and h.status_novo = 'conforme')     as foi_resolvido,
        count(*) filter (where h.status_anterior is not null and h.status_anterior <> '-'
                           and h.status_novo is not null and h.status_anterior <> h.status_novo)      as trocas_totais
      from mac_historico h
      group by 1
      having count(*) filter (where h.status_anterior is not null and h.status_anterior <> '-'
                                and h.status_novo is not null and h.status_anterior <> h.status_novo) > 0
      order by trocas_totais desc
      limit 10`,
  },
  {
    nome: "vw_bdi_exigencias_por_contexto",
    porque: "o que mais reprova, por assunto e por faixa de área — a base da triagem por evidência",
    sql: `
      select
        -- mac_historico gravou o tipo em duas grafias (regularizacao e
        -- REGULARIZACAO); sem normalizar, o mesmo assunto aparece duas vezes.
        lower(h.tipo_processo) as tipo_processo,
        case
          when p.area_construida is null then '(sem área)'
          when p.area_construida < 100   then 'até 100 m²'
          when p.area_construida < 300   then '100 a 300 m²'
          when p.area_construida < 1000  then '300 a 1.000 m²'
          else 'acima de 1.000 m²'
        end                                        as faixa_area,
        left(h.item_texto, 60)                     as exigencia,
        count(*)                                   as vezes,
        count(distinct h.processo_codigo)          as processos
      from mac_historico h
      join processos p on p.codigo = h.processo_codigo and p.excluido_em is null
      where h.status_novo = 'nao_conforme' and coalesce(trim(h.item_texto),'') <> ''
      group by 1,2,3
      order by vezes desc
      limit 10`,
  },
  {
    nome: "vw_bdi_desempenho_artigo",
    porque: "qual referência legal mais gera não-conformidade (a lei que mais tropeça)",
    sql: `
      select
        trim(h.referencia_legal)                                              as referencia,
        count(*) filter (where h.status_novo = 'nao_conforme')                as reprovou,
        count(*) filter (where h.status_novo = 'conforme')                    as passou,
        count(distinct h.processo_codigo)                                     as processos,
        round(100.0 * count(*) filter (where h.status_novo = 'nao_conforme')
              / nullif(count(*) filter (where h.status_novo in ('conforme','nao_conforme')),0), 1) as pct_reprova
      from mac_historico h
      where coalesce(trim(h.referencia_legal),'') <> ''
      group by 1
      having count(distinct h.processo_codigo) >= 3
      order by reprovou desc
      limit 10`,
  },
  {
    nome: "vw_bdi_campos_criticos",
    porque: "processos com campo vazio, campo em X, ou área construída maior que a do terreno",
    sql: `
      select
        p.codigo,
        count(*) filter (where coalesce(trim(v->>'valor'),'') = '')                  as campos_vazios,
        count(*) filter (where upper(trim(coalesce(v->>'valor',''))) = 'X')          as campos_em_x,
        -- A área vem com vírgula decimal ("375,00"); sem trocar por ponto o
        -- cast estoura. Qualquer coisa que não seja número vira null e a
        -- comparação simplesmente não acusa, em vez de derrubar a consulta.
        (p.area_construida > nullif(regexp_replace(replace(p.dados->'areaTerreno'->>'valor', '.', ''), ',', '.'), '')::numeric)
          as area_maior_que_terreno
      from processos p, lateral jsonb_each(p.dados) e(k, v)
      where p.dados is not null and p.excluido_em is null and jsonb_typeof(v) = 'object'
      group by p.codigo, p.area_construida, p.dados
      order by campos_vazios desc
      limit 10`,
  },
  {
    nome: "vw_bdi_numeracao_saldo",
    porque: "faixa de numeração perto do fim — aviso antes de travar a emissão",
    sql: `
      select
        f.tipo,
        f.ano,
        f.numero_inicial,
        f.numero_final,
        f.proximo,
        greatest(f.numero_final - f.proximo + 1, 0) as restantes,
        case
          when f.proximo > f.numero_final then 'ESGOTADA'
          when (f.numero_final - f.proximo + 1) <= 5  then 'CRÍTICO'
          when (f.numero_final - f.proximo + 1) <= 20 then 'ATENÇÃO'
          else 'ok'
        end as situacao
      from urbis_numeracao_faixas f
      order by restantes asc`,
  },
];

const c = new Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

let falhas = 0;
for (const v of SQL) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`${v.nome}`);
  console.log(`  ${v.porque}`);
  console.log("=".repeat(72));
  try {
    const r = await c.query(v.sql);
    if (r.rows.length === 0) {
      console.log("  (nenhuma linha — a consulta roda, mas não há dado que se encaixe hoje)");
    } else {
      console.table(r.rows);
    }
  } catch (e: any) {
    falhas++;
    console.error(`  ✕ FALHOU: ${e.message}`);
  }
}
await c.end();

console.log(`\n${SQL.length - falhas} de ${SQL.length} consultas rodaram.`);
process.exit(falhas > 0 ? 1 : 0);
