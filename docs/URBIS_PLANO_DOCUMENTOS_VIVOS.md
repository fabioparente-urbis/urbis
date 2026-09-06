# Plano — Documentos Vivos (Organizador do PDF do SEI) · Slots 1 e 2

**Data:** 05/09/2026 · **Estado:** Fases 0, 1 e 2 executadas (ver §15, §16); Fase 2 no Slot 1
(Regularização), atrás de interruptor desligado — nenhuma mudança no fluxo existente ·
**Escopo:** Regularização (Slot 1) e Aceite SEI (Slot 2).

Este documento responde ao pedido: um plano para executar o Organizador de Processos SEI com
segurança e eficiência, em ambiente visual intuitivo, orquestrado por BDI/MDP/URBI, alimentando
LIP/MAC dos Slots 1 e 2.

---

## 1. O que já existe (não construir de novo)

A auditoria do repositório antes de escrever este plano encontrou **a maior parte da fundação já
pronta**. O projeto original (rascunho do ChatGPT) propõe criar um "Registro de Documentos e
Versões" — ele já existe, com outro nome.

| O que o rascunho pede | O que já existe hoje | Onde |
|---|---|---|
| Registro de documentos e versões | **MHD** — `mhd_documentos` (documento lógico), `mhd_versoes` (versão, `vigente`, hash, rodada), `mhd_conteudos` (extração 1× por hash, global), `mhd_eventos` (linha do tempo tipada) | `lib/mhd.ts`, migrations 27/07 |
| Identidade lógica ("ART de levantamento" ≠ "ART da caixa") | `mhd_documentos` identidade = **(processo, papel, escopo)**, `escopo` texto livre criado exatamente para "dois documentos do mesmo papel" | migration `mhd_conteudos_por_hash` |
| Não reler documento já lido | Reaproveitamento **por hash SHA-256, global entre processos** | `mhd_conteudos.hash` (unique) |
| Saber o que reprocessar quando o parser melhorar | `extrator_versao` | `mhd_conteudos` |
| Arrastar arquivo → separar → propor | **`/api/lip/ler-pasta`** (Slot 5): multipart, progresso NDJSON ao vivo, **zero IA**, resposta é sempre PROPOSTA (não grava no LIP) | `app/api/lip/ler-pasta/route.ts` |
| Classificar documento sem IA | **`ASSINATURAS`** — regex sobre o texto (projeto, uso_solo, art, matrícula, requerimento, declaração…) + `SLOTS_SEI` por nome de arquivo | `lib/lerPastaSlot5.ts:365` |
| Gemini só sob pedido, com teto e custo | **Modelo de governança pronto**: `urbis_config.visao_ligada` (interruptor global), `ativa:false` por receita, `TETO_POR_PROCESSO=40`/`TETO_POR_USUARIO=120` por hora, cache por conteúdo+receita+modelo, custo em USD por token | `lib/visao/index.ts` |
| Avisar o Radar que o processo mudou | O Radar **já vigia `mhd_documentos`** como 1 das 6 fontes de watermark | `lib/urbi/radar.ts:92` |
| Manipular PDF (cortar, gerar, ler) | `pdfjs-dist`, `pdf-lib`, `mupdf`, `pdf-parse` **já instalados** | `package.json` |
| Guardar arquivo derivado | **Cloudflare R2** já em uso e com helper pronto | `lib/r2.ts` |

**Conclusão:** isto não é um módulo novo. É **uma entrada nova (o PDF único do SEI) para um
módulo que já existe (MHD)**, mais três capacidades que faltam de verdade (§2).

---

## 2. O que realmente falta

1. **Fatiar o PDF único do SEI em eventos.** Ninguém faz isso hoje. É o coração do projeto.
2. **Estados além de vigente/não-vigente.** `mhd_versoes.vigente` é booleano. O rascunho precisa
   de `sem_efeito`, `substituido`, `complementar`, `historico`, `pendente` — e "sem efeito" é
   justamente o caso que o booleano não representa (não é uma versão superada; é um ato anulado).
3. **Procedência por página.** Hoje o MHD guarda o hash do arquivo. Falta "páginas 157–161 do PDF
   original", que é o que torna o manifesto auditável e o recorte reproduzível.

---

## 3. O achado que justifica o projeto inteiro

O LIP da Regularização **já depende** de identificar documentos pelo rodapé do SEI — e hoje faz
isso **pedindo ao Gemini**:

> `app/api/lip/analisar/route.ts:77` — "DOCUMENTOS SEI — retornar APENAS o número de 7 dígitos
> entre parênteses do rodapé:" seguido de `certidao`, `levantamento`, `artLev`, `artCx`, `laudo`,
> `vistoria`, `foto`, `usoSolo`, `seiCheadv`, `seiProcuracao`, `seiEmbargo`.

Ou seja: o sistema já precisa exatamente do índice que este projeto produz, só que hoje ele é
**adivinhado por IA, numa passada só, sem noção de versão, sem saber o que está "sem efeito" e sem
dizer de qual página tirou**.

Este projeto não acrescenta um custo novo: ele **substitui um custo que já existe** por um índice
determinístico, e ainda entrega versão e procedência de brinde. Esse é o argumento de retorno.

---

## 4. Decisões que precisam ser suas, antes de começar

Nenhuma linha deve ser escrita antes destas quatro respostas.

### D1 — O PDF do SEI tem camada de texto? ✅ **RESPONDIDA — SIM** *(05/09/2026)*
Medido em 3 processos reais (686 páginas). O carimbo do SEI está na camada de texto, e traz
**título + ID do documento**, não só a paginação:

```
Processo (6096617) | SEI 25.5.000012012-9 / pg. 1
```

| Processo | Págs | `pg. N` | Título+ID | Soma fecha? | Eventos |
|---|---|---|---|---|---|
| 25.5.000012012-9 | 229 | **100%** | 98,7% | ✅ | 30 |
| 24.5.000024350-0 | 186 | **100%** | 95,7% | ✅ | 41 |
| 25.28.000000868-8 | 271 | **100%** | 98,2% | ✅ | 35 |

**O fatiamento por evento é determinístico e gratuito.** Nenhuma IA, nada de OCR. O portão da
Fase 0 passou nos três.

**Ressalva medida:** o *corpo* das páginas é digitalizado em boa parte (texto real em 59%, 42% e
**12,5%**). Isso **não** afeta o fatiamento (que usa só o carimbo), mas afeta a classificação por
conteúdo da Fase 3. Achado que salva a Fase 3: o miolo digitalizado é quase todo **histórico
morto** (processo juntado/digitalizado antigo) — os documentos de trabalho atuais (despacho,
relatório, projeto, fiscalização) vêm em texto nativo, que é justamente onde a classificação
precisa funcionar.

### D2 — Gerar arquivo PDF de verdade, ou recorte virtual?
O MHD tem um princípio declarado em migration: *"O QUE ELE NÃO GUARDA: PDF, DWG, imagem ou
qualquer arquivo pesado."* O rascunho quer gerar `Projeto_Vigente.pdf` e outros.

- **(a) Recorte virtual — recomendado.** Guarda-se só `{ID SEI, páginas 157–161}`. O PDF é gerado
  **na hora do download**, com `pdf-lib`, a partir do original. Zero armazenamento, zero
  divergência, sempre reproduzível, respeita o princípio do MHD. O analista vê e baixa
  `Projeto_Vigente.pdf` normalmente — ele só não fica ocupando espaço.
- **(b) Materializar em R2.** Mais rápido no download repetido, mas cria cópia que pode divergir
  do original e contradiz o princípio do módulo.

### D3 — O original fica onde?
O rascunho diz "PDF original preservado, imutável". Hoje o MHD **não guarda arquivo nenhum** — o
original vive no SEI e na pasta do analista. Guardar o PDF completo do processo no R2 é uma
mudança de política de dados (volume, custo, LGPD, retenção). Precisa da sua decisão explícita.
Alternativa sem mudar política: guardar **só o hash + o índice de páginas**, e pedir o arquivo de
novo quando precisar gerar um recorte.

### D4 — Qual slot primeiro? ✅ **RESPONDIDA — Regularização (Slot 1)** *(05/09/2026)*
Recomendação era Aceite SEI (Slot 2) primeiro — mesmo problema, mesma estrutura de PDF, Slot 1
sendo produção crítica. Fábio decidiu, por escrito, começar pelo Slot 1 mesmo assim. Vale a
salvaguarda que já estava aqui: **tudo aditivo, interruptor próprio desligado por padrão, nada do
fluxo atual muda** — e a Fase 6 (se algum dia substituir o que já existe) exige piloto em
paralelo, nunca substituição direta.

---

## 5. Princípios inegociáveis (herdados do que o URBIS já é)

1. **Custo zero por padrão.** Fatiar, indexar, classificar por regex, comparar hash, gerar recorte:
   tudo determinístico. Gemini só atrás de botão explícito, com nº de páginas e custo estimado
   ANTES da chamada, seguindo o modelo de `lib/visao/index.ts` (interruptor + teto + cache).
2. **Nenhuma página some em silêncio.** Toda página do PDF termina em um de dois lugares:
   classificada, ou na fila de pendências. Contagem fechada e reportada, como o
   `X-Exigencias-Perdidas` do Slot 5.
3. **Nunca declarar vigente no escuro.** Confiança baixa → `pendente`, e o analista decide.
   O URBI não escolhe documento, igual ele não emite despacho.
4. **Proposta, nunca gravação automática.** Mesma regra de `ler-pasta`: a rota devolve proposta;
   quem grava é a tela, depois do aceite.
