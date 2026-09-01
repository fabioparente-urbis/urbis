/**
 * Extrai o schema real do banco (public) para supabase/schema/*.
 *
 *   npx tsx --env-file=.env.local scripts/extrair_schema.mts
 *
 * Exige SUPABASE_DB_URL no .env.local (Supabase > Connect > Direct/Connection
 * string > Session pooler). Leitura pura: nenhuma consulta aqui escreve.
 *
 * Existe porque o repo tem migrations incompletas — parte do banco foi criada
 * fora delas (schema legado inteiro, e a trava de RLS da leva 2). Este dump é a
 * fonte de verdade sobre o que o banco REALMENTE tem.
 */
import { Client } from "pg";
import { writeFileSync } from "node:fs";

const DIR = "supabase/schema";
const c = new Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const q = async (sql: string) => (await c.query(sql)).rows;
const cabecalho = (titulo: string) =>
  `-- ${titulo}\n-- Gerado por scripts/extrair_schema.mts em ${new Date().toISOString().slice(0, 10)}.\n-- NAO EDITE A MAO: regenere.\n\n`;

const versao = (await q("select version() as v"))[0].v;

// ---------- tabelas: colunas, constraints, comentarios ----------
const colunas = await q(`
  select c.relname as tabela, a.attnum, a.attname as coluna,
         format_type(a.atttypid, a.atttypmod) as tipo,
         a.attnotnull as nao_nulo,
         pg_get_expr(d.adbin, d.adrelid) as padrao,
         col_description(c.oid, a.attnum) as comentario
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
   where n.nspname = 'public' and c.relkind in ('r','p')
   order by c.relname, a.attnum`);

const constraints = await q(`
  select conrelid::regclass::text as tabela, conname as nome,
         pg_get_constraintdef(oid) as definicao, contype as tipo
    from pg_constraint
   where connamespace = 'public'::regnamespace and conrelid <> 0
   order by conrelid::regclass::text, contype, conname`);

let sql = cabecalho("TABELAS — colunas, defaults e constraints");
const tabelas = [...new Set(colunas.map((r) => r.tabela))];
for (const t of tabelas) {
  sql += `-- ======================================================================\n-- ${t}\n-- ======================================================================\nCREATE TABLE public.${t} (\n`;
  const cols = colunas.filter((r) => r.tabela === t);
  sql += cols
    .map((r) => `    ${r.coluna} ${r.tipo}${r.padrao ? ` DEFAULT ${r.padrao}` : ""}${r.nao_nulo ? " NOT NULL" : ""}`)
    .join(",\n");
  sql += "\n);\n";
  for (const cs of constraints.filter((r) => r.tabela === t))
    sql += `ALTER TABLE public.${t} ADD CONSTRAINT ${cs.nome} ${cs.definicao};\n`;
  for (const co of cols.filter((r) => r.comentario))
    sql += `COMMENT ON COLUMN public.${t}.${co.coluna} IS ${JSON.stringify(co.comentario)};\n`;
  sql += "\n";
}
writeFileSync(`${DIR}/01_tabelas.sql`, sql);

// ---------- indices ----------
const indices = await q(`select tablename, indexname, indexdef from pg_indexes where schemaname='public' order by tablename, indexname`);
writeFileSync(
  `${DIR}/02_indices.sql`,
  cabecalho("INDICES") + indices.map((r) => `${r.indexdef};`).join("\n") + "\n",
);

// ---------- views ----------
const views = await q(`
  select c.relname as nome, c.relkind as tipo,
         pg_get_viewdef(c.oid, true) as definicao
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and c.relkind in ('v','m')
   order by c.relname`);
const opcoesView = await q(`
  select c.relname as nome, c.reloptions as opcoes
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('v','m') and c.reloptions is not null`);
const mapaOpcoes = new Map(opcoesView.map((r) => [r.nome, (r.opcoes ?? []).join(", ")]));
writeFileSync(
  `${DIR}/03_views.sql`,
  cabecalho("VIEWS — definicao real (o repo nao tem o SQL de nenhuma delas)") +
    views
      .map((r) => {
        const opc = mapaOpcoes.get(r.nome);
        return `-- ======================================================================\n-- ${r.nome}${r.tipo === "m" ? "  (MATERIALIZED)" : ""}${opc ? `\n-- opcoes: ${opc}` : "\n-- opcoes: (nenhuma — roda com privilegio do dono)"}\n-- ======================================================================\nCREATE OR REPLACE ${r.tipo === "m" ? "MATERIALIZED " : ""}VIEW public.${r.nome} AS\n${r.definicao}\n`;
      })
      .join("\n"),
);

// ---------- funcoes e triggers ----------
const funcoes = await q(`
  select p.proname as nome, pg_get_functiondef(p.oid) as definicao
    from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind in ('f','p')
   order by p.proname`);
writeFileSync(
  `${DIR}/04_funcoes.sql`,
  cabecalho("FUNCOES E PROCEDURES") + funcoes.map((r) => `${r.definicao};\n`).join("\n"),
);

