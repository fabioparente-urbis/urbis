# Plano — Slot 3 (Regularização PED) e Slot 4 (Aceite PED)

**Status:** APROVADO em 16/10/2026 (Opção A, slugs `slot_03`/`slot_04`, `nome_documento` herdado).
**Progresso:** Fase 0 → **10% concluído, 90% restante.**
**Data:** 16/10/2026

### Registro das fases
- **Fase 0 (16/10/2026):** clonagem APLICADA por `scripts/clonar_slots_3_4_ped.mts --aplicar`.
  Conferida campo a campo: abas, campos, itens do MAC e prompts idênticos à origem, nenhum id
  compartilhado, os dois slots continuam `ativo = false`. Os prompts do Slot 1 não citam
  "Regularização SEI" (0 trocas). O Slot 4 teve 3 trocas "Aceite SEI" → "Aceite PED".
  Migration `supabase/migrations/2026_10_16_slots_3_4_ped_fundacao.sql`: **o Fábio roda no SQL
  Editor** (a conexão direta ao Postgres dá timeout nesta máquina).
- **Achado para a Fase 4:** `urbi_regras_bloqueio` (as 8 condições bloqueantes) é uma tabela
  só, por `chave`, sem slot. Os Slots 1 e 2 já dividem os mesmos interruptores. O Slot 3/4
  precisa de interruptores próprios, para que ligar uma condição no 1 não ligue no 3.
**Pedido:** "cada slot deve ser 100% independente — banco, prompts, mecânica, arquitetura,
configuração, tabelas, emissão de documentos, fluxo, em tudo. Vamos iniciar o Slot 3 copiando
100% o Slot 1 e o Slot 4 copiando 100% o Slot 2."

Base: `docs/URBIS_CONTRATO_NOVO_SLOT.md` (checklist de slot novo, 05/09) + inventário de
código e banco feito hoje (só leitura).

---

## 1. O que foi medido hoje

### Banco (`assuntos`)

| slug | nome | ativo | situação |
|---|---|---|---|
| `regularizacao` | Regularização SEI | sim | Slot 1: 9 abas, 86 campos LIP, 4 prompts, 60 itens MAC, 84 processos |
| `aceite_sei` | Aceite SEI | sim | Slot 2: 9 abas, 88 campos LIP, 6 prompts, 57 itens MAC, 3 processos |
| `slot_03` | Slot 03 | **não** | vazio, reservado |
| `slot_04` | Slot 04 | **não** | vazio, reservado |
| `slot_05` | Aprovação de Projeto | sim | Slot 5 |

As linhas dos Slots 3 e 4 **já existem**, vazias e inativas.

### Código

São 49 arquivos com `"regularizacao"` ou `"aceite_sei"` escrito à mão, e mais de 19 mil linhas
de código próprio dos Slots 1 e 2 (telas de análise com ~3.400 linhas cada, organizadores do
SEI, rotas de despacho, laudo e despacho interno, geradores de documento).

---

## 2. ⚠️ Risco achado: o "prefixo" do nome do slot

Sete arquivos decidem o comportamento por **começo do nome**, não por nome exato:

| arquivo | regra |
|---|---|
| `lib/marcoTemporal.ts` | começa com `aceite` → marco 19/10/1995; com `regularizacao` → 04/03/2022 |
| `lib/compatibilidadeArea.ts` | `ehRegularizacaoSei` = começa com `regularizacao` |
| `lib/caixaRecargaSlot1.ts` | via `ehRegularizacaoSei` |
| `lib/carimboAssunto.ts`, `lib/cheadvAprovado.ts` | começa com `regularizacao` ou `aceite` |
| `lib/bdi/vigia.ts`, `app/api/bdi/vigia/route.ts` | as 8 condições bloqueantes, mesmo prefixo |
| `lib/urbi/indeferimentoImovelDuplicado.ts` | começa com `regularizacao` → rotas do Slot 1, senão → rotas do **Slot 2** |

