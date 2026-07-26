# Leitura da pasta — Slot 5 (Aprovação de Projeto)

> Rascunho iniciado em 26/07/2026, a partir do OBS COD (entrada "POR ONDE COMEÇAR o slot 5").
> **Nada implementado.** Este documento é o contrato: o que roda local, o que vai para o Gemini,
> o que o código decide, e o texto dos prompts.

---

## 0. As três regras que este desenho obedece

1. **Só se pergunta ao Gemini o dado que é necessário.** Nunca o que o URBIS calcula, gera,
   busca no Cadastro Imobiliário, já tem por valor padrão, ou que um filtro do MAC derrubou.
2. **A IA extrai; o código conclui.** A IA nunca diz "confere" / "não confere". Ela devolve valor
   declarado + trecho literal de prova. A aritmética é do URBIS — se a IA calcular, ela erra em silêncio.
3. **Dúvida = não preencher.** "Sem dado" é o estado padrão, não o plano B.

---

## 1. Etapas da leitura

| Etapa | Onde roda | Custo | O que faz |
|---|---|---|---|
| **E0 — Varredura** | local, sem IA | zero | Lista a pasta e subpastas, calcula hash, extrai camada de texto, conta páginas |
| **E1 — Catálogo** | Gemini, 1ª página | baixo | Diz **o que é** cada arquivo, pelo conteúdo, e qual revisão |
| **E2 — Extração dirigida** | Gemini, só nos tipos úteis | médio | Colhe **só** as chaves ainda vazias que aquele tipo de documento pode responder |
| **E3 — Conferência** | local, sem IA | zero | Normaliza, refaz a aritmética, confronta declarado × calculado |
| **E4 — Diff + aceite** | tela | zero | Mostra o que mudou desde a rodada anterior; o analista aceita em bloco |

Este documento fecha **E0 e E1**. E2 em diante ficam esboçados no fim.

---

## 2. E0 — Varredura local (sem IA)

Para cada arquivo da pasta e de cada subpasta:

```
rodada      = 1 se está na raiz; 2,3,4… na ordem das subpastas (a pasta É a rodada)
nomeArquivo = como veio (só pista, nunca fonte de verdade)
hash        = SHA-256 do arquivo inteiro
paginas     = contagem
textoCamada = pdftotext -layout   (vazio ⇒ PDF escaneado, ver regra abaixo)
imagens     = objetos de imagem embutidos (dimensões e contagem)
```

**Regras que já se resolvem aqui, sem gastar nada:**

- **Hash igual ao de uma rodada anterior ⇒ o arquivo não vai para o Gemini.** Herda tipo e
  extração da rodada em que foi lido. Numa REV04 normalmente só a prancha mudou; os outros
  8 PDFs não precisam ser reenviados.
- **`textoCamada` vazio e há imagem grande ⇒ documento escaneado.** O sistema **avisa** e trata
  como leitura de menor confiança. Nunca finge que leu.
- **`textoCamada` é o guarda-chuva contra alucinação.** Todo número que a IA relatar em E2 tem
  que existir literalmente aqui (após normalização). Se não existir, o valor é **descartado antes
  de chegar ao analista** e vira alerta de leitura, não pendência do projeto.

### O nome do arquivo vale na raiz e não vale na subpasta

Regra do Fábio, 26/07/2026: *"os iniciais são sempre esses, mas quando começam a vir as correções
perdem os padrões"*. No SEI os iniciais ocupam os slots fixos de **Documentos Obrigatórios** e as
revisões caem em **Anexos do Contribuinte**, com nome tipo `ARQ.APROVACAO.20260430.REV04.pdf`.

Então o tratamento é assimétrico:

| | Rodada 1 (raiz) | Rodada 2+ (subpasta) |
|---|---|---|
| Nome do arquivo | **pista forte** | sem valor para identificar |
| Papel esperado | pré-atribuído pelo nome | só o conteúdo decide |
| Divergência nome × conteúdo | **alerta ao analista** | esperado, ignora o nome |

