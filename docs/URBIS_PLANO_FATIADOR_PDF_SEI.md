# PLANO — Fatiador de PDF do SEI + Módulo de Análise de Fluxo

**Versão:** 3 · **Data:** 10/09/2026 · **Estado:** proposto, nada implementado
**Autoria:** ideia e direção do Fábio Parente · expansão para Análise de Fluxo discutida com o
Gemini · levantamento técnico, verificação e redação na sessão Claude de 10/09/2026

> Documento **auto-suficiente de propósito**: escrito para ser lido também por IAs externas
> (Gemini, ChatGPT) que não têm acesso ao repositório nem ao banco. Repete contexto que quem
> conhece o URBIS já sabe.
>
> **MEDIDO** = verificado nesta sessão com chamada real à API ou consulta real ao banco de
> produção. **NÃO MEDIDO** = hipótese explícita, marcada como tal.

---

## 1. Como este plano chegou aqui

**v1** tratava de **um** módulo: o Fatiador.

**v2** — a conversa do Fábio com o Gemini acrescentou um **segundo módulo**, a **Análise de Fluxo
de Processos**. Ao verificar essa proposta contra o banco de produção apareceu o achado de §4, que
nem o Gemini nem eu tínhamos visto: o BDI é cego para fora do URBIS, e o Fatiador é a única porta
pela qual o fluxo real da prefeitura pode entrar. Isso transformou uma tarefa de meia sessão na
peça mais estratégica do projeto (Fase 1). A v2 também levantou a **governança de métrica nominal
de servidores** (§9), que é o maior risco pessoal do Fábio e ninguém tinha citado.

**v3** — o Fábio corrigiu uma análise minha que estava errada: *classificar documento não precisa
de imagem*. Documento administrativo é identificado pela **moldura** (rodapé, cabeçalho,
assinatura, departamento, posição no fluxo), não pelo miolo. Verificar isso achou o buraco real
(**F10**): o classificador recebe apenas o texto da página e **ignora três sinais que o fatiador
já extrai**. Daí nasceu a Fase 1B — e a perspectiva de que a IA sobre imagem se torne quase
desnecessária. Ver §8.1.

> **Padrão que se repete e vale registrar:** as três correções mais valiosas deste documento
> vieram do Fábio ou do Gemini, e todas foram confirmadas indo verificar o código e o banco. As
> hipóteses que eu levantei sem medir foram justamente as que caíram.

---

## 2. Contexto mínimo para quem chega de fora

**URBIS** é o sistema que o Fábio (analista de aprovação de projetos numa prefeitura) usa para
analisar processos administrativos que chegam pelo **SEI** (Sistema Eletrônico de Informações,
padrão do governo brasileiro).

**Módulos principais:**
- **LIP** — Leitura Inteligente de Processo: a "ficha" do processo, dezenas de campos.
- **MAC** — Módulo de Análises e Conformidades: o checklist de conformidade.

**Módulos satélites** (todos já existentes): **URBI** (assistente de conversa), **BDI** (Banco de
Dados Inteligente / estatísticas), **MAP** (Auditoria e Produtividade), **MRP** (Minha
Produtividade), **MDP** (Despachos e Pareceres), **MHD** (Histórico e Documentos, indexado por
hash).

**Como funciona hoje:** o analista solta **um PDF único** — o SEI exporta o processo inteiro
mesclado num arquivo só, tipicamente 150-350 páginas e 20-100MB — e o **Gemini lê o PDF inteiro**
para preencher LIP e MAC.

**Slots** (tipos de processo) no escopo: **Slot 1 — Regularização SEI** (produção crítica, é o
ganha-pão do Fábio) e **Slot 2 — Aceite SEI**. Slot 5 (Aprovação de Projeto) fica de fora.

**Departamentos da prefeitura que aparecem no fluxo:** Atende Fácil, CONTEC, CADV, GEFEP/GERFEP,
DIRAAP, SECGER (protocolo geral). **Nenhum deles usa o URBIS** — o URBIS é ferramenta pessoal do
analista. Guarde isto, é o eixo do §4.

**Regra de ouro do projeto:** slots são isolados; código de um não é importado por outro. A
exceção declarada é **infraestrutura técnica genérica** que não conhece slot nem decide regra de
negócio — e essa exceção já está escrita no código existente.

---

## 3. As duas forças que obrigam a agir agora

### 3.1 O modelo de IA atual morre em 16/10/2026
O URBIS usa `gemini-2.5-flash`, numa constante única (`lib/constants.ts`). Aposentadoria
anunciada pela Google para **16/10/2026**, com relatos públicos de indisponibilidade antes da
data. Sem substituto configurado, LIP e MAC param de ler.

