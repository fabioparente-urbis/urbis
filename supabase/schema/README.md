# Schema real do banco

Dump do que o banco de produção **realmente tem** hoje, gerado do `pg_catalog`.

Existe porque as migrations não contam a história inteira: 115 dos 177 objetos de `public`
não são criados por nenhuma migration nem lidos por nenhum `.from()` do app — é schema
legado, mais views, triggers e funções que só existem no banco. Migration é o registro do
que foi *pedido*; isto aqui é o registro do que *está lá*.

## Como regerar

```bash
npx tsx --env-file=.env.local scripts/extrair_schema.mts
```

Precisa de `SUPABASE_DB_URL` no `.env.local` — Supabase → Connect → *Direct / Connection
string* → **Session pooler** (porta 5432). O script é leitura pura: nenhuma consulta dele
escreve no banco.

Regere e commite sempre que mexer em tabela, view, policy ou grant. Um diff nestes arquivos
mostra na hora o que mudou no banco de verdade — inclusive alteração feita à mão pelo SQL
Editor, que é justamente o que costuma escapar.

## Arquivos

| arquivo | o que traz |
|---|---|
| `00_inventario.md` | os 177 objetos com tipo, linhas estimadas e se têm RLS |
| `01_tabelas.sql` | colunas, tipos, defaults, PK/FK/unique/check, comentários |
| `02_indices.sql` | os 316 índices |
| `03_views.sql` | o SQL das 58 views — **não existe em nenhum outro lugar do repo** |
| `04_funcoes.sql` | 253 funções e procedures |
| `05_triggers.sql` | 45 triggers, incluindo os que alimentam tabelas que nenhum código escreve |
| `06_rls_policies_grants.sql` | RLS por tabela, as 32 policies e os grants por role |

**Não edite estes arquivos à mão.** Eles são gerados; mudança real vai em `supabase/migrations/`
e depois se regenera o dump.

## O que ler primeiro

- `06_rls_policies_grants.sql` — estado da trava de segurança de 01/09/2026. Hoje: 119/119
  tabelas com RLS, zero grants para `anon`/`authenticated`/`PUBLIC`, 107 tabelas com RLS e
  nenhuma policy (negam tudo por padrão).
- `03_views.sql` — várias views do BDI têm defeito conhecido de cálculo. O `vw_bdi_autores`,
  por exemplo, lê `dados ->> 'nome_responsavel_arq'` num campo que guarda o objeto
  `{fonte, valor, origem}`, e por isso agrupa por JSON serializado em vez de nome; e soma
  não-conformidades depois de um `LEFT JOIN analises_mac`, multiplicando o total por análise.