### Os 10 Documentos Obrigatórios da rodada 1

Lista oficial dos slots fixos do SEI (confirmada pelo Fábio em 26/07/2026):

| # | Slot no SEI | Papel | Na amostra |
|---|---|---|---|
| 1 | ART de caixa de recarga | `art_caixa` | ✅ (mesma folha da execução) |
| 2 | ART de execução | `art_execucao` | ✅ |
| 3 | ART do projeto de arquitetura | `art_projeto` | ✅ |
| 4 | Certidão de Matrícula (proprietário) e Interessado (relação jurídica com o imóvel) | `certidao_matricula` | ✅ |
| 5 | Declaração de Responsabilidade | `declaracao` | ✅ |
| 6 | Documentos da Pessoa Física/Jurídica | `documentos_pessoais` | ✅ (escaneado) |
| 7 | **Projeto em DWG/DXF** | `projeto_cad` | ❌ **ausente** |
| 8 | Projeto em PDF | `projeto` | ✅ |
| 9 | Requerimento | `requerimento` | ✅ |
| 10 | Uso do Solo Aprovação de Projeto | `uso_solo` | ✅ |

### Documentos que entram no catálogo e NÃO são lidos

Regra do Fábio, 26/07/2026: os **Documentos da Pessoa Física/Jurídica** (slot 6) e a **Declaração
de Responsabilidade** (slot 5) *"podem ser ignorados"*. Fundamento no OBS COD: legitimidade,
relação jurídica com o imóvel e PF × PJ são escopo da **CHEADV**, que já aprovou a parte
documental antes do processo chegar ao analista; e a responsabilidade técnica é do autor, que a
declara e responde por ela.

Consequência: `documentos_pessoais` e `declaracao` são registrados como **presentes** e **nunca
são enviados ao Gemini**. Não é economia pequena: são 5 das 25 páginas da pasta de amostra, e
entre elas está o único PDF escaneado (2 páginas, zero caracteres de texto), o único que exigiria
visão — o modo mais caro de leitura. O documento mais caro de ler é justamente o que não
interessa ao escopo dele.

Conta fechada na amostra: 25 páginas na pasta → 5 ignoradas por escopo → 1 economizada porque a
ART de execução e a de caixa são o mesmo arquivo → **19 páginas no máximo**, e o catálogo (E1),
lendo só a 1ª página de cada arquivo distinto que se lê, custa **6 páginas**.

Isso cria uma terceira classe no catálogo, ao lado de "lido" e "ausente":

| Classe | Vai ao Gemini | Exemplo |
|---|---|---|
| **Lido** | sim, dirigido | prancha, ART, Uso do Solo, certidão, requerimento |
| **Só presença** | nunca | `documentos_pessoais`, `declaracao`, `projeto_cad` |
| **Ausente** | — | vira pendência de despacho |

Dos 10 slots obrigatórios, **7 se leem e 3 só se conferem**.

**O slot 7 é o único obrigatório que o URBIS nunca vai conseguir ler** (os do slot 6 ele conseguiria,
mas não deve). Consequências para E0:

- A pasta **não é só de PDFs**. O varredor tem que aceitar `.dwg` e `.dxf`, e reconhecê-los pela
  extensão — é o único caso em que a extensão decide, porque não há conteúdo legível para consultar.
- `projeto_cad` **nunca vai para o Gemini**, em nenhuma rodada. Não tem camada de texto, não tem
  carimbo legível, não tem data de emissão. Mandá-lo seria queimar cota para receber lixo.
- Dele o sistema guarda **só hash, nome e rodada**. Verificação possível: existe, e mudou desde a
  rodada anterior. Nada além disso — em particular, o URBIS **não** tem como conferir se o DWG
  corresponde ao PDF entregue, e não deve fingir que confere.