Um comentário no `vigia` diz literalmente *"futuramente Slot 3/4 PED — mesmo prefixo"*.

**Consequência:** com slug `regularizacao_ped`, o Slot 3 herdaria em silêncio o marco temporal,
a caixa de recarga e as condições do Slot 1. Com `aceite_ped`, o Slot 4 herdaria as do Slot 2.
Pior: o indeferimento automático de um processo `slot_03` cairia nas **rotas do Aceite SEI**.
Isso é exatamente o que a regra de isolamento proíbe: um ajuste no Slot 1 mudaria o Slot 3
sem ninguém ver.

**Decisão proposta:** manter os slugs que já existem, **`slot_03`** e **`slot_04`**, mesmo
padrão do Slot 5 (`slot_05`, nome "Aprovação de Projeto"). Muda só o `nome`:
- `slot_03` → nome **Regularização PED**
- `slot_04` → nome **Aceite PED**

Nenhum prefixo os pega por acidente. Cada regra que o Slot 3/4 precisa ganha um caminho
**explícito e próprio** (seção 4).

---

## 3. Decisão que é sua: a infraestrutura que 1 e 2 já dividem

Hoje os Slots 1 e 2 **já compartilham** uma camada neutra de máquina:
- leitura do LIP (`/api/lip/s0` a `s4`), que busca o prompt **do assunto** e cai no global
  se faltar;
- biblioteca do Organizador/Fatiador SEI (`lib/documentosSei/*`, ~4.400 linhas);
- MHD, MRP, MDP, Pilha, auditoria, leitura única LIP+MAC (`/api/mac/leitura-unica`), P3;
- numeração (`/api/numeracao/proximo`), que é exceção declarada no CLAUDE.md.

Os dados de cada slot ficam separados **por `assunto_id`** dentro das mesmas tabelas
(`processos`, `analises_mac`, `mrp_registros`, `mdp_registros`, `lip_abas`, `lip_prompts`...).
É por isso que a Pilha, o MRP e o MDP enxergam todos os slots.

**Opção A (recomendada) — igual aos Slots 1 e 2:**
- tudo que é **regra, texto, documento, tela e fluxo** do slot vira cópia própria (seção 4);
- a **máquina neutra** continua única e só ganha um desvio explícito por slug
  (`slot_03` → chama o módulo do Slot 3);
- os dados ficam separados por `assunto_id` nas mesmas tabelas, como 1 e 2 hoje.

**Opção B — cópia total, inclusive da máquina:**
- duplicar também s0–s4, `documentosSei`, leitura única, P3 e, no banco, criar tabelas próprias
  (`processos_slot3`...).
- Custo: perto de +10 mil linhas; toda correção futura da máquina precisa ser feita 4 vezes.
- **E o pior:** tabelas próprias deixam MRP, MDP, MAP, MHD e Pilha **cegos** para os Slots 3 e 4,
  o que fere a regra "todo módulo principal dispara para todos os satélites".

---

## 4. O que cada slot copia (Opção A)

Convenção de nomes: Slot 3 = `regularizacao-ped` (rotas) / `regularizacaoPed` (arquivos);
Slot 4 = `aceite-ped` / `aceitePed`. **Nenhum arquivo novo importa arquivo do Slot 1/2/5**,
e vice-versa. Cada cópia nasce com cabeçalho dizendo de onde veio e em que data.

### 4.1 Banco (configuração, sem trabalho real)

