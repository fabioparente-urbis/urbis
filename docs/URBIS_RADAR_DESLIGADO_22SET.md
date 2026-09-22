# Radar do URBI — desligado em 22/09/2026

**O que foi feito:** o agendamento (`pg_cron` jobid=1) que disparava o Radar a cada minuto foi
**pausado** (não removido) em 22/09/2026, por decisão do Fábio, durante um incidente em que o
URBIS ficou inutilizável.

Comando executado (pelo Fábio, no SQL Editor do Supabase — a tabela `cron.job` não aceita UPDATE
direto, só a função):

```sql
select cron.alter_job(job_id := 1, active := false);
```

Para religar (NÃO fazer antes de ler a seção "O que consertar antes de religar"):

```sql
select cron.alter_job(job_id := 1, active := true);
```

---

## 1. Por que foi cortado — o que foi medido

Medição em `pg_stat_statements`, 22/09/2026, com o banco já em colapso (Supabase Free, compute
`Nano`/t4g.nano, CPU 98%, etiqueta "EXCEEDING USAGE LIMITS", login falhando, queries estourando
o tempo limite):

| Serviço | Chamadas | CPU acumulada | % do banco |
|---|---|---|---|
| **RADAR (URBI)** | 379.804 | **18.452 s (5h07)** | **52,7%** |
| BDI (views do painel) | 147.333 | 4.750 s | 13,6% |
| MAC histórico | 126.262 | 2.115 s | 6,0% |
| Log do agendador (`cron.job_run_details`) | 126.030 | 2.004 s | 5,7% |
| Chamadas HTTP do banco (`pg_net`) | 86.933 | 1.700 s | 4,9% |
| MHD documentos | 200.336 | 634 s | 1,8% |
| Auditoria (antes/depois) | 5.914 | 514 s | 1,5% |
| Auditoria de eventos (MAP) | 10.132 | 266 s | 0,8% |
| **Monitoramento do analista (sessões)** | 15.340 | 160 s | **0,5%** |
| MRP produtividade | 47.275 | 59 s | 0,2% |

As linhas de BDI, MAC histórico, log do agendador, HTTP e MHD têm contagens de chamada que batem
1:1 com as do Radar (~42 mil / ~65 mil / ~126 mil) — **são consequência dele**, não uso humano.
Somadas ao Radar, dão **~83% de toda a carga do banco**.

Duas hipóteses foram testadas e **descartadas por medição**:
- *"o monitoramento do analista (tempo em trabalho) é caro"* → custa **0,5%**. Desligar não
  resolveria nada e perderia o dado do MAP/MRP.
- *"o fatiador de PDF travou o sistema"* → custa **1,81%**, com consultas de 2–5 ms; e a maior
  parte dessas chamadas era do próprio Radar lendo `mhd_*` pra detectar mudança. Coincidência de
  horário, não causa.

## 2. O defeito de projeto (a razão real do custo)

`urbi_radar_retratos` é, ao mesmo tempo, o **histórico** (uma linha por versão) e a **fila**
(linhas `pendente`/`em_atualizacao`) — decisão registrada no cabeçalho de `lib/urbi/radar.ts`.
Nada nunca poda as versões antigas.

Estado em 22/09/2026:

| | |
|---|---|
| Retratos guardados | **40.995** |
| Processos distintos | **89** |
| Versões por processo | **460** |
| Linhas realmente úteis (a mais nova de cada processo) | **89** |
| Linhas que são histórico morto | **40.906 (99,8%)** |
| Tamanho da tabela | **128 MB de um banco de 299 MB (43%)** |

A consulta de detecção (`lib/urbi/radar.ts`, ~linha 180) é:

```ts
supabaseAdmin.from("urbi_radar_retratos")
  .select("processo_codigo, versao, watermark_fontes")
  .in("processo_codigo", codigos)
  .order("versao", { ascending: false })
```

