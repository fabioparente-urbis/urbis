# Manual do LIP — Slot 5 (Aprovação de Projeto)

**Versão:** 1.8
**Data:** 2026-08-26
**Módulo:** LIP — Slot 5
**Autor:** Claude (sessão Cantus)

---

> ## ⛔ REGRA SUPREMA DO SLOT 5 — manuais versionados
>
> **Toda modificação, ampliação, alteração ou expansão do Slot 5 obriga a atualizar, versionar e
> datar OS DOIS manuais** — este e o seu par (`MANUAL_SLOT5_LIP.md` e `MANUAL_SLOT5_MAC.md`).
> Não é opcional e não depende de o trabalho ter tocado só um dos módulos: o manual do módulo que
> não mudou registra, na mesma data, que foi conferido e o que mudou do outro lado.
>
> Ordem obrigatória, antes de encerrar qualquer tarefa do Slot 5:
> 1. escrever o que mudou na seção certa do manual (não só no histórico);
> 2. acrescentar a linha nova em **Histórico de versões**, com versão e data;
> 3. subir o `**Versão:**` e o `**Data:**` do cabeçalho;
> 4. repetir 1-3 no outro manual.
>
> Regra declarada pelo Fábio em 2026-08-25. Registrada também no `CLAUDE.md` do repositório.

---

## 1. O que é o Slot 5

No URBIS, um **slot** é um tipo de processo — cada um com seu checklist e seus documentos
próprios. O **Slot 5** é o assunto **"Aprovação de Projeto"** (slug fixo `slot_05`, `assunto_id =
78e2f7bb-7d9e-4b66-a6b8-1fd8418361f3`). Foi ativado em 25/07/2026 por auto-clone do Slot 1
(Regularização SEI) — nasceu com 9 abas, 75 campos e 56 itens de checklist, todos idênticos
(mesmo hash) ao da Regularização, e cresceu a partir daí com trabalho específico.

**Regra que nunca muda:** renomear o slot pela tela ("Regularização SEI" → outro nome de exibição)
nunca muda o slug. `slot_05` é o identificador técnico para sempre, mesmo que o nome mostrado ao
analista mude.

O **LIP** (Leitura Inteligente de Processo) é um dos dois **módulos principais** do URBIS (o outro
é o MAC — ver [`MANUAL_SLOT5_MAC.md`](./MANUAL_SLOT5_MAC.md)). É a ficha do processo: lê os
documentos da pasta e preenche campos estruturados sobre o imóvel, o requerente, o projeto e o
trâmite. Este manual cobre o LIP como implementado hoje para o Slot 5.

---

## 2. Onde vive o LIP na arquitetura

**A tela do LIP não é isolada por slot.** `app/processo/ProcessoClient.tsx` é **um único
componente**, roteado por `app/processo/[id]/page.tsx`, que serve os 15 `assuntos` (slots) do
URBIS. Qualquer edição nessa tela — botão novo, mudança de comportamento, texto — atinge os 15
slots ao mesmo tempo, mesmo quando o pedido menciona só um. Já aconteceu de uma feature pedida "só
para o Slot 1" aparecer de graça no Slot 5, sem uma linha de código escrita especificamente para
lá — porque não existe "só a tela do Slot 1".

O que **é** isolado por slot, ao contrário da tela:

| Isolado por `assunto_id` | Compartilhado (1 arquivo/rota para os 15 slots) |
|---|---|
| `lip_prompts` (P1_TRIAGEM, P2_EXTRACAO, P3_MAC, P3_WORD) | `app/processo/ProcessoClient.tsx` (a tela) |
| `lip_abas` / `lip_campos` | Rotas `/api/lip/s2`, `/api/lip/s3` (fazem fallback ao prompt global quando o slot não tem prompt próprio) |
| `mac_checklist_modelos` / `mac_checklist_itens` | — |

Quando for pedir autorização para "mexer na tela do LIP do Slot X", formular sabendo que a mudança
sempre vale para os 15 — nunca prometer isolamento que a arquitetura não tem hoje. Isolamento de
verdade na tela seria um refactor arquitetural (separar por componente/rota por slot, ou gatear
comportamento novo atrás de `tipoUrl`/`assunto_id`), nunca feito sem pedido explícito.

**Regra de trabalho geral do URBIS**, vale para qualquer slot: só o(s) slot(s) autorizado(s)
explicitamente **na sessão atual** ficam destravados. Autorização de uma sessão anterior não vale
sozinha na próxima. O Slot 1 (Regularização SEI) tem a versão mais forte dessa regra — é
"intocável", direta ou indiretamente, sem pedido explícito nomeando "Slot 1" — porque é a base que
os outros 14 slots clonam, e porque as rotas de IA compartilhadas (`lip/s2`, `lip/s3`, `mac/p3`)
fazem fallback automático ao prompt do Slot 1 quando um slot não tem prompt próprio.

---

## 3. O pipeline de leitura — botão LER PASTA

### 3.1 Fluxo

Botão **📁 LER PASTA** no LIP do Slot 5 → `POST /api/lip/ler-pasta` → `lerPastaSlot5()`
(`lib/lerPastaSlot5.ts`) → resultado numa **proposta** dentro de um modal → **aceite em bloco** →
`POST /api/lip/aceitar-pasta` grava. Nada entra no LIP sem o analista aceitar explicitamente.

Em `ProcessoClient.tsx`, o botão é travado por slot: `ehSlot5 ? lerPasta(fs) :
aoEscolherArquivosLeitura(fs)`. Slots 1/2 caem em `lerLip()`, um caminho diferente que **não passa
pelo MHD** (ver seção 5). Isso é o motivo técnico concreto de o MHD hoje só ser alimentado pelo
Slot 5.

Na pasta de amostra medida: **45 dos 136 campos e 14 conferências preenchidos em ~3 segundos, ZERO
chamadas ao Gemini** — tudo resolvido pela camada de texto dos PDFs (`pdfjs-dist`).

### 3.2 Regras de negócio da leitura (não reinterpretar)

1. **A subpasta mais recente sempre vence** — é a correção que o requerente mandou depois. A data
   de emissão do documento é só aviso, nunca decide.
2. Documento sem substituto na rodada nova **permanece vigente** — a prioridade é por papel de
   documento, não global entre rodadas.
3. Identificação por nome de arquivo: pista **forte** na raiz da pasta (10 slots fixos do SEI),
   **último recurso** dentro de subpasta — nunca contradiz o conteúdo do documento.
4. **10º documento obrigatório = Projeto em DWG/DXF** — é o único que o URBIS nunca lê (não tem
   parser para esse formato).
5. Documentos PF/PJ e Declaração de Responsabilidade "podem ser ignorados" (fora do escopo da
   CHEADV) → o sistema só confere presença, nunca manda o conteúdo ao Gemini.
6. **"ART e RRT é a mesma coisa"** — o sistema pode chamar as duas de ART indistintamente.
7. O carimbo segue o modelo oficial da **IN 007/2024, página 522** da Coletânea Urbanística de
   Goiânia (a página 525 é o modelo da Regularização — não confundir).

### 3.3 O "Programa Atendimento"

Sistema próprio da Prefeitura de Goiânia (não é o SEI, não é do URBIS) usado no fluxo de Aprovação
de Projeto como o SEI é usado na Regularização. A tela relevante é "Analisar projeto" — traz
Licença Prévia, Data de Pagamento da Taxa Inicial, Situação e dados do imóvel. Vários campos do LIP
do Slot 5 (LICENÇA PRÉVIA Nº, DATA PAGTO. TAXA INICIAL) vêm de um print dessa tela, não da "consulta
do alvará" que o texto do campo sugere.

### 3.4 Armadilhas técnicas já custaram tempo — ler antes de mexer

- **`serverExternalPackages: ["pdfjs-dist"]`** precisa estar no `next.config` — sem isso, empacotado,
  o pdfjs não acha o próprio worker e a leitura inteira falha.