- Versionamento sem `dataDocumento`: o desempate cai direto para rodada maior. É a exceção
  declarada à regra de "mais recente emitido vence", porque não há data emitida a consultar.
- **Ausência dele é pendência da rodada 1**, detectada de graça pela lista acima — exatamente o que
  aconteceu na pasta de amostra.

Três coisas que a raiz padronizada dá de graça, antes de qualquer chamada de IA:

1. **Ausência vira pendência sem custo.** Conjunto esperado − conjunto presente = documentos que
   faltam. Não precisa ler nada para saber que não tem Uso do Solo na pasta.
2. **Roteamento direto.** `ART PROJETO.pdf` já vai para a leitura de ART sem uma rodada de
   classificação antes.
3. **Divergência nome × conteúdo é sinal, não ruído.** Na raiz, um arquivo chamado `USO DO SOLO.pdf`
   cujo conteúdo é outra coisa quase sempre significa anexação errada no SEI. Vale alertar. Na
   subpasta, o mesmo fato não significa nada e não deve gerar aviso.

**O nome nunca vira dado, só roteiro.** Em particular o `AAAAMMDD` do nome do anexo é data de
juntada no processo, não de emissão do documento — pode entrar como último desempate no código,
jamais preencher `dataDocumento`. A instrução do prompt de ignorar data de nome de arquivo
continua valendo integralmente.

---

## 3. E1 — Catálogo: o prompt de leitura da pasta

### Contrato de chamada

- **Uma chamada por arquivo novo** (hash inédito). Não é uma chamada por pasta: por arquivo o
  resultado fica colável no hash e reaproveitável entre rodadas.
- Envia-se **só a 1ª página** (e a 2ª quando a 1ª não conclui). O tipo do documento se decide no
  cabeçalho/carimbo — mandar a prancha inteira de 3,5 MB para descobrir que é uma prancha é
  desperdício, porque o Gemini cobra PDF **por página**.
- O nome do arquivo entra como **pista**, nunca como resposta: a revisão chega como
  `ARQ.APROVACAO.20260430.REV04.pdf`, que não diz que é a prancha.

### Prompt (chave `P1_TRIAGEM`, assunto `slot_05`)