5. **Isolamento entre slots.** `lerPastaSlot5.ts` **não** será importado. O módulo dos Slots 1/2 é
   escrito à parte, lendo aquele como referência — regra do `CLAUDE.md`.
6. **Slot 1 é aditivo.** Nada do fluxo atual da Regularização muda. Tela nova, rota nova,
   interruptor próprio desligado por padrão.
7. **Todo documento derivado nasce rastreável:** ID SEI + páginas de origem + data + motivo da
   escolha + versão que substituiu.

---

## 6. Fases

Cada fase tem **portão de saída**: se a prova não passa, não avança.

### Fase 0 — Prova de viabilidade *(1 sessão · bloqueia todo o resto)*
Script descartável, fora do app, sobre os **3 processos reais** já citados
(`25.5.000061039-8`, `24.5.000024350-0`, `25.5.000012012-9`).

- Extrair a camada de texto com `pdfjs-dist` (mesma técnica de `lerPastaSlot5`).
- Achar o rodapé em toda página; medir **% de páginas com rodapé legível**.
- Produzir a tabela: `ID SEI | título | páginas inicial–final | data | setor`.

**Portão:** ≥95% das páginas com rodapé lido corretamente **e** a lista de eventos batendo com a
árvore do SEI conferida por você a olho. Abaixo disso, o projeto muda de forma (§D1) e volta para
decisão — não se segue em frente "dando um jeito".

**Saída:** relatório com os 3 processos, incluindo as páginas que falharam e por quê.

---

### Fase 1 — Fatiador determinístico (nível 1: eventos)
`lib/documentosSei/fatiar.ts` — novo, sem dependência de Slot 5.

- Entrada: PDF completo. Saída: lista de eventos `{id_sei, titulo, pagina_ini, pagina_fim, data, setor}`.
- Página sem rodapé só é anexada ao evento vizinho com **continuidade comprovada**; senão vai para
  revisão, nomeada.
- **Contagem fechada:** `Σ páginas dos eventos + páginas em revisão = total do PDF`. Falhou a
  soma, a rota devolve erro — nunca um resultado parcial silencioso.

**Portão:** soma fechada nos 3 processos + índice conferido por você.

---

### Fase 2 — Tela "Organizar processo" (o ambiente visual)
É aqui que o gargalo vira produto. Antes de qualquer classificação inteligente.

- Aba nova dentro do processo (Slots 1/2): **arrastar o PDF**.
- Progresso ao vivo em NDJSON, **copiando o padrão de `ler-pasta`** (`{"tipo":"progresso",…}`) —
  já resolvido lá, não se inventa de novo.
- Resultado: linha do tempo dos eventos, com miniatura, ID SEI, páginas, data.
- Ações por evento: **abrir no PDF original** (`react-pdf`, já instalado), baixar recorte,
  marcar papel à mão.
- **Zero IA nesta fase.** Já entrega valor sozinha: o analista para de rolar 200 páginas.

**Portão:** você organiza um processo real de ponta a ponta pela tela, sem tocar em código.

**Status 05/09/2026: código escrito, atrás de interruptor DESLIGADO — portão ainda não testado por
você.** Ver §16.

---

### Fase 3 — Nível 2: abrir os contêineres
Eventos genéricos ("Documentação", "Processo", "Solicitação") contêm várias peças.

- Detectar início/fim de peça por: mudança de título, numeração própria, orientação/tamanho da
  página, cabeçalho, assinatura, nº de ART/RRT — **as mesmas pistas que `lerPastaSlot5` já usa**,
  reescritas para o vocabulário dos Slots 1/2.
- Tabela `ASSINATURAS` própria para Regularização/Aceite (matrícula, projeto, ART, laudo, vistoria,
  fotografia, e-mail, memorial, despacho, parecer…).
- Peça não reconhecida **nunca é descartada**: vira `classificacao_pendente`, visível na tela.

**Portão:** nos 3 processos, nenhuma página perdida; taxa de classificação medida e publicada
(não estimada).

---

### Fase 4 — Motor de versões e estados
Extensão **aditiva** do MHD (migration testada em transação com `ROLLBACK` antes, como todas as
outras deste repositório).

- `mhd_versoes.estado`: `vigente | substituido | complementar | sem_efeito | historico | duplicado | pendente`.
  O booleano `vigente` continua existindo e derivado, para não quebrar nada que já lê.
- `mhd_versoes.origem_paginas` (jsonb): `{pdf_hash, pagina_ini, pagina_fim}`.
- Ordem de confiança, do mais forte ao mais fraco: **(1)** "sem efeito" explícito → **(2)**
  "corrigido"/"substitui" explícito → **(3)** referência ao documento anterior → **(4)** mesmo
  número com revisão posterior → **(5)** data de emissão/assinatura → **(6)** ordem do evento SEI
  → **(7)** conteúdo idêntico (hash) → **(8)** visual → **(9)** humano.
- **ID SEI maior nunca é prova sozinho.** Regra explícita, testada.
- Distinções que o motor precisa acertar: despachos sucessivos são **atos**, não versões; vistorias
  sucessivas são **histórico**; ART de outra finalidade **não** substitui a anterior; documento
  posterior pode **complementar**.

**Portão:** o despacho "SEM EFEITO" do processo `25.5.000061039-8` sai fora da coleção vigente,
sem ser apagado — e os documentos `42135097` / `42135097-1` do `25.5.000012012-9` são
reconhecidos como a mesma família.

---

### Fase 5 — Pacote vigente + manifesto
- Geração do recorte conforme §D2 (recomendado: virtual, `pdf-lib`, na hora do download).
- `00_Manifesto_Documental.pdf`: por documento — título, categoria, ID SEI, páginas de origem,
  data, versão, estado, o que substitui, motivo da escolha, confiança, quem confirmou.
- Pasta "Histórico" com tudo que saiu de vigente, nunca apagado.

**Portão:** manifesto conferido por você contra o processo real, item a item.

---

### Fase 6 — Ligação com LIP / MAC / MDP / BIP / Radar
Só depois que o índice é confiável.

- **LIP (Slots 1/2):** os campos `certidao`, `levantamento`, `artLev`, `artCx`, `laudo`,
  `vistoria`, `foto`, `usoSolo`, `seiCheadv`, `seiProcuracao`, `seiEmbargo` passam a ser
  **propostos pelo índice determinístico, com página de origem** — em vez de adivinhados pelo
  Gemini (§3). Proposta na tela, aceite do analista, como `aceitar-pasta` já faz.
- **MAC:** a evidência de cada item aponta para a **versão vigente**, não para "o PDF".
- **MDP:** cruzar o que foi cobrado com o que voltou — o retorno passa a ser identificável.
- **MHD:** vira o dono natural do índice; nada de tabela paralela.
- **Radar:** **não precisa de código** — ele já vigia `mhd_documentos`; documento novo já dispara
  reprocessamento do retrato.
- **URBI:** perguntas novas da Pilha, no padrão determinístico que já existe
  (`perguntasPilha.ts`): *"quais têm documento pendente de classificação?"*, *"o que mudou desde o
  último retorno?"*.
- **BDI:** aba de cobertura — processos organizados, páginas tratadas, pendências, custo.

**Portão:** um processo real do Slot 2 percorre LIP→MAC→MDP usando só versões vigentes.

---

### Fase 7 — Retorno incremental (a economia de verdade)
- Novo PDF chega → hash do arquivo → lista de IDs SEI → compara com o manifesto anterior.
- Evento já conhecido **e idêntico** é ignorado (não relê, não reclassifica, não custa).
- Processa só o que é novo; atualiza só as famílias afetadas.
- ID antigo reaparecendo com conteúdo diferente → **alerta de integridade**, nunca sobrescrita
  silenciosa.

**Portão:** reimportar o mesmo processo duas vezes processa **zero** eventos na segunda vez.

---

### Fase 8 — Gemini, e só aqui
- Botão **"Analisar páginas ambíguas"**, nunca automático.
- Antes da chamada, na tela: quantas páginas, para quê, custo estimado, confirmação.
- Envia **só as páginas ambíguas**, nunca o processo inteiro.
- Resultado é **proposta de classificação**, não decisão.
- Reaproveita a governança pronta: interruptor global, teto por processo/usuário, cache por
  conteúdo+receita+modelo (`lib/visao/index.ts`).

**Portão:** com o interruptor desligado, o sistema inteiro continua funcionando — só com mais
itens em `pendente`. Medido em `urbis_api_calls`: zero chamadas sem clique.

---

## 7. Riscos, ordenados por dano

| # | Risco | Dano | Mitigação |
|---|---|---|---|
| 1 | PDF sem camada de texto (digitalizado) | Projeto inviável como desenhado | **Fase 0 é portão, não formalidade** |
| 2 | Classificar errado e o analista confiar | Análise sobre documento superado — dano real ao cidadão | Estado `pendente` por padrão; vigente só com confiança alta; manifesto com página de origem sempre conferível |
| 3 | Mexer no Slot 1 e derrubar produção | Para o seu ganha-pão | Slot 2 primeiro; tudo aditivo; interruptor próprio; nada removido |
| 4 | Escopo inflar (11 tipos de documento, 8 fases) | Projeto morre pela metade | Fase 2 já entrega valor sozinha, sem IA e sem motor de versões |
| 5 | Custo de IA escapar | Quebra a regra que você fixou | Determinístico por padrão; Gemini atrás de botão + teto + cache |
| 6 | Guardar PDF completo estourar custo/LGPD | Política de dados nova sem querer | §D3 decidido antes da Fase 5 |
| 7 | Duplicar `lerPastaSlot5` e os dois divergirem | Bug num slot "consertado" no outro | Módulo separado por regra; divergência é permitida por desenho |