- **RLS bloqueia escrita anônima em todas as tabelas**, e o `SELECT` passa devolvendo vazio (não dá
  erro) — em rota de servidor usar sempre `lib/supabaseAdmin.ts`.
- **DDL sempre volta para o Fábio rodar**: não há CLI do Supabase nem `psql`/string de conexão no
  ambiente. Escrever a migration e pedir para ele colar no SQL Editor.
- **Agrupamento de linha do PDF segue a altura da fonte**, não um número fixo de caracteres — senão
  "R 2" e "COLETORA" se separam e a via desaparece do texto extraído.
- **A prancha só se lê por coordenada.** O rótulo da área do terreno é literalmente `ÁREA DO
  TERRENO ORIGINAL:`, e a data vem do rótulo `DATA:` — atenção, a 1ª data que aparece no arquivo às
  vezes é de 2019, de uma porta do desenho, não do projeto.
- **Uso do Solo é tabular** — não colapsar espaços ao extrair texto, senão colunas se fundem.
- **Um documento que só FALA de ART não é uma ART** — ex.: uma nota da SEPLANH cita "ART / RRT" sem
  ser o documento em si.
- **A autorização é a PRIMEIRA coisa da rota** — qualquer `return` antecipado acima da checagem de
  sessão fura a proteção.
- **`ArrayBuffer` fica "detached" depois do pdfjs ler.** `lerPastaSlot5` cataloga com pdfjs, que
  detacha o buffer recebido; se a mesma instância de bytes for reusada depois (ex.: para subir ao
  Gemini, ou para o mupdf recortar imagem), quebra com `"Cannot perform Construct on a detached
  ArrayBuffer"`. Cada biblioteca (pdfjs, mupdf) precisa da sua própria cópia dos bytes
  (`buffer.slice()`).
- **Nome de arquivo acentuado quebra header HTTP.** "Certidão", "Execução" etc. têm caractere fora
  do intervalo ByteString (0-255); enviar como `X-Goog-File-Name` para o Gemini falha com
  `Cannot convert argument to a ByteString`. Sanitizar (NFKD + strip diacríticos + troca por `_`)
  só a cópia usada no header, mantendo o nome original no resto do fluxo (log, identificação de
  papel).
- **Padrão que se repete sempre que um campo aparece vazio/errado com LER PASTA "em azul"** (cor
  que sinaliza preenchimento automático, não digitação manual): quase sempre é **regex frágil
  contra variação real de redação** do carimbo do projetista — nunca falta de dado de verdade. Vale
  extrair o texto puro do PDF (`extrairPdf`, exportada de `lib/lerPastaSlot5.ts`) antes de supor a
  causa.
- **Uma frase plausível não é prova.** Uma tentativa de detectar "elevador reservado sem instalar"
  por regex de texto ("PROJEÇÃO ESPAÇO ELEVADOR") foi derrubada olhando a planta real — o processo
  tinha elevador de verdade, "projeção" ali era termo de desenho técnico (elemento projetado na
  vista), não "reservado". Revertido. Extração de texto puro é **estruturalmente cega** para
  informação que só existe como ícone/símbolo no desenho (ex.: vaga de idoso marcada só com ícone
  "60+", sem nenhum texto ao lado — ao contrário da vaga PCD, que tem texto junto do símbolo).

---

## 4. A Matriz de Rastreabilidade

### 4.1 O que é

**A Matriz de Rastreabilidade não é documentação — é a especificação oficial de como o URBIS
decide cada campo do LIP.** Decisão explícita do Fábio (28/07/2026), faz parte da arquitetura do
sistema, não é um artefato descritivo à parte.

Para qualquer campo, a matriz tem que responder: *por que foi preenchido · de onde veio · que
regra se aplicou · que código executou · que versão da regra · como reproduzir.*

**Onde fica:**
- `lib/rastreabilidade/tipos.ts` — o vocabulário (método, regra, estados)
- `lib/rastreabilidade/lipSlot5.ts` — os 136 campos do LIP do Slot 5
- `lib/rastreabilidade/fechar.ts` — `fecharResultados()`, sintetiza o resultado que falta a partir
  da declaração
- `lib/rastreabilidade/macSlot5.ts` — os itens do checklist MAC (ver manual do MAC)
- `lib/rastreabilidade/index.ts` — registro por módulo+slot
- `versoes.lock.json` — trava de versão/hash
- `scripts/testar_rastreabilidade.mts` — teste 13/14 é a trava que garante isso como contrato (ver
  4.4); a seção MAC valida os itens do checklist + vínculos BIP/LIP no banco
- `/api/lip/aceitar-pasta` — grava o resultado real no aceite do analista
- tela `/admin/rastreabilidade` — declaração sempre visível; resultado de uma execução real ao
  buscar por processo + relatório de lacunas

### 4.2 Declaração × Resultado

Princípio central, nunca desfazer: **a matriz DECLARA o que o campo PODE ser; o MHD guarda o que
ele FOI naquele processo.** Declarar um campo como `NAO_APLICAVEL` sobreajusta à amostra que
motivou a declaração — um caso real pode reverter isso (ex.: `via2`, declarado `NAO_APLICAVEL` para
um lote comum, se aplica de verdade num lote de esquina).

**Nenhum campo desaparece.** O `set()` interno nunca sai calado: sem valor, grava
`NAO_ENCONTRADO` com o que tentou, nunca omite a linha.

### 4.3 Três estados de erro, porque a correção é diferente para cada um

- **`NAO_APLICAVEL`** — leu, aplicou a regra, concluiu que o campo não se aplica a este processo.
  Exige **evidência positiva**, nunca é o padrão por ausência.
- **`NAO_ENCONTRADO`** — o texto existe no documento, mas o padrão (regex/regra) não achou. Conserta
  o **extrator**.
- **`FONTE_ILEGIVEL`** — não há conteúdo utilizável na fonte (ex.: PDF sem camada de texto, scan
  puro). Precisa de **OCR/visão** (Grupo C, seção 4.6).

Outros conceitos do vocabulário: **Método** = como o valor é obtido (14 valores possíveis, ex.:
AUTOMATICO/CALCULADO/MANUAL/PENDENTE_VISAO). **Regra** = como o valor é validado/transformado (14
valores). Método ≠ regra — são dois eixos diferentes da mesma declaração.

**NP exige prova positiva.** Ausência de valor nunca gera `NP` ("Não Pertence") por padrão — só
quando há evidência de que o campo genuinamente não se aplica (ex.: profissional é ou arquiteto ou
engenheiro, nunca os dois; o campo do que ele NÃO é vira `NP` por exclusividade comprovada, não por
estar vazio).

**Versão = mudança funcional; hash = coerência.** Reescrever um comentário no código não sobe a
versão da regra. Mudar uma tolerância numérica, sim. Verificado em teste: mudar tolerância acusa
divergência, mudar só o comentário passa despercebido corretamente. A trava fica em
`versoes.lock.json`, atualizada com a flag `--atualizar-lock`.

**A tela lê do código, nunca de cópia** — não existe uma segunda fonte de verdade desatualizável.

**Cresce por (módulo, slot)** — Regularização e outros slots entram como novas matrizes próprias,
sem reescrever os testes nem a tela existente.

### 4.4 A trava que faz disso um contrato (teste 13/14)

`scripts/testar_rastreabilidade.mts` roda a leitura REAL contra uma amostra e compara com a
declaração. Já pegou três erros reais antes de irem para produção: cinco campos declarados como já
implementados que o leitor de fato não preenchia (foi daí que nasceu o conceito `preenchidoPor`);
`volumeExigidoDaCaixa` declarado `PENDENTE_VISAO` quando o leitor já conseguia lê-lo por texto puro
(o Grupo C nem era necessário); e `AGUARDANDO_FATO` declarado como característica do campo quando,
na verdade, é um **resultado** possível, não uma declaração.

### 4.5 Números medidos (29/07/2026, contra a pasta de amostra real)

