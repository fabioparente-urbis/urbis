# Auditoria independente — 07/09/2026

Escopo pedido: (1) plano Documentos Vivos, Passo 0 + Fases 0–8, sem confiar no que está marcado
como feito; (2) plano Assessor Ativo, consistência do desenho contra o que o código permite;
(3) mapa de `lib/urbi/*` e `lib/bdi/*`.

**Método:** leitura do código real, `npx tsc --noEmit` (limpo, exit 0), e execução dos módulos
puros contra dados sintéticos construídos para reproduzir os casos do plano. Onde há "provado
executando" abaixo, existe saída de terminal real, não inferência de leitura.

**Estado deste documento:** ele registra a auditoria *como ela foi feita* — os achados abaixo
descrevem o código no momento em que foram encontrados, não o de agora. Na mesma sessão, depois de
relatados, **A1, A2, M1, M3 e M4 foram corrigidos e testados**; o que ficou de fora está em §23.6
do plano. O registro do que mudou, e por quê, está em `docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md` §23.
Este arquivo fica como está de propósito: é o retrato do que existia, e é o que dá para comparar
se algum desses defeitos voltar.

---

## Resumo em uma linha

O código existe, é de qualidade acima da média e quase tudo que o plano diz que foi construído
realmente foi. Mas **dois defeitos reais decidem qual documento é "vigente" e são gravados no
banco desde o Passo 0** — e os portões humanos que o plano diz que faltam continuam todos
abertos, o que significa que os percentuais do §12 medem código escrito, não comportamento
verificado.

---

## SEVERIDADE ALTA

### A1 — O motor de versões compara datas como texto e pode eleger o documento mais ANTIGO como vigente
`lib/documentosSei/motorVersoes.ts:134`

O tier 5 ("data de assinatura mais recente") ordena datas por comparação de string sobre o texto
em português extraído da página (`"2 de dezembro de 2026"`), não sobre uma data real:

```ts
const maisRecente = ordenada.reduce((acc, ev, i) =>
  (i === 0 || (ev.data ?? "") > (ordenada[acc].data ?? "") ? i : acc), 0);
```

**Provado executando** (família de 2 documentos, ambos com data extraída):

| documento | data real | resultado do motor |
|---|---|---|
| Laudo tecnico 1 | 2 de dezembro de 2026 | **`vigente`**, confiança `media` |
| Laudo tecnico 2 | 10 de janeiro de 2027 | `substituido` |

O motor elegeu o documento **mais antigo** como vigente, com confiança `media` e o motivo textual
"data de assinatura mais recente da família" — ou seja, afirma na tela exatamente o oposto do que
fez. A causa é que `"2..." > "10..."` em comparação de string.

Isso acontece sempre que o dia do mês do documento mais novo começa com um dígito menor que o do
mais velho (10 vs 2, 15 vs 3, 21 vs 9…). Um teste com dias que por acaso ordenam bem (2 vs 9)
passa — que é provavelmente por que a validação ad-hoc da Fase 4 não pegou isso.

