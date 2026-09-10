# PLANO — Fatiador de PDF do SEI (módulo próprio)

**Versão:** 1 · **Data:** 10/09/2026 · **Estado:** proposto, nada implementado
**Autor da ideia:** Fábio Parente · **Levantamento técnico e redação:** sessão Claude de 10/09/2026

> Este documento é **auto-suficiente de propósito**: foi escrito para ser lido também por IAs
> externas (Gemini, ChatGPT) que não têm acesso ao repositório. Por isso repete contexto que quem
> conhece o URBIS já sabe. Tudo marcado como **MEDIDO** foi verificado com chamada real nesta
> sessão; tudo marcado como **NÃO MEDIDO** é hipótese explícita.

---

## 1. Contexto mínimo para quem chega de fora

**URBIS** é o sistema que o Fábio (analista de aprovação de projetos numa prefeitura) usa para
analisar processos administrativos que chegam pelo **SEI** (Sistema Eletrônico de Informações do
governo brasileiro).

Dois módulos principais:
- **LIP** — Leitura Inteligente de Processo: a "ficha" do processo, com dezenas de campos
  (número da matrícula, área do terreno, nº SEI de cada documento etc.).
- **MAC** — Módulo de Análises e Conformidades: o checklist de conformidade do processo.

Ambos hoje funcionam assim: o analista solta **um PDF único** (o SEI exporta o processo inteiro
mesclado num arquivo só, tipicamente 150-350 páginas, 20-100MB) e o **Gemini lê o PDF inteiro**
para preencher os campos do LIP ou os itens do MAC.

Três tipos de processo ("slots") relevantes aqui:
- **Slot 1** — Regularização SEI (produção crítica, é o ganha-pão do Fábio)
- **Slot 2** — Aceite SEI
- **Slot 5** — Aprovação de Projeto (fora do escopo deste plano)

**Regra de ouro do projeto:** slots são isolados. Código de um slot não é importado por outro;
comportamento igual é reproduzido por leitura, nunca compartilhado. A exceção declarada é
**infraestrutura técnica genérica** (que não conhece slot nem decide regra de negócio) — e essa
exceção já está escrita no código existente.

---

## 2. Os dois problemas que forçam este plano

### 2.1 O modelo de IA atual morre em 16/10/2026

O URBIS usa `gemini-2.5-flash`, gravado numa constante única (`lib/constants.ts`). A Google
anunciou aposentadoria para **16/10/2026**, com relatos públicos de indisponibilidade antes da
data. Sem substituto configurado, LIP e MAC param de ler.

### 2.2 O sucessor é muito mais caro — MEDIDO

Mesmo PDF sintético de 50 páginas idênticas, chamada real à API nos dois modelos:

| modelo | tokens de entrada | por página | modalidade |
|---|---|---|---|
| `gemini-2.5-flash` | 12.900 | **258** | DOCUMENT |
| `gemini-3.6-flash` | 26.600 | **532** | **IMAGE** |

O 3.6 mudou a forma de processar PDF (trata cada página como imagem) e consome **2,06x mais
tokens por página**.

Preço: 2.5 = `$0,30 / $2,50` por 1M (entrada/saída) · 3.6 = `$0,75 / $3,75`, **dobrando em
01/01/2027** (fim do preço promocional).

**Custo real por página: 5,2x hoje · 10,3x a partir de janeiro/2027.**

### 2.3 Achado colateral que resolve um problema antigo — MEDIDO

O mesmo PDF de 52MB (processo real 25.5.000012012-9):
- `gemini-2.5-flash` → **400 INVALID_ARGUMENT** (recusa)
- `gemini-3.6-flash` → **lê normalmente** (229 páginas, 9,6 segundos)

Ou seja: o teto de 50MB por PDF é limitação **do modelo 2.5**, não da plataforma Gemini.
Migrar resolve sozinho o problema de "PDF grande demais".

### 2.4 O crédito não se perde — MEDIDO

A chave já enxerga `gemini-3.5/3.6/3.7/3.8-flash`. Chamada real ao 3.6 respondeu e foi cobrada na
conta existente (`serviceTier: standard`). O saldo é da conta, não do modelo.

---

## 3. A conta que justifica a arquitetura inteira