### 3.2 O sucessor é muito mais caro — MEDIDO
Mesmo PDF sintético de 50 páginas idênticas, chamada real nos dois modelos:

| modelo | tokens de entrada | por página | modalidade |
|---|---|---|---|
| `gemini-2.5-flash` | 12.900 | **258** | DOCUMENT |
| `gemini-3.6-flash` | 26.600 | **532** | **IMAGE** |

O 3.6 passou a tratar cada página como imagem: **2,06x mais tokens**.
Preço: 2.5 = `$0,30/$2,50` por 1M · 3.6 = `$0,75/$3,75`, **dobrando em 01/01/2027**.

**Custo real por página: 5,2x hoje · 10,3x a partir de janeiro/2027.**

### 3.3 Dois achados colaterais — MEDIDOS
- **O teto de 50MB por PDF é do modelo 2.5, não da plataforma.** O mesmo arquivo de 52MB
  (processo real 25.5.000012012-9): 2.5 devolve `400 INVALID_ARGUMENT`; **3.6 lê normalmente**
  (229 páginas, 9,6s). Migrar resolve sozinho o problema de "PDF grande demais".
- **O crédito não se perde.** A chave já enxerga `3.5/3.6/3.7/3.8-flash`; chamada real ao 3.6 foi
  cobrada na conta existente. Saldo é da conta, não do modelo.

### 3.4 A conta que justifica a arquitetura
Hoje o processo é lido **duas vezes** (LIP e MAC, rotas e uploads independentes). Páginas iguais,
pagas em dobro.

| cenário | custo relativo ao 2.5 de hoje |
|---|---|
| só migrar para o 3.6 | **5,2x** |
| + ler uma vez só (LIP e MAC compartilhando) | 2,6x |
| + ler só os documentos que importam (~40% das páginas) | **~1,0x — empata** |
| + retorno incremental (relê só o que voltou novo) | **bem mais barato que hoje** |

> Nenhuma economia sozinha compensa. As duas juntas empatam. O lucro está no retorno incremental.
> **Esta arquitetura é a condição para o custo continuar neutro depois de uma migração obrigatória
> e datada.** O `~40%` é **NÃO MEDIDO** e precisa ser confirmado.

---

## 4. O ACHADO CENTRAL: o BDI é cego para fora do URBIS

Consultei o banco de produção. O que o BDI mede hoje:

- **21 views `vw_bdi_*` já existem** — incluindo `analistas_desempenho`, `autores`,
  `retrabalho`, `retrabalho_por_passada`, `tempo_etapas`, `tempo_analista`,
  `produtividade_mensal`, `retorno_por_slot`. Boa parte do que o Gemini propôs como "novo" **já
  está construída como dado**.
- **`auditoria_eventos`: 6.974 linhas** — mas as colunas são `analista_id`, `analista_nome`,
  `modulo`, `acao`. São as ações **dos usuários do URBIS**, dentro do URBIS.
- **`vw_bdi_analistas_desempenho` devolve um nome só:** "Fábio Parente Martins Santos", gerência
  GERAED.
- **`vw_bdi_tempo_etapas` mede `analise_iniciada_em` → `analise_concluida_em`** — exemplos reais
  retornaram `0 dias`, análises de 3 minutos. É o tempo **dele, dentro do URBIS**.

**Conclusão — e é o ponto mais importante deste documento:**

> O BDI de hoje é um **espelho do trabalho do próprio Fábio**. Ele não enxerga a prefeitura.
> GEFEP, DIRAAP, CONTEC, CADV e Atende Fácil **nunca tocam no URBIS** — existem apenas como
> carimbos dentro do PDF do SEI.
>
> **O Fatiador é a única porta pela qual o fluxo real da prefeitura pode entrar no URBIS.**
> Ele lê o carimbo do SEI: quem assinou, qual setor, qual data. Sem ele, o Módulo de Análise de
> Fluxo **não tem como existir** — não há de onde tirar o dado.

### 4.1 O dado já é extraído — e jogado fora

`lib/documentosSei/fatiar.ts` **já tenta** extrair setor (linha 173), assinante (206) e data
(228), por regra determinística.

Mas a tabela `mhd_documentos` (74 linhas hoje) tem as colunas: `processo_codigo`, `assunto_id`,
`papel`, `rotulo`, `status`, `criado_em`, `atualizado_em`, `escopo`.

**Não existe `assinante`. Não existe `setor`. Não existe `data_documento`.**

> O sistema **calcula** quem assinou e de qual departamento, mostra na tela, e **descarta na hora
> de gravar**. Acrescentar essas três colunas é a mudança mais barata e de maior alavancagem do
> projeto inteiro: destrava um módulo, e a partir do dia em que entrar já começa a acumular
> histórico.