**Declaração** (o que cada um dos 136 campos PODE ser): AUTOMATICO 87 · CALCULADO 26 ·
PENDENTE_VISAO 16 · DOCUMENTO_AUSENTE 3 · MANUAL 2 · BLOQUEADO 2 = **136**.

**Resultado da execução completa** (leitura real + fechamento + aceite simulado): ENCONTRADO 31 ·
CALCULADO 27 · NAO_APLICAVEL 33 · NAO_ENCONTRADO 5 · MANUAL 2 · DOCUMENTO_AUSENTE 3 ·
AGUARDANDO_FATO 17 · NAO_IMPLEMENTADO 16 · BLOQUEADO 2 = **136** — fecha exatamente. A única
divergência esperada entre declaração (26 CALCULADO) e resultado (27) é o campo `observacoes`:
declarado `AUTOMATICO` mas resulta sempre `CALCULADO` no aceite (é um log montado a partir de outros
dados, não texto extraído diretamente) — documentado no código e travado pelos testes 14g/14h.

*(Nota: estes números têm 27 dias na data deste manual — são o estado de fechamento dos 136,
verificado e travado por teste automatizado; não foram reconferidos ao vivo para este manual, mas o
próprio teste `testar_rastreabilidade.mts` é a garantia de que continuam batendo, porque roda a cada
mudança relevante.)*

### 4.6 Grupo C — campos lidos por visão de imagem

Alguns campos do LIP só existem como desenho, nunca como texto extraível (ex.: uma tabela dentro da
prancha, um ícone). Para esses, o URBIS tem um pipeline de leitura por imagem:

- **Rasterização**: `mupdf` (WASM, ~14MB, sem binário nativo — seguro para rodar na Vercel/Railway).
  Recortar uma região específica a 200dpi custa ~720ms e ~1,2MB; renderizar a página inteira da
  prancha A0 custa ~2,6s e ~186MB de pixmap cru — **95% descartado**. Por isso o pipeline sempre
  recorta a região específica via `Pixmap` + `DrawDevice`, nunca rasteriza a página toda.
- **O DPI certo depende do tamanho da página, não é uma constante.** A prancha é A0 (3370×2384pt) e
  a certidão é A4 — a receita de recorte especifica o alvo em **pixels na maior dimensão**, não um
  DPI fixo.
- **Cada biblioteca precisa da sua própria cópia dos bytes** (ver armadilha do `ArrayBuffer`
  detached, seção 3.4) — nunca misturar coordenadas de localização por texto (pdfjs) com recorte
  visual (mupdf); as duas não compartilham a mesma convenção de rotação/coordenada, e misturar
  produz recorte de uma região TOTALMENTE ERRADA da prancha, silenciosamente (já aconteceu:
  mostrou "PLANTA DE COBERTURA" em vez do quadro esperado).
- **Localização por texto (`mupdf.Page.search()`) é preferível a página fixa.** Localizar a âncora
  textual candidata (nunca posição/página fixa — cada processo diagrama diferente) e recortar com a
  mesma biblioteca que localizou. Medido: 132ms para localizar+recortar um bloco pequeno e nítido,
  contra ~2,6s de renderizar a página inteira.
- **Custo real medido**: primeiro campo lido por visão (`vagasPcdExigido`), modelo real: confiança
  0.95, **US$ 0,000238** por leitura, ~9s do total dominados pela chamada ao modelo (o recorte em si
  é só ~582ms). **14 campos em série ficariam em ~126s — estoura o teto de tempo de execução da
  Vercel.** Paralelizar ou tornar assíncrono é necessário a partir de ~5 campos, não antes.
- **Decisões de arquitetura do Grupo C, fixas**: a receita inteira entra no hash de cache (geometria
  + dpi + prompt + parser + modelo); resolução por alvo em pixels, nunca DPI fixo; resultado vindo
  de visão marca `origem: "inferido"` no formulário, com aviso visual e confirmação obrigatória via
  Enter (reaproveita o mecanismo de conferência que já existia para outros campos); abstenção do
  modelo → `FONTE_ILEGIVEL`, nunca um valor forçado; cache checado **antes** do orçamento (evita
  gastar limite verificando algo que já está em cache); a leitura de imagem roda **na rota**, o
  `lerPastaSlot5` continua puro (sem I/O de rede).
- **Infra reaproveitável**: `lib/visao/` (`rasterizar.ts`, `localizar.ts`, `receitas.ts`,
  `index.ts`) — pipeline de produção completo: recorte por bbox, cache por conteúdo, orçamento por
  processo/usuário, abstenção por campo, gravação em `mhd_interpretacoes_visao`. Já tem receita
  `prancha.iccap` para o campo `areaImpermeabilizada`, hoje via estratégia `VARREDURA_VISUAL` (uma
  chamada Gemini de baixa resolução para achar o quadro visualmente).
- **Estado hoje**: essa infra está ligada ao fluxo de leitura do **LIP**
  (`lerPastaSlot5.ts`) — **não** está ligada ao motor MAC (`lib/mac-motor/slot5/*`); ligar as duas é
  trabalho ainda não feito. Ver `MANUAL_SLOT5_MAC.md` para o recorte do quadro ICCAP no contexto do
  MAC, que reaproveita `mupdf.Page.search()` mas com um papel diferente (ilustração da pergunta
  assistida, não insumo para decisão automática).

---

## 5. MHD — Histórico e Documentos (módulo satélite)

O **MHD** é um dos **módulos satélites** do URBIS (a lista completa é: URBI, MAP, MRP, MDP,
tag/pilha e MHD — todo módulo novo entra automaticamente nessa lista). É a memória do que **ENTROU**
no processo — guarda o conteúdo extraído dos documentos da pasta (texto, estrutura com coordenada,
dados, versão, linha do tempo), identificado por **hash do conteúdo**, nunca por nome+data (nome e
data mentem: copiar um arquivo muda a data do arquivo, o requerente renomeia).

### 5.1 Só o Slot 5 alimenta o MHD, e só por um caminho

Hoje o MHD é alimentado **exclusivamente** pelo botão **LER PASTA** do LIP (rota
`/api/lip/ler-pasta`), e essa rota **só é acionada no Slot 5** (ver seção 3.1). Não tem relação
nenhuma com o motor do MAC (`/api/mac/slot-05/*`) — foi um erro de diagnóstico já cometido e
corrigido: MHD e o motor MAC são caminhos completamente separados.

**Ligar o MHD nos Slots 1/2 não é uma questão de "fiação" — é capacidade que falta.** O motor
`lerPastaSlot5` só sabe reconhecer os papéis de documento específicos da Aprovação de Projeto. Para
os outros slots seria preciso primeiro definir quais são os documentos típicos da pasta deles e como
identificá-los — conhecimento de negócio do Fábio, não dedutível a partir do código existente. Ele
decidiu adiar essa extensão ("não me fez falta até agora") — **pendência confirmada de novo em
25/08/2026**.

### 5.2 O modelo de dados

- `mhd_conteudos` — a extração em si, **uma vez por hash**, global entre processos (a mesma ART
  usada em dois processos diferentes não duplica o texto extraído).
- `mhd_documentos` — o documento lógico: identidade é o trio `(processo, papel, escopo)`.
- `mhd_versoes` — o **vínculo**: qual conteúdo é a versão N daquele documento lógico.
- `mhd_eventos` — a linha do tempo (inclui tipos `pendencia_aberta`/`pendencia_fechada`, que já
  existem no schema mas ainda não são emitidos por nenhum código — nasceriam do despacho, que ainda
  não gera para o Slot 5, ver `MANUAL_SLOT5_MAC.md`).

**Contagem ao vivo nesta sessão (25/08/2026)**: `mhd_conteudos` 11 · `mhd_documentos` 18 ·
`mhd_versoes` 22 · `mhd_eventos` 66.

Código: `lib/mhd.ts` (núcleo) · `lib/mhdDependencias.ts` (matriz de dependências entre campos) ·
`app/api/mhd/route.ts` · botão **HISTÓRICO DOCUMENTAL** em `ProcessoClient.tsx` · teste
`scripts/testar_mhd.mts`.