**Por que é alta:** desde o Passo 0 (§20) esse resultado é **gravado** —
`persistencia.ts:158-186` escreve `estado`, `vigente` e `motivo_estado` em `mhd_versoes` a partir
dele. É exatamente o risco nº 2 da tabela do próprio plano ("classificar errado e o analista
confiar → análise sobre documento superado — dano real ao cidadão"), em Slot 1, que é produção
crítica. E a confiança devolvida é `media`, não `baixa`, então a tela não sinaliza conferência.

---

### A2 — O hash que sustenta a Fase 7 colide entre documentos digitalizados diferentes
`lib/documentosSei/persistencia.ts:45-48`

O hash de identidade é SHA-256 sobre o **texto extraído** normalizado:

```ts
const normalizado = paginas.map(p => p.texto.trim().replace(/\s+/g," ").toLowerCase()).join("\n");
```

Página digitalizada não tem camada de texto — `texto` vem vazio. Logo, **todo documento sem texto
tem o mesmo hash**, independentemente do conteúdo.

**Provado executando** (função copiada literalmente do arquivo, duas peças distintas, ambas
digitalizadas): hash idêntico `75a11da4...` para as duas.

Isto não é hipotético: o §11 do próprio plano mediu que **48% das páginas são histórico
digitalizado**, e que num dos processos reais só **12,5%** das páginas tinham texto nativo.

**Três consequências, todas silenciosas:**

1. **Procedência errada.** `acharOuCriarConteudo` (`lib/mhd.ts:245-275`) reaproveita a linha
   existente pelo hash e **não atualiza `dados`**. Então o segundo documento digitalizado herda o
   `idSei`/`paginaIni`/`paginaFim` do primeiro. A "página de origem" — que é o argumento central
   do projeto (§7 princípio 7, o manifesto auditável da Fase 5) — fica apontando para o documento
   errado.
2. **O alerta de integridade nunca dispara** para esses documentos: a consulta de
   `persistencia.ts:134-137` procura por `dados->>idSei`, que nunca foi gravado para o segundo.
3. **Pior caso:** um documento digitalizado substituído por **outro** documento digitalizado, no
   mesmo papel, é tratado como `inalterado` (`persistencia.ts:168-177`) — zero versão nova, zero
   alerta. O portão da Fase 7 ("reimportar processa zero eventos") passa por um motivo errado, e a
   promessa "nunca sobrescreve em silêncio" não se sustenta justamente para a maioria das páginas
   reais.

---

## SEVERIDADE MÉDIA

### M1 — O fatiador promete mandar página com rodapé divergente para revisão, e não manda
`lib/documentosSei/fatiar.ts:14-16` (promessa) vs `fatiar.ts:305-331` (código)

O cabeçalho do arquivo declara:

> "se o rodapé diz 'pg. 139' numa página que não é a 139ª do arquivo, algo está fora de ordem e a
> página vai para revisão, **nunca é aceita no escuro**."

O código não faz isso. A página é marcada inválida (`fatiar.ts:297`), mas em seguida a regra de
continuidade (`fatiar.ts:326-330`) a absorve no evento vizinho sempre que os vizinhos válidos dos
dois lados têm o mesmo `idSei` — e aí ela **não entra** em `paginasRevisao`.

**Provado executando** com um PDF sintético de 5 páginas no formato real do SEI (carimbo em dois
itens de texto separados). A página 3 carimbada `pg. 99`:

```
EVENTOS: Documentacao (10000002) páginas 2–4   ← a página 3 divergente foi absorvida
PAGINAS EM REVISAO: []
soma fechada? 5 + 0 == 5 -> true
>>> pagina 3 tem rodape 'pg. 99' (divergente). Foi para revisao? NAO — absorvida em silencio
```

O resto do fatiador funciona: soma fechada de verdade (o `throw` de `fatiar.ts:358-362` é real),
setor lido do cabeçalho, eventos corretos. O defeito é só a garantia declarada e não cumprida.

### M2 — A Fase 8 entregou 1 dos 3 controles de custo que o plano especificou
`app/api/analise-*/documentos-sei/analisar-pendentes/route.ts:25,63-74`

O §6 Fase 8 do plano diz: "Reaproveita a governança pronta: interruptor global, **teto por
processo/usuário**, **cache** por conteúdo+receita+modelo (`lib/visao/index.ts`)."

O que existe em `lib/visao/index.ts` (o modelo citado): `TETO_POR_PROCESSO = 40` (linha 46),
`TETO_POR_USUARIO = 120` (linha 47) e cache.

O que a rota nova tem: só `TETO_PAGINAS_POR_PROCESSO_HORA = 20`. **Sem teto por usuário e sem
cache nenhum.** Sem teto por usuário, o limite por processo não limita o gasto total: 20
páginas/hora × N processos. Um analista com 30 processos abertos pode gastar 600 páginas/hora sem
tocar em nenhum teto. Reclassificar a mesma página duas vezes paga duas vezes.

Isto é o que o §22 registra como "executada" com "teto/hora" — verdadeiro, mas menos do que o §6
prometeu, e a diferença é exatamente o mecanismo que impede o custo de escapar.

### M3 — Tela e banco discordam sobre o estado dos contêineres, e o caso do portão da Fase 4 é um deles
`lib/documentosSei/persistencia.ts:74-75` vs `components/regularizacao/OrganizadorSeiRegularizacao.tsx:230`

A tela resolve o estado de **todos** os eventos:
`resolverEstados(resultado.eventos)`.
A persistência resolve apenas os **não-contêineres**:
`const eventosNaoContainer = eventos.filter(ev => !ehContainerGenerico(ev.titulo))`.

**Provado executando:** `ehContainerGenerico("Processo digital - 42135097")` devolve `true` —
porque o título começa com "Processo". Ou seja, a família `42135097` / `42135097-1`, que é
**literalmente metade do portão declarado da Fase 4** (§6 e §18), é um contêiner: seu estado
aparece na tela mas **nunca é gravado** em `mhd_versoes`.

O §18 afirma que o motor foi "validado contra os dois casos reais do portão". Confirmei que isso é
verdade quando `resolverEstados` é chamado isoladamente (como o script descartável fez) — mas no
caminho real da persistência esse caso é filtrado antes de chegar no motor. A validação foi feita
fora do caminho que o código de produção percorre.

### M4 — As duas rotas afirmam no próprio cabeçalho que não gravam nada, e gravam
`app/api/analise-regularizacao/documentos-sei/route.ts:14-16` e o par do Aceite SEI (`:18-20`)

> "ZERO IA, zero gravação: a resposta é só a proposta — **nem MHD**, nem `processos.dados` são
> tocados aqui."

Nas linhas 131-158 da mesma função: `registrarEvento(...)` grava em `mhd_eventos` e
`persistirDocumentosVivos(...)` cria `mhd_documentos` e `mhd_versoes`. Sem clique, sem aceite.

A gravação em si foi pedida por escrito (§16.3) e é legítima — o problema é duplo: o comentário
ficou mentindo depois do Passo 0, e ela contraria o princípio §5.4 do plano ("Proposta, nunca
gravação automática. A rota devolve proposta; quem grava é a tela, depois do aceite"). O aceite
explícito existe para os campos do LIP, mas não para o MHD. Vale decidir se o princípio muda ou se
a gravação passa a pedir clique — hoje o documento diz uma coisa e o código faz outra.

### M5 — A persistência roda em série, sem transação, dentro do limite de tempo da rota
`lib/documentosSei/persistencia.ts:129-189`

Para **cada** item (evento + peça), o laço faz: releitura das páginas + 1 select em
`mhd_conteudos` + `acharOuCriarConteudo` + `acharOuCriarDocumento` + 1 select em `mhd_versoes` +
até 2 updates + 1 insert. Num processo real de 30–41 eventos com peças, são centenas de idas ao
banco em sequência, tudo **depois** de o PDF já ter sido lido e **antes** de a linha
`{tipo:"resultado"}` ser enviada — sem nenhum evento de progresso nesse trecho.

`maxDuration = 120` (rota, linha 25). Se estourar: o analista perde o resultado inteiro na tela, e
as gravações já feitas **permanecem** — não há transação. Fica meio processo persistido, sem
nenhum registro de que ficou pela metade.

### M6 — Upload de até 350 MB é aceito antes de qualquer verificação de quem é o usuário
`app/api/analise-regularizacao/documentos-sei/route.ts:46` vs `:85`

`await req.formData()` (linha 46, consome o arquivo inteiro) e a checagem de tamanho (linha 78)
acontecem **antes** de `autorizar(req, processoCodigo)` (linha 85). O interruptor de feature é
checado antes de tudo, o que hoje segura a porta — mas com o interruptor ligado (que é o estado
que o Fábio precisa para usar), qualquer requisição sem sessão válida consegue fazer o servidor
receber e materializar 350 MB em memória antes de levar o 403. Inverter a ordem (autorizar antes
de ler o corpo) é barato.

---

## SEVERIDADE BAIXA

- **B1** — `analisar-pendentes/route.ts:64-74`: o teto conta e depois gasta; dois cliques
  simultâneos passam os dois. Corrida clássica, dano limitado pelo teto baixo.
- **B2** — `analisar-pendentes/route.ts:43-47`: a lista `paginas` vem do cliente e não é validada
  contra as peças realmente `classificacao_pendente`, nem contra o intervalo do PDF. O tipo é
  checado, o conteúdo não.
- **B3** — Código morto. ⚠️ **PARCIALMENTE ERRADO, corrigido em 07/09/2026 na mesma sessão:**
  a varredura original cobriu `app`, `lib` e `components`, mas **não `scripts/`**, que é onde mora
  a suíte de testes do projeto. Reconferido no repositório inteiro: só
  `lib/urbi/catalogoSemantico.ts:158` `unidadeDoCampo` é morto de verdade.
  `lib/urbi/previsao.ts:111` `previsaoGranularidadeIndisponivel` **não é morto** — é usado por
  `scripts/testar_previsao_tempo.mts:12,72`.
- **B4** — Exportados sem necessidade. ⚠️ **ERRADO pelo mesmo motivo.** `CRITERIOS`,
  `contarAnalises`, `temIndeferimento`, `FRASE_SEM_REGRA` e `USUARIO_SISTEMA` são todos
  consumidos por `scripts/` — o `export` é a superfície de teste do módulo, não excesso. Só
  `CATALOGO_SEMANTICO` fica sem consumidor externo, e mesmo esse não justifica risco.
  **Achado retirado.**
- **B5** — `persistencia.ts:163-166`: a dedup olha só a **última** versão (`limit(1)`).
  Reimportar um PDF mais antigo, cujo conteúdo já existe como versão anterior, cria versão nova em
  vez de reconhecer o que já estava lá.

---

## Portões humanos: nenhum foi fechado

O plano é honesto ao listá-los como pendentes; o ponto aqui é o efeito somado. Dos oito portões,
**zero** foram confirmados pela tela por você, por escrito:

| Fase | % no §12 | Portão | Estado real |
|---|---|---|---|
| 1 | 90% | conferir o índice contra a árvore do SEI | aberto |
| 2 | 95% | organizar um processo de ponta a ponta | usado várias vezes em 06/09, **nunca declarado fechado** |
| 3 | 70% | taxa de classificação medida nos 4 processos | aberto |
| 4 | 60% | despacho SEM EFEITO + família 42135097 | validado **fora** do caminho real (ver M3) |
| 5 | 75% | manifesto conferido item a item | aberto |
| 6 | 75% | processo real percorrendo LIP→MAC→MDP | aberto |
| 7 | 90% | reimportar o mesmo PDF duas vezes pela tela | aberto (e ver A2) |
| 8 | 85% | chamada real ao Gemini | aberto por decisão (custa dinheiro) |

Os `%` do §12 medem código escrito, e a tabela diz isso com todas as letras. Mas o total de
**≈76% concluído** lido de fora sugere um projeto quase pronto, quando o que está provado é
"quase todo o código existe e nenhuma fase foi confirmada funcionando pela tela". A2 e A1 são
exatamente o tipo de coisa que esses portões existiam para pegar.

**Não pude verificar** a afirmação do §22 de que `documentos_vivos_gemini_ativo` está `false` em
produção — isso exige acesso ao banco, que esta sessão não tem. Fica como não-verificado, não
como errado.

---

## Item 2 — Plano Assessor Ativo: revisão do desenho antes de implementar

### O que confere ✅

- **"Vigia já dispara sozinho no `useEffect`"** — verdade. `components/bdi/VigiaProcesso.tsx:35-48`
  busca `/api/bdi/vigia` na montagem, independente de o painel estar aberto (`aberto` é só
  exibição, linha 33). A premissa "sem custo novo" se sustenta.
- **`urbi:dica` como padrão a generalizar** — existe, `components/urbi/UrbiGlobal.tsx:114`.
- **Números do Radar** — batem exatamente: `MAX_ITENS_PADRAO = 10`, `MAX_MS_PADRAO = 20_000`,
  `CADENCIA_ESPERADA_MIN = 1` (`lib/urbi/radarJob.ts:36,37,27`), limite de 200 processos visíveis
  (`lib/urbi/radar.ts:172,240,362`).
- **"Custo zero, nenhuma chamada Gemini nesses módulos"** — confirmado por varredura.

### Os quatro problemas de desenho

**P1 — O Motor de Produção não tem por onde ser chamado fora do chat.** `montarRelatorioMotor` só
é importado por `app/api/urbi/chat/route.ts:16`, pelo job do Radar
(`app/api/urbi/radar/processar/route.ts`) e por consumidores internos (`radar.ts`, `previsao.ts`,
`catalogoConsultaPilha.ts`). **Não existe rota que devolva o relatório do processo aberto.** A
Fase 1 (sinaleiro usa "o relatório do Motor de Produção") e a Fase 4 (relatório como primeira
mensagem ao abrir o chat) dependem disso. É rota nova em ambos os casos — trabalho real que o
cronograma de "1 sessão" para a Fase 1 não contempla.

**P2 — O sinaleiro não tem como enxergar o resultado do Vigia.** `VigiaProcesso` é montado dentro
de `app/processo/ProcessoClient.tsx:3007`; o sinaleiro mora em `components/urbi/UrbiGlobal.tsx`,
outra árvore de componentes. O resultado do Vigia vive num `useState` local
(`VigiaProcesso.tsx:28-29`) que o UrbiGlobal não alcança. Ou se cria uma ponte por evento de
janela (o padrão `urbi:dica` já provado), ou o sinaleiro faz um **segundo** fetch — e aí "sem
custo novo" deixa de ser verdade: dobra as chamadas a `/api/bdi/vigia` por processo aberto. O
plano não escolhe entre as duas.

**P3 — Fase 1 e Fase 2 leem fontes diferentes, e o portão da Fase 2 proíbe exatamente isso.** A
Fase 1 propõe calcular a cor do Motor de Produção **ao vivo**; a Fase 2 propõe ler o **retrato**
gravado pelo Radar (`urbi_radar_retratos`). O retrato pode estar até minutos atrasado. O portão da
Fase 2 é: "ordenar a Pilha por esforço bate com o que o chat já responde — mesma fonte, mesma
resposta, sem divergência". Com duas fontes, o sinaleiro de um processo e a linha dele na Pilha
podem discordar na tela ao mesmo tempo. **Escolher uma fonte só (recomendo o retrato) antes de
começar a Fase 1**, ou o portão da Fase 2 nasce impossível.

**P4 — Processo sem retrato não tem comportamento definido.** O Radar processa até 10 processos
por execução e enxerga até 200. A Fase 2 quer esforço e pendências **por linha da Pilha**. Nada no
plano diz o que a linha mostra enquanto o retrato não existe ou está velho. Precisa de um estado
explícito ("ainda sem retrato") — senão vira célula vazia, que o analista lê como "não tem
pendência", que é o oposto da verdade. O §4 princípio 4 do próprio plano ("onde faltar dado, a
resposta é 'base insuficiente'") já dá a resposta; falta aplicá-la ao desenho da Fase 2.

**D3 segue aberta** e está corretamente marcada como tal.

---

## Item 3 — Mapa de `lib/urbi/*` e `lib/bdi/*`

24 módulos, ~250 KB. Agrupados por função:

| Grupo | Módulos |
|---|---|
| **Retrato / fundo** | `radar.ts`, `radarJob.ts` — job `pg_cron`, watermark de 6 fontes, grava `urbi_radar_retratos` |
| **Leitura do processo** | `montarDossie.ts`, `dossieProcesso.ts`, `fontesConsultadas.ts`, `manifestoFontes.ts` |
| **Raciocínio determinístico** | `motorProducao.ts`, `alertasProducao.ts`, `cruzamento.ts`, `catalogoSemantico.ts`, `validarComparacoes.ts`, `linhaEvidencia.ts`, `previsao.ts` |
| **Pilha / consulta** | `perguntasPilha.ts`, `catalogoConsultaPilha.ts`, `navegacao.ts`, `sugestoes.ts` |
| **Conversa** | `contratoResposta.ts`, `sanitizarResposta.ts`, `atendimento.ts`, `presenca.ts`, `limites.ts` |
| **BDI** | `vigia.ts`, `situacao.ts`, `embeddingConsulta.ts` |

**A saúde geral é boa, e vale registrar:** nenhum `TODO`, `FIXME`, `HACK` ou marcador equivalente
em nenhum dos 24 arquivos. Os comentários explicam decisões, não repetem o código. Duas funções
mortas em ~250 KB é muito pouco.

**As divergências entre documentação e comportamento real que achei:**

1. As já listadas em M1 (`fatiar.ts`), M3 (persistência × tela) e M4 (cabeçalho das rotas) — são
   as três reais e todas dentro de `documentosSei`, não em `urbi`/`bdi`.
2. `lib/urbi/perguntasPilha.ts:260-288` faz consulta direta ao banco, quebrando a regra declarada
   do próprio arquivo ("só lê o retrato pronto, nunca faz query nova"). **Isto está documentado
   como exceção deliberada** nas linhas 262-264 e no §21 do plano — é divergência assumida, não
   esquecida. Registro só para não se perder: é o primeiro furo nesse padrão, e o segundo já entra
   sem discussão.
3. `lib/urbi/linhaEvidencia.ts:102` `tentarVinculoEstruturalFuturo` — é chamada de verdade (linha
   314), mas devolve `null` sempre, porque nenhuma rota de emissão grava `checklist_item_id`. Está
   honestamente documentado como contrato futuro inerte (linhas 94-101). **Não é código morto** —
   é hook plantado. Só não confunda com funcionalidade.
4. **O MDP continua sem sinal do MHD**, como o §21 registra. Confirmei: `linhaEvidencia.ts` não
   importa nada de `documentosSei` nem de `mhd`. O plano está certo ao chamar isso de trabalho
   futuro e não de feito — este é um caso em que a documentação foi mais honesta que o normal.

**A integração da Fase 6 é real**, ao contrário do que eu esperava encontrar:
`lib/urbi/motorProducao.ts:28,139-166` de fato importa `CAMPO_POR_PAPEL_PECA` e diferencia
`rapido` (documento já no MHD) de `depende_documento`.

---

## O que eu faria primeiro

1. **A1** — trocar a comparação de string por data real em `motorVersoes.ts:134`. É o defeito com
   maior consequência e o de menor esforço: uma função que converta "10 de janeiro de 2027" em
   data ordenável. Enquanto não for corrigido, o mais seguro é rebaixar a confiança do tier 5 para
   `baixa`, o que faz a tela pedir conferência em vez de afirmar.
2. **A2** — decidir o que fazer quando o texto extraído é vazio. O mínimo honesto é **não
   persistir** documento sem texto (ou incluir `idSei` + intervalo de páginas no hash), em vez de
   deixá-lo dedupar com todos os outros.
3. **M3** — decidir se contêiner tem estado gravado ou não, e alinhar tela e persistência. Hoje
   discordam.
4. **M4/M1** — corrigir os dois comentários que afirmam garantias que o código não dá. É barato e
   evita que a próxima sessão (humana ou de IA) confie neles, que é como M3 nasceu.
5. **Item 2** — resolver P3 (uma fonte só) antes de escrever a primeira linha do sinaleiro.

Nada disso muda a avaliação de que a fundação é sólida. Muda o que dá para dizer que está pronto.