**Consequência de cronograma:** estatística precisa de tempo. Cada semana sem essas colunas é uma
semana de dado perdido para sempre. **Isso deve ser feito cedo, mesmo antes das partes vistosas.**

---

## 5. Inventário verificado — o que JÁ existe

O projeto "Documentos Vivos" (`docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md`) já construiu ~77% das peças
do Fatiador.

| peça | onde | estado |
|---|---|---|
| Fatiador determinístico por evento SEI | `lib/documentosSei/fatiar.ts` (473 linhas) | ✅ **zero IA, zero rede** — validado pelo Fábio em 07/09 contra 4 processos reais |
| Classificação de peças dentro de contêineres | `lib/documentosSei/pecas.ts` (207 linhas) | 🟡 escrito, **taxa de acerto nunca medida** |
| Recorte de PDF por documento, no navegador | `pacoteVigenteClient.ts:56-66` (pdf-lib) | ✅ já gera PDF de cada documento |
| Motor de versões (vigente/substituído/sem efeito) | `motorVersoes.ts` (327 linhas) | 🟡 60%, não persiste estado |
| Persistência + dedup por hash | `persistencia.ts` (263 linhas) | ✅ pronto |
| PDF no navegador (IndexedDB, 180 dias) | `cachePdfNavegador.ts` | ✅ pronto |
| Manifesto + pacote .zip | `manifesto.ts`, `pacoteVigenteClient.ts` | 🟡 75% |
| Ponte determinística → campos do LIP | `compararLip.ts` | ✅ sugere nº SEI para 11 campos |
| Classificação por IA de páginas ambíguas | `visaoAmbiguas.ts` | ✅ **única parte com IA** — sob clique, custo na tela, cache, interruptor próprio desligado |
| Telas do Organizador | `OrganizadorSeiRegularizacao.tsx` (1123) · `OrganizadorSeiAceite.tsx` (1103) · `OrganizadorSlot5.tsx` (295) | ✅ no ar, **triplicadas** |
| Estatísticas BDI | 21 views `vw_bdi_*` | ✅ no ar — mas só sobre o próprio URBIS (§4) |
| Auditoria de ações | `auditoria_eventos` (6.974 linhas) | ✅ no ar — só usuários do URBIS |
| Produtividade / despachos | `mrp_registros` (137) · `mdp_registros` (71) | ✅ no ar |

**Onde o Organizador está montado hoje:** dentro da tela do LIP —
`app/processo/ProcessoClient.tsx:3100-3103`.

---

## 6. Inventário verificado — o que NÃO existe

| # | falta | evidência |
|---|---|---|
| **F1** | **Ajuste manual do corte.** `paginaIni`/`paginaFim` vêm do fatiador e são só-leitura; não há como mover fronteira. | varredura dos `onClick` das telas |
| **F2** | **Ligação Fatiador → leitor com IA.** Os PDFs recortados nunca são enviados ao leitor. Peça central, inexistente. | `compararLip.ts` só devolve sugestão de nº SEI |
| **F3** | **Pular o que já foi lido.** A dedup por hash existe (`acharOuCriarConteudo`), mas **ninguém consulta antes de gastar IA**. | grep em `app/api/lip` e `app/api/mac` |
| **F4** | **Uma leitura servindo LIP e MAC.** `app/api/mac/p3/route.ts:112` faz upload e chamada próprios. | leitura da rota |
| **F5** | **Regras editáveis pelo analista.** `ASSINATURAS_PECA` é array *hardcoded* em TypeScript. | leitura de `pecas.ts` |
| **F6** | **Módulo próprio.** 2.521 linhas triplicadas, presas dentro de slots. | `wc -l` |
| **F7** | **Assinante, setor e data do documento persistidos.** Extraídos e descartados (§4.1). | colunas de `mhd_documentos` |
| **F8** | **Qualquer métrica por departamento ou por signatário.** Nenhuma view, nenhuma coluna. | 21 views inspecionadas |
| **F9** | **Medição de tempo entre etapas da prefeitura.** `vw_bdi_tempo_etapas` mede minutos dentro do URBIS, não a jornada do processo. | amostra real da view |
| **F10** | **O classificador é cego para 3 dos 4 sinais.** `abrirContainer(paginasDoEvento: PaginaTexto[])` recebe só texto e dimensões da página — **não recebe departamento, assinante nem posição no fluxo**, que o fatiador já extrai. Classifica por regex no corpo da página, ignorando a moldura que de fato identifica um documento administrativo. | assinatura da função + varredura sem resultado por `setor`/`assinante`/`contexto` em `pecas.ts` |

---

## 7. Os dois módulos propostos

### 7.1 Módulo A — Fatiador de PDF do SEI

Sai de dentro do LIP e vira módulo independente — embrião de um **Editor de PDF** mais amplo
(dividir, compactar, escrever, assinar: fases futuras, fora deste plano).