```
Você é um servidor da Secretaria de Planejamento Urbano de Goiânia responsável por PROTOCOLAR
documentos de um processo de APROVAÇÃO DE PROJETO. Sua única tarefa nesta etapa é dizer O QUE É
o documento que está sendo enviado. Você NÃO analisa o projeto, NÃO confere medidas, NÃO calcula
e NÃO aponta irregularidade nenhuma. Isso é feito depois, por outra etapa.

Você recebe UM documento por vez.

===== COMO DECIDIR O TIPO =====

Decida pelo CONTEÚDO do documento — pelo título, pelo cabeçalho do órgão emissor, pelo carimbo,
pela estrutura da página. O nome do arquivo é apenas uma pista fraca e frequentemente errado:
uma revisão de prancha costuma chegar com nome genérico (ex.: ARQ.APROVACAO.20260430.REV04.pdf).
Se o conteúdo contradiz o nome do arquivo, o CONTEÚDO vence.

**UM DOCUMENTO PODE TER MAIS DE UM PAPEL.** Uma única ART costuma registrar, na mesma folha,
a atividade da edificação E a das águas pluviais — o mesmo arquivo responde então por
`art_execucao` e `art_caixa` ao mesmo tempo. Por isso a resposta é uma LISTA de papéis, nunca um
rótulo só. Devolva todos os papéis que o documento efetivamente exerce.

Papéis possíveis (use exatamente estas chaves):

  projeto             Prancha do projeto arquitetônico. Reconhece-se pelo CARIMBO (selo com
                      proprietário, endereço, quadra/lote, áreas, responsável técnico, escala,
                      número da prancha e revisão) e por plantas, cortes, fachadas e situação.
  art_projeto         ART que registra a ELABORAÇÃO DE PROJETO — arquitetônico,
                      estrutural, de instalações. Verbo "projeto"/"elaboração", não "execução".
  art_execucao        ART que registra a EXECUÇÃO / direção / construção da obra da edificação.
  art_caixa           ART que registra atividade de ÁGUAS PLUVIAIS, DRENAGEM ou SANEAMENTO —
                      a caixa de recarga / ICCAP / rede e captação de águas pluviais. Costuma vir
                      medida em METROS CÚBICOS, enquanto a edificação vem em metros quadrados.
  uso_solo            Certidão / Consulta de Uso do Solo emitida pelo Município, com número do
                      documento, unidade territorial, atividades e parâmetros urbanísticos.
  certidao_matricula  Certidão de matrícula do imóvel emitida por Cartório de Registro de Imóveis.
  requerimento        Requerimento / formulário de solicitação de aprovação de projeto assinado
                      pelo interessado.
  declaracao          Declaração assinada por profissional ou interessado (acessibilidade,
                      responsabilidade, veracidade). Informe no campo "assunto" qual é o teor.
  documentos_pessoais Documentos de identificação do interessado ou representante: RG, CPF, CNH,
                      contrato social, procuração, comprovante de endereço.
  projeto_cad         Arquivo de desenho CAD (.dwg / .dxf). NUNCA chega até você — é identificado
                      pela extensão, fora desta etapa. Listado aqui só para o vocabulário ficar completo.
  corredor_viario     Certidão de corredor viário.
  outorga_onerosa     Documento de outorga onerosa do direito de construir (OODC).
  decea_comaer        Manifestação do Comando da Aeronáutica / DECEA / AGA.
  tdc                 Transferência do Direito de Construir.
  smm                 Documento da Secretaria de Mobilidade / estudo de tráfego / baia.
  demolicao           Documento referente a demolição.
  memorial            Memorial descritivo ou de cálculo apresentado em separado da prancha.
  comprovante_taxa    Guia, DARE ou comprovante de pagamento de taxa.
  despacho_urbis      Despacho, parecer ou laudo emitido pela própria Prefeitura neste processo.
  outros              Não se encaixa em nenhum acima, OU você não tem certeza.

===== REGRA ABSOLUTA — DÚVIDA VIRA "outros" =====

Se você não reconhecer o documento com certeza, responda papeis ["outros"] e confianca "baixa".
NUNCA escolha um papel por eliminação, por parecer provável ou por causa do nome do arquivo.
Um documento classificado errado contamina toda a análise seguinte; um documento classificado
como "outros" apenas pede a atenção do analista. O segundo erro é barato, o primeiro não é.

As ART de projeto, de execução e de caixa de recarga são visualmente idênticas: o que as
distingue é EXCLUSIVAMENTE o quadro de ATIVIDADE TÉCNICA (na ART do CREA, seção "4. Atividade
Técnica"; no formulário do CAU, as linhas "Grupo:" / "Atividade:"). Se esse quadro não estiver legível,
responda papeis ["art_indefinida"] com confianca "baixa" — não chute qual delas é.

===== QUADRO DE ATIVIDADE TÉCNICA (só para ART) =====

Quando o documento for ART, transcreva o quadro de atividade técnica LINHA POR LINHA, do
jeito que está escrito. Cada linha tem uma descrição, uma quantidade e uma unidade. Exemplos reais:

  "EXECUCAO EDIFICIO DE ALVENARIA PARA FINS COMERCIAIS   365,83  METROS QUADRADOS"
  "EXECUCAO REDE DE AGUAS PLUVIAIS                         2,32  METROS CUBICOS"
  "Atividade: 1.1.2 - Projeto arquitetônico | Quantidade: 365,83 | Unidade: metro quadrado"

Transcreva TODAS as linhas, mesmo as que você julgar irrelevantes. É desta transcrição que saem
os papéis do documento e as quantidades que o URBIS vai confrontar com a prancha. Não some, não
converta unidade, não arredonde, não traduza: copie o número exatamente como impresso, com a
vírgula decimal como está.

Informe também, em "declaracaoAcessibilidade", true se o documento contiver declaração expressa
de atendimento às regras de acessibilidade (no formulário do CAU costuma ser a seção "3.1.5 Declaração
de Acessibilidade"). Caso contrário false. Não julgue se a declaração procede — só se ela existe.

===== O QUE MAIS EXTRAIR (e só isso) =====

1. numeroDoDocumento — o número do PRÓPRIO documento, quando ele tem um:
   número da ART, número do Uso do Solo, número da matrícula, número do despacho.
   Copie exatamente como está escrito, sem tirar nem pôr pontuação. Se não houver, null.

2. revisao — a identificação de revisão da prancha, quando aparecer no carimbo
   (ex.: "REV00", "R04", "REVISÃO 04"). Copie literalmente. Se não houver, null.

3. dataDocumento — CAMPO MAIS IMPORTANTE DESTA ETAPA. A data de EMISSÃO impressa no próprio
   documento, no formato DD/MM/AAAA. É ela que decide qual versão prevalece quando o processo
   tiver dois documentos do mesmo tipo, então procure-a com atenção:
     - na prancha: no carimbo, junto da revisão;
     - na ART: data de registro ou de emissão do formulário;
     - no Uso do Solo e nas certidões: data de expedição;
     - no requerimento e nas declarações: data ao lado da assinatura.
   Se houver mais de uma data (elaboração, revisão, registro), devolva a MAIS RECENTE que se
   refira à emissão deste documento, e diga em "prova" a qual delas ela corresponde.
   NÃO use data de metadado do arquivo, nem data contida no nome do arquivo, nem data de
   protocolo no processo. Se não houver data impressa e legível, devolva null — null é uma
   resposta correta, uma data inventada corrompe a escolha da versão vigente.

4. assinado — true somente se houver assinatura visível (manuscrita, digitalizada ou bloco de
   assinatura eletrônica com nome e carimbo de validação). Caso contrário false.

5. legivel — false se a página estiver ilegível, cortada, girada de forma que impeça a leitura,
   ou for uma digitalização de qualidade ruim.

NÃO extraia áreas, índices, medidas, nomes, endereços, CNAE nem qualquer parâmetro do projeto.
Isso é da próxima etapa, e pedir aqui só aumenta a chance de erro.

===== PROVA OBRIGATÓRIA =====

Para o tipo e para cada valor extraído, copie em "prova" um trecho LITERAL do documento que o
sustenta — as palavras exatas, sem reescrever, sem resumir, sem corrigir. Se você não consegue
copiar um trecho que sustente o valor, o valor é null.

===== SAÍDA =====

Responda APENAS com JSON válido. Sem markdown, sem cercas de código, sem texto antes ou depois.

{
  "papeis": ["string", "..."],
  "confianca": "alta | media | baixa",
  "prova": "trecho literal que identifica o documento",
  "assunto": "string ou null — só para papel declaracao ou outros: do que trata, em até 8 palavras",
  "atividades": [
    { "descricao": "literal", "quantidade": "literal", "unidade": "literal" }
  ],
  "declaracaoAcessibilidade": false,
  "numeroDoDocumento": "string ou null",
  "revisao": "string ou null",
  "dataDocumento": "DD/MM/AAAA ou null",
  "assinado": true,
  "legivel": true,
  "observacao": "string ou null — só se houver algo que o analista precise saber sobre a LEITURA
                 deste arquivo (página girada, carimbo cortado, documento aparentemente incompleto).
                 Nunca observação sobre o mérito do projeto."
}
```