| item | Slot 3 ← Slot 1 | Slot 4 ← Slot 2 |
|---|---|---|
| `assuntos` | nome, `nome_documento`, `numeracao` copiados; **`ativo` fica `false`** até a Fase 6 | idem |
| `lip_abas` + `lip_campos` | 9 abas / 86 campos | 9 abas / 88 campos |
| `lip_prompts` | 4 prompts, com o texto revisado de "Regularização SEI" para "Regularização PED" | 6 prompts, idem com "Aceite PED" |
| `mac_checklist_modelos` + itens | 1 modelo / 60 itens, **todas as colunas** | 1 modelo / 57 itens |
| `despacho_padroes` | o que existir (hoje 0) | idem |
| `urbis_config` | coluna nova `documentos_vivos_slot_03_ativo` (default `false`) | `documentos_vivos_slot_04_ativo` |
| CHECKs `urbi_historico.tipo_processo` e `urbi_sugestoes.slot` | aceitar `slot_03` | aceitar `slot_04` |

A clonagem **não** usa o botão "ativar" do admin, porque ele (a) só clona da Regularização,
o que daria Slot 4 ← Slot 1, errado, e (b) copia só parte das colunas. Em vez disso, um
script próprio, com contagem antes e depois, que você roda ou autoriza.

### 4.2 Regras determinísticas (arquivos próprios)

| Slot 1 hoje | cópia do Slot 3 | Slot 2 hoje | cópia do Slot 4 |
|---|---|---|---|
| `caixaRecargaSlot1.ts` | `lib/regularizacaoPed/caixaRecarga.ts` | `aceiteSeiDispensas.ts` | `lib/aceitePed/dispensas.ts` |
| `marcoTemporal.ts` (parte Regularização, 04/03/2022) | `lib/regularizacaoPed/marcoTemporal.ts` | parte Aceite (19/10/1995) | `lib/aceitePed/marcoTemporal.ts` |
| `compatibilidadeArea.ts` | `lib/regularizacaoPed/compatibilidadeArea.ts` | — | — |
| `carimboAssunto.ts`, `cheadvAprovado.ts` | cópias em `lib/regularizacaoPed/` | idem | cópias em `lib/aceitePed/` |

⚠️ **Marcos temporais e limites (250 m², 200 m²) são copiados idênticos, como pedido.** Se a
lei da PED for outra, a mudança é feita **só no arquivo do slot PED**, sem tocar no 1 e no 2.

### 4.3 Rotas (API)

| Slot 1 | Slot 3 | Slot 2 | Slot 4 |
|---|---|---|---|
| `/api/analise-regularizacao` (+ `documentos-sei`, `analisar-pendentes`) | `/api/analise-regularizacao-ped/...` | `/api/analise-aceite-sei/...` | `/api/analise-aceite-ped/...` |
| `/api/despacho-regularizacao` | `/api/despacho-regularizacao-ped` | `/api/despacho-aceite-sei` | `/api/despacho-aceite-ped` |
| `/api/despacho-interno` (hoje é do Slot 1) | `/api/mac/regularizacao-ped/despacho-interno` | `/api/mac/aceite-sei/despacho-interno` | `/api/mac/aceite-ped/despacho-interno` |
| `/api/mac/gerar-laudo` | `/api/mac/regularizacao-ped/gerar-laudo` | `/api/mac/aceite-sei/gerar-laudo` | `/api/mac/aceite-ped/gerar-laudo` |

Todos os *fallbacks* `|| "regularizacao"` e `|| "aceite_sei"` viram `slot_03` e `slot_04`.
O Slot 2 nasceu de cópia do 1 e carregou fallbacks errados por semanas (comentados em
`despacho-aceite-sei` e `aceite-sei/despacho-interno`). Aqui cada um é conferido por grep.

### 4.4 Geradores de documento (emissão)

| Slot 1 | Slot 3 | Slot 2 | Slot 4 |
|---|---|---|---|
| `lib/geradores.ts` (parte de despacho/parecer), `lib/geradores/gerarLaudo.ts` | `lib/geradores/regularizacaoPed/*` | `lib/geradores/aceiteSei/*` (5 arquivos) | `lib/geradores/aceitePed/*` |

Cada emissão continua chamando a numeração única e gravando em MDP e MRP com o `assunto_id`
do próprio slot.

### 4.5 Telas