Ela traz **todas as versões** de todos os processos e escolhe a mais recente **no JavaScript**.
Ou seja: a cada minuto lia ~41.000 linhas pra usar 89. Média de 700 ms por chamada, e **piorando
sozinha** — quanto mais histórico acumula, mais lenta fica, o que atrasa a execução seguinte, que
acumula mais. Durante a investigação, um simples `count(*)` nessa tabela passou a estourar o
tempo limite em questão de minutos.

### 2.1 O laço da "versão 1" — o defeito de verdade (medido em 22/09, durante a limpeza)

A suspeita inicial ("watermark disparando à toa") estava perto, mas o mecanismo real é outro, e
foi confirmado por medição:

| versão | linhas | processos |
|---|---|---|
| **1** | **39.829** | 89 |
| 2 | 81 | 81 |
| 3 | 80 | 80 |
| 4 | 80 | 80 |
| ... | ~77–78 cada | ~77–78 |

As versões 2+ se comportam certo (uma linha por processo) e **param em 18/09**. A versão 1 tem
~447 cópias por processo e vai **até 22/09** — todas com `estado='atualizado'`, `concluido_em` e
`watermark_fontes` preenchidos, ou seja, **retratos legítimos, processados com sucesso**, só que
numerados "1" repetidamente.

**Mecanismo:** a consulta de detecção (`.select(...).in(...).order("versao", desc)`) sofre o
**teto padrão de linhas do PostgREST (~1000)**. Quando a tabela passou de mil linhas, ela passou a
devolver só as 1.000 maiores versões — de um punhado de processos. Para todos os outros,
`ultimo` vinha `undefined`, e aí:

```ts
versao: (ultimo?.versao ?? 0) + 1   // → 1, sempre
const mudou = !ultimo || ...        // → true, sempre
```

Cada processo fora do top-1000 era reenfileirado **todo minuto**, gerando outra "versão 1" — que
por ser a versão mais BAIXA nunca entrava no top-1000, perpetuando o laço. Realimentação pura.

**Consequência silenciosa no dia a dia:** `/api/processos` (Pilha) usa o mesmo `order by versao
desc` + "pega o primeiro". Como as versões altas (2+) são de 18/09 ou antes, **a Pilha vinha
exibindo esforço/pendências defasados em dias**, ignorando os retratos frescos de versão 1. Não
era só lentidão — era dado errado na tela.

**Armadilha na limpeza (quase caí nela):** o critério óbvio "manter a maior versão por processo"
teria **preservado os retratos velhos de 18/09 e apagado os atuais**. O critério correto foi
`distinct on (processo_codigo) ... order by processo_codigo, criado_em desc`, entre linhas com
`concluido_em is not null`.

### 2.2 Limpeza executada (22/09/2026)

| | antes | depois |
|---|---|---|
| Linhas em `urbi_radar_retratos` | 40.995 | **89** (1 por processo) |
| Tamanho da tabela | 128 MB | **416 kB** |
| Banco inteiro | 299 MB | **172 MB** |
| Consulta da Pilha | 41.000 linhas (estourava o tempo) | 87 linhas, ~0,2 s |

Feita em lotes de 5.000 (`delete ... using` com `limit`), pelo Fábio no SQL Editor, seguida de
`vacuum full analyze urbi_radar_retratos`.

## 3. O que o Radar fazia (pra poder ser refeito igual)

Serviço de pré-análise silenciosa da Pilha, independente de sessão/navegador. Implementado em
05/09/2026 (`lib/urbi/radarJob.ts`, `lib/urbi/radar.ts`, rota `/api/urbi/radar/job`).

- Detecta, em lote, quais processos mudaram desde o último retrato, comparando um "watermark"
  (timestamp mais recente entre as fontes: LIP, MAC, MDP, MHD, catálogo por `tipo_processo`).
- Para os que mudaram, enfileira e depois projeta um retrato factual reaproveitando
  `montarDossieFactual` e `montarRelatorioMotor` — **não calcula número novo**.