Hoje, um processo é lido **duas vezes** pelo Gemini: uma pelo LIP, outra pelo MAC (rotas
independentes, uploads independentes). Páginas iguais, pagas duas vezes.

Efeito de cada economia, partindo da migração forçada:

| cenário | custo relativo ao 2.5 de hoje |
|---|---|
| só migrar para o 3.6, sem mudar mais nada | **5,2x** |
| + ler uma vez só (LIP e MAC compartilhando a leitura) | 2,6x |
| + ler só os documentos que importam (~40% das páginas) | **~1,0x — empata** |
| + retorno incremental (relê só o que voltou novo) | **bem mais barato que hoje** |

> **Conclusão central:** nenhuma economia sozinha compensa os 5,2x. As duas juntas empatam.
> O lucro real está no retorno incremental. **Esta arquitetura não é melhoria opcional — é a
> condição para o custo continuar neutro depois de uma migração que é obrigatória e datada.**

O `~40% das páginas` é **NÃO MEDIDO** — é a estimativa que sustenta o empate e precisa ser
confirmada (ver §8).

---

## 4. A ideia: separar o trabalho determinístico do trabalho de IA

**Princípio:** regra determinística faz o volume; IA faz só o que a regra não resolve.

Hoje o Gemini recebe 229 páginas e é solicitado a achar tudo. Na arquitetura proposta:

1. Um **fatiador sem IA** lê o carimbo do SEI (texto puro) e identifica onde cada documento do
   processo começa e termina.
2. O analista **confere e corrige** os cortes numa tela gráfica.
3. Só os documentos que interessam são enviados à IA, agrupados.
4. Documento já lido antes (mesmo hash) **não é reenviado** — não custa nada.
5. Uma leitura serve LIP **e** MAC.

O fatiador **não usa IA e não depende de modelo nenhum** — funciona no 2.5, no 3.6, no que vier,
com qualquer teto de tamanho. É a peça durável do plano.

---

## 5. Inventário verificado — o que JÁ existe

Levantado por leitura direta do código nesta sessão. O projeto "Documentos Vivos"
(`docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md`) já construiu ~77% das peças necessárias.

| peça | arquivo | estado |
|---|---|---|
| Fatiador determinístico por evento SEI | `lib/documentosSei/fatiar.ts` (473 linhas) | ✅ pronto, **zero IA, zero rede** — portão validado pelo Fábio em 07/09 contra 4 processos reais |
| Classificação de peças dentro de contêineres genéricos | `lib/documentosSei/pecas.ts` (207 linhas) | 🟡 escrito, **taxa de acerto nunca medida** |
| Recorte de PDF por documento, no navegador | `lib/documentosSei/pacoteVigenteClient.ts:56-66` (pdf-lib) | ✅ pronto — já gera PDF de cada documento |
| Motor de versões (vigente/substituído/sem efeito) | `lib/documentosSei/motorVersoes.ts` (327 linhas) | 🟡 60%, não persiste estado |
| Persistência + dedup por hash de conteúdo | `lib/documentosSei/persistencia.ts` (263 linhas) | ✅ pronto |
| PDF guardado no navegador (IndexedDB, 180 dias) | `lib/documentosSei/cachePdfNavegador.ts` | ✅ pronto |
| Manifesto e pacote .zip | `manifesto.ts`, `pacoteVigenteClient.ts` | 🟡 75% |
| Ponte determinística Organizador → campos do LIP | `lib/documentosSei/compararLip.ts` | ✅ sugere nº SEI para 11 campos |
| Classificação por IA de páginas ambíguas | `lib/documentosSei/visaoAmbiguas.ts` | ✅ pronto — **única parte com IA**, sob clique, custo na tela, cache, interruptor próprio desligado |
| Telas do Organizador | `OrganizadorSeiRegularizacao.tsx` (1123) · `OrganizadorSeiAceite.tsx` (1103) · `OrganizadorSlot5.tsx` (295) | ✅ no ar, **triplicadas** |

**Onde está montado hoje:** dentro da tela do LIP —
`app/processo/ProcessoClient.tsx:3100-3103`. É daí que ele sai.

**O fatiador já tenta** extrair setor, assinante e data por regra (`fatiar.ts:173, 206, 228`),
declaradamente em "melhor esforço" — o que ele garante é só a contagem fechada de páginas por
ID SEI.