**Mecânica:**
- **Triagem por texto puro.** O carimbo do SEI está 100% na camada de texto — isso foi medido na
  Fase 0 do projeto anterior, em 4 processos reais. Fatiar não precisa de imagem nem de IA.
- **Emagrecimento.** De um PDF de 26MB a 260MB, separa o que é útil do que é histórico morto e
  entrega um conjunto limpo para a análise.
- **Escopo inicial:** Regularização (Slot 1) e Aceite (Slot 2).

**Tela gráfica de conferência** (o pedido do Fábio):
- Renderiza o PDF (`react-pdf` já instalado)
- Mostra onde o fatiador propôs cada corte e permite **mover a fronteira**, dividir e juntar
- Tabela final: documento, tipo, páginas, **departamento, assinante, data**
- Campos que o fatiador não preencheu ficam editáveis
- O analista escolhe o que exportar e o que mandar para leitura

> **Princípio:** a tela é de **conferência, não de autoria**. O fatiador propõe tudo que
> conseguir; o analista confirma no caso comum e corrige na exceção. Se virar formulário em
> branco, o módulo fracassou.

**Vocabulário documental a reconhecer** (levantado pelo Fábio, é conhecimento de domínio dele):

| origem | documentos |
|---|---|
| **Base** | Certidão de Matrícula (padrão de cartório, com áreas e lotes), Procuração, ARTs (padrão CAU/CREA) |
| **GEFEP** | Notificação de Calçada, Laudo de Irregularidade, Fotos da Obra, **Laudo de Fiscalização do Imóvel** (o que destrava o processo) |
| **DIRAAP** | Encaminhamento do CPD (comprova busca por processos anteriores — **bloqueia duplicidade de alvará**) |

### 7.2 Módulo B — Análise de Fluxo de Processos

Consome os metadados do Fatiador e transforma o histórico em visão gerencial.

**O que passa a ser possível — e hoje é impossível (§4):**
- **Tempo real de cada etapa da prefeitura**: quantos dias o processo ficou em cada departamento,
  medido pela diferença entre datas de documentos assinados por setores diferentes.
- **Gargalos estruturais**: em qual etapa e com qual tipo de documento o processo mais trava.
- **Retrabalho (idas e vindas)**: quantas vezes um projeto voltou até bater com o laudo do fiscal.
  (Existe `vw_bdi_retrabalho`, mas só enxerga o retrabalho **dentro do URBIS** — com o Fatiador
  passa a enxergar o ciclo real.)
- **Desempenho de autores externos**: engenheiros e arquitetos, volume de documento com erro ou
  fora do padrão. (`vw_bdi_autores` já existe e ganha profundidade.)

**Camada de inteligência:** com a base estatística formada, o Gemini cruza variáveis para apontar
padrões e **propor melhorias** — não só diagnosticar.

> **Ordem obrigatória:** primeiro o dado bruto acumula (barato, determinístico, sem IA); só depois
> a IA interpreta. Chamar IA sobre base pequena produz opinião bonita e sem valor.

---

## 8. Correções às premissas da proposta do Gemini

Duas coisas na proposta original precisam de ajuste, porque contrariam dados medidos do projeto.

### 8.1 "Processar só texto, eliminando leitura de imagem" — **o Gemini está certo, e eu estava errado**

Na v2 deste documento eu havia escrito que classificar exigiria ler imagem, porque num processo
real só 12,5% das páginas têm texto nativo. **Análise errada**, corrigida pelo Fábio:

> *"Pra fatiar não precisa ler essas imagens. Lá tem 90% de imagem, mas os 10% são suficientes
> para identificar a documentação: rodapé, cabeçalho, assinaturas, departamentos, local no fluxo
> do processo."*

Ele tem razão, e o erro foi meu no enquadramento. **Documento administrativo não é identificado
pelo miolo — é identificado pela moldura.** Uma matrícula escaneada é reconhecida pelo carimbo do
SEI, pelo cabeçalho do cartório, pela assinatura e por onde ela aparece no fluxo — não por ler o
texto do imóvel dentro dela. O que está em imagem é justamente a parte que **não** serve para
classificar.

#### O buraco real — VERIFICADO

Fui checar por que a classificação erra hoje. Não é falta de pixel. É que o classificador
**enxerga um sinal só de quatro disponíveis**:

```
lib/documentosSei/pecas.ts
  export function abrirContainer(paginasDoEvento: PaginaTexto[]): PecaSei[]

lib/documentosSei/fatiar.ts:86
  type PaginaTexto = { pagina, texto, largura, altura }
```

Ele recebe **apenas o texto e as dimensões da página**. Uma varredura por `setor`, `assinante`,
`anterior`, `contexto` e `EventoSei` dentro de `pecas.ts` retorna **nada**.