- Nunca chama Gemini. Nunca escreve em LIP/MAC/MDP/documento/despacho/numeração.
- Lock por índice único parcial em `urbi_radar_execucoes` (`estado='em_execucao'`) impede duas
  execuções simultâneas.

**Comando exato do agendamento** (preservado aqui verbatim, pra recriar idêntico se um dia o
job for removido em vez de pausado):

```sql
SELECT net.http_post(
  url := 'https://urbis-production.up.railway.app/api/urbi/radar/job',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'urbi_radar_cron_secret')
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 25000
);
```

Agenda original: `* * * * *` (a cada minuto, 24/7). Autenticação por segredo compartilhado
(`URBI_RADAR_CRON_SECRET`, guardado no `vault`), caminho separado de `lib/auth.ts` — desligar o
job **não** afrouxa login/sessão/RLS de nada.

## 4. O que se perde enquanto está desligado

- Na tela da Pilha (`app/processos/page.tsx`): o "esforço provável" e a contagem de pendências do
  MAC (`pendencias_radar`) **param de ser atualizados** — mostram o último valor calculado até
  22/09, cada vez mais velho.
- No painel admin do URBI, aba "Pré-análise da Pilha": cobertura e linha de evidência congelam.

**Não é afetado:** abrir processo, LIP, MAC, fatiador, emissão de documento, numeração, MDP, MRP,
MAP, login. Nenhum fluxo de trabalho do analista depende do Radar.

## 5. O que consertar ANTES de religar

Religar como está reproduz o problema em dias — a poda de 22/09 comprou tempo, não consertou
nada. O mínimo:

1. ~~Eliminar o teto de linhas como fator~~ — **FEITO em 22/09.** Ver §7.1: índice único em
   `processo_codigo` + upsert no lugar de insert. Testado com 3 chamadas seguidas pro mesmo
   processo → 1 linha só, versão avançando na mesma linha.