### 5.3 Decisões que não devem ser desfeitas

- **Conteúdo separado de versão.** A justificativa de fundir os dois ("é sempre 1-para-1") caducou
  quando o hash virou global: uma ART que exerce dois papéis diferentes gravaria o mesmo texto duas
  vezes se conteúdo e versão fossem a mesma coisa.
- **Conteúdo é global por hash; o VÍNCULO é do processo.** A autorização/aceite se aplica ao
  vínculo, nunca ao conteúdo — senão reaproveitar um conteúdo já conhecido vazaria texto entre
  processos diferentes.
- **`papeisTodos` ≠ `papeis`**: o conteúdo guarda TODOS os papéis que aquele documento já exerceu em
  qualquer processo; a versão usa só os papéis vigentes NESTE vínculo. Guardar a lista já filtrada
  fazia um arquivo reaproveitado da memória "esquecer" papéis que de fato exerce.
- **Conteúdo vindo da memória (já conhecido por hash) AINDA cria uma versão** no processo novo — o
  vínculo nunca pode ser pulado junto com a extração, mesmo quando a extração em si é reaproveitada.
- **A matriz de dependências EXPLICA, não pula cálculo.** A extração é incremental (só reprocessa o
  que mudou), mas a conferência roda sempre inteira, porque é aritmética local de custo
  computacional zero — não vale a pena economizar ali.
- **`extrator_versao`** registra qual versão do parser gerou cada extração — é o que diz o que
  precisa ser reextraído quando o parser melhorar, sem precisar reprocessar tudo às cegas.
- **Falha nunca é silenciosa**: cada operação registra `problemas[]`, e `gravou` só sai `true` se
  nada falhou — mais um aviso explícito no modal, para o analista nunca achar que algo foi salvo
  quando não foi.
- **Rodada é soberana** — inclusive sobre a preferência projeto-vs-execução da ART de caixa (ou
  seja, mesmo uma regra de preferência de documento cede diante de qual rodada é mais recente).

### 5.4 Desempenho medido

2ª leitura da mesma pasta (nada mudou): **todos os documentos já conhecidos, 0 páginas
reprocessadas**, ~3s contra ~14s da 1ª leitura.

Teste de correção real (2 leituras sequenciais de uma pasta que teve uma correção no meio): a
rodada 2 identifica corretamente 6 documentos já conhecidos, detecta a ART de Caixa evoluindo de v1
para v2 com 8 alterações campo a campo, recalcula 3 das 14 conferências afetadas, e mantém
Projeto/Certidão/Requerimento/UDS em v1 (não mudaram).

### 5.5 O que falta no módulo (estado real, não roadmap)

- **Migrar o log antigo**: `mdp_registros.conteudo.observacoes` guardava texto corrido, repetido
  inteiro a cada nova leitura — ainda não migrado para o formato de eventos do MHD.
- **Pendências como eventos**: os tipos existem no schema (`pendencia_aberta`/`pendencia_fechada`),
  nada os emite ainda.
- **Reprocessar a partir da memória sem os arquivos**: a estrutura com coordenadas já está
  guardada em `mhd_conteudos`, falta só a tela oferecer o botão para reconstruir sem precisar
  reenviar os PDFs.
- **Interface do módulo nunca foi verificada visualmente** (exige login real, que sessões de IA não
  têm).
- **O MHD ainda não substituiu o MDP** ("Despachos e Pareceres", outro satélite) — os dois convivem
  hoje sem uma linha do tempo unificada entre eles.

---

## 6. Coordenadas por IPTU (integração com o Mapa Fácil)

Preenche o campo `coordenadas` ("Coordenadas GPS") do LIP automaticamente a partir do IPTU,
consultando a API pública do Mapa Fácil da Prefeitura de Goiânia. Construído originalmente para
Slots 1 e 2, e herdado **de graça** pelo Slot 5 por causa da tela única do LIP (ver seção 2) — o
botão aparece em qualquer campo cuja chave seja `"coordenadas"`, sem trava de slot nenhuma.

### 6.1 A API

Camada 3 ("Cadastro Imobiário", sic — falta o "li" no nome oficial da camada) do serviço
`Feature_Base`, ArcGIS REST, pública, sem autenticação:

```
https://portalmapa.goiania.go.gov.br/servicogyn/rest/services/MapaServer/Feature_Base/MapServer/3/query
  ?f=json
  &where=UPPER(nrinscr) LIKE '%<IPTU>%'
  &outFields=*
  &returnGeometry=false
```

Devolve `x_coord`/`y_coord` em UTM 22S/SIRGAS 2000 (`outSR=31982`), mais `nmlogradou`, `nrquadra`,
`nrlote`, `nmbairro`, `areaterr`, `areaedif`, `cdzona`. O campo `ci` é o IPTU sem os 4 zeros finais.

⚠️ **O `<IPTU>` entra direto numa cláusula `where`** — sanear para só dígitos antes de montar a URL
(risco de injeção na query do ArcGIS se não sanear).

Conversão UTM→lat/lng: `utmToLatLng()` em `app/processo/ProcessoClient.tsx`, com `parseCoords()`
detectando automaticamente se o valor colado é UTM. Extraída para `lib/utm.ts`.

### 6.2 Bug de fonte corrigido: IPTU não deve vir da prancha

O prompt `P2_EXTRACAO` do Slot 1 só instruía "apenas dígitos, sem pontos/barras" para o campo IPTU,
sem dizer QUAL documento é a fonte de verdade. Resultado real observado: leu `41908106000000` de
um documento quando o correto (confirmado no Uso do Solo/Despacho CHEADV) era `41908406000000`.
Corrigido no prompt (commit `d8f0e95`, script `scripts/prompt_iptu_uso_do_solo.mjs`, Slot 1 v20→21,
Slot 2 v33→34): o IPTU deve vir do **Uso do Solo (Despacho CHEADV)**, nunca da prancha. Vale para
os dois botões de leitura (LER PROCESSO e LER ARQUIVOS INDIVIDUAIS usam o mesmo texto extraído/S3).
Prompt em produção assim que salvo no banco — não depende de deploy.

### 6.3 Decisão de UX

Botão **🗺** ao lado do campo Coordenadas (aparece mesmo com o campo vazio), não preenchimento
automático durante a leitura do PDF. Motivos: a coordenada não está literalmente no PDF (deriva do
IPTU, é uma consulta externa); se o IPTU vier errado a coordenada vem errada atrás — o analista
precisa conferir o IPTU antes de confiar na coordenada; e é quase instantâneo (~1s, sem gasto de
Gemini), sem adicionar ponto de falha ao pipeline principal de leitura.

Divergência de endereço entre o cadastro do Mapa Fácil e o LIP **nunca trava nada** — a coordenada é
preenchida sempre que o imóvel é localizado, com aviso para o analista conferir. Regra textual do
Fábio: *"o cadastro do mapa fácil com certeza deve tá desatualizado, principalmente se só o bairro
ou uma das ruas divergir... mas a palavra final sempre do analista, então o URBIS faz tudo e avisa
que deve ser verificado."* A comparação precisa normalizar formas equivalentes de escrita
("PERIMETRAL NORTE" × "AV PERIMETRAL NORTE", "QUADRA AREA" × "AREA").

### 6.4 Particularidade do Slot 5

O Slot 5 tem um campo próprio, `via2` (lote de esquina), preenchido separadamente pela leitura de
pasta via regex direto na ART (`lib/lerPastaSlot5.ts`, linhas ~421 e ~611 na versão auditada). A
comparação contra o Mapa Fácil só confronta a via principal (`logradouro`); `via2` fica fora dessa
checagem — e como divergência nunca trava nada, não há necessidade prática de ampliar isso. A
extração automática de coordenada que o Slot 5 já tinha (a partir da ART) continua intocada; o botão
🗺 é só um caminho manual adicional, não substitui a extração existente.