const triggers = await q(`
  select t.tgname as nome, c.relname as tabela, pg_get_triggerdef(t.oid) as definicao
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and not t.tgisinternal
   order by c.relname, t.tgname`);
writeFileSync(
  `${DIR}/05_triggers.sql`,
  cabecalho("TRIGGERS — inclui os que alimentam tabelas que nenhum codigo escreve") +
    triggers.map((r) => `-- ${r.tabela}\n${r.definicao};\n`).join("\n"),
);

// ---------- RLS, policies e grants ----------
const rls = await q(`
  select c.relname as tabela, c.relrowsecurity as rls_ativo, c.relforcerowsecurity as rls_forcado
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('r','p') order by c.relname`);
const policies = await q(`select tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies where schemaname='public' order by tablename, policyname`);
const grants = await q(`
  select table_name, grantee, string_agg(distinct privilege_type, ', ' order by privilege_type) as privilegios
    from information_schema.role_table_grants
   where table_schema='public' and grantee in ('anon','authenticated','service_role','PUBLIC')
   group by table_name, grantee order by table_name, grantee`);

let seg = cabecalho("RLS, POLICIES E GRANTS — estado real apos a trava de 01/09/2026");
seg += `-- Tabelas sem RLS ativo (${rls.filter((r) => !r.rls_ativo).length} de ${rls.length}):\n`;
for (const r of rls.filter((r) => !r.rls_ativo)) seg += `--   ${r.tabela}\n`;
seg += `\n-- RLS ativo:\n`;
for (const r of rls.filter((r) => r.rls_ativo)) seg += `ALTER TABLE public.${r.tabela} ENABLE ROW LEVEL SECURITY;${r.rls_forcado ? "  -- FORCE" : ""}\n`;
seg += `\n-- Policies (${policies.length}):\n`;
for (const p of policies)
  seg += `CREATE POLICY ${p.policyname} ON public.${p.tablename} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles}${p.qual ? `\n  USING (${p.qual})` : ""}${p.with_check ? `\n  WITH CHECK (${p.with_check})` : ""};\n`;
seg += `\n-- Grants para anon/authenticated/service_role/PUBLIC (${grants.length} linhas):\n`;
for (const g of grants) seg += `-- ${g.table_name.padEnd(42)} ${String(g.grantee).padEnd(15)} ${g.privilegios}\n`;
const perigosos = grants.filter((g) => ["anon", "authenticated", "PUBLIC"].includes(String(g.grantee)));
seg += `\n-- ATENCAO: ${perigosos.length} grant(s) ainda concedidos a anon/authenticated/PUBLIC.\n`;
for (const g of perigosos) seg += `--   ${g.table_name} -> ${g.grantee}: ${g.privilegios}\n`;
writeFileSync(`${DIR}/06_rls_policies_grants.sql`, seg);

// ---------- inventario ----------
// Contagem exata, nao reltuples: tabela nunca analisada devolve -1 e o
// inventario fica inutil justamente nas tabelas legadas, que ninguem analisa.
const inv = await q(`
  select objeto, tipo, rls,
         case when tipo like 'view%' then null
              else (xpath('/row/c/text()', linhas_xml))[1]::text::bigint end as linhas
    from (
      select c.relname as objeto,
             case c.relkind when 'r' then 'tabela' when 'p' then 'particionada'
                            when 'v' then 'view' when 'm' then 'view materializada' end as tipo,
             c.relrowsecurity as rls,
             case when c.relkind in ('r','p')
                  then query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')
             end as linhas_xml
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r','p','v','m')
    ) t
   order by tipo, objeto`);

let md = `# Schema real do banco — inventário\n\nGerado por \`scripts/extrair_schema.mts\` em ${new Date().toISOString().slice(0, 10)}.\n\n${versao}\n\n`;
md += `**${inv.length} objetos** no schema \`public\`: ${inv.filter((r) => r.tipo === "tabela").length} tabelas, ${inv.filter((r) => String(r.tipo).startsWith("view")).length} views.\n`;
md += `${funcoes.length} funções, ${triggers.length} triggers, ${indices.length} índices, ${policies.length} policies.\n\n`;
md += `| objeto | tipo | linhas | RLS |\n|---|---|---:|---|\n`;
for (const r of inv)
  md += `| \`${r.objeto}\` | ${r.tipo} | ${r.linhas ?? "—"} | ${String(r.tipo).includes("view") ? "—" : r.rls ? "✅" : "❌"} |\n`;
writeFileSync(`${DIR}/00_inventario.md`, md);

console.log(`${inv.length} objetos | ${funcoes.length} funcoes | ${triggers.length} triggers | ${indices.length} indices | ${policies.length} policies`);
console.log(`grants a anon/authenticated/PUBLIC: ${perigosos.length}`);
console.log(`tabelas sem RLS: ${rls.filter((r) => !r.rls_ativo).length} de ${rls.length}`);
await c.end();