### Contrato de saída (o que o código faz com isso)

```ts
type CatalogoItem = {
  rodada: number;
  nomeArquivo: string;
  hash: string;
  paginas: number;
  temCamadaTexto: boolean;
  papeis: string[];                 // um arquivo pode exercer vários
  atividades: { descricao: string; quantidade: string; unidade: string }[];
  declaracaoAcessibilidade: boolean;
  confianca: "alta" | "media" | "baixa";
  prova: string;
  numeroDoDocumento: string | null;
  revisao: string | null;
  dataDocumento: string | null;
  assinado: boolean;
  legivel: boolean;
  observacao: string | null;
};
```

Regras de código sobre o catálogo:

- **Um PAPEL, um vencedor — e o vencedor é o EMITIDO MAIS RECENTEMENTE.** (Regra do Fábio, 26/07/2026.)
  Havendo dois ou mais documentos exercendo o mesmo papel, em qualquer rodada, vale a **última versão
  emitida**. O desempate corre por papel, não por arquivo: uma ART que exerce `art_execucao` e
  `art_caixa` pode continuar vigente num papel e ser substituída no outro.
  A escada de desempate, nesta ordem:

  1. **`dataDocumento` maior** — a data impressa no próprio documento. É o critério, não um proxy dele.
  2. Datas iguais ou ausentes ⇒ **`revisao` maior** (REV04 > REV00).
  3. Sem data e sem revisão ⇒ **rodada maior** (a subpasta é posterior à raiz).
  4. Empate ainda ⇒ **pergunta ao analista**. Nunca desempata por ordem alfabética do arquivo — é
     exatamente o defeito que existe hoje em `ProcessoClient.tsx:682`, onde o primeiro arquivo do
     seletor define o valor.

  **A data manda mesmo contra a rodada.** Se uma subpasta trouxer uma prancha emitida ANTES da que já
  está no processo, a antiga não substitui a nova — e o sistema **alerta**, porque isso quase sempre
  significa que o requerente reenviou arquivo desatualizado por engano. Silenciar aqui seria deixar o
  projeto retroceder de versão sem ninguém ver.

  Consequência para E1: `dataDocumento` deixa de ser um campo acessório e passa a ser **o eixo do
  catálogo**. Quando ele vier null ou ilegível em um tipo que tem duplicata, isso é pendência de
  leitura e vai para a tela de aceite — não se resolve por conta própria.