**Nunca testado em processo real do Slot 5** — os processos de teste no banco (`123456`, `1234567`,
`44556`) têm os campos de coordenada vazios.

---

## 7. Status dos satélites alimentados pelo LIP no Slot 5

Auditoria feita em 25/08/2026 (contra 76 processos totais no banco), depois de o Fábio perguntar se
o Slot 5 disparava para todos os módulos satélites. **Não disparava para nenhum.** Estado depois da
correção (commits `9495a7b`, `80ae535`, `5d0c690`):

| | Slot 1 | Slot 2 | Slot 5 |
|---|---|---|---|
| auditoria → **MAP** | ✅ 9 pontos | ✅ 9 | ✅ 6 |
| **MRP** · **MDP** · **tag** | ✅ | ✅ | ✅ |
| **MHD** | ❌ | ❌ | ✅ |

O **MDP** ("Despachos e Pareceres" — registro do que SAI do sistema) é de onde 16 campos
"documento emitido" do LIP se preenchem sozinhos (`lib/lipDocumentosEmitidos.ts`). Sem gravar ali,
esses campos ficam "aguardando o fato" para sempre — é a ponta final da rastreabilidade desses 16
campos específicos.

A pontuação do **MRP** é por tipo de despacho e área da obra, **nunca por slot** — um slot novo já
pontua sem precisar de configuração extra.

Ver `MANUAL_SLOT5_MAC.md`, seção de satélites, para o que o **MAC** alimenta (que é um conjunto
parcialmente diferente do que o LIP alimenta).

---

## 8. Achados reais de campos do LIP (processo 50724, mapeamento manual de 2026-08-18)

O LIP do processo 50724 (MVO Agropecuária) foi mapeado campo a campo, aba por aba, com o Fábio
narrando o processo real e comparando contra os documentos-fonte. **Está declarado FINALIZADO (14
abas)** pelo Fábio ("finalizamos o LIP, parabéns"). Resumo dos achados mais importantes — não é a
lista completa, só os que mudam entendimento sobre como o LIP decide:

### 8.1 Regra do gate de compatibilidade (bloqueia a análise inteira se falhar)

No início de qualquer análise, compara **Certidão de Matrícula (cartório) × Uso do Solo × Projeto**.
Se o endereço ou as vias não batem entre os três, ou se o **CNAE do Projeto não é subconjunto do
CNAE autorizado no Uso do Solo**, a análise para ali — não é um campo pendente isolado, é bloqueio
geral. Regra de CNAE é de **subconjunto, nunca igualdade**: o Projeto pode ter menos CNAEs do que o
Uso do Solo autoriza, nunca pode ter um CNAE que o Uso não lista.

**Achado real neste processo**: o carimbo do Projeto tem só o CNAE 471130100 (hipermercados), que
não está na lista autorizada pelo Uso do Solo — incompatibilidade de verdade. Decisão do Fábio:
**isso não trava o LIP** (o campo CNAE do LIP grava o valor do carimbo normalmente) — vira item do
MAC ("cobra atualização do Uso do Solo para essa finalidade").

### 8.2 Bug conhecido, ainda não corrigido: campo CNAE do LIP

O campo `CNAE` (aba Uso do Solo/Aproveitamento) está sendo preenchido pelo LER PASTA com a **lista
inteira do Uso do Solo** (6 códigos), quando deveria ser só o(s) CNAE(s) do **carimbo do Projeto**
(neste caso, só 471130100). Corrigir a fonte em `lib/lerPastaSlot5.ts`.

### 8.3 Bug de leitura de área (corrigido só neste processo, não em código geral)

`Área do Terreno` gravou 71,49 quando o correto é 5.071,49; `Área a ser Regularizada TOTAL` gravou
572,10 quando o correto é 3.572,10 — em ambos os casos, **perdeu os dois primeiros dígitos**. Por
causa disso, o LIP respondeu "NÃO" para a conferência de as ARTs baterem com o projeto — as duas na
verdade **conferem**. Causa raiz: `P_AREA` sem âncora aceitava só até 3 dígitos antes da vírgula
(`\d{1,3}(?:\.\d{3})*,\d{2}`); o carimbo escreve "3572,10m²" **sem** ponto de milhar, e sem
lookbehind o motor lia "572,10" a partir do 2º dígito. Corrigido com
`/(?<!\d)(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}\s*m?²?/i`, aplicado nos 2 lugares do código que tinham o
regex duplicado. **Não há script de detecção geral** para achar o mesmo padrão em outros
processos já gravados — se aparecer de novo (valor salvo não bate com o PDF atual), é esse bug já
conhecido, corrigir manual/ad-hoc.

### 8.4 Regras de campo específicas mapeadas

- **VIA 2** não é "segunda rua" — é a descrição composta de esquina ("Av. X c/ Rua Y c/ Rua Z"),
  copiada do próprio carimbo do Projeto.
- **CHEADV Nº**: o despacho mais recente vence **por número, não por data da subpasta** — se existe
  um despacho pedindo correção e depois um dizendo "documentação está correta", o que pediu
  correção é 100% ignorado, nem entra na análise.
- **RESPONSÁVEL TÉCNICO (ARQ/ENG) + CAU/CREA**: regra de **NP por exclusividade** — o profissional
  é ou arquiteto ou engenheiro, nunca os dois; o campo do que ele NÃO é vira `NP`, nunca fica
  vazio.
- **`ATENDE O PORTE ADMITIDO?`**: campo tinha uma segunda causa de vazio — só reconhecia a frase "a
  área máxima será sem limite de área"; a redação real deste Uso do Solo era "ADMITE GI-1...GI-5 SEM
  LIMITE DE ÁREA", numa linha diferente da tabela. Fallback adicionado em `lerUsoDoSolo`.
- **`dimensoesDoLoteConferemComA`**: veredito SIM/NÃO que compara certidão × planta/carimbo. Dois
  campos-fonte redundantes (`dimensoesDoLoteNaCertidao`/`dimensoesDoLoteNoProjeto`) foram removidos
  a pedido do Fábio — se o veredito já é SIM/NÃO, escrever a dimensão nua de novo não agrega nada.
- **`larguraDaVia1`/`larguraDoPasseio1`**: apareciam vazios por um bug no fallback de busca de via
  por bairro (`lib/cadastroImobiliario.ts`, `buscarVia`) — quando o nome exato do bairro não bate, a
  busca cai num `ILIKE` pela "palavra mais longa" do bairro normalizado, mas a palavra mais longa
  costuma ser a forma **expandida** de uma abreviação ("RESIDENCIAL" em vez de "RES"), e o cadastro
  real (20.524 vias) grava **abreviado**. Corrigido excluindo do critério de busca as palavras que
  são expansão de alguma abreviação conhecida (`PALAVRAS_EXPANDIDAS`).
- **Índice paisagístico (Área Permeável)**: são 3 caminhos **mutuamente exclusivos** (Opção 1 = só
  grama 15%; Opção 2 = grama 10% + não permeável até 5%; Opção 3 = só não permeável 25%, zero
  grama), decididos pelo que o carimbo mostra, não um "exigido" calculado para as 4 opções sempre. O
  valor da opção que se aplica é o **percentual alcançado**, não a área nem um exigido abstrato.
- **Área impermeabilizada + volume exigido da caixa**: fórmula confirmada no memorial do processo —
  área impermeável = área do lote **menos** área de grama (sem outros descontos); volume exigido =
  área impermeável ÷ divisor do UDS (200 m²/m³ neste caso). Isso destravou um campo que a matriz
  achava que só dava para ler por visão (Grupo C) — virou `derivado()` puro-texto.
- **Caixa de recarga (número + volume)**: carimbo às vezes só escreve "10Cxs. 22,60m³" cru, sem
  seguir o padrão "EXIGIDO"/"ATENDIDO" nem "V=X,XXm³" do modelo oficial — fallback novo cobre esse
  formato compacto.