| sinal | o fatiador extrai? | o classificador usa? |
|---|---|---|
| Texto do corpo da página | sim | ✅ **é o único que usa** |
| **Departamento / cabeçalho** | sim (`fatiar.ts:173`) | ❌ **não recebe** |
| **Assinante** | sim (`fatiar.ts:206`) | ❌ **não recebe** |
| **Data do documento** | sim (`fatiar.ts:228`) | ❌ **não recebe** |
| **Posição no fluxo** (o que veio antes e depois) | disponível na lista de eventos | ❌ **não existe** |

> O fatiador **calcula** departamento, assinante e data, mostra na tela, **descarta na gravação**
> (§4.1) — **e não passa nada disso para quem precisa classificar**. O classificador está
> adivinhando por regex no corpo da página com uma venda nos olhos.

#### Consequência para o plano

1. A prioridade **não** é ligar IA sobre imagem. É **alimentar o classificador com os sinais que
   já existem**. Isso é determinístico, de graça, e provavelmente derruba muito do que hoje cai em
   `classificacao_pendente`.
2. O `visaoAmbiguas.ts` (IA sobre imagem) passa de "recurso necessário" para "último recurso de
   exceção" — talvez quase nunca acionado. Isso serve diretamente ao princípio do projeto de usar
   o mínimo de IA possível.
3. Abre uma frente nova de classificação que ninguém tinha considerado: **inferir o documento pela
   posição no fluxo**. Um documento assinado pela GEFEP depois de uma notificação é um laudo; uma
   página com formatação de cartório logo após um requerimento é uma matrícula. **O fluxo é
   evidência** — e é justamente o conhecimento que o Fábio domina e o sistema ignora.

**Resumo honesto:** o Gemini disse "não precisa de imagem" e estava certo. Eu disse "precisa" e
estava errado, por ter confundido *ler o conteúdo do documento* com *identificar o documento*.

### 8.2 "Construir o Módulo de Análise de Fluxo" — parcialmente já existe

21 views `vw_bdi_*` já cobrem desempenho de analista, autores, retrabalho, tempo e produtividade.
**O que falta não é a camada estatística — é a matéria-prima** (§4): setor, assinante e data
persistidos. Construir do zero o que já existe seria desperdício; o trabalho real é **alimentar** o
que está pronto com dado que hoje não entra.

---

## 9. Governança: a questão de maior risco pessoal — ninguém levantou

A proposta inclui *"mapear o desempenho de cada setor e rastrear os servidores responsáveis pelas
assinaturas, identificando onde há eficiência e onde há retenção"*.

Isso é tecnicamente viável e **institucionalmente perigoso para o Fábio**, que é analista, não
secretário:

- Um sistema pessoal que **ranqueia colegas nominalmente** e aponta "quem segura processo" pode
  gerar conflito funcional, atrito sindical e retaliação política — e o custo cai sobre ele.
- Assinar um documento no SEI é ato administrativo. **Agregar assinaturas num ranking de
  desempenho é outro tratamento**, com finalidade diferente — o que, sob a LGPD, exige base legal
  e finalidade declarada. Não é o mesmo que o dado estar "publicamente no processo".

**Recomendação:**

1. **Padrão: métrica por DEPARTAMENTO e por ETAPA**, nunca por pessoa. Gargalo quase sempre é
   estrutural — entrega a maior parte do valor sem expor ninguém.
2. **Métrica nominal fica atrás de interruptor desligado**, e só é ligada com autorização
   explícita de quem tem competência para isso (gerência/secretaria) — decisão institucional, não
   técnica.
3. **Autores externos** (engenheiros, arquitetos) são categoria diferente de servidores: são
   fornecedores de documento ao processo, e medir taxa de erro documental é atividade-fim da
   análise. Risco bem menor — mas ainda assim, medir **padrão de erro**, não "ranking de
   profissional".

> Esta recomendação não é jurídica. É de prudência institucional. Vale consultar quem de direito
> antes de ligar qualquer métrica nominal.

---

## 10. Integração com URBI e BDI

### 10.1 Como o Fatiador alimenta os satélites

| satélite | o que recebe do Fatiador | estado |
|---|---|---|
| **MHD** | cada documento classificado, com páginas, hash, **e — novo — setor, assinante e data** | parcial hoje; F7 completa |
| **BDI** | fluxo real da prefeitura: etapas, tempos entre setores, retrabalho verdadeiro | **impossível hoje** (§4) |
| **MDP** | cruzamento entre o que saiu (despacho/parecer) e o que voltou | `mdp_registros` já existe |
| **MRP** | esforço real por processo, com base em quantos documentos novos vieram | `mrp_registros` já existe |
| **Radar/URBI** | já vigia `mhd_documentos.atualizado_em` — passa a ver documento novo por setor | funciona hoje |