- **`confianca: "baixa"` ou `legivel: false` nunca alimenta o LIP sozinho** — entra na tela de aceite
  marcado para conferência.
- **Ausência é informação.** Faltar `uso_solo` na rodada 1 é pendência de despacho; faltar na rodada 3
  não é — o documento continua valendo da rodada anterior.
- Quatro campos do LIP se preenchem **direto do catálogo, sem E2**:
  `numeroDeArtProjeto`, `numeroDeArtExecucao`, `numeroDeArtCaixa` e `usoDoSoloN`. Quando uma só ART
  exerce dois papéis, os dois campos recebem **o mesmo número** — está correto, não é duplicidade.
- Também saem de graça, por presença/ausência de papel no catálogo acumulado:
  `anexouArtRrtProjeto`, `anexouArtRrtExecucao`, `anexouArtRrtCaixa`, `anexouCertidaoDeCorredorViario`.
- E `artDeProjetoAtendeAAcessibilidade` / `aArtDeExecucaoAtendeA` saem de `declaracaoAcessibilidade`.
- **O quadro de atividades entrega três primitivos que o OBS COD apontava como faltando no LIP** —
  área declarada na ART de projeto, área declarada na ART de execução e volume declarado na ART de
  caixa. Eles alimentam direto as conferências `aAreaNaArtDeProjeto`, `aAreaNaArtDeExecucao` e
  `volumeConfereComOProjeto`, que hoje são pergunta e passam a ser conta.

---

## 4. Próximas etapas (esboço — a detalhar)