- **VAGAS ATIVIDADES ECONÔMICAS**: decisão consciente de **não automatizar** os 9 campos — a tabela
  "AMBIENTES A SEREM DESCONTADOS" do carimbo aparece fragmentada no texto extraído (a mesma prancha
  tem o memorial da caixa sobreposto). Regra combinada com o Fábio: **risco de dar número errado
  silenciosamente é pior que deixar manual.**

### 8.5 Pendências propositalmente adiadas (perguntar antes de retomar)

1. **Ponte LIP→MAC para a área permeável virar item 19/48 do MAC automaticamente** — hoje só existe
   1 piloto genérico desse padrão (dimensões do lote, `lib/mac-motor/slot5/ponteMhd.ts`). Replicar
   para um item novo é tarefa de arquitetura, não achar rótulo errado.
2. **Leitura do memorial das caixas de retenção** (comparar carimbo × memorial × planta) — o
   memorial **não é arquivo separado**, mora na mesma prancha (sheet 1) do projeto, por isso o texto
   sai bagunçado. Achado à parte: esse memorial cita "Processo Nº 39399", diferente do processo real
   (50724) — erro de template reaproveitado, vale mencionar ao Fábio.
3. **Vaga de idoso por imagem** (ícone "60+" sem texto) — precisa de leitura visual (Grupo C).
4. **`atendeAcessibilidade`**: o Fábio pediu valor padrão sempre "NÃO", virando "SIM" automaticamente
   só quando o laudo é emitido, nunca sobrescrevendo um "SIM" já existente. **Só a metade "NÃO" foi
   implementada** (`valor_padrao` do campo em `lip_campos`) — a metade "muda para SIM ao emitir o
   laudo" não dá para fazer ainda: **o Slot 5 não tem geração de laudo construída** (ver
   `MANUAL_SLOT5_MAC.md`).
5. Ponte para `T.D.C.`/`Demolição`/`DECEA-AGA` com a lógica real (onerosa→TDC, casa averbada→
   demolição, zona aeroporto→COMAER) em vez do `NP` incondicional atual.
6. **Campo de observação por item do LIP** (por aba, não por item) — decisão nunca fechada. *(O MAC
   já ganhou observação por item — ver `MANUAL_SLOT5_MAC.md`, seção da observação por item.)*

### 8.6 Excel de restore com rótulos antigos — não confiar sem conferir

Existe um mecanismo de export/import do LIP (`app/api/processo/exportar-lip` /
`app/api/processo/importar-lip`, formato `Aba`/`Campo`/`Valor`) confirmado funcionando (casa por
aba+rótulo, mescla sem apagar o resto do processo). Mas um arquivo específico encontrado usa
nomenclatura **antiga** ("Proprietário", "Processo SEI", aba "1. Identificação") que não bate com
os nomes atuais ("INTERESSADO", "PROJETO Nº", aba "INÍCIO"). Como o importador casa por texto exato
do rótulo, um import direto desse arquivo específico deixaria a maioria das linhas "não
encontrado". **Nunca testado de propósito.** Antes de confiar num restore desse tipo de arquivo:
comparar rótulo a rótulo com os nomes atuais das abas/campos do Slot 5.

---

## 9. Segurança — pendência conhecida, agravada pelo Grupo C

O cookie de sessão `urbis_id` (`lib/autorizacao.ts`) é um **UUID cru sem assinatura** — gravidade
alta, não corrigido. Um teste automatizado de validação chegou a tentar forjar esse cookie contra
uma rota real; o modo automático bloqueou corretamente a tentativa, confirmando que hoje não há
verificação/assinatura nenhuma protegendo esse valor.

**Por que isso piora com o Grupo C especificamente**: hoje a leitura do Slot 5 não gasta IA "à
vontade" — o analista pode chamar LER PASTA quantas vezes quiser sem custo direto por chamada
relevante. Assim que a leitura por visão (Grupo C) virar uso comum, cada campo lido por imagem
**custa dinheiro de verdade** (a chamada ao modelo). Um cookie forjável atrás de um endpoint que
gasta dinheiro é um risco concreto, não teórico — a trava de orçamento do Grupo C precisa ser por
usuário/processo autenticado de verdade, não a trava genérica de "50/hora" que hoje protege outra
rota (`s3`) de forma mais simples.

---

## 10. Glossário

| Termo | Significado |
|---|---|
| **LIP** | Leitura Inteligente de Processo — a ficha do processo, lê documentos e preenche campos |
| **MAC** | Módulo de Análises e Conformidades — o checklist (ver manual próprio) |
| **Slot** | Um tipo de processo, com checklist e documentos próprios (Slot 5 = Aprovação de Projeto) |
| **Matriz de Rastreabilidade** | Especificação oficial de como cada campo do LIP/MAC é decidido |
| **Declaração** | O que um campo PODE ser, segundo a matriz (não muda por processo) |
| **Resultado** | O que um campo FOI, numa execução real contra um processo específico |
| **Método** | Como um valor é obtido (AUTOMATICO, CALCULADO, MANUAL, PENDENTE_VISAO, etc.) |
| **Regra** | Como um valor é validado/transformado, eixo independente do método |
| **NAO_APLICAVEL** | O campo não se aplica a este processo — exige evidência positiva |
| **NAO_ENCONTRADO** | O texto existe mas o extrator não achou — bug de regex/regra a corrigir |
| **FONTE_ILEGIVEL** | Sem conteúdo utilizável na fonte — precisa de leitura por visão |
| **NP** | "Não Pertence" — por exclusividade comprovada, nunca por campo vazio |
| **AGUARDANDO_FATO** | Resultado (não característica) — o sistema sabe que precisa do dado, ainda não tem |
| **Grupo C** | O grupo de campos lidos por visão de imagem (mupdf + Gemini), não por texto puro |
| **MHD** | Histórico e Documentos — módulo satélite, memória do que ENTROU na pasta, por hash |
| **MDP** | Despachos e Pareceres — módulo satélite, registro do que SAIU (documentos emitidos) |
| **BIP** | Biblioteca Inteligente para Pesquisas — biblioteca de leis com busca semântica |
| **CHEADV** | Chefia da Advocacia Setorial — origem de um despacho anexado pelo interessado |
| **"Programa Atendimento"** | Sistema próprio da Prefeitura para Aprovação de Projeto (não é o SEI) |

---

## 11. A noite do 48533 e do 48535 — 26/08/2026

Dois processos cadastrados de madrugada, LER PASTA rodou "ridiculamente rápida e fraca", e o
analista excluiu os dois achando que o sistema não tinha lido nada. Os dois foram restaurados (era
exclusão lógica) e a causa foi encontrada. Vale como referência do que investigar quando a leitura
voltar pobre.

### 11.1 O que NÃO era

- **Não era PDF escaneado.** A prancha do 48535 é vetorial: 11 fontes embutidas, 2.930 caracteres
  de texto real, 42.267 traços. A camada de texto existia.
- **Não era o MHD.** Os 8–9 documentos foram catalogados com o papel certo e o texto vigente
  gravado (~29 mil caracteres cada).
- **Não era a visão.** `mhd_interpretacoes_visao` está vazia desde sempre, mas ela cobre 4 campos
  só (3 de vagas + área impermeabilizada) e nunca teve nada a ver com o carimbo. Como o Fábio
  observou na mesma noite, esses 4 nem precisariam de imagem: o memorial de cálculo é texto.

### 11.2 O que era — três defeitos somados

1. **`m2` com o dígito dois.** O carimbo do 48535 escreve `524,70m2`; o leitor exigia `m²`, o
   caractere de expoente. Os cinco campos obrigatórios do carimbo (área do terreno, área
   construída e as três de cobertura vegetal) voltavam `NAO_ENCONTRADO`. `P_AREA`, a área do
   carimbo, o ICCAP e o volume da caixa passaram a aceitar as duas grafias.