### 10.2 O que o URBI passa a poder responder

Hoje o URBI responde sobre a pilha e sobre o processo. Com o Fatiador e o Módulo de Fluxo, passa a
poder responder perguntas que hoje não têm fonte:

- *"Esse processo está parado há quanto tempo, e em qual setor?"*
- *"Quantas vezes esse projeto já voltou?"*
- *"Falta o Laudo de Fiscalização da GEFEP?"* (documento que destrava o processo)
- *"Já veio o Encaminhamento do CPD?"* (o que bloqueia duplicidade de alvará)
- *"Onde meus processos costumam travar?"*

**Regra que já vale no URBIS e continua valendo:** o URBI **propõe, nunca grava sozinho**.

### 10.3 Apresentação: painel **e** alerta (a pergunta do Gemini)

O Gemini perguntou se os gargalos devem aparecer em painel ou em alerta no processo. A resposta
correta é **os dois, com papéis distintos**:

- **Alerta no processo** — operacional, para agir agora: *"parado há 40 dias na GEFEP"*. Aparece
  onde a decisão acontece.
- **Painel** — estratégico, para enxergar padrão: *"processos com laudo da GEFEP levam em média
  3x mais tempo"*. Serve para propor mudança de fluxo.

Painel sem alerta vira relatório que ninguém abre. Alerta sem painel vira ruído sem contexto.

---

## 11. Fases de implementação

> Ordem pensada para **retorno cedo**, **risco baixo** e **começar a acumular dado o quanto
> antes**. Tudo aditivo, atrás de interruptor; o caminho atual do LIP/MAC nunca é alterado.

### Fase 0 — Medir para mirar *(0,5 sessão)*
Rodar o fatiador contra os 4 processos reais e medir: taxa de acerto da classificação, quantas
páginas caem em `classificacao_pendente`, quantas vezes setor/assinante/data saem vazios.

**Não é portão de vai/não-vai** — é o mapa que diz onde o conhecimento do Fábio rende mais.

### Fase 1 — Persistir setor, assinante e data *(0,5 sessão)* ⚡ **MAIOR ALAVANCAGEM**
Três colunas em `mhd_documentos` e gravação no `persistencia.ts`. O dado **já é calculado e
descartado** (§4.1).

**Por que primeiro:** é a menor tarefa do plano inteiro e destrava o Módulo B por completo. E
estatística precisa de tempo — **cada semana sem isso é dado perdido para sempre.**

### Fase 1B — Alimentar o classificador com os sinais que já existem *(1 sessão)* ⚡ **SEGUNDA MAIOR ALAVANCAGEM**
Gêmea da Fase 1, mesma matéria-prima, outro consumidor. Passar a `abrirContainer` o que hoje ele
não recebe (F10): **departamento, assinante, data e posição no fluxo**. Acrescentar regras que
combinem sinais — *"assinado pela GEFEP + vem depois de notificação = laudo de fiscalização"* —
em vez de só regex no corpo da página.

**Por que cedo:** é determinístico, custo zero de IA, e ataca a causa real do
`classificacao_pendente` (não é falta de pixel, é venda nos olhos — §8.1). Provavelmente torna o
`visaoAmbiguas.ts` quase desnecessário, o que serve ao princípio de usar o mínimo de IA.

**Saída:** taxa de acerto remedida contra a linha de base da Fase 0, mostrando o ganho.

### Fase 2 — Modelo vira escolha *(1 sessão)* — resolve dor de hoje
`GEMINI_MODEL` deixa de ser constante. `2.5-flash` continua padrão; `3.6-flash` entra
automaticamente **só quando o PDF passa de 50MB** — único caso em que o 2.5 não lê.
**Ganho imediato:** o PDF de 52MB volta a ler sem pagar 5,2x em tudo.

### Fase 3 — Comparar qualidade 2.5 × 3.6 *(0,5 sessão)* — risco que pode derrubar a conta
Rodar os prompts reais do LIP num processo já conferido, nos dois modelos, comparando campo a
campo. Os prompts foram afinados durante meses em cima do 2.5. Se o 3.6 extrair pior, reescrever
prompts entra no cronograma antes de outubro.

### Fase 4 — Regras saem do código para o banco *(1,5 sessão)* — destrava o Fábio
`ASSINATURAS_PECA` e o vocabulário de setores migram para tabelas versionadas com tela de edição,
como já são os prompts (`lip_prompts`). Fallback para as regras atuais se a tabela estiver vazia.
**Saída:** o Fábio adiciona regra sem programador e sem publicação.