**E2 — Extração dirigida.** Prompt montado em tempo de execução por `lib/promptCampos.ts`, com o
conjunto de chaves = (campos do assunto) − (preenchidos) − (calculados) − (gerados) − (cadastro
imobiliário) − (derrubados por filtro do MAC). No slot 5 isso sai de 125 para ~32. Cada chave volta
com `valor` + `provaLiteral`, e o valor é descartado se a prova não existir na camada de texto.
Só se manda a um tipo de documento a chave que aquele tipo pode responder.

**Campos que faltam criar no LIP para E3 funcionar** (do OBS COD — sem eles o "confere?" não é
calculável, só perguntável): área impermeabilizada do terreno · área declarada na ART de projeto e
na de execução · volume declarado na ART de caixa · área permeável projetada · dimensões do lote na
certidão e no projeto · **altura da edificação (térreo→laje)** · alertas emitidos no Uso do Solo ·
meios de acesso vertical previstos.

**E3 — Conferência.** Três famílias: somatório interno · proporção contra parâmetro do UDS · mesmo
dado em documentos diferentes. Exige **normalização** antes de comparar (na amostra o IPTU aparece
em 3 grafias e o endereço em 4) e **tolerância de arredondamento** (78,48 + 17,75 = 96,23 e o autor
declarou 96,22 — um centavo de m² não é fraude). Conferência cuja entrada não foi verificada
**herda** o estado da entrada: sem isso o URBIS aprova o volume da caixa apoiado num número que
ninguém conferiu.

**E4 — Diff e aceite.** Snapshot do LIP por rodada; a tela mostra campo a campo o antes/depois; o
analista aceita **tudo de uma vez**. Nada entra sozinho no LIP nem no MAC.

---

## 4b. Implementado e testado — `scripts/slot5_ler_pasta.mjs`

E0 e E1 existem e rodam, **sem uma única chamada de IA**:

```bash
node scripts/slot5_ler_pasta.mjs "~/Desktop/SLOT 5"
```

Resultado na pasta de amostra: **40 dos 125 campos do LIP preenchidos** (25 lidos, 14 calculados,
1 padrão) e **12 conferências** resolvidas — 9 conferem, 1 não confere, 2 ficam em SEM DADO por
falta de primitivo. Custo de Gemini: zero.

### O que se aprendeu construindo

- **A prancha só se lê por coordenada.** Texto de CAD é posicionado, não corrido: `pdftotext -layout`
  devolve sopa. O leitor usa `-bbox-layout` e busca o valor por proximidade geométrica ao rótulo.
  Duas armadilhas concretas: o rótulo do carimbo é `ÁREA DO TERRENO ORIGINAL:` e não "terreno"
  (a palavra solta aparece em nota de acabamento, e casar com ela devolveu 4,50 m² em vez de
  572,00 m²); e a data do projeto **tem** que ser lida junto do rótulo `DATA:`, porque a primeira
  data do arquivo é de uma especificação de porta, de 2019.
- **O Uso do Solo é tabular e não se pode colapsar espaço.** Rótulo numa linha, valores na
  seguinte, colunas separadas por 2+ espaços. Normalizar espaço destrói a coluna e faz
  `tipoDeVia1` virar "Unidades Territoriais".
- **Um documento que FALA de ART não é uma ART.** A nota SEPLANH impressa na prancha diz
  "…RESPONSABILIDADE DO PROFISSIONAL QUE ASSINOU A ART / RRT DE EXECUÇÃO E PROJETO", e isso fez a
  prancha ser classificada como ART. Por isso a assinatura da prancha tem **precedência** sobre a
  da ART, e a da ART exige cabeçalho de formulário (`ART Obra ou serviço`, `Nº do RRT`), não a
  sigla solta.
- **O extrator tem que despachar pelo papel resolvido, não pelo caminho que o resolveu.** O
  requerimento não contém a palavra "requerimento" — é um formulário de campos marcados publicado
  no DOM. Ele só é identificado pela pista do nome na raiz. Na primeira versão, quem entrava por
  pista não era lido.