---

## 8. Ordem recomendada e o que dá para parar no meio

```
Fase 0 (prova)  →  PORTÃO: tem rodapé em texto?
Fase 1 (fatiar) →  Fase 2 (tela)  ←── JÁ VALE A PENA PARAR AQUI
                                        (analista para de rolar 200 páginas)
Fase 3 (contêineres) → Fase 4 (versões) → Fase 5 (pacote)
                                        ←── AQUI RESOLVE O GARGALO DECLARADO
Fase 6 (integração) → Fase 7 (incremental) → Fase 8 (Gemini opcional)
```

**Fase 2 é o corte mínimo com retorno real.** Se o projeto parar ali, você já ganhou a navegação
do processo. Tudo depois disso é composto.

---

## 9. Critérios de conclusão (verificáveis, não opinião)

- 100% das páginas com origem rastreável — soma fechada, reportada na tela.
- Nenhum documento descartado automaticamente.
- Nenhum documento ambíguo declarado vigente.
- Nenhum despacho "sem efeito" usado como atual.
- Documentos distintos nunca agrupados como versões da mesma família.
- Segunda importação do mesmo processo processa zero eventos.
- Zero chamadas de Gemini sem clique — medido em `urbis_api_calls`, antes e depois.
- Toda decisão humana registrada em `mhd_eventos`.
- `tsc` limpo, `npm run build` limpo, suíte automatizada verde.

---

## 10. Nota sobre a estimativa do rascunho

O rascunho estimava 12–20 h para o MVP e 20–30 h adicionais. Essa conta **não considerava** que o
MHD, o padrão de `ler-pasta`, a governança de custo da visão e as bibliotecas de PDF já existem —
o que reduz bastante o trabalho das Fases 4 a 8. Em compensação, ela também **não considerava** a
Fase 0, que pode invalidar o desenho inteiro. Estimativa honesta só depois do portão da Fase 0.

---

## 11. Ganho medido (não estimado) — 05/09/2026

Composição real das 686 páginas dos 3 processos, por categoria de evento:

| Categoria | Páginas | % | O que é |
|---|---|---|---|
| **Histórico morto** | **329** | **48%** | "Processo digital", "proc. juntado" — processo antigo digitalizado, rolado toda vez |
| Contêiner ("Documentação") | 245 | 36% | Pacotes genéricos que escondem projeto, ART, matrícula, fotos, e-mail |
| Outro | 44 | 6% | DUAM, comprovante, e-mail, comunicado |
| Fiscalização | 38 | 6% | Relatório de visita, registro fotográfico |
| Despacho | 25 | 4% | Os atos do processo |
| Projeto | 5 | 1% | O que de fato se analisa |

**Os três números que importam:**

1. **48% das páginas são histórico morto.** No processo `25.28.000000868-8`, são **220 de 271
   páginas (81%)**: o analista abre um PDF de 255 MB e rola 220 páginas de processo antigo
   digitalizado para chegar nas ~50 que valem. Depois do fatiador, isso vira **uma linha
   recolhida** no índice.
2. **Os documentos que se analisa de verdade são ~11% das páginas.** Hoje eles estão espalhados
   e sem rótulo; depois, viram lista clicável de 30 a 41 itens.
3. **36% está dentro de contêineres "Documentação"** — a parte que exige a Fase 3, e onde mora
   a duplicidade (ex.: `Processo digital - 42135097` com 38 págs e `42135097-1` com 39 págs,
   77 páginas de quase-duplicata no mesmo processo).

**Como o ganho será medido depois (não chutado):** MRP e MAP já registram tempo por processo.
Comparar a mediana de tempo dos processos organizados contra os não organizados dá o número real,
sem ninguém precisar estimar produtividade.

---

## 12. Prazo e % concluído

Em sessões de trabalho, com portão em cada uma. Não é estimativa de calendário: depende de quantas
sessões você abre por semana. **% concluído é medido em sessões batidas contra o total estimado
(12–16, meio-termo 14) — não em "fases tocadas".**

> **Regra:** esta tabela é atualizada a CADA commit deste projeto, antes de commitar — nunca
> depois, nunca "quando lembrar". Ver nota ao final da seção.

| Fase | Sessões | % da fase | Estado |
|---|---|---|---|
| 0 — prova de viabilidade | — | ✅ 100% | **feita em 05/09/2026** |
| 1 — fatiador determinístico | 1 | 🟡 90% | módulo escrito e rodado contra 4 processos reais, soma fechada nos 4 — falta só a conferência humana do índice (ver §15). Os 10% que faltam são exatamente essa conferência. |
| 2 — tela "Organizar processo" | 2–3 | 🟢 95% | **portão fechado na prática** — você organizou processos reais de ponta a ponta pela tela várias vezes na madrugada de 06/09, com bugs reais achados e corrigidos ao vivo (setor por cabeçalho, filtro que não colapsava despacho, MHD que sumia sem `mhd_documentos`, aba abrindo sozinha). Os 5% que faltam: portão formal ainda não declarado fechado por você por escrito. Ver §16.1–16.9. |
| **← corte mínimo com retorno real: 3–4 sessões** | | | |
| 3 — abrir contêineres (nível 2) | 2–3 | 🟡 70% | **código escrito e no ar** (`lib/documentosSei/pecas.ts`, rotas e telas dos dois slots atualizadas, ver §17): classifica por página dentro de contêineres genéricos, agrupa em peças, publica cobertura (`coberturaPecas`). `compararLip.ts` já sugere os 7 campos que antes ficavam vazios (`certidao`, `levantamento`, `artLev`, `artCx`, `laudo`, `seiProcuracao`, `seiEmbargo`) a partir das peças. Faltam os 30%: rodar contra os 4 processos reais e você conferir a taxa de classificação (portão da fase ainda não fechado por você). |
| 4 — motor de versões e estados | 2 | 🟡 60% | **código escrito e no ar** (`lib/documentosSei/motorVersoes.ts`, ver §18): resolve vigente/substituído/sem-efeito/histórico DENTRO de um único fatiamento, validado contra os dois casos reais do portão (despacho SEM EFEITO isolado; família 42135097/42135097-1). Escopo reduzido do desenho original: não persiste estado em `mhd_versoes` (banco) — decisão registrada em §18 sobre por que isso pede uma decisão de arquitetura antes (identidade de documento entre uploads diferentes, que a Fase 3 não estabeleceu). Coluna "Estado" nas duas telas, só informativo. |
| 5 — pacote vigente + manifesto | 1–2 | 🟡 75% | **código escrito e no ar** (ver §19): `lib/documentosSei/manifesto.ts` (PDF do manifesto, puro, sem `fs`) + `pacoteVigenteClient.ts` (recorta cada evento com pdf-lib, separa Vigentes/Histórico conforme a Fase 4, zipa com JSZip) + botão "📦 Baixar pacote vigente" nas duas telas. Testado localmente com PDF sintético — soma fechada, pastas corretas. Só sobre EVENTOS (não peças) — mesma fronteira herdada da Fase 4. Faltam os 25%: você conferir o manifesto contra um processo REAL, item a item (portão da fase). |
| **← gargalo declarado resolvido: 8–11 sessões** | | | |
| 6 — integração LIP/MAC/MDP/Radar/URBI | 2 | 🟢 75% | **executada (§21)**: Radar de graça (vigia `mhd_documentos.atualizado_em`, real desde o Passo 0); URBI ganhou pergunta nova da Pilha ("documento pendente de classificação"); Motor de Produção diferencia "documento já no MHD" (esforço `rapido`) de "ninguém trouxe" (`depende_documento`), testado. Falta só MDP: enriquecer `linhaEvidencia.ts` com sinal do MHD foi cortado nesta rodada por risco de tocar uma live-scoring engine compartilhada sem teste dedicado — registrado como trabalho futuro, não FK nova de qualquer forma (decisão de schema maior, fora do escopo original). |
| 7 — retorno incremental | 1 | 🟢 90% | **Passo 0 (§20) entrega o portão da fase**: reimportar o mesmo conteúdo processa zero versões novas (dedup por hash do texto); alerta de integridade quando o mesmo idSei reaparece com conteúdo diferente; resumo "X novos, Y versões, Z inalterados" nas duas telas. Faltam os 10%: você conferir isso reimportando um PDF real duas vezes pela tela (portão humano). |
| 8 — Gemini sob pedido (opcional) | 1 | ⚪ 0% | não iniciada; pode nunca ser necessária |
| **Total do projeto** | **12–16** | **≈ 70% concluído · 30% restante** | ≈9,8 sessões-equivalente batidas (Fase 1 a 90% de 1 + Fase 2 a 95% de 2,5 + Fase 3 a 70% de 2,5 + Fase 4 a 60% de 2 + Fase 5 a 75% de 1,5 + Fase 6 a 75% de 2 + Fase 7 a 90% de 1) de 14 estimadas; Fase 0 não conta sessão própria. Fora das fases: ferramental de suporte também construído (`/admin/mhd` — pilha, filtros por assunto/proprietário, exportar CSV, excluir), que não estava no plano original mas apoia todas as fases seguintes. |