---

## 6. Inventário verificado — o que NÃO existe

| # | falta | evidência |
|---|---|---|
| **F1** | **Ajuste manual do corte.** O analista vê, baixa o recorte e aceita, mas `paginaIni`/`paginaFim` vêm do fatiador e são só-leitura. Não há como mover uma fronteira. | varredura dos `onClick` das telas |
| **F2** | **Ligação Organizador → leitor com IA.** O Organizador só produz sugestões determinísticas de nº SEI. Os PDFs recortados **nunca são enviados ao leitor**. É a peça central e ela não existe. | `compararLip.ts` só devolve `SugestaoCampo` |
| **F3** | **Pular o que já foi lido.** A dedup por hash existe (`acharOuCriarConteudo` em `lib/mhd.ts`), mas **ninguém a consulta antes de gastar IA**. Zero chamadas encontradas nas rotas de leitura. | grep em `app/api/lip` e `app/api/mac` |
| **F4** | **Uma leitura servindo LIP e MAC.** `app/api/mac/p3/route.ts:112` faz upload próprio e chamada própria ao Gemini. | leitura da rota |
| **F5** | **Regras editáveis pelo analista.** `ASSINATURAS_PECA` em `pecas.ts` é array *hardcoded* em TypeScript: cada regra nova exige alterar código e publicar. | leitura do arquivo |
| **F6** | **Módulo próprio.** As 3 telas são cópias, presas dentro de slots. | 2.521 linhas triplicadas |

---

## 7. O que se decide construir

### 7.1 Um módulo novo: **Fatiador de PDF do SEI**

Sai de dentro do LIP e vira módulo independente, embrião de um **Editor de PDF** mais amplo
(dividir, compactar, escrever, assinar — fases futuras, fora deste plano).

**Fronteira de isolamento** (resolve a tensão com a regra dos slots): o módulo é
**infraestrutura genérica** — não conhece slot, não decide regra de negócio. O precedente já está
escrito em `fatiar.ts` e `cachePdfNavegador.ts`, que declaram exatamente isso. O que permanece
**por slot** é só a *tradução do resultado*: qual papel de documento vira qual campo do LIP, qual
item do checklist do MAC.

### 7.2 Tela gráfica de conferência

- Renderiza o PDF (a dependência `react-pdf` já está instalada)
- Mostra visualmente onde o fatiador propôs cada corte
- Permite **mover a fronteira** com o mouse, dividir e juntar documentos
- Gera a tabela final: documento, tipo, páginas, **departamento, assinante, data**
- Campos que o fatiador não conseguiu preencher ficam editáveis pelo analista
- O analista escolhe quais documentos exportar / mandar para leitura

**Princípio de projeto:** a tela é de **conferência, não de autoria**. O fatiador propõe tudo que
conseguir; o analista confirma no caso comum e corrige na exceção.

### 7.3 O ciclo que faz o sistema aprender — sem IA

Esta é a peça que transforma o plano de "ferramenta que paga uma vez" em "ferramenta que rende
juros", e é a resposta direta ao ponto do Fábio: *"eu domino o fluxo de documentos, departamentos,
os textos que limitam os documentos — só falta você saber o que eu sei"*.

1. Toda correção manual é **registrada com o texto ao redor** da página corrigida.
2. Correções recorrentes viram **candidatas a regra determinística**.
3. Regra aprovada entra na base — o fatiador acerta mais na próxima.
4. Menos página cai em `classificacao_pendente` → **menos IA é chamada** → menos custo.
5. O trabalho manual diminui sozinho a cada processo.

**Requisito derivado (resolve F5):** as regras precisam sair do código e ir para o **banco**,
editáveis por tela — como já acontece com os prompts do LIP (tabela `lip_prompts`, versionada).
Sem isso, cada conhecimento do Fábio vira um pedido de programação; com isso, ele mesmo alimenta
o sistema.

---

## 8. Extração do conhecimento do Fábio (workstream próprio)

O gargalo declarado não é código: é transferir para regras o que o analista sabe. Proposta em
duas frentes complementares:

### 8.1 Bootstrap — entrevista estruturada

Sessões dedicadas, tema por tema, gerando tabelas:

| tema | o que capturar | onde vai parar |
|---|---|---|
| **Departamentos** | nome oficial, siglas, variações de grafia, como aparece no cabeçalho do SEI, qual departamento emite o quê | tabela de setores |
| **Textos que limitam documentos** | frases/cabeçalhos que marcam início e fim de cada tipo de documento | expansão de `ASSINATURAS_PECA` |
| **Tipos de documento** | vocabulário completo (hoje são 18 papéis), sinônimos, como distinguir pares ambíguos (ex.: ART de Levantamento × ART da Caixa) | tabela de papéis |
| **Fluxo** | qual documento sucede qual, o que substitui o quê, o que anula o quê ("SEM EFEITO") | regras do motor de versões |
| **Assinatura e data** | formatos reais encontrados, cargos, padrões de assinatura eletrônica | refino de `acharAssinante`/`acharData` |

### 8.2 Contínuo — aprendizado por correção

O ciclo de §7.3, rodando em produção, capturando o que a entrevista não previu.

> **Por que as duas:** a entrevista sozinha é cansativa e sempre esquece casos; a correção sozinha
> demora demais para chegar a uma cobertura útil. Juntas, a entrevista dá o salto inicial e a
> correção cobre a cauda longa.

---

## 9. Fases de implementação

> Ordem pensada para **retorno cedo** e **risco baixo**. Nenhuma fase quebra o que existe: tudo
> aditivo, atrás de interruptor, com o caminho atual intocado.

### Fase 0 — Medir para mirar *(0,5 sessão)*
Rodar o fatiador contra os 4 processos reais e medir: taxa de acerto da classificação de peças,
quantas páginas caem em `classificacao_pendente`, quantas vezes departamento/assinante/data
saem vazios.

**Não é portão de vai/não-vai** — é o mapa que diz onde o conhecimento do Fábio rende mais.
**Saída:** relatório por tipo de erro, ordenado por frequência.

### Fase A — Modelo vira escolha *(1 sessão)* — **resolve dor de hoje**
`GEMINI_MODEL` deixa de ser constante e vira configuração. `2.5-flash` continua o padrão;
`3.6-flash` entra automaticamente **só quando o PDF passa de 50MB** — único caso em que o 2.5
não lê de jeito nenhum.

**Ganho imediato:** o PDF de 52MB que hoje dá erro volta a ler, sem pagar 5,2x em tudo.
**Saída:** interruptor + regra de tamanho + registro de qual modelo leu cada processo.

### Fase B — Comparar qualidade 2.5 × 3.6 *(0,5 sessão)* — **risco que pode derrubar a conta**
Rodar os prompts reais do LIP num processo já conferido pelo Fábio, nos dois modelos, e comparar
campo a campo. Os prompts foram afinados durante meses em cima do 2.5.

**Saída:** tabela de divergências. Se o 3.6 extrair pior, a migração exige reescrever prompts —
trabalho que precisa entrar no cronograma antes de outubro.

### Fase C — Regras saem do código para o banco *(1,5 sessão)* — **destrava o Fábio**
`ASSINATURAS_PECA` e o vocabulário de setores migram para tabelas versionadas, com tela de
edição. Fallback para as regras atuais se a tabela estiver vazia (nada quebra).

**Saída:** o Fábio adiciona regra sem programador e sem publicação.

### Fase D — Bootstrap do conhecimento *(N sessões, com o Fábio)*
As entrevistas de §8.1, alimentando as tabelas da Fase C. Medir a taxa da Fase 0 de novo a cada
rodada para ver o ganho.

**Saída:** cobertura subindo, medida, não achada.

### Fase E — O módulo Fatiador + tela gráfica *(3-4 sessões)*
Extrair as 3 telas duplicadas para um módulo só, tirar do LIP, e construir o ajuste gráfico de
corte (F1) e a edição dos campos faltantes.

**Saída:** o módulo que o Fábio descreveu.

### Fase F — Ligar o fatiador ao leitor com IA *(2 sessões)* — **coração da economia**
Os PDFs recortados passam a alimentar o leitor individual. **Agrupar documentos inteiros até
quase o teto de tamanho — nunca 1 chamada por documento**, senão um processo com 40 documentos
estoura a trava de 50 chamadas/hora (`app/api/lip/s3/route.ts:49`).

**Saída:** leitura passa a ver só o que importa.