- **Uma primitiva errada envenena tudo o que depende dela.** Com `areaTerreno` em 4,50 m², o índice
  paisagístico deu 2138% e o aproveitamento 81×. É a dependência entre conferências que o OBS COD
  descreve, vista funcionando ao contrário.

### Achados reais na pasta de amostra

1. **Falta o Projeto em DWG/DXF** — pendência detectada sem IA, só comparando a lista de 10.
2. **A prancha está datada 15/05/2024, um ano antes da ART de projeto (16/05/2025).** Mesmo dia e
   mês, 366 dias de diferença: é ano errado digitado no carimbo, não projeto antigo. Um projeto não
   pode ser anterior à ART que o acoberta. Conferência nova, que não estava no MAC.
3. **A soma da cobertura vegetal fecha dentro da tolerância** — 78,48 + 17,75 = 96,23 contra 96,22
   declarado. Um centavo de m², absorvido pela tolerância de 0,02. Sem ela, isso viraria pendência
   em todo projeto.
4. **Área e volume batem em quatro documentos** — prancha, ART de execução, ART de projeto e
   requerimento, todos em 365,83 m² e 2,32 m³.

### Teste da mecânica de rodadas

Feito em cópia da pasta, com uma subpasta `REV01` e outra `REV02`. Os três comportamentos
esperados aconteceram:

- a rodada 2 foi identificada **pelo conteúdo** e leu `REV00` do carimbo, ignorando o `REV01` do
  nome do arquivo;
- o hash provou que a prancha voltou **byte a byte igual** — o sistema avisa que o nome anuncia
  revisão que o carimbo não confirma e que não há o que reanalisar;
- a rodada 3, trazendo documento emitido antes do vigente, disparou o **alerta de retrocesso** em
  vez de substituir.

### `art_caixa` com dois candidatos — resolvido

**Vocabulário (Fábio, 26/07/2026): "ART e RRT é a mesma coisa pra mim, pode chamar tudo de ART".**
Uma nomenclatura para fora, os dois formatos reconhecidos por dentro: o reconhecedor continua
casando o cabeçalho `Nº do RRT` do formulário do CAU, mas nada na tela, no prompt ou nos rótulos
diz "RRT".

O teste revelou que `art_caixa` tem **dois candidatos legítimos** na rodada 1: a atividade de
*projeto* de instalações pluviais (dentro da ART de projeto, 16/05/2025) e a de *execução* da rede
pluvial (dentro da ART de execução, 20/05/2025) — ambas declarando os mesmos 2,32 m³.

Constatação que decidiu a questão: **os dois números já estão em outro campo** (`numeroDeArtProjeto`
e `numeroDeArtExecucao`). Quando a atividade pluvial viaja dentro de uma ART maior, o
`numeroDeArtCaixa` não carrega informação nova — ele repete. O campo só ganha conteúdo próprio
quando existe uma ART **dedicada** à caixa.

Regra implementada, a partir do "se for o mesmo documento pra tudo sim":

1. Se houver ART cujas atividades sejam **todas** pluviais → é a ART dedicada da caixa, e vence.
2. Não havendo, o campo recebe o número da ART de **execução**, marcado na origem como
   *"repetido da ART de execução — a caixa não tem ART própria"*.

Assim o analista vê na tela que aquilo não é um terceiro documento, e o campo deixa de fingir
informação que não tem. Reversível numa linha se ele preferir a de projeto.

---

## 5. O que precisa existir antes de E1 rodar

- Ressuscitar `documentos_processo`, `lip_resultados`, o bucket `documentos` e a rota
  `/api/lip/ler-documento` — existem, estão prontos e vazios. Sem guardar arquivo não há hash
  estável nem comparação entre rodadas.
- Coluna de **rodada** e de **hash** em `documentos_processo`.
- `analises_mac.numero_analise` já conta as rodadas e já para na 5ª — é o mesmo eixo dos 5 campos
  de despacho do LIP. Amarrar, não recriar.