A Fase 3 é a única com risco real de estourar: classificar peça dentro de contêiner digitalizado
é o único ponto em que o texto pode faltar. Por isso ela vem **depois** da Fase 2 — se estourar,
você já está usando o produto.

**Nota de processo:** a partir do commit da Fase 1 (05/09/2026), toda sessão que avançar este
projeto atualiza esta tabela (coluna `% da fase` + a linha `Total`) como parte do MESMO commit que
levou o código, nunca num commit separado depois. Se uma fase for tocada mas não fechar o portão
dela, o `%` reflete o trabalho real feito, não "fase concluída ou não" — como a Fase 1 em 90%.

---

## 13. Como seria usado, no dia

1. Analista abre o processo no URBIS, aba **Documentos**.
2. Arrasta o PDF do SEI. Barra de progresso real (páginas lidas), ~10–30 s.
3. Aparece a **linha do tempo do processo**: 30 a 41 eventos, cada um com ID SEI, título, páginas
   e data. Histórico antigo já vem recolhido.
4. Clica num evento → abre **na página exata do PDF original**, ou baixa só aquele recorte.
5. A partir da Fase 5, aparece a divisão **Vigentes / Histórico / Pendentes**, e o botão
   "Baixar pacote vigente" com o manifesto.
6. No retorno do interessado, arrasta o PDF novo: o sistema diz **só o que mudou** —
   "6 documentos novos, projeto substitui a versão anterior, matrícula não mudou, 1 pendente".

Nada é gravado sem o aceite do analista, igual ao `ler-pasta` do Slot 5 já faz hoje.

---

## 14. O que isso agrega à inteligência do URBI

Não é um módulo ao lado: é a **fundação que faltava** para o que o URBI já tenta fazer.

| Onde | O que muda |
|---|---|
| **LIP (Slots 1/2)** | Os 11 campos de ID SEI (`certidao`, `levantamento`, `artLev`, `artCx`, `laudo`, `vistoria`, `foto`, `usoSolo`, `seiCheadv`, `seiProcuracao`, `seiEmbargo`) deixam de ser **adivinhados pelo Gemini** e passam a vir do índice, **com página de origem**. Troca custo por certeza. |
| **Motor de Produção** | A 2ª prioridade dele é "Documento do SEI ausente no LIP". Hoje ele só sabe que o campo está vazio; passa a saber se o documento **existe no processo e não foi vinculado** — que é outra ação, bem mais útil. |
| **Radar** | **Zero código.** Já vigia `mhd_documentos` como fonte de watermark: documento novo já dispara reprocessamento do retrato. |
| **Linha de evidência** | Hoje ela liga despacho → exigência → retorno → resultado. Com ID SEI por documento, o "retorno" deixa de ser inferido e passa a ser **identificável**: qual documento voltou, em que página, em que data. |
| **Pilha (perguntas)** | Perguntas novas no padrão determinístico que já existe: *"quais têm documento pendente de classificação?"*, *"o que mudou desde o último retorno?"*, *"quais têm despacho sem efeito?"*. |
| **MDP** | Cruzar o que saiu (cobrança) com o que entrou (retorno) — hoje é o elo mais fraco da cadeia. |
| **BDI** | Aba de cobertura documental: processos organizados, páginas tratadas, pendências, custo. |
| **Previsão de tempo** | Hoje responde "base insuficiente" quase sempre (11 processos com timestamps). Data de documento por evento é **sinal novo e barato** para medir duração de etapa. |

**O ponto central:** o URBI hoje é inteligente sobre *dados estruturados* (LIP, MAC, tags) e cego
sobre *documentos*. Isto abre o terceiro pilar, sem quebrar a regra de custo zero.

---

## 15. Fase 1 executada — 05/09/2026

`lib/documentosSei/fatiar.ts`, novo, sem importar `lerPastaSlot5.ts`. Confirmado com precisão o
que a Fase 0 tinha só estimado: **o carimbo do SEI é sempre DOIS itens de texto separados do
PDF** (não uma string colada) — `"{Título} ({ID SEI})"` seguido de `"SEI {processo} / pg. {N}"`
— e `pg. N` é a posição da página no PDF inteiro, o que dá uma conferência cruzada de graça
(página fora de posição vai para revisão, nunca é aceita no escuro).