### Fase 5 — Bootstrap do conhecimento *(N sessões, com o Fábio)*
Entrevistas estruturadas (§12) alimentando as tabelas da Fase 4, começando pelo vocabulário
GEFEP/DIRAAP do §7.1. Remedir a Fase 0 a cada rodada para ver o ganho.

### Fase 6 — O módulo Fatiador + tela gráfica *(3-4 sessões)*
Extrair as 3 telas duplicadas para um módulo só, tirar do LIP, e construir o ajuste gráfico (F1) e
a edição dos campos faltantes.

### Fase 7 — Ligar Fatiador ao leitor com IA *(2 sessões)* — coração da economia
Os PDFs recortados alimentam o leitor. **Agrupar documentos inteiros até quase o teto de tamanho —
nunca 1 chamada por documento**, senão um processo com 40 documentos estoura a trava de 50
chamadas/hora (`app/api/lip/s3/route.ts:49`).

### Fase 8 — Não pagar duas vezes *(1 sessão)*
Consultar o hash no MHD antes de chamar IA (F3). Processo que volta com 3 documentos novos entre
40 paga por 3.

### Fase 9 — Uma leitura, dois consumidores *(1 sessão)*
LIP e MAC param de ler o mesmo PDF separadamente (F4).

### Fase 10 — Views de fluxo por departamento *(1,5 sessão)* — nasce o Módulo B
Com dado acumulado desde a Fase 1: views de tempo por setor, por etapa e retrabalho real.
**Por departamento, não por pessoa** (§9).

### Fase 11 — Alertas e painel *(2 sessões)*
Alerta no processo (operacional) + painel (estratégico), conforme §10.3.

### Fase 12 — Camada de interpretação com IA *(1,5 sessão)* — só quando houver base
Gemini cruzando as variáveis do BDI para propor melhorias. **Só depois de meses de dado
acumulado.** Governança de sempre: interruptor, teto, custo à vista.

### Fase 13 — Aprendizado por correção *(1,5 sessão)*
Correção manual do analista → registrada com o texto ao redor → candidata a regra → aprovação →
base. O fatiador melhora sozinho, sem IA.

---

## 12. Extração do conhecimento do Fábio (workstream próprio)

O gargalo declarado não é código: é transferir para regra o que o analista sabe. Nas palavras
dele: *"eu domino o fluxo de documentos, departamentos, os textos que limitam os documentos — só
falta você saber o que eu sei"*.

### 12.1 Bootstrap — entrevista estruturada

| tema | o que capturar | destino |
|---|---|---|
| **Departamentos** | nome, siglas, variações de grafia, como aparece no cabeçalho do SEI, quem emite o quê | tabela de setores |
| **Textos que limitam documentos** | frases e cabeçalhos que marcam início e fim de cada tipo | expansão de `ASSINATURAS_PECA` |
| **Tipos de documento** | vocabulário completo (hoje 18 papéis), sinônimos, pares ambíguos (ART de Levantamento × ART da Caixa) | tabela de papéis |
| **Fluxo** | qual documento sucede qual, o que substitui, o que anula ("SEM EFEITO"), o que destrava etapa | motor de versões + Módulo B |
| **Assinatura e data** | formatos reais, cargos, padrões de assinatura eletrônica | refino de `acharAssinante`/`acharData` |

### 12.2 Contínuo — aprendizado por correção
O ciclo da Fase 13, capturando o que a entrevista não previu.

> **Por que as duas:** a entrevista sozinha cansa e esquece casos; a correção sozinha demora
> demais para cobrir. Juntas, a entrevista dá o salto inicial e a correção cobre a cauda longa.

---

## 13. Riscos

| risco | gravidade | mitigação |
|---|---|---|
| **Métrica nominal de servidores gerar conflito funcional/jurídico** | **alta — risco pessoal do Fábio** | §9: padrão por departamento; nominal atrás de interruptor e autorização institucional |
| **3.6 extrai pior que o 2.5 nos prompts do LIP** | alta — invalidaria a conta | Fase 3, cedo e barata |
| **Dado de fluxo não acumulado a tempo** | alta — estatística não se recupera retroativamente | Fase 1 primeiro, é meia sessão |
| Taxa de acerto do fatiador baixa | média | Fase 0 mede; Fases 4+5 atacam com o conhecimento do Fábio; risco assumido conscientemente pelo dono do produto |
| Tela gráfica virar digitação em vez de conferência | média | princípio de §7.1 + medir tempo real por processo antes de dar por pronta |
| Trava de 50 chamadas/hora estourar | média | agrupar documentos (Fase 7); rever o teto |
| **Quebrar a leitura atual do LIP/MAC** | **crítica — Slot 1 é produção** | tudo aditivo, atrás de interruptor desligado; caminho atual nunca alterado |
| IA opinando sobre base estatística pequena | média | Fase 12 só depois de meses de dado |
| 6 fases do Documentos Vivos paradas em 70-90% esperando validação humana | média | cada uma vira 100% com o Fábio conferindo na tela — maior entrega por hora do projeto |
| Preço do 3.6 dobra em 01/01/2027 | alta | economias das Fases 7/8/9 no ar antes disso |