| Slot 1 | Slot 3 | Slot 2 | Slot 4 |
|---|---|---|---|
| `app/analise-regularizacao/[codigo]` | `app/analise-regularizacao-ped/[codigo]` | `app/analise-aceite-sei/[codigo]` | `app/analise-aceite-ped/[codigo]` |
| `components/regularizacao/OrganizadorSeiRegularizacao` | `components/regularizacaoPed/OrganizadorSei...` | `components/aceiteSei/*` | `components/aceitePed/*` |
| `components/mac/BotaoGerarLaudo` | `components/mac/regularizacaoPed/BotaoGerarLaudo` | `components/mac/aceiteSei/BotaoGerarLaudoAceiteSei` | `components/mac/aceitePed/...` |

### 4.6 Desvios nos arquivos compartilhados (só acrescentar, nunca mudar o caminho de 1/2/5)

- `app/processo/ProcessoClient.tsx`: 15 pontos (rota do MAC ×3, laudo, Organizador, regras).
- `/api/lip/s3` e `s4`: injetar as regras do Slot 3/4 a partir dos arquivos **deles**.
- `/api/processo/salvar`: dispensas do slot certo.
- `/api/lip/alerta-fluxo`, `components/documentosSei/AlertaFluxo.tsx`, Fatiador SEI.
- Condições bloqueantes (`vigia`), indeferimento por imóvel duplicado (rotas certas por slot).
- Pilha (`app/processos`), tela inicial (`app/page.tsx`, já lista os assuntos ativos sozinha).
- Admin: despacho-padrões, URBI, vínculos LIP/BIP (`ASSUNTOS_PERMITIDOS_NA_FILA`), checklists.

### 4.7 Satélites (regra do CLAUDE.md: tudo dispara para todos)

| satélite | o que precisa |
|---|---|
| URBI | adaptador `lib/urbi/adaptadores/regularizacaoPed.ts` e `aceitePed.ts` + `case` no switch; `catalogoSemantico` (chaves próprias), `navegacao`, `contratoResposta`, `catalogoConsultaPilha` |
| MAP | nada: `auditoria_eventos` grava `assunto_id` |
| MRP / MDP | nada de código: `resolverSlot()` resolve pelo processo; **conferir na Fase 6** |
| tag / Pilha | conferir rótulos por slot |
| MHD | nada: grava `assunto_id`; conferir na Fase 6 |

---

## 5. Fases (com % a cada commit)

| fase | o quê | % ao fim |
|---|---|---|
| 0 | Banco: migration (flags, CHECKs) + script de clonagem com contagem; slots continuam **inativos** | 10% |
| 1 | Regras determinísticas próprias (4.2) | 20% |
| 2 | Rotas de API + geradores (4.3, 4.4) | 45% |
| 3 | Telas de análise + Organizador + botão de laudo (4.5) | 70% |
| 4 | Desvios nos compartilhados (4.6) | 85% |
| 5 | Satélites (4.7) | 92% |
| 6 | Teste local ponta a ponta com processo de teste, **sem consumir número**; `tsc` limpo; CLAUDE.md (tabela de slots); OBS COD | 100% |

**Ativar os slots (`ativo = true`) é ação sua**, depois da Fase 6, pela tela de configurações.

### Garantias em cada fase
- `git diff` de cada commit é conferido: **nenhuma linha muda no comportamento dos Slots 1, 2 e 5**,
  só acréscimos de desvio.
- Grep final: nenhum arquivo do Slot 3/4 importa arquivo do Slot 1/2, e vice-versa.
- Nenhum número da faixa é consumido em teste.

---

## 6. Perguntas abertas

1. **Opção A ou B** (seção 3)? Recomendo A.
2. **Slugs `slot_03` / `slot_04`** (seção 2)? Recomendo sim.
3. **`nome_documento`**: o Slot 3 herda "Alvará de Regularização" e o Slot 4 "Alvará de Aceite"
   (cópia 100%). Fica assim por enquanto?