2. **`proprietario` sem fonte possível.** A matriz declara o campo como vindo do REQUERIMENTO,
   mas o requerimento é `SO_PRESENCA` e nada o abria — o campo mais visível da ficha nunca pôde
   ser preenchido por leitura (no 50724 está gravado como `manual`). A regra do Fábio é que o
   requerimento **não é importante** para a análise técnica, não que seja proibido lê-lo: agora
   se lê dele UMA coisa, o nome do interessado, e a ausência continua não sendo cobrada.
   O padrão antigo ainda exigia nome e CPF na mesma linha e em Caixa Alta e baixa; passou a
   aceitar CNPJ, CAIXA ALTA e o número na linha de baixo do nome.
3. **Autor do projeto em outro formato.** O padrão era `ARQ. NOME CAU: xxx`; a prancha escrevia
   `Arquiteta e Urbanista - NOME - CAU-GO xxx`. Os dois valem.

Resultado medido contra as pastas reais:

| campo | antes | depois |
|---|---|---|
| areaTerreno 48535 | ✘ | 524,70 |
| areaTotal 48535 | ✘ | 327,80 |
| proprietario 48535 | ✘ | OMEGA PARTICIPAÇÕES E INVESTIMENTO LTDA |
| nome_responsavel_arq 48535 | ✘ | MARCILENE SALES DIAS AMORIM |

### 11.3 O que continua sem leitura, honestamente

No **48533**, `proprietario` e `nome_responsavel_arq` seguem vazios — e devem seguir. O
requerimento dele é o modelo do DOM com AcroForm de 1 campo, 0 preenchidos, sem CPF/CNPJ no texto;
a prancha não traz o nome do arquiteto em lugar nenhum (só o contato da plotagem). O dado não
existe no PDF. Uma tentativa de plano B pelo carimbo devolveu "SECRETARIA MUNICIPAL DE
EFICIÊNCIA-SEFIC" como proprietário e foi **descartada**: nome errado num campo que vai assinado
no despacho é pior que campo vazio.

### 11.4 A leitura não pode mais ser rápida e muda

Duas defesas novas na janela da proposta, antes de tudo, em destaque:

- **documento sem camada de texto** — lista qual é, com quantos caracteres, e o que fazer;
- **carimbo incompleto** — quando a prancha tem texto mas não entregou os campos obrigatórios, o
  detalhe da conferência sobe para o topo em laranja. A informação já existia; estava enterrada
  numa lista de dezenas de conferências que ninguém lê de madrugada.

O log da OBS registra os dois casos junto com a leitura.

---

## 12. O motor de cruzamento — declarado × entregue (26/08/2026, madrugada)

### 12.1 A regra

Ditada pelo Fábio: *"o ATENDIMENTO tem tudo mas tem que cruzar, pra saber se o ATENDIMENTO tá
errado ou se os documentos do processo tão errados e cobrar no MAC"*.

O **ATENDIMENTO** (print da tela do Alvará Mais Fácil) é o que o requerente **declarou**. Os
documentos da pasta são o que ele **entregou**. Analista de projeto confere se batem.

O modelo anterior — cascata de fontes, "se a prancha falhar pega do ATENDIMENTO" — estava errado
em espírito e foi corrigido: ele pegava a primeira fonte e calava, **escondendo justamente a
divergência que é a exigência**.

### 12.2 Como funciona

Cada campo coleta TODAS as fontes que o têm e compara, normalizando acento, plural e formatação
de número (`PARTICIPAÇÕES` = `PARTICIPACOES`; `327,80` = `327.8`). Dois campos novos aparecem na
ficha quando há o que cobrar:

- **`divergenciasEntreDocumentos`** — as fontes discordam
- **`declaradoMasNaoEntregue`** — consta na declaração e falta no documento obrigado a trazer

O sistema **não decide quem errou**: mostra "prancha diz 327,80 · ATENDIMENTO declara 345,05" e
manda cobrar. A decisão é do analista; o que não pode é passar batido.

Achados reais na primeira execução (processo 48535): área construída divergindo em 17 m² entre a
prancha e a declaração, contratante da ART sendo **outra empresa** (`FARMÁCIA YANOMELO LTDA`
contra o requerente `OMEGA PARTICIPAÇÕES`), e número de ART declarado diferente do entregue.

### 12.3 O que tornou o cruzamento possível

**Texto corrido.** `extrairPdf` passou a devolver, além do texto agrupado por linha, o texto na
**ordem em que o PDF emite os itens**. Tabela separa rótulo e valor em células: no ATENDIMENTO o
cabeçalho "ART" fica numa linha e os números noutra; na ART do CREA o "ART Obra ou serviço" e o
número caem em células diferentes. A regex não casava com o dado **presente** no documento. Custo
zero — é o mesmo array de itens. Atenção: **não reordenar** por posição, é a ordem de emissão que
mantém rótulo e valor juntos.

**Leitor do ATENDIMENTO** (`lerAtendimento`). Traz proprietário, endereço (com quadra e lote),
IPTU, área do terreno, área a construir, responsável técnico, CAE, situação, licença prévia, data
de pagamento da taxa, números de ART declarados e vagas exigidas/atendidas com PCD.

**ART** passou a entregar profissional, título, contratante e proprietário — e o número no formato
do CREA (`ART Obra ou serviço 1020260027990`).

### 12.4 Monitor IA — dois anéis lado a lado

O anel único respondia "do que está preenchido, quanto veio do sistema" — e marcava 100% com
metade da ficha vazia. Agora são dois círculos iguais, lado a lado:

- **do preenchido** — quanto do que está preenchido veio do sistema
- **eficiência** (azul) — **campos lidos ÷ campos que o LIP tem**. É o número que mostra se a
  leitura melhora de um processo para o outro. No 48533, depois desta noite: **81%**.

### 12.5 Limpar LIP — agora grava, e exige digitação

O botão existia e **não gravava**: fazia `setD({})`, a tela zerava e o banco não. Os campos
voltavam no carregamento seguinte como se nada tivesse acontecido. Agora persiste (`dados: {}`).

E a confirmação passou a exigir que o analista **escreva `LIMPAR`**. Apagar o LIP joga fora horas
de leitura e digitação e não tem desfazer; um clique em "Confirmar" é fácil demais de dar por
engano num modal que aparece de repente. Ter que escrever a palavra obriga a ler o que vai
acontecer. O modal também passou a dizer QUANTOS campos serão apagados.

---

## 13. Layout da aba INÍCIO — campos-chave no topo (26/08/2026)

A aba **INÍCIO** (primeira aba do LIP, `ordem=0`) tinha os campos de identificação do processo
— **Interessado** (proprietário), **Projeto Nº**, **Ordem de Serviço Nº** e **Data Pagto. Taxa
inicial** — enterrados no meio da lista (posições 8, 9, 10 e 14), depois de Via 1–4, frentes,
quadra e lote. O Fábio pediu para trazer esses quatro pro topo, antes de qualquer coisa, para
que sejam a primeira coisa que o analista vê ao abrir o LIP.

Mudança feita **só na coluna `ordem` de `lip_campos`**, direto no banco (script descartável, não
ficou no repo) — nenhum campo foi criado, renomeado ou apagado, e a mudança já vale para qualquer
processo do Slot 5 sem precisar de deploy. Ordem nova da aba INÍCIO:

1. `proprietario` — Interessado
2. `processo` — Projeto Nº
3. `processoFisico` — Ordem de Serviço Nº
4. `dataPagtoTaxaInicial` — Data Pagto. Taxa inicial
5. em diante — Via 1–4, frentes, quadra, lote, bairro, Cheadv Nº, IPTU, ARQ/CAU,
   ENG/CREA, Coordenadas GPS (ordem relativa inalterada; `licencaPrevia`, que estava aqui, foi
   removido no mesmo dia — ver seção 14)

---

## 14. Campo removido: `licencaPrevia` (26/08/2026)

Pedido do Fábio: *"Licença Prévia Nº" não tem utilidade alguma, pode ser excluído do LIP* —
mas só depois de pesquisar as consequências em todos os módulos, não só apagar.