---

## 14. Perguntas em aberto — para atacar com Gemini/ChatGPT

1. **Existe modelo melhor que o `gemini-3.6-flash` para este caso?** Critério não é benchmark
   genérico: é custo por página de PDF digitalizado × qualidade de extração de campo estruturado.
   Comparar `3.5-flash`, `3.1-flash-lite` e variantes `-lite`.
2. **Dá para reduzir o custo por página?** O 3.6 processa PDF como imagem (532 tokens/página).
   Enviar texto extraído localmente quando a página tem camada de texto reduziria muito — mas
   perde entendimento visual. Vale para quais tipos de documento, dado que ~48% das páginas são
   digitalização sem texto?
3. **Cache de contexto do Gemini** — a segunda leitura do mesmo documento pode custar ~1/10. Vale
   mais que fundir as leituras de LIP e MAC? Quais os mínimos e o custo de armazenamento?
4. **Metodologia de *knowledge elicitation*** — como estruturar as entrevistas do §12.1 para
   extrair regras de forma exaustiva sem esgotar o especialista?
5. **Ajuste gráfico de corte em PDF grande no navegador** — 229 páginas, 100MB, com arrastar de
   fronteira: qual abordagem de renderização aguenta sem travar?
6. **Medir tempo de etapa a partir de datas de assinatura é confiável?** A data do documento não é
   necessariamente a data em que o processo chegou ou saiu do setor. Que viés isso introduz e como
   corrigir?
7. **A ordem das fases está certa?** Especificamente: a Fase 1 (persistir setor/assinante/data)
   antes de tudo se justifica pelo argumento de que estatística não se recupera retroativamente?
8. **Governança (§9)** — a recomendação de medir por departamento e deixar o nominal atrás de
   autorização é prudente ou excessivamente conservadora para uma ferramenta de uso pessoal?

---

## 15. Decisões já tomadas (não reabrir sem motivo novo)

- **O fatiamento não usa IA** e não deve usar. A única parte com IA é `visaoAmbiguas.ts`, restrita
  a páginas que a regra não classificou, sob clique, com custo à vista e interruptor desligado.
- **A leitura de PDF atual não muda.** O novo caminho é extra.
- **O Organizador sai de dentro do LIP** e vira módulo próprio.
- **OBS COD não vira MHD.** MHD é memória de documentos de processo, consultada por produção;
  OBS COD é memória de decisões de código.
- **O crédito Google não se perde** na aposentadoria do 2.5 — testado.
- **Não medir a taxa de acerto do fatiador como portão de vai/não-vai.** Decisão do Fábio, aceita:
  se o fatiador não for eficaz, o conhecimento dele o torna eficaz. A medição serve para mirar,
  não para decidir.

---

## 16. Histórico de versões

| versão | data | o que mudou |
|---|---|---|
| 1 | 10/09/2026 | Criação. Levantamento do código, medições de custo e limite dos modelos 2.5/3.6, decisão de extrair o Organizador para módulo próprio, fases e workstream de extração de conhecimento. |
| 2 | 10/09/2026 | Acrescentado o **Módulo B — Análise de Fluxo** (proposta discutida com o Gemini). Achado central novo (§4): o BDI é cego para fora do URBIS e o Fatiador é a única porta de entrada do fluxo real da prefeitura; setor/assinante/data são calculados e descartados (F7) — virou a Fase 1 por alavancagem. Duas premissas do Gemini corrigidas (§8). Acrescentada governança de métrica nominal de servidores (§9). Acrescentada integração com URBI/BDI e a resposta painel×alerta (§10). Fases reordenadas de 10 para 14. |
| 3 | 10/09/2026 | **Correção do Fábio, aceita: classificar não precisa de imagem.** A v2 dizia que sim; estava errado, por confundir *ler o conteúdo* com *identificar o documento*. Documento administrativo é identificado pela moldura (rodapé, cabeçalho, assinatura, departamento, posição no fluxo), não pelo miolo. Verificação disso achou **F10**: `abrirContainer` recebe só `PaginaTexto[]` — o classificador não recebe departamento, assinante nem posição no fluxo, embora o fatiador já extraia os três. §8.1 reescrita. Nova **Fase 1B** (alimentar o classificador com os sinais existentes), que provavelmente torna o `visaoAmbiguas.ts` quase desnecessário. Nova frente: **inferir documento pela posição no fluxo**. |