### Fase G — Não pagar duas vezes *(1 sessão)*
Consultar o hash no MHD antes de chamar IA; documento já lido é pulado (F3). É aqui que o
retorno incremental vira dinheiro: processo que volta com 3 documentos novos entre 40 paga por 3.

### Fase H — Uma leitura, dois consumidores *(1 sessão)*
LIP e MAC param de ler o mesmo PDF separadamente (F4).

### Fase I — Aprendizado por correção *(1,5 sessão)*
O ciclo de §7.3 em produção: correção registrada → candidata a regra → aprovação → base.

---

## 10. Riscos

| risco | gravidade | mitigação |
|---|---|---|
| **3.6 extrai pior que o 2.5 nos prompts do LIP** | alta — invalidaria a conta | Fase B, cedo e barata |
| Taxa de acerto do fatiador baixa demais | média | Fase 0 mede; Fases C+D atacam com o conhecimento do Fábio; risco assumido conscientemente pelo dono do produto |
| Tela gráfica vira digitação em vez de conferência | média | princípio de §7.2 (conferência, não autoria) + medir tempo real por processo antes de dar por pronta |
| Trava de 50 chamadas/hora estourar | média | agrupar documentos (Fase F); rever o teto |
| Quebrar a leitura atual do LIP/MAC | **crítica** — Slot 1 é produção | tudo aditivo, atrás de interruptor desligado; caminho atual nunca alterado |
| 6 fases do Documentos Vivos paradas em 70-90% esperando validação humana | média | cada uma vira 100% com o Fábio conferindo na tela — maior entrega por hora do projeto |
| Preço do 3.6 dobra em 01/01/2027 | alta | economias das Fases F/G/H precisam estar no ar antes disso |

---

## 11. Perguntas em aberto — para atacar com Gemini/ChatGPT

1. **Existe modelo melhor que o `gemini-3.6-flash` para este caso?** O critério não é benchmark
   genérico: é custo por página de PDF digitalizado × qualidade de extração de campos
   estruturados. Comparar também `3.5-flash`, `3.1-flash-lite` e as variantes `-lite`.
2. **Dá para reduzir o custo por página?** O 3.6 processa PDF como imagem (532 tokens/página).
   Enviar texto extraído localmente em vez da imagem, quando a página tem camada de texto,
   reduziria muito — mas perde-se o entendimento visual. Vale para quais tipos de documento?
   (Dado relevante: num levantamento anterior, 48% das páginas eram digitalização sem camada de
   texto.)
3. **Cache de contexto do Gemini** — a segunda leitura do mesmo documento pode custar ~1/10.
   Vale a pena em vez de fundir as leituras de LIP e MAC? Quais são os mínimos e o custo de
   armazenamento?
4. **Como estruturar a entrevista de §8.1** para extrair regras de forma exaustiva sem cansar o
   especialista? Existe metodologia consolidada de *knowledge elicitation* aplicável?
5. **Ajuste gráfico de corte em PDF grande no navegador** — 229 páginas, 100MB, com arrastar de
   fronteira: qual abordagem de renderização aguenta isso sem travar?
6. **A ordem das fases está certa?** Especificamente: adiantar a Fase F (economia) antes da
   Fase E (módulo) faria mais sentido financeiramente?

---

## 12. Decisões já tomadas (não reabrir sem motivo novo)

- **O fatiador não usa IA** e não deve usar. A única parte com IA do módulo é
  `visaoAmbiguas.ts`, restrita a páginas que a regra não classificou, sob clique, com custo na
  tela e interruptor próprio desligado.
- **A leitura de PDF atual não muda.** O novo caminho é extra.
- **O Organizador sai de dentro do LIP** e vira módulo.
- **OBS COD não vira MHD.** MHD é memória de documentos de processo, consultada por produção
  (o Radar vigia `mhd_documentos.atualizado_em`); OBS COD é memória de decisões de código.
- **O crédito Google não se perde** na aposentadoria do 2.5 — testado.

---

## 13. Histórico de versões

| versão | data | o que mudou |
|---|---|---|
| 1 | 10/09/2026 | Criação. Levantamento do código existente, medições reais de custo e limite dos modelos 2.5 e 3.6, decisão de extrair o Organizador para módulo próprio, fases de implementação e workstream de extração de conhecimento. |