**O que a pesquisa achou:** o campo tinha uma única fonte (regex sobre o print do ATENDIMENTO,
"Consulta Alvará NNNN NNNN" — o segundo número), passava pelo motor de cruzamento como fonte
única (nunca gerava divergência nem exigência) e **não era citado em nenhum lugar que importa**:
nenhum dos 768 itens do checklist do MAC (nem os 10 subitens do ITEM 1, "Alvará Fácil", o mais
próximo do tema), nenhum filtro em `mac_slot5_filtros`, nenhum gerador de laudo/despacho, nenhum
satélite (MDP/MHD). A única menção fora do próprio LIP era descritiva, no prompt P3 do MAC
(`promptP3.ts`), como um dos campos que a IA podia citar ao conferir o ITEM 1 — removida junto.

**O que foi feito:**
- Apagado o registro em `lip_campos` (linha da aba INÍCIO, `ordem=12`).
- Removida a chamada `emCascata("licencaPrevia", ...)` e o parser que a alimentava
  (`lerPastaSlot5.ts`) — o LIP não gasta mais ciclo escrevendo um campo que não existe na tela.
- Removida a entrada da Matriz de Rastreabilidade (`lipSlot5.ts`) e regenerado
  `versoes.lock.json` (`--atualizar-lock`) para tirar a chave órfã.
- `scripts/testar_rastreabilidade.mts` confirma banco↔matriz consistentes: 117 campos dos dois
  lados. **O "136" da seção 4 já estava desatualizado antes desta mudança** — a contagem viva
  (`CAMPOS_LIP_SLOT5.length`) era 118 antes de hoje, é 117 agora; a seção 4 é uma foto de 27+ dias
  atrás e não foi refeita aqui (fora do escopo deste pedido).

Nenhum processo já analisado perde dado: o que já estava gravado em `dados.licencaPrevia` continua
no JSON do processo, só para de aparecer na tela e de ser escrito em leituras novas.

---

## 15. O laço LIP→MAC — a divergência vira item marcado sozinho (26/08/2026)

Pendência que o próprio Fábio pediu para cobrar nesta conversa (ver a noite de 26/08, seção 11):
o motor de cruzamento (seção 12) já sabia dizer "isto divergiu" ou "isto foi declarado e não
entregue", mas isso morria num texto livre — o analista tinha que ler o campo do LIP e marcar o
item do MAC à mão. Agora uma parte disso fecha sozinha.

**O que mudou no LIP:** ao lado de `divergenciasEntreDocumentos`/`declaradoMasNaoEntregue` (texto
para o analista ler), o cruzamento agora também grava `divergenciasChaves` e
`declaradoMasNaoEntregueChaves` — a mesma informação, mas por **chave** do LIP, em formato
`|chave1|chave2|` (pipe nas duas pontas, para "processo" não bater dentro de "processoFisico").
Os quatro são campos internos: não são `lip_campos`, não têm aba, não aparecem na tela — só
existem dentro de `dados` para o motor de filtros do MAC ler. Declarados como chave fantasma em
`CHAVES_FANTASMA_LIP_SLOT5` (`lipSlot5.ts`), senão o teste de integridade (13d/14c) reclamava —
essas duas primeiras já estavam sem declarar desde a noite do cruzamento e passaram batido; foi
corrigido junto, por estar bem no meio do que eu já estava mexendo.

**O que mudou no MAC:** 8 filtros novos em `mac_slot5_filtros` (prefixo `LAÇO LIP:`), todos
`CAMPO_LIP_IGUAL` mirando um token de `divergenciasChaves`/`declaradoMasNaoEntregueChaves`, todos
`status_alvo = "nao_conforme"` — ver seção 14.10 do `MANUAL_SLOT5_MAC.md` para a lista completa e
por que só esses 8.

**Por que só 8 de ~17 chaves possíveis:** o cruzamento roda sobre 16 chaves do LIP (mais o caso
avulso de ART não entregue). Só mapeei para item do checklist os casos em que o **próprio texto
do item já cita o mesmo campo** — o ITEM 1 ("Conferir os dados informados... no Sistema Alvará
Fácil") lista literalmente "Área do terreno", "Área construída...", "Compatibilizar Nº das ARTs e
RRTs", "Vagas atendidas para comércio", "Vagas PcD": a mesma lista que o cruzamento já compara.
Ficaram de fora, **de propósito, sem inventar mapeamento**: `logradouro`, `quadra`, `lote`,
`bairro`, `proprietario`, `nome_responsavel_arq`, `dataPagtoTaxaInicial` (não há item do
checklist que confira endereço/proprietário/data contra o declarado) e
`totalDeVagasExigidasParaEssas`/`vagasPcdExigido` (o ITEM 1 só lista vagas *atendidas*, não
*exigidas*). Decidir se algum desses merece item novo, ou se um item existente serve, é
julgamento de analista — fica para o Fábio decidir, não para eu supor.

Testado com `avaliarFiltros` contra um LIP simulado (divergência em `areaTerreno` +
`numeroDeArtProjeto` + ART não entregue): os 3 filtros certos acionaram, os outros 5 não —
confirma que o delimitador por pipe não deixa uma chave bater dentro de outra parecida
(`numeroDeArtProjeto` × `numeroDeArtExecucao`/`numeroDeArtCaixa`, `areaTerreno` × `areaTotal`).
Não testado ainda com leitura real de pasta ponta a ponta — o próximo processo lido no Slot 5 é
o primeiro teste de verdade.

---

## Histórico de versões

| Versão | Data | Mudança |
|---|---|---|
| 1.0 | 2026-08-25 | Primeira versão do manual, consolidando o estado do LIP do Slot 5 a partir de toda a memória de sessão acumulada e conferência ao vivo de alguns números contra o banco |
| 1.1 | 2026-08-25 | Regra suprema dos manuais versionados incorporada ao manual e ao `CLAUDE.md`; conferido contra a auditoria geral do Slot 5 do mesmo dia, que **não alterou nada do LIP** — as 11 correções foram todas na tela e nas rotas do MAC (ver seção 14 do `MANUAL_SLOT5_MAC.md`) |
| 1.8 | 2026-08-26 | Seção 15: laço LIP→MAC — cruzamento passa a gravar `divergenciasChaves`/`declaradoMasNaoEntregueChaves` por chave (não só texto), 8 filtros novos no MAC marcam item automaticamente quando o texto do item já cita o mesmo campo; corrigidas 2 chaves fantasma que faltavam declarar desde a noite do cruzamento |
| 1.7 | 2026-08-26 | Seção 14: campo `licencaPrevia` removido do LIP (0 uso em checklist/filtros/laudo/despacho, achado ao pesquisar antes de apagar) — banco, cruzamento, matriz de rastreabilidade e lock de versões atualizados juntos |
| 1.6 | 2026-08-26 | Nenhuma mudança no LIP — conferido contra o MAC da mesma data, que passou a ler `unidadeTerritorialDoUsoDoSolo` do LIP como fallback do filtro de Unidade Territorial (ver seção 14.9 do `MANUAL_SLOT5_MAC.md`). O LIP não ganhou campo nem mudou de comportamento |
| 1.5 | 2026-08-26 | Seção 13: Interessado, Projeto Nº, Ordem de Serviço Nº e Data Pagto. Taxa inicial movidos para o topo da aba INÍCIO (só reordenação, sem campo novo) |
| 1.4 | 2026-08-26 | Seção 12.5: "Limpar LIP" passa a gravar de verdade (antes só zerava a tela) e a exigir confirmação por digitação |
| 1.3 | 2026-08-26 | Seção 12: motor de cruzamento (declarado no ATENDIMENTO × entregue nos documentos), leitor do ATENDIMENTO, texto corrido no extrator, número da ART no formato do CREA, e o Monitor IA com dois anéis — incluindo a eficiência da leitura |
| 1.2 | 2026-08-26 | Seção 11: os defeitos de leitura achados nos processos 48533/48535 — `m2` sem expoente derrubando o carimbo inteiro, `proprietario` sem fonte possível, autor do projeto em outro formato — e os dois avisos novos que impedem a leitura de voltar pobre em silêncio |
