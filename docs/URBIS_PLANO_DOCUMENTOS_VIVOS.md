# Plano — Documentos Vivos (Organizador do PDF do SEI) · Slots 1 e 2

**Data:** 05/09/2026 · **Estado:** Fase 0 e Fase 1 executadas (ver §15); nada tocou em nenhum
slot ainda · **Escopo:** Regularização (Slot 1) e Aceite SEI (Slot 2).

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

### D4 — Qual slot primeiro?
Recomendo **Aceite SEI (Slot 2) primeiro**, não Regularização. Mesmo problema, mesma estrutura de
PDF, mas Slot 1 é sua produção crítica rodando liso. Erra-se barato no 2, migra-se provado para o
1. (Se o volume de dor estiver todo no Slot 1, isso muda — mas então a Fase 6 exige piloto em
paralelo, nunca substituição direta.)

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
| 2 — tela "Organizar processo" | 2–3 | ⚪ 0% | não iniciada |
| **← corte mínimo com retorno real: 3–4 sessões** | | | |
| 3 — abrir contêineres (nível 2) | 2–3 | ⚪ 0% | não iniciada; a parte mais incerta |
| 4 — motor de versões e estados | 2 | ⚪ 0% | não iniciada |
| 5 — pacote vigente + manifesto | 1–2 | ⚪ 0% | não iniciada |
| **← gargalo declarado resolvido: 8–11 sessões** | | | |
| 6 — integração LIP/MAC/MDP/Radar/URBI | 2 | ⚪ 0% | não iniciada |
| 7 — retorno incremental | 1 | ⚪ 0% | não iniciada |
| 8 — Gemini sob pedido (opcional) | 1 | ⚪ 0% | não iniciada; pode nunca ser necessária |
| **Total do projeto** | **12–16** | **≈ 7% concluído · 93% restante** | 1 sessão batida (Fase 1) de 14 estimadas (meio-termo); Fase 0 não conta sessão própria |

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