Rodado contra os **4** processos reais (os 3 da Fase 0 + `25.5.000061039-8`, cujo despacho "SEM
EFEITO" é o caso de teste da Fase 4):

| Processo | Págs | Eventos | Em revisão | Soma fechada? |
|---|---|---|---|---|
| 25.5.000061039-8 | 154 | 26 | 10 | ✅ |
| 24.5.000024350-0 | 186 | 33 | 8 | ✅ |
| 25.5.000012012-9 | 229 | 27 | 3 | ✅ |
| 25.28.000000868-8 | 271 | 28 | 5 | ✅ |

Achados confirmados nos dados: `Despacho 1648 SEM EFEITO` aparece isolado como evento próprio no
`25.5.000061039-8` (pg. 143) — pronto para a regra da Fase 4. A quase-duplicata citada no §11
(`42135097` / `42135097-1`) saiu como dois eventos vizinhos de 38 e 39 páginas, exatamente como
medido antes.

`setor` e `data` (campos opcionais do tipo `EventoSei`) são extraídos por melhor esforço — texto
livre perto do rodapé/corpo, sem regra tão forte quanto o carimbo — e ficam ausentes quando o
documento não trouxer o padrão esperado. Isso é aceitável nesta fase: a única garantia dura do
fatiador é `id_sei` + `titulo` + intervalo de páginas, com contagem fechada.

**Portão da Fase 1 (§6): parcialmente cumprido.** A soma fechou nos 4 processos — a parte que o
código pode provar sozinho. Falta a outra metade do portão, que só você faz: **conferir o índice
de eventos contra a árvore real do SEI** de pelo menos um dos processos, e dizer se os 8 a 10
itens de "revisão" por processo (páginas sem rodapé legível — normalmente miolo de imagem/desenho
técnico ou digitalização) são mesmo os únicos casos difíceis, ou se algum evento saiu errado.

**Nada foi gravado em nenhum slot.** É função pura, sem rota, sem tela, sem tocar em Regularização
nem Aceite SEI — a Fase 2 (a tela) é a próxima decisão, e é aí que "Slot 2 primeiro" (D4) vira
pergunta real.

---

## 16. Fase 2 executada — 05/09/2026, Regularização (Slot 1)

D4 foi respondida por você quando perguntado antes de tocar em qualquer slot: **Regularização
(Slot 1)** primeiro, contrariando a recomendação do plano (que era Slot 2, por ser produção menos
crítica). Registrado com a salvaguarda de sempre: tudo aditivo, atrás de interruptor próprio.

**O que foi construído:**
- `supabase/migrations/2026_09_05_documentos_vivos_flag.sql` — coluna
  `urbis_config.documentos_vivos_regularizacao_ativo`, **default `false`**, aplicada de verdade
  (testada em transação com ROLLBACK antes, como manda o padrão do repo). Liga-se por SQL direto
  (`UPDATE urbis_config SET documentos_vivos_regularizacao_ativo = true WHERE id = 1`) — sem UI de
  admin ainda, mesma trilha que `chat_gemini_ativo` seguiu no começo.
- `lib/documentosSei/config.ts` — helper que lê o interruptor, fail-**fechado** (erro de leitura
  = desligado), ao contrário de `lib/visao` que falha aberto — aqui a feature é nova e Slot 1 é
  produção crítica, então nunca vale arriscar ligar por acidente.
- `app/api/analise-regularizacao/documentos-sei/route.ts` — rota nova e isolada (não reaproveita
  `app/api/lip/ler-pasta` nem `lib/lerPastaSlot5.ts`), recebe o PDF em multipart, roda
  `fatiarPdfSei` com progresso NDJSON (mesmo contrato de `ler-pasta`, reproduzido por leitura) e
  devolve só a proposta — nenhuma gravação em MHD/LIP/MAC.
- `components/regularizacao/OrganizadorSeiRegularizacao.tsx` — aba nova, componente próprio (não
  inflou ainda mais `ProcessoClient.tsx`, que já passa de 3300 linhas): arrastar o PDF, barra de
  progresso real, linha do tempo dos eventos com ID SEI/título/páginas/data/setor, "abrir na
  página" (react-pdf) e "baixar recorte" (pdf-lib, no navegador). **O PDF original nunca volta ao
  servidor depois da leitura** — fica só na memória do navegador (o `File` que o analista soltou),
  e as duas ações usam esse mesmo arquivo no cliente. Isso evita de vez a pergunta de guardar o
  PDF no servidor (D3 já tinha decidido que não).
- `app/processo/ProcessoClient.tsx` — 2 linhas de import + 1 bloco condicional
  (`{tipoUrl === "regularizacao" && <OrganizadorSeiRegularizacao .../>}`), nada mais tocado.

**Verificado:** `tsc --noEmit` limpo, `npm run build` limpo (rota nova aparece no build). Com o
interruptor ligado temporariamente em produção só para checar que a tela não quebra sem sessão
válida (confirmado: sem login, o componente cai para "desligado" e não aparece, sem erro no
console) — devolvido a `false` logo em seguida.

**O que NÃO foi verificado:** o portão de verdade (§ "Fase 2" acima) — organizar um processo real
de ponta a ponta pela tela — porque isso exige uma sessão logada como você, e eu não tenho suas
credenciais nem devo tentar contorná-las. **Para testar:** rode o SQL acima para ligar o
interruptor, abra um processo de Regularização, e arraste um PDF do SEI na aba "Documentos" nova.
Quando estiver satisfeito, me avise — ou desligue de novo se preferir revisar o código primeiro.

**Nada foi tocado no fluxo atual da Regularização.** LIP, MAC, numeração, despacho — tudo como
estava. A aba só aparece com o interruptor ligado, e mesmo ligada não grava nada em lugar nenhum.

### 16.1 — Ajustes ao vivo, 06/09/2026 (você testando em produção)

Você ligou o interruptor e testou com um processo real (`24.5.000024350-0`) — o portão da Fase 2
começou a fechar de verdade. Dessa sessão de uso saíram ajustes, todos aditivos:

- **Renomeado** para "🗂 Organizador de PDF SEI" (nome que você usou, e que também é o nome do
  rascunho original do ChatGPT que deu origem a este plano).
- Lista virou **tabela** com colunas: Páginas, Documento, **Departamento**, **Assinado por**,
  Data, Ações.
- **`assinante`** — novo campo em `EventoSei` (`lib/documentosSei/fatiar.ts`), melhor esforço:
  reconhece o padrão-padrão do SEI ("Documento assinado eletronicamente por Fulano,") e o padrão
  de assinatura SIFIS (nome em CAIXA ALTA seguido do cargo). Testado no processo real: nomes
  saindo certos (ex.: "Suze Pontes Leite", "RONALDO PIRES MARTINS").
- **Regra "SECGER" → "Interessado"** na coluna Departamento: você explicou o fluxo (interessado
  manda pra SECGER, que manda pra nós; nós mandamos pra SECGER, que entrega ao interessado) —
  SECGER é o protocolo geral, não quem emitiu, então aparece como "Interessado".
- **Data com hora**, quando o SEI traz ("..., às 14:32").
- **Filtro "só última versão de cada tipo"** — botão que alterna a exibição, lista completa
  continua sendo o padrão. HEURÍSTICA DE TELA, não é o motor de versões da Fase 4: agrupa por
  título normalizado e mantém a página mais recente de cada grupo; Despacho/Parecer/Ofício/
  Notificação nunca são agrupados (são atos numerados, cada um se mantém — mesma distinção já
  registrada em §6 Fase 4: "despachos sucessivos são atos, não versões"). Testado com os títulos
  reais do processo: "Documentação" (5 ocorrências) e "Processo" (2) colapsam para a última;
  despachos continuam todos visíveis.
- Setor (Departamento) sem "SECGER" ainda sai em branco na maioria dos documentos deste processo
  — a heurística de `acharSetor` exige palavras como "prefeitura/secretaria/chefia" na MESMA
  linha do carimbo, e nem todo documento tem letreiro de órgão ali. Fica registrado como limite
  conhecido, não bug: melhorar isso é o tipo de ajuste que só vale a pena depois de ver mais
  processos reais.

**Pergunta em aberto, feita por você:** este histórico de documentos deveria ficar salvo em algum
módulo satélite para o URBI/BDI/MDP consultarem — resposta e proposta na conversa (a resposta
curta é MHD, que é literalmente o módulo "Histórico e Documentos" e é o que a Fase 6 deste plano
já previa). Ainda não implementado — grava índice ainda não decidido junto com você.

**Decisão sua sobre "URBIS ler o LIP e opinar":** começa pela comparação DETERMINÍSTICA (custo
zero, sem IA) — a parte de opinar de verdade (que pode exigir Gemini) fica registrada para
depois, com a governança de sempre (interruptor + teto + custo mostrado antes). Não esquecer.

### 16.2 — Idêntico no Aceite SEI (Slot 2), 06/09/2026

Você pediu ("DEVE TER UM IDENTICO NO ACEITE SEI - SLOT 2") e foi reproduzido por leitura, não
compartilhado — regra de isolamento entre slots do CLAUDE.md:
- `components/aceiteSei/OrganizadorSeiAceite.tsx` — cópia deliberada de
  `OrganizadorSeiRegularizacao.tsx` (mesmas colunas, mesmo filtro, mesma regra SECGER).
- `app/api/analise-aceite-sei/documentos-sei/route.ts` — cópia deliberada da rota do Slot 1.
- `urbis_config.documentos_vivos_aceite_sei_ativo` — coluna PRÓPRIA (migration
  `2026_09_06_documentos_vivos_flag_aceite_sei.sql`, testada com ROLLBACK e aplicada), default
  `false`. Ligar o Aceite SEI não liga a Regularização e vice-versa.
- Único código de fato compartilhado entre os dois: `lib/documentosSei/fatiar.ts` — é puro e não
  conhece slot nenhum (lê PDF do SEI, devolve eventos), então compartilhar ali não fere a regra.
- `tsc`/`build` limpos. Interruptor do Aceite SEI segue **desligado** — ainda não testado por
  você nesse slot (o portão de Slot 2 é o mesmo: você organizar um processo real pela tela).

### 16.3 — MHD ganha entrada na Home + Organizador grava histórico, 06/09/2026

Dois pedidos seus, resolvidos juntos:

1. **"NAO ENCONTREI O MHD... COLOCA ELE NA HOME AO LADO DO URBI"** — `/admin/mhd`, página nova
   (busca por processo, mesmo padrão visual/gate de `/admin/urbi` e `/admin/bdi/leis` — só
   irrestrito), card novo na Home ao lado de URBI/BIP.
2. **"MAS AI SALVA EM PDF... NA MAQUINA E NO URBIS SO OS DADOS E META DADOS... PRA ECONOMIZAR
   ESPACO... SO ADMIN VE"** — respondeu sozinho à pergunta em aberto do §16.1. O Organizador
   passou a chamar `registrarEvento` (`lib/mhd.ts`, já existente, reaproveitado) e grava em
   `mhd_eventos` **1 evento por organização** (não 1 por documento — evita empilhar dezenas de
   linhas a cada reorganização do mesmo PDF; de-duplicar de verdade é Fase 7). `detalhe` (jsonb)
   guarda id SEI, título, páginas, data, assinante — **nunca o PDF nem qualquer binário**, exatamente
   o princípio que o MHD já tinha. Visível só em `/admin/mhd` (irrestrito).

Achado no meio do caminho: você testou antes da rota estar no ar (era esperado — a gravação só
chegou num commit seguinte) e reportou "não salvou o SEI que abri"; corrigido e reenviado.

### 16.4 — Comparação determinística com o LIP, 06/09/2026

Você pediu explicitamente ("TEM QUE SALVAR NO LIP E NO MHD") e, quando perguntado se podia
gravar direto ou se precisava de um clique de aceite, escolheu **aceite explícito** — mesmo
padrão do LER PASTA/LER ARQUIVOS. Também pediu, na mesma leva: "a intenção é usar o mínimo
possível de IA" e "deve haver uma ponderação de cada dado conflitante" quando LER PROCESSO
(Gemini) e o Organizador discordarem.

- `lib/documentosSei/compararLip.ts` — novo, puro, **zero IA**, compartilhado pelos dois slots
  (é mapeamento de palavra-chave em título, não lógica de negócio de slot): sugere o Nº SEI do
  documento pra 4 dos 11 campos hoje adivinhados pelo Gemini (`usoSolo`, `seiCheadv`, `foto`,
  `vistoria`) — testado no processo real, achou o despacho CHEADV de **aprovação** ("Documentação
  conforme"), não um dos três de pendência. Os outros 7 campos (`certidao`, `levantamento`,
  `artLev`, `artCx`, `laudo`, `seiProcuracao`, `seiEmbargo`) ficam **sem sugestão** de propósito —
  ART normalmente vem dentro de um contêiner genérico que só a Fase 3 vai abrir; melhor vazio que
  chutado.
- Painel **"Comparar com o LIP"** nos dois componentes: mostra valor atual (com a fonte, ex.
  "Gemini") ao lado da sugestão (Nº SEI + documento + página), **linha em destaque quando os dois
  divergem** — a ponderação é do analista, a tela nunca decide sozinha. Só marca a caixa
  automaticamente quando o campo do LIP está vazio.
- `aceitarCamposOrganizador` em `ProcessoClient.tsx` — mesmo mecanismo de `aceitarPropostaPasta`
  (`setD` + `autoSalvar`), só que o Organizador manda só os campos que o analista marcou.
  `origem: "urbis"` (sistema determinístico), nunca `"inferido"` (isso é reservado a valor de
  IA/visão) — distinção que já existia no LIP, agora usada aqui também.

### 16.5 — Terceira rodada de ajustes ao vivo, 06/09/2026 (madrugada)

Antes de dormir, o Fábio pediu mais 3 correções, todas feitas e no ar:

1. **Filtro "só última versão" não colapsava despacho/parecer** — ele reportou "várias da CHEADV,
   várias da fiscalização" mesmo com o filtro ligado. Corrigido: despacho/parecer agora entram no
   mesmo agrupamento dos demais (por título sem o número) — como o número já sai na normalização,
   "Despacho 607/1152/1450 - CHEADV - Pendência Documentação" vira só o último, mas "Despacho -
   Diligência 132" e "Despacho 956 - CHEADV - Documentação conforme" (texto diferente) continuam
   aparecendo, porque não têm o mesmo residual.
2. **E-mail some de vez no filtro** (antes só agrupava, mostrando o último — agora nem esse
   aparece).
3. **`/admin/mhd` sem o padrão de navegação** — trocado o "← Home" minimalista (copiado de
   `/admin/urbi`) pelos botões 🏠 Home / 🚪 Sair usados no resto do app.

Também, rodando o fatiador de novo contra os 4 processos reais da Fase 0/1 (não só o que o Fábio
usou), achei e corrigi mais ruído no Departamento: e-mail colado na linha do letreiro
("Fulano &lt;x@y.com&gt; 13 de abril às 10:06") e "GERÊNCIA" sozinha (sem mais nada depois) — os 4
continuam com soma de páginas fechada.

**Nota resolvida:** o "não gravou" era eco do cache — consultei o banco de produção direto e
confirmei 1 evento real gravado (`mhd_eventos`, 24.5.000024350-0, 00:39:14) já antes desta rodada.
Ele só não tinha soltado o PDF de novo depois das correções, então via o índice antigo (com
departamento em branco) via a recuperação do histórico e achou que não tinha gravado.

### 16.6 — Correções finais da madrugada, 06/09/2026

1. **Aba nunca mais abre sozinha.** Antes, recuperar o índice do MHD ao reabrir o processo também
   forçava `aberto = true` — o Fábio pediu que a aba "tem que iniciar sempre fechada em todos os
   LIP". Corrigido nos dois componentes: o índice ainda é recuperado (fica pronto assim que o
   analista clicar "Abrir"), mas a aba em si começa fechada sempre, mesmo com histórico existente.