2. ~~Uma linha por processo, sobrescrita~~ — **FEITO junto com o item 1**, mesma mudança.
3. ~~Corrigir `/api/processos` junto~~ — **FEITO em 22/09** (commit `fix(pilha)`, PR #13): lê
   `vw_urbi_radar_vigente` em vez da tabela crua, sem trazer `alertas` inteiro pela rede.
4. ~~Criar poda automática~~ — **FEITO em 22/09** (§ anterior): job `limpar_log_do_agendador`.
5. ~~Reduzir a cadência~~ — **FEITO em 22/09.** `* * * * *` → `*/15 * * * *` (§7.1). Cálculo
   apresentado ao Fábio: Radar+consequências eram ~85% da CPU do banco; a 15 min isso cai pra
   ~5,6% do que era — banco geral cai pra ~21% da carga do auge do incidente. Ir para 30 min
   traria só +3 pontos de alívio (retornos decrescentes); Fábio escolheu 15 min.

**Status em 22/09, fim do dia: todos os 5 pontos corrigidos e testados. Falta só religar
(`select cron.alter_job(job_id := 1, active := true);`) — decisão do Fábio, não é automático.**

## 7.1 O que foi corrigido no código (22/09/2026, depois da limpeza manual)

A limpeza de dados (§2.2) resolveu o SINTOMA (banco de 128 MB → 416 kB); o código continuava com
o defeito que reproduziria o problema assim que religado. Corrigido:

- **Migration** `supabase/migrations/2026_09_22_urbi_radar_retratos_upsert.sql`: índice único
  `urbi_radar_retratos_processo_codigo_uidx` em `processo_codigo`. Aplicada direto (não precisou
  de intervenção manual do Fábio, ao contrário das outras operações neste incidente).
- **`lib/urbi/radar.ts`, `detectarMudancas`**: o `.insert(...)` que criava uma linha nova a cada
  detecção virou `.upsert(..., { onConflict: "processo_codigo" })`. Com o índice único, isso
  reaproveita SEMPRE a mesma linha do processo — nunca mais cresce por passada.
- **`lib/urbi/radar.ts`, `processarProximoPendente`**: removida a limpeza de "outro pendente
  remanescente pro mesmo código" no fim do processamento — com o índice único, nunca existe outra
  linha pra limpar; a query virou trabalho morto.
- **Efeito colateral corrigido de graça**: `obterUltimosRetratosVisiveis` (alimenta
  `lib/urbi/perguntasPilha.ts` — o URBI respondendo perguntas sobre a Pilha inteira) tinha o
  MESMO padrão frágil da Pilha (`order by versao desc` + dedup em JS) — sofria do mesmo risco de
  responder com dado velho. Não precisou de reescrita: o índice único garante 1 linha por
  processo, então o padrão antigo passa a estar sempre certo por construção.
- **Agendamento**: `select cron.alter_job(job_id := 1, schedule := '*/15 * * * *');` — de 1 em 1
  minuto para 15 em 15.

## 7.2 O que NÃO foi feito (decisão, não pendência)

Rótulo separado de conteúdo em tabelas diferentes — considerado e descartado. Medição
(22/09): cada campo pesado (`alertas`, `linha_evidencia`, `campos_consulta`) pesa **~1 KB em
média** — o incidente nunca foi o tamanho do conteúdo, foi o número de cópias (já resolvido acima).
Separar quebraria `perguntasPilha.ts` (que precisa do conteúdo de TODOS os processos pra responder
perguntas sobre a Pilha inteira, não só do processo aberto) para economizar menos de 100 KB no
total. Ver §7 (ideia original do Fábio) para o raciocínio completo.

## 7. Direção decidida pelo Fábio (22/09/2026) — "a embalagem dos potes"

Palavras dele: *"o URBI deve olhar só a embalagem dos potes, e não o conteúdo. Quando ele olhar um
conteúdo, ele deve olhar só um processo."*

Traduzindo pro concreto, e é exatamente o que os números apoiam:

- **Rótulo** — o que o URBI pode varrer de todos os processos: poucos campos simples (situação,
  esforço, nº de pendências). Uma linha por processo, sobrescrita, minúscula.
- **Conteúdo** — o dossiê completo (`alertas`, `linha_evidencia`, `campos_consulta`,
  `previsao_tempo`): calculado **sob demanda, para UM processo**, quando o analista o abre.

Hoje o sistema faz o oposto: abre todos os potes, lê o conteúdo inteiro de cada um e guarda uma
cópia desse conteúdo a cada minuto. A Pilha chega a pedir a coluna `alertas` quando só precisa de
dois números.

Essa revisão de escopo do URBI ficou para uma sessão de planejamento própria, junto com a ideia
"URBIS OFFLINE". **Não é para ser implementada de afogadilho durante incidente.**

## 6. Contexto do incidente (22/09/2026)

Cronologia (horário de Brasília):
- 13:49 — página de status do Supabase marca "Partially Degraded Service" (incidente crônico de
  JWT, aberto desde 14/08 — **não** é a causa daqui).
- ~14:20 em diante — timeouts de statement, `getUser` devolvendo 504, login falhando com
  "email ou senha incorretos" (mensagem enganosa: a consulta que confere o usuário estourava o
  tempo).
- Painel do Supabase: `Status: Unhealthy`, CPU 98%, plano Free, compute Nano, "EXCEEDING USAGE
  LIMITS", disco em 7%.
- ~16:15 — Radar pausado. `pg_stat_activity` passa a mostrar zero consultas ativas.

**Ponto importante:** o compute `Nano` (t4g.nano) é *burstable* — funciona com créditos de CPU.
"EXCEEDING USAGE LIMITS" indica créditos esgotados, e sem crédito a instância fica limitada a uma
fração de um processador. Por isso, mesmo com o banco ocioso, consultas simples continuaram
lentas logo após o desligamento: a recuperação depende dos créditos voltarem, o que só acontece
com a carga baixa mantida.

Espaço **nunca** foi o problema (disco em 7%, banco de 299 MB). O problema era CPU.