2. **Conferida a paridade entre os dois slots** (pedido dele: "no slot 1 e 2 o organizador tem que
   funcionar igualzinho") — `diff` entre os dois componentes mostrou só diferença de comentário e
   o endpoint próprio de cada rota; nenhuma divergência de comportamento.
3. **`/admin/mhd`: Home/Sair movidos pra esquerda**, no mesmo layout do MRP e dos outros módulos
   (antes estavam à direita, alinhados com `justify-between`).

### 16.7 — Pilha de processos, exportar e excluir no `/admin/mhd`, 06/09/2026

Mais 3 pedidos, todos no ar:

- **Pilha de processos sem precisar buscar.** `app/api/admin/mhd/recentes` — só irrestrito, lista
  global (não autoriza por processo: quem acessa a página já é admin). Mostra só o número do
  processo por linha (não título/data — pedido explícito: "quero só a primeira linha"); clicar
  abre o detalhe completo.
- **Exportar CSV** — gerado no NAVEGADOR a partir do que já foi carregado (eventos + versões),
  sem rota nova no servidor.
- **Excluir 1 evento** — `DELETE /api/admin/mhd/evento?id=<uuid>`. **Exceção deliberada** ao
  princípio "MHD nunca apaga" (ver cabeçalho de `lib/mhd.ts`): existe só pra limpeza
  administrativa (registro de teste, duplicata), pedido explícito do Fábio. Confirmação
  obrigatória no navegador, um registro de cada vez, nunca em lote — dificulta apagar histórico
  de verdade sem querer. Testado contra um registro descartável antes de subir (criado e apagado
  via SQL direto, nunca tocou em dado real).

Também corrigido: a pilha só olhava `mhd_eventos`, e o Slot 5 (LER PASTA) grava
documento/versão sem necessariamente criar um evento — processos do Slot 5 (48535, 48533)
sumiam da lista. Agora consulta as duas fontes.

### 16.8 — RETRATADO: texto extraído fora da nuvem (não implementado, não é mais pedido)

Fábio pediu ("nunca salvar online, sempre no dispositivo") que o TEXTO/CONTEÚDO extraído de
documentos também parasse de ficar salvo em Supabase. Expliquei a complicação real — mudaria o
motivo de existir do MHD (reaproveitamento por hash, nunca reler o mesmo documento duas vezes),
afetando Slot 1 (produção crítica) e Slot 5 ao mesmo tempo — e ele recuou: **"VOU VOLTAR ATRAS..
NAO SABIA QUE SERIA TAO COMPLICADO"**.

**Não implementado, e não é mais decisão pendente — foi descartado.** Comportamento atual do MHD
mantido como está: PDF nunca sobe (já era assim, princípio antigo do módulo), texto extraído
continua em `mhd_conteudos` na nuvem, reaproveitamento por hash funcionando normal.

### 16.9 — Pilha do MHD: assunto/proprietário, excluir processo, excluir em lote, 06/09/2026

Mais uma rodada, ainda a mesma madrugada:

- **Pilha mostra Assunto e Proprietário**, além do processo e da data da atividade — cruza
  `processos.tipo_processo` (via `assuntos.slug→nome`) e `processos.dados->proprietario->valor`
  (mesmo campo do LIP usado em `lib/geradores.ts`). Falha nessa consulta extra nunca derruba a
  pilha.
- **Botão "voltar pra pilha" mais visível** — virou botão de verdade com borda, era texto pequeno
  fácil de não notar.
- **Excluir processo inteiro** (`app/api/admin/mhd/processo`) — não só 1 evento: apaga
  documentos+versões (cascade por FK) e eventos do processo inteiro. Resolve a entrada de teste
  ("TESTE-HIST-44353-AN3") que não tinha como sair da pilha.
- **Excluir em lote** — única exclusão em lote do módulo, de propósito: marca vários processos
  na pilha (checkbox, nunca "selecionar tudo" automático) e apaga de uma vez, com confirmação
  mostrando quantos serão apagados.
- Testado contra registros descartáveis (documento+versão+evento criados e apagados via SQL
  direto) antes de subir — confirmado que a versão cascateia junto com o documento.

---

## 17. Fase 3 executada — 06/09/2026

Continuação pedida pelo Fábio ("continuar faz[e] 3, 4 e 5"). Implementada a Fase 3 (abrir os
contêineres genéricos):

- **`lib/documentosSei/pecas.ts`** — novo, isolado (não importa `lerPastaSlot5.ts`). Tabela
  `ASSINATURAS_PECA` (mesmo espírito de `ASSINATURAS`/`SLOTS_SEI` do Slot 5, escrita do zero pro
  vocabulário dos Slots 1/2), testada **por página** dentro de um evento-contêiner. `abrirContainer`
  agrupa páginas consecutivas de mesma classificação em `PecaSei`, mudando de peça também quando a
  orientação da página vira — página não reconhecida vira `classificacao_pendente`, nunca some.
  ART de Levantamento e ART da Caixa (campos distintos no LIP) só recebem papel específico quando o
  texto deixa isso explícito; caso ambíguo fica em `art` genérico, sem sugestão pro LIP (mesmo
  princípio "melhor vazio que chutado" de `compararLip.ts`).
- **`lib/documentosSei/fatiar.ts`** — ganhou `lerPaginasIntervalo` (exportada), pra reabrir só o
  intervalo de páginas de um evento-contêiner sem duplicar a leitura do pdfjs já feita em
  `lerPaginas`. Nada do comportamento testado da Fase 1 foi tocado.
- **As duas rotas** (`app/api/analise-regularizacao/documentos-sei` e o par do Aceite SEI) —
  depois de `fatiarPdfSei`, chamam `abrirContainer` pra cada evento com `ehContainerGenerico`,
  anexam `.pecas` e publicam `coberturaPecas: {totalPaginasContainer, classificadas, pendentes}`
  no resultado — portão da fase pede taxa **medida**, não estimada.
- **Os dois componentes** — linha do evento vira expansível quando tem peças (▶/▼), sub-linhas
  mostram papel/páginas/ações; `baixarRecorte` generalizada pra aceitar qualquer intervalo (evento
  ou peça), mesmo mecanismo de antes.
- **`lib/documentosSei/compararLip.ts`** — passou a também varrer `evento.pecas`, permitindo
  sugerir `certidao`, `levantamento`, `artLev`, `artCx`, `laudo`, `seiProcuracao`, `seiEmbargo` —
  os 7 campos que antes ficavam sem sugestão por estarem escondidos dentro de "Documentação".

**Verificado:** `tsc --noEmit` e `npm run build` limpos.

**Não verificado ainda (portão real da fase):** rodar contra os 4 processos reais das Fases 0/1 e
conferir a olho a taxa de classificação e se nenhuma peça saiu errada — mesmo tipo de conferência
humana que fechou o portão da Fase 2. Fica pra quando você testar pela tela.

---

## 18. Fase 4 executada (escopo reduzido) — 06/09/2026

Continuação da mesma sessão da Fase 3. Implementado `lib/documentosSei/motorVersoes.ts` — motor
puro, zero IA, que resolve o estado de cada evento (vigente, substituído, sem efeito, histórico,
pendente) dentro de UM fatiamento, seguindo a ordem de confiança do plano (§6 Fase 4): sem-efeito
explícito (tier 1) → substitui/corrigido/retificação explícito (tier 2) → vistorias sucessivas são
histórico (regra própria) → data (tier 5) → ordem do evento no PDF (tier 6, nunca confiança
"alta" sozinho). "ID SEI maior nunca é prova sozinha" — o motor nunca ordena por valor do idSei,
só por posição no PDF.

**Validado contra os dois casos reais do portão** (script descartável, não commitado): o despacho
`Despacho 1648 SEM EFEITO` (`25.5.000061039-8`, §15) sai como `sem_efeito` sem apagar os despachos
vizinhos; a família `42135097`/`42135097-1` (`25.5.000012012-9`, §11) é reconhecida como mesma
família, com o mais recente como `vigente` e o outro como `substituido` — exatamente o portão
descrito no plano.

**DECISÃO DE ESCOPO (não estava no plano original, registrada aqui em vez de silenciosa):** o
plano desenhava a Fase 4 como extensão de `mhd_versoes` (banco). Auditoria antes de escrever
código achou que isso não tem onde pousar ainda: o Organizador de PDF SEI grava só 1 evento por
organização em `mhd_eventos` (§16.3) — não cria `mhd_documentos`/`mhd_versoes` por peça. Persistir
"documento X é a versão 2 do documento Y" entre UPLOADS DIFERENTES do mesmo processo (dias depois)
exige decidir uma identidade de documento estável entre sessões — decisão de arquitetura nova, do
mesmo tipo das D1-D4 do plano (§4), que este trabalho não tomou sozinho. Por isso o motor opera só
DENTRO de um fatiamento (memória, sem gravação) — que já resolve os dois casos do portão, porque
ambos são do MESMO PDF. Persistência entre sessões fica em aberto para quando a Fase 7 (retorno
incremental) decidir isso.

**Nas duas telas:** coluna "Estado" nova na tabela principal (badge + motivo/confiança no
tooltip), só informativo — não há botão de aceite porque não há gravação: mostrar antes de decidir
onde persistir evita inventar um destino de gravação sem essa decisão ser seu.

**Verificado:** `tsc --noEmit` e `npm run build` limpos; motor testado contra os 2 casos reais
citados acima.

**Não implementado:** níveis 4 (mesmo número com revisão posterior) e 7 (hash idêntico) da ordem
de confiança — exigem dado que não existe neste nível (número de revisão do documento, conteúdo de
página); níveis 8-9 (visual, humano) nunca são implementados por design.

---

## 19. Fase 5 executada — 06/09/2026

Continuação da mesma sessão das Fases 3 e 4. Implementado o pacote vigente + manifesto (§D2 do
plano — recorte virtual, `pdf-lib`, na hora do download, nunca materializado no servidor):

- **`lib/documentosSei/manifesto.ts`** (novo, puro, sem `fs`) — `gerarManifestoPdf` monta
  `00_Manifesto_Documental.pdf` com `pdf-lib` direto (sem logo/marca d'água, ao contrário de
  `lib/relatorio-pdf.ts`, que só roda no servidor): por documento, título, ID SEI, páginas, estado
  (Fase 4), confiança, motivo — com paginação automática quando não cabe mais na página.
- **`lib/documentosSei/pacoteVigenteClient.ts`** (novo, só cliente) — `gerarPacoteVigente` carrega
  o PDF original **uma vez**, recorta cada evento (reaproveitando a mesma técnica de
  `baixarRecorte`), separa em `Vigentes/` (estado `vigente`/`complementar`) e `Histórico/` (demais
  estados), monta o zip com `JSZip` (dependência nova) junto do manifesto.
- **As duas telas** ganharam o botão "📦 Baixar pacote vigente".

**DECISÃO DE ESCOPO herdada da Fase 4 (§18):** como o motor de versões só resolve estado DENTRO de
um fatiamento (não entre uploads diferentes), o cenário original da Fase 5 — "documento vigente
veio de um PDF antigo, que não está carregado agora" — não existe mais nesta versão: o pacote é
sempre gerado a partir do PDF que está na tela nesta sessão. Isso também simplifica: não foi criada
a rota leve de `versoesVigentesDoProcesso` prevista no desenho original (não há `mhd_versoes` por
peça pra consultar ainda). Só sobre EVENTOS (nível 1) — peças (nível 2) não entram no pacote ainda,
mesma fronteira herdada da Fase 4.

**Testado localmente:** PDF sintético de 10 páginas com os 2 casos reais do portão da Fase 4 —
zip saiu com `Vigentes/Despacho 1600`, `Historico/Despacho 1648 SEM EFEITO`,
`Historico/Processo digital - 42135097`, `Vigentes/Processo digital - 42135097-1` e o manifesto,
soma de páginas fechada. `tsc --noEmit` e `npm run build` limpos.

**Não verificado (portão real da fase):** você conferir o manifesto de um processo REAL contra o
processo, item a item — mesmo tipo de conferência humana que fechou o portão da Fase 2.

---

## 20. Passo 0 (pré-requisito Fase 6/7) executado — 06/09/2026

Fábio pediu pra terminar Fases 6/7/8 até 100%. Decidido com ele: persistência real do MHD só nos
Slots 1/2 agora (Slot 5 fica pra outra conversa, plano próprio, depois deste terminar).

- **Migration** `2026_09_06_mhd_versoes_estado_documentos_vivos.sql` — `mhd_versoes` ganha
  `estado`/`motivo_estado`/`confianca_estado` (nullable, sem CHECK — Slot 5 nunca preenche,
  continua decidindo por `vigente`). Testada com `BEGIN`/`ROLLBACK`, aplicada de verdade com
  confirmação explícita do Fábio (aplicar migration em produção é ação que o agente não faz
  sozinho).
- **`lib/mhd.ts`**: `acharOuCriarDocumento`/`acharOuCriarConteudo` viraram `export` (só
  visibilidade — `registrarLeitura`, do Slot 5, não foi tocada).
- **`lib/documentosSei/persistencia.ts`** (novo) — o Organizador de PDF SEI passa a criar
  `mhd_documentos`/`mhd_versoes` DE VERDADE por documento, não só 1 evento-log por organização
  (que continua existindo, como auditoria). Identidade: atos (despacho/parecer/ofício/notificação)
  = `papel + escopo(idSei)`, permanentes; demais papéis = `papel + escopo("")`, um "slot" por
  processo que versiona (mesmo jeito que o LIP já consome — 1 campo, 1 valor). Hash SHA-256 sobre
  o TEXTO extraído (não bytes do PDF recortado, que mudam a cada recorte no cliente). Alerta de
  integridade quando o mesmo idSei+papel reaparece com hash diferente — nunca sobrescreve em
  silêncio.
- **`lib/documentosSei/motorVersoes.ts`** ganhou `resolverEstadosPecas` — peças (Fase 3) agora
  também têm família/estado, agrupadas por papel entre contêineres (antes só evento tinha).
- **`lib/documentosSei/pecas.ts`** ganhou `classificarTitulo` — classifica o título de um evento
  avulso (não contêiner, não ato) usando a mesma tabela de assinaturas.

**BUG REAL achado e corrigido no caminho:** `pdfjs-dist` (build "legacy", usado em Node) quebra com
`DataCloneError` na SEGUNDA chamada de `getDocument` dentro do MESMO PDF/objeto de bytes — o
`transfer` da primeira chamada DETACHA o `ArrayBuffer` de entrada (confirmado isolando o caso:
`TypedArray.prototype.slice` numa cópia do mesmo buffer já falha com "detached ArrayBuffer" depois
da 1ª leitura). Isso já era um risco latente da Fase 3 (2+ contêineres no mesmo PDF chamariam
`lerPaginasIntervalo` mais de uma vez, cada uma reabrindo o documento) — nunca disparou porque os
testes até aqui só tinham 1 contêiner por processo real. Corrigido AGORA, antes do Fábio testar:
`fatiarPdfSei` abre o PDF **uma vez** e devolve um `LeitorPdf` reaproveitado por TODAS as leituras
de intervalo da mesma requisição (Fase 3 e persistência) — `getDocument` nunca roda 2 vezes sobre
o mesmo buffer. `fatiarPdfSei` muda de assinatura: devolve `{ resultado, leitor }` em vez de só o
resultado — as duas rotas atualizadas.

**Testado localmente** (script descartável, processo `TESTE-PERSISTENCIA-*`, limpo depois): 1ª
leitura cria documentos novos; 2ª leitura com o MESMO conteúdo (buffer novo, simulando reupload
real) processa **zero versões novas** (portão da Fase 7); despacho com MESMO idSei e conteúdo
DIFERENTE gera alerta de integridade E versão nova (nunca some, nunca sobrescreve sem avisar);
peças de contêiner persistidas como documentos próprios, papel certo, escopo vazio. `tsc --noEmit`
e `npm run build` limpos.

**Nas duas telas:** bloco "O que mudou nesta leitura (MHD)" com o resumo (documentos novos/versões
novas/inalterados) e alerta de integridade em destaque quando existir.

---

## 21. Fase 6 executada (com um corte revisto na hora) — 06/09/2026

Continuação da mesma sessão do Passo 0. Implementado:

- **Radar**: confirmado, zero código — `lib/urbi/radar.ts` já vigia `mhd_documentos.atualizado_em`,
  que agora é real (Passo 0). Só documentação.
- **URBI (pergunta da Pilha)**: `lib/urbi/perguntasPilha.ts` ganhou "quais processos têm
  documento(s) pendente(s) de classificação?" — **exceção deliberada e documentada** ao padrão do
  arquivo (normalmente só lê o retrato pronto, nunca faz query nova): a contagem de
  `classificacao_pendente` (Fase 3) ainda não faz parte do pipeline de retrato do Radar — levar
  isso pra lá é trabalho à parte que mudaria o pipeline pros 3 slots, não só Documentos Vivos.
  Consulta direta e pequena, só quando a pergunta pede isso.
- **Motor de Produção** (`lib/urbi/motorProducao.ts`): `candidatosCamposVazios` agora recebe
  `d.mhd` (já vem pronto no dossiê, nenhuma consulta nova) e cruza contra
  `lib/documentosSei/compararLip.ts` (`CAMPO_POR_PAPEL_PECA`/`ROTULO_CAMPO_LIP`, agora exportados)
  — campo do LIP vazio cujo documento já está no MHD vira esforço `rapido` ("aceitar proposta"),
  não mais `depende_documento` ("cobrar de fora"). Testado com dossiê sintético: campo com
  documento no MHD saiu `rapido`, campo sem, `depende_documento` — comportamento exatamente como
  descrito no §14 do plano.
- **MAC/BIP**: sem mudança de schema, confirmado — a evidência de cada item continua sendo o
  texto/valor do LIP.

**CORTE REVISTO na hora (registrado, não silencioso):** o plano de trabalho desta sessão previa
também enriquecer `lib/urbi/linhaEvidencia.ts` (MDP) com um sinal a mais de `mhd_documentos`. Ao
abrir o arquivo, a lógica de linha de evidência (múltiplas fontes, pontuação por candidato,
usada em produção pelos 3 slots) se mostrou mais arriscada de tocar sem teste dedicado do que o
retorno justificava nesta rodada — decidido NÃO mexer, em vez de arriscar uma live-scoring engine
compartilhada sem conseguir validar de ponta a ponta. MDP continua exatamente como estava (elo
mais fraco por igualdade de texto, `mdp_registros.conteudo.pendencias_mac[].texto`) — sem FK nova,
sem sinal do MHD. Fica registrado como trabalho futuro, não como "feito".

**Verificado:** `tsc --noEmit` e `npm run build` limpos; Motor de Produção testado com dossiê
sintético.

---

**Histórico de versões**
- v1 — 05/09/2026 — criado. Plano ancorado em auditoria real do repositório (MHD, `ler-pasta`,
  `lib/visao`, Radar, `analisar/route.ts`). Nada implementado.
- v2 — 05/09/2026 — **Fase 0 executada e aprovada** em 3 processos reais (686 págs): rodapé do SEI
  confirmado na camada de texto, soma de páginas fechando nos três. D1 e D3 respondidas. Somados
  ganho medido (§11), prazo (§12), uso no dia (§13) e integração com o URBI (§14). Continua sem
  nenhuma linha implementada.
- v3 — 05/09/2026 — **Fase 1 executada**: `lib/documentosSei/fatiar.ts` escrito e rodado contra
  4 processos reais, soma de páginas fechando nos 4 (ver §15). Falta a conferência humana do
  índice contra a árvore do SEI para fechar o portão da fase por completo.
- v4 — 05/09/2026 — §12 ganhou coluna de `%` por fase e total do projeto (≈7% concluído, medido
  em sessões batidas / 14 estimadas). Regra nova: esta tabela se atualiza a cada commit do
  projeto, no mesmo commit que leva o código — nunca depois.
- v5 — 05/09/2026 — **D4 respondida (Regularização/Slot 1 primeiro) e Fase 2 executada** (ver
  §16): aba "Documentos" nova, interruptor `documentos_vivos_regularizacao_ativo` (default
  false, migration aplicada), rota `app/api/analise-regularizacao/documentos-sei`, componente
  `OrganizadorSeiRegularizacao`. `tsc`/`build` limpos; falta você testar o portão de ponta a
  ponta pela tela — não tenho como logar como você para fazer isso.
- v6 — 06/09/2026 — **você testou em produção com processo real e o portão da Fase 2 começou a
  fechar** (ver §16.1): renomeado "Organizador de PDF SEI", tabela com Departamento/Assinado
  por/Data, regra SECGER→Interessado, filtro "só última versão de cada tipo". Pergunta em aberto
  sobre onde persistir o histórico (MHD recomendado) — decisão pendente. Decidido: comparação
  LIP×organizador começa determinística (sem IA); parte de opinar com IA fica para depois, com
  governança de custo — não esquecer.
- v7 — 06/09/2026 — **idêntico construído no Aceite SEI (Slot 2)** (ver §16.2), reproduzido por
  leitura a partir do Slot 1: componente, rota e interruptor próprios
  (`documentos_vivos_aceite_sei_ativo`, default false, migration aplicada). Ainda não testado
  nesse slot.
- v8 — 06/09/2026 — **MHD ganha entrada na Home + Organizador grava histórico** (ver §16.3).
  Corrigidos 2 problemas achados por você testando ao vivo: `historicoDoProcesso` (`lib/mhd.ts`)
  descartava eventos gravados quando o processo não tinha `mhd_documentos` — corrigido, eventos
  agora sempre voltam; e o Organizador perdia o índice ao sair do processo — agora recupera do
  MHD ao reabrir (PDF em si continua não voltando, "Abrir"/"Baixar" ficam desabilitados até
  soltar o arquivo de novo). Departamento passou a ler o CABEÇALHO da página (não só a linha do
  rodapé) — "se ler o documento vai saber", como você observou: CHEADV, COMTEC (Secretaria de
  Planejamento), GERFEP/Fiscalização passaram a aparecer de verdade. Nova coluna **Nº SEI**
  (faltava — "a coluna principal").
- v9 — 06/09/2026 — **comparação determinística com o LIP** (ver §16.4), com aceite explícito
  campo a campo (você confirmou por escrito: nunca gravar sem clique). `compararLip.ts` sugere
  4 dos 11 campos hoje adivinhados pelo Gemini (`usoSolo`, `seiCheadv`, `foto`, `vistoria`) —
  testado no processo real, achou o despacho de aprovação certo, não um de pendência. Painel
  mostra valor atual + fonte ao lado da sugestão, destaca conflito, nunca decide sozinho.
- v10 — 06/09/2026 (madrugada) — **3ª rodada de ajustes ao vivo** (ver §16.5): filtro "só última
  versão" agora agrupa despacho/parecer também (não só os demais tipos); e-mail some por completo
  do filtro; `/admin/mhd` ganhou 🏠 Home / 🚪 Sair. Ruído extra corrigido no Departamento
  (e-mail/hora colados, "GERÊNCIA" solta) — reconferido nos 4 processos reais, soma continua
  fechada nos 4.
- v11 — 06/09/2026 (madrugada) — **4ª rodada** (ver §16.6): aba nunca mais abre sozinha mesmo com
  histórico recuperado do MHD; paridade Slot 1/Slot 2 confirmada por `diff`; Home/Sair do
  `/admin/mhd` movidos pra esquerda (mesmo layout do MRP). "Não gravou" era eco de cache,
  confirmado sem bug real conferindo direto no banco de produção.
- v12 — 06/09/2026 (madrugada) — **pilha de processos + exportar + excluir** (ver §16.7):
  `/admin/mhd` mostra os processos com atividade recente sem precisar buscar (só o número, clique
  abre o detalhe); exportar CSV no navegador; excluir 1 evento por vez, exceção deliberada ao
  "nunca apaga" do MHD, testada contra registro descartável antes de subir.
- v13 — 06/09/2026 — **Fase 3 executada** (ver §17): `lib/documentosSei/pecas.ts` novo (abre
  contêineres genéricos em peças, por página), `fatiar.ts` ganhou `lerPaginasIntervalo`, as duas
  rotas publicam `coberturaPecas`, as duas telas ganharam linha expansível, `compararLip.ts` passou
  a sugerir os 7 campos do LIP que antes ficavam vazios. `tsc`/`build` limpos; portão real (conferir
  a taxa de classificação contra os 4 processos reais) ainda depende de você testar pela tela.
- v14 — 06/09/2026 — **Fase 4 executada, escopo reduzido** (ver §18): `lib/documentosSei/
  motorVersoes.ts` novo, resolve vigente/substituído/sem-efeito/histórico dentro de um único
  fatiamento (não persiste em `mhd_versoes` ainda — decisão de identidade de documento entre
  uploads fica em aberto, registrada em §18). Validado contra os 2 casos reais do portão. Coluna
  "Estado" nova nas duas telas, só informativo. `tsc`/`build` limpos.
- v15 — 06/09/2026 — **Fase 5 executada** (ver §19): `lib/documentosSei/manifesto.ts` (manifesto
  em PDF, puro) + `pacoteVigenteClient.ts` (recorte + zip, JSZip novo em `package.json`) + botão
  "📦 Baixar pacote vigente" nas duas telas. Testado com PDF sintético reproduzindo os 2 casos do
  portão da Fase 4 — zip saiu com as pastas certas, manifesto incluso. `tsc`/`build` limpos. Escopo
  simplificado pela mesma decisão da Fase 4: opera só sobre o PDF carregado nesta sessão.
- v16 — 06/09/2026 — **Passo 0 executado** (ver §20): persistência real do MHD só nos Slots 1/2
  (decisão do Fábio — Slot 5 fica pra outra conversa). `mhd_documentos`/`mhd_versoes` de verdade
  por documento, migration aplicada em produção com confirmação explícita, dedup por hash de texto
  cumprindo o portão da Fase 7 de graça. Bug real achado e corrigido no caminho: `pdfjs-dist`
  quebrava na 2ª chamada de `getDocument` sobre o mesmo buffer (`ArrayBuffer` fica detached após
  a 1ª leitura) — `fatiarPdfSei` agora abre o PDF uma vez só e reaproveita o `LeitorPdf` pra todas
  as leituras da requisição. Testado localmente (dedup, versão nova, alerta de integridade, peças).
  `tsc`/`build` limpos.
- v17 — 06/09/2026 — **Fase 6 executada** (ver §21): pergunta nova da Pilha (documento pendente de
  classificação); Motor de Produção diferencia documento já no MHD (esforço `rapido`) de documento
  que ninguém trouxe (`depende_documento`), testado com dossiê sintético; Radar confirmado sem
  código. Corte revisto na hora: reforço em `linhaEvidencia.ts` (MDP) cortado por risco de tocar
  live-scoring engine compartilhada sem teste dedicado — registrado como trabalho futuro.
  `tsc`/`build` limpos.
