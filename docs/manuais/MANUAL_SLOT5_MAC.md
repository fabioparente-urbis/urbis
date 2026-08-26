# Manual do MAC — Slot 5 (Aprovação de Projeto)

**Versão:** 1.17
**Data:** 2026-08-26
**Módulo:** MAC — Slot 5
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

## 1. O que é o MAC no Slot 5

O **MAC** (Módulo de Análises e Conformidades) é um dos dois **módulos principais** do URBIS (o
outro é o LIP — ver [`MANUAL_SLOT5_LIP.md`](./MANUAL_SLOT5_LIP.md)). É o checklist de conformidade:
cada item representa uma exigência legal ou técnica que o projeto precisa cumprir para ser aprovado.

O Slot 5 (Aprovação de Projeto) tem hoje uma **tela própria** de MAC — diferente do Slot 1
(Regularização SEI), que usava a tela do Slot 1 antes de o Slot 5 ganhar a sua. Este manual cobre
o MAC como implementado hoje para o Slot 5: modelo de dados, tela, motor de execução, reconciliação
do checklist contra a planilha real do Fábio, geração de documentos e o backlog oficial pendente.

---

## 2. Modelo de dados

**Modelo do checklist do Slot 5**: `modelo_id = 88451782-86ed-47b5-b34c-e2e2b8f3a99f`, dentro da
tabela `mac_checklist_itens` (que guarda, na mesma tabela, os itens dos 3 modelos existentes — Slot
5 + Regularização + Aceite — sempre filtrar por `modelo_id`, nunca confiar em filtro por nome de
grupo sozinho, ver seção 5.9 "armadilha grave").

**Contagem ao vivo nesta sessão (25/08/2026, consultado direto no banco)**: **774 itens totais**
no modelo do Slot 5, dos quais **538 ativos**. Este número mudou várias vezes ao longo do trabalho
de reconciliação (ver seção 5) — a memória de sessões anteriores registra 768→731→718→697→660→
575→572, e o valor vivo hoje (538) reflete lotes de SQL que o Fábio rodou nas últimas 24h, alguns
dos quais não tinham sido reconferidos nas memórias de sessão até este manual ser escrito. **Trate
538 como o número correto no momento deste manual, mas reconfira contra o banco antes de qualquer
trabalho que dependa da contagem exata** — a reconciliação foi declarada 100% fechada em
25/08/2026 (seção 5.10), mas o número final de itens ativos após os últimos lotes de SQL não foi
reconferido byte a byte contra a lista completa dos 48 grupos neste manual.

Vínculos (contagem ao vivo, 25/08/2026): `mac_bip_vinculos` **727** (item do checklist ↔ artigo de
lei) · `mac_lip_vinculos` **147** (item do checklist ↔ campo do LIP). Ambos caíram desde os números
originais de 29/07 (887 e 160) por causa da limpeza de duplicatas feita durante a reconciliação.

**Classificações originais confirmadas em 29/07/2026** (antes da reconciliação começar — não
reconferidas depois, porque a reconciliação desativou itens sem recalcular classificação):
- **BIP**: 655 VINCULADO_BIP · 91 SEM_FUNDAMENTO_BIP · 22 REVISAO_MANUAL
- **LIP**: 42 AUTOMATIZAVEL · 45 PARCIALMENTE_AUTOMATIZAVEL · ~658 MANUAL_COM_EVIDENCIA_LIP · 23
  REVISAO_MANUAL

---

## 3. A tela própria do MAC do Slot 5

Arquivo: `app/analise-aprovacao-projeto/[codigo]/page.tsx` — exclusivo do Slot 5 (diferente da tela
do LIP, que é 1 arquivo para os 15 slots; aqui dá para mexer num slot sem tocar o outro, mas ainda
assim **toda mudança de comportamento equivalente precisa ser feita duas vezes**, uma vez em cada
tela de MAC própria, se for para manter paridade com o Slot 1/2).

### 3.1 Estrutura da tela

Índice dos **48 grupos** do checklist, cada um com:
- Contagem de subitens respondidos (ex.: "10/10")
- Cor de resumo sem precisar abrir: vermelho claro se ao menos 1 item é não conforme (prioridade
  máxima), azul se o grupo inteiro é N/A, verde se está todo respondido sem erro, branco enquanto
  falta responder (`ESTADO_GRUPO`)
- Botões ✅ ❌ ⬜ 🧹 na própria linha do índice, para marcar o grupo inteiro sem precisar abrir
  (`marcarGrupo(grupo, status, salvarAgora)`, salva na hora quando acionado pelo índice)
- Numeração **"ÍTEM 1..48"** (a aba de observações é o **"item 49"**) — vocabulário exato pedido
  pelo Fábio: "ÍTEM" com acento, "SUB ITEM" sem, dentro de cada grupo

Dentro de cada item aberto: texto da exigência, botões Conforme/Não Conforme/Não se Aplica, campo
de observação sempre visível (não expansível — decisão do Fábio), vínculos com BIP (lei/artigo) e
LIP (campo de origem).

### 3.2 Ícone de origem por item

🎛️ filtro automático · 🤖 sugerido por IA · ✍️ manual (`origemDoItem`) — substitui o texto cru da
fonte que existia antes. **Achado no caminho**: a função de marcação manual não gravava
`fontes[id]` no clique direto do analista — marcações por IA e manuais caíam juntas na mesma
categoria "Marcados por você". Corrigido (`marcar`/`marcarGrupo`/"Concluir pendentes" agora
gravam `"manual"` explicitamente). **Limitação real, não bug**: itens marcados manualmente ANTES
dessa correção não têm fonte gravada — não há como recuperar isso retroativamente, só os marcados
depois mostram o ícone certo.

### 3.3 Números clicáveis e progresso

Os números do painel (Conforme/Não Conforme/N.A./Pendentes/por filtro/por IA/por você) são
clicáveis — abrem a lista dos itens daquele balde; clicar num item da lista manda para o grupo dele
e destaca por 2 segundos.

**LER PASTA (IA) com progresso real**: a rota (`app/api/mac/slot-05/ler-pasta/route.ts`) usa
NDJSON (mesmo formato de `/api/lip/ler-pasta`) — evento por fase (catalogando → enviando cada PDF
→ analisando). A tela mostra percentual + tempo decorrido + documento atual. A fase "analisando" é
uma única chamada bloqueante ao Gemini (1-3 minutos, sem progresso real possível durante ela) — uma
rampa por tempo cobre visualmente até 92% enquanto espera.

### 3.4 Filtros de aplicabilidade — dois mecanismos

**Filtros do banco** (`mac_slot5_filtros`, tabela com 13 filtros cadastrados hoje): filtro acionado
JÁ marca os itens correspondentes como Não se Aplica; os recomendados aplicam sozinhos ao abrir a
tela. Botão vira "Desfazer", que devolve só o que veio daquele filtro específico (reconhecido pela
fonte gravada). **Desfazer é definitivo** (corrigido em 25/08/2026): a decisão fica gravada em
`analises_mac.aceites.filtros`, então a aplicação automática da próxima abertura pula o filtro
recusado. Antes disso, cada visita à tela remarcava exatamente o que o analista tinha desfeito.
O painel também diz de onde as regras vieram — dos filtros cadastrados ou, se nenhum estiver ativo,
das regras fixas do código (fallback). Alcançam item pelo **texto** (`termos_item`), não só por grupo — foi assim que o
filtro "APRO DE PROJ" foi de 25 para 65 itens alcançados e "COMERCIAL" de 60 para 78 (depois de um
ajuste que também passou a derrubar os dois grupos de índice de aproveitamento).

**Filtros de tema** (`FILTROS_TEMA`, direto na tela, sem tabela): barra "🚫 Não se aplica a este
processo" — 🛫 Zona aeroportuária (4 itens) · 🎖️ Zona militar (0 — checklist não tem item sobre
isso, botão desabilitado) · 🏛️ Setor Central/Campinas (5) · 🏊 Área de lazer (9) · 🚦 EIT (12) ·
🏘️ EIV (4) · 🚚 Carga e descarga (10) · 🪜 Rampa (15) · e os três filtros de opção do índice
paisagístico (🏠 IP Opção 1/2/3, mutuamente exclusivos entre si).

Regras comuns aos dois mecanismos:
- Busca sempre por **palavra inteira sem acento** — substring dava falso positivo ("POSTO" batendo
  dentro de "COMPOSTO").
- Só a versão **VIGENTE** de cada documento conta na busca de tema — concatenar versões antigas
  fazia filtro deixar de acionar.
- **Nunca sobrescreve resposta do analista**, em nenhum caminho (filtro, IA, importação de Excel).
- IA: o filtro **propõe**, o Gemini **confirma** (campo `temas` na resposta da leitura de pasta) —
  dupla checagem antes de retirar um item da fila do analista.
- Sem dado suficiente → pendência explícita, **nunca chute**.

**EIT/EIV são calculados, não só filtrados**: `lib/mac-motor/slot5/estudosExigencias.ts` (puro,
sem Supabase) traduz a legislação (Lei 10.977/2023 para EIT, exige quando área ocupada ≥ 2.000 m²
para hiper/super/mercado; Lei 11.127/2024 + LC 349/2022 art. 262 para EIV, exige quando > 2.000
m²) em gatilhos campo+operador+base legal, com **três saídas por gatilho**: exigido / dispensado /
SEM DADO (pendência nunca vira dispensa automática). Ao abrir o MAC, "dispensado pela conta" aplica
o filtro sozinho com os números na fonte; "exigido" não marca nada, só escreve a conta na
observação de cada item envolvido.

**Painel "🧮 EIT · EIV · Carga e descarga"** (25/08/2026): no índice, recolhido, com um selo de
veredito para cada um dos três. É onde entram os números que o LIP não tem — área de
depósito/produção, pátio de carga desenhado, capacidade de reunião, alunos por turno e a marcação
"atividade do Anexo I da IN 008/2023". Sem esses campos na tela, `avaliarCargaDescarga` nunca saía
de "sem dado" e o resultado era calculado e jogado fora. O botão "Levar a conta para os N itens"
aplica o mesmo tratamento do EIT/EIV: **dispensado** retira os itens de carga e descarga da análise
com a conta na fonte; **exigido** só escreve a conta (e se o pátio desenhado atende o mínimo) na
observação de cada item — a decisão continua sendo do analista.

### 3.5 Filtro de Unidade Territorial

Campo no topo do índice, com a sigla escolhida pelo analista. **Histórico de idas e vindas nessa
regra, as duas por pedido explícito do Fábio:** uma primeira tentativa pré-preenchia automático a
partir do LIP; foi revertida para nascer sempre em branco, preenchendo só quando uma leitura de
documento *dentro do MAC* via a sigla. Em 26/08/2026 essa segunda regra foi revertida de novo
(seção 14.9): o valor de `dados.unidadeTerritorialDoUsoDoSolo` do LIP volta a valer, mas agora como
**último** fallback — só entra quando a análise salva e o `localStorage` não têm nada; uma leitura
de documento feita depois, dentro do MAC, ainda pode trocar a sigla normalmente. Marca N/A todo
item que trata só de outras Unidades Territoriais. Escolha fica em `localStorage`
(`mac5-ut-<codigo>`), sem coluna nova no banco. Siglas reconhecidas: AA, AAB, AAD, ADD, AOS, ARAU,
APA, APAC, AEIS, AEBT. Casamento por fronteira Unicode (para "AAB" não bater dentro de "ACRÉSCIMO")
e com regra de exceção: item que cita "exceto AOS e ARAU" nunca é marcado automaticamente (a regra
ali é invertida, marcar por semelhança daria o resultado errado).

A sigla passou a viver **na análise** (`analises_mac.aceites.unidadeTerritorial`), com o
`localStorage` só como fallback do que já estava gravado antes — o mesmo vale para os números do
painel de estudos (`aceites.estudos`). Enquanto morava só no navegador, abrir o processo em outro
computador (ou limpar o navegador) apagava tudo sem aviso. "Limpar MAC" **não** apaga esses dois:
eles não são resposta de item.

### 3.6 Auxílio de "Via / Logradouro"

Ao voltar da tela `/logradouro/[codigo]` (compartilhada por 4 chamadores: Aceite SEI, Regularização,
MAC do Slot 5 e o LIP), o item do checklist que cita "Cadastro de Logradouros" + "largura" recebe
automaticamente a observação no padrão que o Fábio escrevia à mão (ex.: *"Para a Av Anapolis:
28,5m, para a R RSL3: 13m..."*), e o MAC é salvo na hora. Texto do analista nunca é sobrescrito —só
entra em caixa vazia ou em cima de texto que o próprio gerador escreveu antes. **Limitação real**:
o Cadastro de Logradouros guarda nome sem acento, então sai "Av Anapolis", não "Av Anápolis".

---

## 4. O motor de execução (`lib/mac-motor/slot5/`)

### 4.1 Infraestrutura de execução — tabelas

Migration `2026_07_30_mac_execucoes.sql`, três tabelas:
- `mac_execucoes` — uma rodada do motor sobre um processo (`versao_lip/mac/bip` são hashes
  reproduzíveis, não números digitados à mão; imutável depois de `concluido_em`)
- `mac_resultados_item` — resultado de um item dentro de uma execução (`UNIQUE(execucao_id,
  mac_item_id)` — regravar o mesmo item na mesma execução é erro, nunca um upsert silencioso)
- `mac_resultados_revisoes` — correção humana, sempre `INSERT`, nunca `UPDATE` sobre
  `mac_resultados_item` — o "resultado efetivo" é a revisão mais recente ou o original

Serviço em `lib/mac-execucao/` (`iniciarExecucao`, `registrarResultado`, `concluirExecucao`,
`marcarErro`, `revisarResultado`, `resultadoEfetivo`, `execucoesDoProcesso`, `resultadosDaExecucao`).

### 4.2 O piloto híbrido — 3 dos 15 arquétipos originais implementados

O plano original previa 15 arquétipos automatizáveis (documento anexado, alerta do Uso do Solo,
índice de aproveitamento, fórmula percentual, etc.). Só **2 chegaram a ser implementados e testados
com processo real** antes de o plano mudar de direção (seção 5):

1. **Dimensões/área do terreno** (item `9086573b-14cc-45f9-9769-eb88f8ab5d0d`, grupo PLANTA DE
   SITUAÇÃO): Gemini lê planta+certidão, extrai área + 4 medidas de perímetro. CONFORME automático
   só com as 5 medidas presentes E dentro de tolerância 0,02 (mesma tolerância de arredondamento já
   usada no LIP) E confiança não-baixa. Qualquer coisa incompleta ou divergente vira
   `REVISAO_MANUAL` — nunca decide sozinho no meio-termo. **Estável em todas as execuções reais**
   (ver seção 5).
2. **Memorial da caixa de recarga** (item `971cc08c-cbc1-4bff-b16c-a19aed12a825`): confere se o
   memorial usa a fórmula certa (área impermeabilizada = terreno − permeável). **Instável** — ver
   seção 5, virou postura ASSISTIDA oficial.
3. **Volume da caixa de recarga** (item `34abc7ef-34c7-4d08-96a0-faf10b548609`): volume exigido usa
   SEMPRE a área impermeável calculada de forma independente, nunca o valor que o memorial declara
   — evita que um memorial errado se auto-aprove.

Um 4º comparador (quadro de áreas × carimbo) é **experimental, sem vínculo MAC** — não corresponde a
nenhum dos itens cadastrados no modelo, implementado em `comparadorQuadroCarimbo.ts` sem gravar em
`mac_resultados_item`.

**Prompts próprios e versionados** (`lib/mac-motor/slot5/prompts.ts`) — nunca reaproveitam o
`P3_MAC` da Regularização/Aceite, hash FNV-1a próprio por prompt.

**Isolamento do Slot 1**: a rota do piloto tem autenticação própria
(`lib/mac-motor/slot5/autorizacao.ts`) que autentica ANTES de ler o corpo da requisição e resolve o
processo pelo trio exato `codigo+assunto_id+tipo_processo` — não usa a busca genérica só-por-código
que poderia, em teoria, pegar processo de outro slot se o código se repetisse (hoje
`processos.codigo` tem constraint única global, então não é reproduzível, mas a resolução por trio
é defesa em profundidade mantida mesmo assim).

### 4.3 `outorgaOnerosa` — implementado, roda a cada salvamento

`lib/mac-motor/slot5/outorgaOnerosa.ts` (commit `271ab26`). Regra do Fábio, as **duas** condições
juntas: altura do térreo até a **cobertura** (ou o **forro**, se não tiver cobertura; ou a **parte
de baixo do telhado**, se não tiver nem forro — NUNCA a altura total do prédio) `>= 7,5m` **E**
área construída `>` área do terreno. Roda a cada `POST /api/processo/salvar` do Slot 5 (não no LER
PASTA, porque `alturaDaEdificacao` é `PENDENTE_VISAO` — só existe quando o analista digita manual,
então o cálculo precisa reagir a QUALQUER salvamento, não só a uma leitura de pasta). Isolado por
`tipoProcesso === "slot_05"` dentro da rota compartilhada — Slot 1 nunca é tocado por esse cálculo.

**Depende de um bug ainda não corrigido em geral**: usa `areaTotal`/`areaTerreno`, os dois campos
que têm o bug de leitura de carimbo (dígito cortado, ver `MANUAL_SLOT5_LIP.md` seção 8.3). Só
confiável onde a área já foi corrigida manualmente — herda essa fragilidade até o bug de leitura ser
corrigido no código, não só ad-hoc por processo.

### 4.4 Caixa de recarga: única fonte da área impermeável (26/08/2026, `REGRA_VERSAO_CAIXA_RECARGA = 5`)

Achado ao vivo no 48533: `caixaDeRecarga.ts` recebia `areaTerreno`/`areaPermeavelProjetada` e
recalculava `área impermeabilizada = terreno − permeável` **por conta própria**, dentro do motor —
a MESMA fórmula que `lerPastaSlot5.ts` já calcula e grava no LIP como `areaImpermeabilizada`
(seção 3, `MANUAL_SLOT5_LIP.md`). Duas contas iguais, dois lugares: se o analista corrige
`areaPermeavelProjetada` à mão depois da leitura (foi exatamente o que aconteceu nesta sessão), o
campo `areaImpermeabilizada` do LIP fica com o valor antigo — e o motor, se recalculasse sozinho,
usaria o valor NOVO sem ninguém perceber a divergência entre o que a tela mostra e o que a caixa de
recarga decide.

Pedido do Fábio: *"o que deveria alimentar a caixa de recarga deveria ser essa área aí... área
impermeável, e não área permeável projetada."* `EntradaDecisaoCaixaRecarga` passou a receber
`areaImpermeabilizada` (o campo do LIP) direto — o motor não subtrai mais nada, só lê o que já foi
calculado. Única fonte da verdade; a tela e o motor nunca mais podem discordar sobre esse número.
`camposLip` dos dois itens (MEMORIAL e VOLUME) passou de 2–3 campos para 1–2, refletindo o que
cada item efetivamente lê agora. Testes de `scripts/testar_mac_motor_slot5.mts` atualizados (as
mesmas 18 seções, só trocando o par `areaTerreno+areaPermeavelProjetada` pelo valor já subtraído)
— `areaTerreno` continua existindo em `EntradaPilotoSlot5` porque `MAC_ITEM_DIMENSOES_TERRENO`
(item 1 da seção 4.2) ainda depende dele, só a caixa de recarga parou de usar.

---

## 5. A série de testes históricos — por que o plano mudou

### 5.1 O experimento (processo 44353, agosto de 2026)

Processo-controlado `TESTE-HIST-44353-AN3` (2V Holding e Participações), com gabarito humano real
(`LAUDO.pdf` assinado, confirma os 3 itens do piloto como CONFORME). **6 execuções** ao longo de
2026-08-03/04, com 4 commits de correção de prompt/regra entre elas.

Resultado estável desde a 3ª execução real: **dimensões automáticas funcionam de verdade** (CONFORME/
ALTA em todas as execuções). **Volume da caixa melhorou** ao longo das execuções (de fallback-LIP/
MEDIA para confirmação-documental/ALTA na execução 6, depois do recorte por categoria — seção 5.2).
**Memorial nunca estabilizou** — variou entre PENDENTE (abstenção total do Gemini), CONFORME por
evidência fraca (uma fórmula simbólica sem número, achado que expôs uma lacuna real no código —
corrigido depois) e PENDENTE de novo, mesmo com prompt e regra corrigidos.

### 5.2 Diagnóstico: não era mais bug de código, era legibilidade visual

Investigação dedicada confirmou que o quadro ICCAP existe em **dois blocos separados** na mesma
prancha (~750pt de distância): um bloco-cabeçalho compacto e inequívoco (uma linha literal
"ICCAP-ÍNDICE CONTROLE CAPTAÇÃO ÁGUA PLUVIAL: EXIGIDO X / ATENDIDO Y") e um bloco-memorial detalhado
(onde mora o rótulo ambíguo "ÁREA PERMEABILIZADA" e o cálculo geométrico). O Gemini, olhando a
prancha inteira ou um recorte mal-localizado, cai em qualquer um dos dois ou nos dois picotados —
daí a instabilidade.

**Solução implementada** (`lib/mac-motor/slot5/recorteIccap.ts`, commits `3943b78`/`586cbf0`):
localizar por texto (`mupdf.Page.search("ICCAP")`) e recortar com a MESMA biblioteca (mupdf) —
nunca misturar com coordenadas do pdfjs (ver armadilha em `MANUAL_SLOT5_LIP.md`, seção 3.4/4.6).
Medido: 132ms para localizar+recortar o bloco-cabeçalho, legível, contra ~2,6s de renderizar a
página inteira. Na execução 6 (com o recorte por categoria — `cabecalho_iccap`/`memorial_iccap`),
os 4 recortes foram encontrados e enviados corretamente ao Gemini, com evidência registrada — **mas
o Gemini ainda se absteve do valor da área impermeabilizada dentro do recorte de memorial.**

### 5.3 Decisão: encerrar o experimento, não perseguir mais versões de prompt

Depois da execução 6, decisão explícita do Fábio: **não reexecutar mais buscando 3× CONFORME**. O
experimento já ensinou o que tinha a ensinar. Regra de governança nova, válida para sempre: **uma
tentativa automática por campo** — abstenção, baixa confiança ou guarda determinística rejeitando a
evidência vira pergunta assistida ao analista, **nunca** uma nova versão de prompt para o mesmo
campo.

**O papel do recorte ICCAP mudou** por causa dessa decisão: deixou de ser insumo para "forçar" o
Gemini a acertar sozinho e virou a **ilustração da pergunta assistida** ("olhe aqui, página X, este
quadro") quando o item cai na postura DADO NECESSÁRIO (seção 6). O valor do módulo parou de
depender do modelo acertar.

---

## 6. O plano vigente — 4 posturas (substitui o roteiro de 10 etapas)

O roteiro original de 10 etapas (fechar rastreabilidade → motor de execução → piloto → motor
declarativo → tela do analista → ... → primeiro processo real) assumia que automação vinha antes de
tela e analista. A experiência do memorial ICCAP provou que essa ordem trava o projeto inteiro
esperando um modelo de IA acertar uma leitura visual difícil. **Substituído em 04/08/2026** por um
plano fechado com o Fábio (e um segundo modelo consultado sob pedido explícito dele em pontos
específicos, nunca como plano concorrente).

### 6.1 Decisão central

**Não automatizar os 774 itens do MAC do Slot 5 antes de usar o URBIS.** Meta: o URBIS **conduz e
registra** a análise dos itens, automatizando o que for seguro e pedindo intervenção humana no
resto. Automação vira otimização, nunca pré-requisito. O Slot 5 fica "usável" quando os itens estão
**endereçados** (cada um numa das 4 posturas, com registro auditável) — não quando estão
automatizados.

### 6.2 Fluxo canônico

URBIS tenta extrair o fato **uma vez** → conseguiu: congela com origem/evidência → não conseguiu:
**pergunta o FATO** ao analista (nunca pede decisão de conformidade — "o usuário informa dados do
documento, não decide sozinho se está conforme") → MAC consome LIP + fatos assistidos → regra
determinística ou veredito humano → confirmação humana → laudo (ainda não construído, seção 8).

### 6.3 As 4 posturas — toda a fila cai numa delas

1. **RESOLVIDO** — regra determinística + fato disponível; analista confirma.
2. **NÃO APLICÁVEL** — recolhido, mas auditável (regra, fatos, versão, justificativa registrados);
   nunca desaparece do histórico.
3. **DADO NECESSÁRIO** — o sistema pergunta o fato ao analista, mostrando onde olhar (recorte de
   PDF quando existir — é aqui que o recorte ICCAP da seção 5.2 se encaixa hoje).
4. **VEREDITO HUMANO** — analista decide e justifica; é o catch-all para a maioria dos itens
   (`MANUAL_SEM_DADO_LIP`) — cobre a fila inteira sem precisar de lógica dedicada por grupo.

Postura é **derivada**, nunca uma coluna nova no banco: `posturaDe()` no cliente calcula a partir de
`linha.resultado?.resultado` — ENCONTRADO/CALCULADO/INFERIDO → RESOLVIDO; NAO_APLICAVEL →
NAO_APLICAVEL; AGUARDANDO_FATO → DADO_NECESSARIO; qualquer outra coisa (incluindo `null`/sem
execução, que é a maioria hoje) cai em VEREDITO_HUMANO.

Contradição entre humano e leitura automática (ex.: LIP diz um valor, Gemini leu outro) sempre vira
`REVISAO_MANUAL` — nunca resposta humana sobrepondo silenciosamente o valor automático. Resolvida
**inline**, mostrando os dois valores, com override explícito e auditável.

### 6.4 Taxonomia de triagem — 2 eixos, não 1

A primeira tentativa de classificar itens (FATO / VEREDITO / CONDICIONAL como categorias únicas,
mutuamente exclusivas) quebrou em itens do tipo *"ADMITE-SE concregrama em estacionamento..."* — não
é fato nem veredito nem simplesmente condicional, é uma **norma permissiva**. Correção adotada: são
2 eixos **independentes**:
- **Forma normativa**: OBRIGACAO / PERMISSAO / PROIBICAO / INSTRUCAO / INFORMATIVO
- **Ação operacional**: COLETAR_FATO / CONFIRMAR_VISUALMENTE / APLICAR_REGRA_DETERMINISTICA /
  JULGAR_TECNICAMENTE / NENHUMA

`PERMISSAO` carrega um `fato_que_aciona` — só entra na fila do analista se o projeto de fato usar a
solução permitida; senão fica recolhido.

### 6.5 Armazenamento — reaproveitado, sem migration nova

`mhd_resultados_campo` (a mesma tabela satélite usada pelo LIP, ver `MANUAL_SLOT5_LIP.md` seção 4)
já tinha `AGUARDANDO_FATO`/`MANUAL` no enum de resultado e colunas `valor_manual`/
`autor_manual_id`/`complementado_em` que nunca sobrescrevem o resultado automático — desenhada
exatamente para este caso, só nunca usada fora do LIP até este plano. Decisão: reaproveitar
integralmente, sem tabela nova. Fatos complementares (ainda não-oficiais no LIP) entram como
`modulo="LIP"` com uma chave fora dos 136 campos oficiais — se um dia forem promovidos a campo
oficial, o dado já está no formato certo, zero migração.

**Contagem ao vivo (25/08/2026)**: `mhd_resultados_campo` com `modulo=MAC` tem só **1 linha** — é o
clique de teste manual feito em 04/08/2026 para validar o endpoint (seção 6.6, Bloco 2), não uma
execução automática real. `modulo=LIP` tem **548**.

### 6.6 O que foi construído — 3 blocos, todos em produção

**Bloco 1** (commit `a448875`) — endpoint de escrita para `valor_manual`: `lib/mhd.ts` ganhou
`complementarCampo()` (grava só `valor_manual`/`autor_manual_id`/`complementado_em`, nunca toca
`resultado`/`valor`/`fonte` automáticos; cria a linha do zero quando o item nunca teve tentativa
automática; toda gravação registra evento em `mhd_eventos`). `app/api/admin/rastreabilidade/route.ts`
ganhou `POST` (antes só tinha `GET`).

**Bloco 2** (commit `8600159`) — não virou página nova: `app/admin/rastreabilidade/page.tsx` já lia
os itens MAC do Slot 5 (filtros, classificação BIP/LIP, painel expansível) — só faltava a AÇÃO de
responder. Badges de postura clicáveis (filtram a lista) + coluna "Postura" na tabela. Componente
novo `RespostaItem`: formulário inline no painel expandido; para RESOLVIDO pré-preenche com o valor
automático e o botão vira "Confirmar" (reenvia o mesmo valor, zero mudança de backend); NAO_APLICAVEL
não tem ação; DADO_NECESSARIO/VEREDITO_HUMANO pedem texto livre. **Verificado ponta a ponta pelo
usuário** (não pela sessão de IA, que não tinha cookie de sessão): processo de teste, item
respondido, gravou `resultado=MANUAL`, UI atualizou na hora.

**Bloco 3** (commit `47a0db0`) — a ponte piloto→tela: `lib/mac-motor/slot5/ponteMhd.ts` traduz
aplicabilidade/resultado do piloto (seção 4.2) para o `resultado` do MHD (o mesmo campo que decide a
postura na tela): CONFORME/NAO_CONFORME → INFERIDO (postura RESOLVIDO); PENDENTE → AGUARDANDO_FATO
(DADO_NECESSARIO); NAO_APLICAVEL → NAO_APLICAVEL; ERRO_DADOS/INDETERMINADO/REVISAO_MANUAL →
BLOQUEADO (catch-all VEREDITO_HUMANO); NAO_AVALIADO → nada é escrito. **Achado que quase virou bug
sério**: a função batch já usada pelo LIP (`registrarResultados()`) APOSENTA todas as linhas
vigentes de `(processo,modulo,slot)` antes de inserir — pensada para "leitura completa da pasta"
(sempre todos os campos de uma vez). Reusá-la para o piloto do MAC (que só resolve 3 dos itens por
execução) teria **apagado as respostas manuais do analista em todos os outros itens**. Por isso
nasceu `registrarResultadoItem()`, que grava/aposenta só a chave dada, nunca o lote inteiro.

**Estado real de uso**: a tela nasceu correta mas **vazia de automação** — qualquer processo mostra
a maioria dos itens em VEREDITO_HUMANO hoje, porque nenhuma execução automática real ainda grava
nessa tabela para o Slot 5 (só o piloto de 3 itens, e só quando chamado diretamente, sem link em
tela nenhuma para o analista comum). Isso é o comportamento **esperado** pelo plano — endereçar não
é o mesmo que automatizar.

### 6.7 O que foi descartado deliberadamente

Roteiro de 10 etapas antigo · meta de automatizar 100% dos itens · mais versões de prompt para o
memorial ICCAP · reexecutar o 44353 buscando 3× CONFORME · expandir para os outros 13 dos 15
arquétipos originais do piloto (pausado, não apagado) · taxonomia de 1 eixo só · "validar a matriz
inteira por humano antes de construir qualquer coisa" (armadilha que o plano anterior e uma consulta
externa cometeram do mesmo jeito) · tabela nova para fatos assistidos.

---

## 7. Reconciliação do checklist contra a planilha real

### 7.1 O achado original (18/08/2026)

O checklist do MAC do Slot 5 no banco **não batia** com a planilha real do Fábio (`LIP MAC
APROVAÇÃO.xlsm`, aba "DENTRO DAS ABAS DO MAC" = 524 itens reais + 50 cabeçalhos). 47 dos 48 grupos
tinham contagem diferente — só "RECUOS E AFASTAMENTOS" batia exato. Diferença total: **+244 itens no
banco**, alguns grupos quase 10× maiores do que deveriam (ex.: "PL. DE COBERTURA" tinha 3 itens
reais e apareceu com 27).

**Causa raiz confirmada**: a migration `2026_07_29_mac_compatibilizacao_despacho_oficial.sql` (só
adiciona colunas) foi seguida de um script não versionado que importou o **Despacho Geral Oficial**
inteiro e, ao segmentar por grupo, **duplicou blocos inteiros no grupo errado** — a leva inteira caiu
em **ordem alfabética de grupo** (ordem 9000 = "47.QUANTO...", depois ACESSIBILIDADE, ALTURA,
ATIVIDADE ECONÔMICA...), ou seja, cada item novo foi jogado por casamento automático de palavra, não
pela estrutura real do documento. Por isso "atividade econômica" atraiu a lista de embarque/EIT, e
"cobertura" atraiu tudo que falava de laje.

**Não era lixo puro**: já existiam 67 respostas gravadas exatamente nesses itens "extras" (Análise 1
do processo 50724), e 44% dos vínculos BIP e 25% dos vínculos LIP originais estavam pendurados
neles.

### 7.2 Estratégia — nunca deletar na hora

1. Item que bate com a planilha (por grupo + texto): `UPDATE` no lugar, mesmo `id` — preserva
   vínculo LIP/BIP automaticamente.
2. Item sem correspondência: `ativo=false`, **nunca `DELETE`**. Motivo registrado em
   `nota_analista`. Vínculos e respostas continuam existindo, só dormentes.
3. `versao_compatibilizacao` nova por rodada de reconciliação, para distinguir do rastro do import
   malfeito de 29/07.
4. **Regra final combinada**: só quando o Fábio confirmar "fechou o MAC" é que os itens
   `ativo=false` que sobrarem são apagados de verdade (`DELETE`). Até lá, tudo é reversível — mesmo
   padrão de segurança já usado no "Zerar Slot" do admin (trava + aviso + confirmação explícita).
5. Migração sem perda: antes de desativar um item, migrar vínculos e respostas do analista para o
   item "gêmeo" que fica, quando existir gêmeo.

**Lição que custou uma rodada inteira**: casar por **similaridade de texto sozinha erra e erra
perigoso**. Um item real e em uso (`"Área construída, número de pavimentos, descrição de
pavimentos;"`) foi classificado como "sobra" por um comparador fuzzy, porque a planilha tinha a
versão completa e o banco guardava só o começo (item **truncado**, não duplicado). Corrigido usando
sinal ESTRUTURAL (duplicata EXATA + grupo que a planilha realmente atribui), nunca só o score de
similaridade.

### 7.3 Cronologia resumida (18-25/08/2026) — 768 → 538 ativos

A reconciliação avançou em levas sucessivas, cada uma auditada e revertível:

- **18/08 — Levas 1-6**: 37 duplicatas exatas migradas sem conflito (768→731); +4 achados olhando a
  tela ao vivo contra o Despacho Geral (731→727); +20 resolvidos usando a posição dos parágrafos do
  Despacho Geral como juiz para casos ambíguos (levas 3-4, →718); +19 desativados a pedido explícito
  do Fábio ("se tá duplicado, joga fora e conserta o problema que der", leva 5, →697, com uma trava
  que impediu zerar um grupo inteiro por engano); +37 títulos de grupo que tinham virado item
  marcável por engano (leva 6, →660).
- **Itens 1 (INFORMAÇÕES NO SISTEMA), 2 (DOCUMENTAÇÃO) e 3 (CARIMBO) fechados item a item** contra
  a planilha E contra o texto completo do Despacho Geral (não só estrutura — cobertura real do LIP
  campo a campo, texto cortado comparado e corrigido). Esse processo (conferir estrutura → checar
  cobertura do LIP → comparar texto contra planilha e despacho) é o **método-modelo** para os outros
  45 grupos.
- **24/08 — achado grande**: 136 itens ativos com `ordem >= 9000` (rastro do import de 29/07,
  espalhados por 34 dos 48 grupos) estavam sistematicamente em grupo errado. Auditoria completa por
  trigramas: 35 duplicatas exatas + 49 trechos de item já existente = **84 saem sem perder regra
  nenhuma**; 52 são conteúdo novo do Despacho Oficial, ficaram para decisão grupo a grupo depois
  (659→575).
- **25/08 — reconciliação item a item completa, grupos 1 a 48**: o Fábio trouxe o Excel real (abas
  "MAC ABAS" + "DENTRO DAS ABAS DO MAC") e o Despacho Geral padrão. **Regra final, exata**: item da
  planilha fica idêntico ao Excel; item só do Despacho Geral (sem par na planilha) fica, mas com
  **asterisco na frente da frase**; duplicado/lixo sai. Método: alinhamento de sequência por
  programação dinâmica entre as linhas do Excel de um grupo e os itens ativos do mesmo grupo no
  banco (mais preciso que comparação gananciosa isolada — pega frases compostas que a reescrita de
  29/07 partiu em pedaços, inclusive pedaços que foram parar em outro grupo). Os 48 grupos foram
  percorridos, SQL gerado para cada lote, o Fábio rodou no SQL Editor (o modo automático da sessão
  bloqueia escrita direta em produção, sempre foi o Fábio colando o SQL). **Declarada 100% fechada
  em 25/08/2026** — as 5 perguntas em aberto que sobraram (ver 7.4) foram todas respondidas pelo
  próprio Fábio no mesmo dia.

### 7.4 As 5 perguntas em aberto — todas respondidas

1. **3.6** (CARIMBO, título do projeto): achou que era truncamento (banco tinha mais opções de
   trâmite que o Excel) — o Fábio confirmou por print que o Excel **não** estava cortado, era texto
   curto mesmo. Erro da análise automática, corrigido.
2. **3.15** (CARIMBO): banco tem "compatibilizar com a representação do projeto" a mais — Fábio
   decidiu **manter o banco** (a planilha estava incompleta).
3. **17.3** (ALTURA DE EDIFICAÇÃO, Setor Jaó/Sul): banco cita LC 349/2022 + nota de subsolo
   aflorado; Excel cita LC 364/2023 sem nota — divergência de **lei diferente**, não só redação.
   Fábio decidiu **manter o banco** (Excel estava desatualizado).
4. **31.12** (ESTACIONAMENTO): Excel fala de recuo com pilares E paredes; banco só falava de
   paredes — Fábio decidiu **forçar o texto do Excel** (Anexo XXI), banco estava errado.
5. **ÍTEM 25** (rebaixo de meio-fio solto, sem par claro no grupo): Fábio decidiu **remover**, sem
   marcar com asterisco.

### 7.5 Achados que continuam relevantes para qualquer reconciliação futura

- **Padrão de merge que se repete**: muitas frases da planilha são um PREFIXO compartilhado +
  cláusula específica (ex.: "Atender Índice de Permeabilidade para AOS e ARAU (Art.194...): Atender
  25%..." e "...: Indicar em planta..."). O import de 29/07 frequentemente separou prefixo e
  cláusula em duas linhas diferentes do banco — às vezes na mesma posição (fácil), às vezes solta na
  leva `ordem>=9000` ou até em outro grupo inteiro.
- **Item no grupo errado, não só duplicado**: um trecho de índice paisagístico apareceu dentro de
  FRAÇÃO IDEAL (movido para o ÍTEM 19); a regra do EIT que faltava apareceu dentro de ATIVIDADE
  ECONÔMICA (movida para o ÍTEM 22).
- **Duplicata de verdade dentro do próprio Excel do Fábio**, não bug do banco: ÍTEM 14 tem 3 pares
  de linha idêntica; ÍTEM 22 tem "macroprojeto" 3×, "ensino" 2×, "habitação" 2×, "anexar EIV/RIV"
  2×. Mantido 1 de cada par/trio no checklist, sem inserir repetido.
- **Snapshot local desatualiza rápido**: o script de alinhamento (`alinhar.py`, efêmero) lê um dump
  do banco que fica desatualizado assim que o Fábio roda um SQL — refazer o fetch antes de continuar
  numa sessão nova, ou o alinhamento de grupos já tocados sai errado.
- **Antes de qualquer UPDATE/DELETE**: sempre checar (1) se o item que vai sair tem resposta
  gravada no processo real e migrar para o gêmeo se ele não tiver; (2) vínculos LIP/BIP presos no
  item que sai; (3) rodar em `begin/commit` com `select count(*)` conferindo o total esperado antes
  de fechar a transação.

### 7.6 Trilha de auditoria

`mac_checklist_itens` **não tinha trigger de auditoria** (uma tentativa de assumir que existia, como
em outras tabelas do URBIS, falhou alto com `RAISE EXCEPTION` — o guard-rail funcionou). No URBIS,
`auditoria_log` é **sempre escrito pelo código da aplicação**, nunca por trigger de banco — cada
rota grava sua própria `operacao` (`MAC_ITEM_DESATIVADO`, `MAC_VINCULO_MIGRADO`,
`MAC_RESPOSTA_MIGRADA`, `MAC_VINCULO_REDUNDANTE_REMOVIDO`, `MAC_TEXTO_COMPLETADO`, etc.).

### 7.7 Item pendente por decisão consciente, não esquecimento

O item "Art. 6º — 180 dias sem movimentação" (grupo DOCUMENTAÇÃO) não batia nem com a planilha nem
com o Despacho Geral extraído — quase foi desativado por engano. **O Fábio corrigiu**: é regra de
negócio real, com efeito concreto que ele quer implementado — todo processo com mais de 180 dias
parado com o interessado deve (a) ficar **impedido de gerar laudo** e (b) **recomendar** o parecer
de indeferimento. Fica ativo, não é para tocar. Bloqueado até a geração de laudo existir (seção 8) —
precisa de um contador de "dias desde a última movimentação com o interessado" que não existe em
nenhuma tabela hoje.

---

## 8. Geração de documentos a partir da análise MAC

### 8.1 Despacho ao Interessado — construído, em produção

O template `public/templates/despacho-slot5-base.docx` é o próprio **"Despacho Geral -
Aprovacao.docx"** do Fábio com o miolo recortado (script `scripts/montar-template-despacho-slot5.py`)
— por isso o documento emitido sai visualmente igual ao modelo oficial: mesma fonte, mesmos
estilos, mesma numeração automática das exigências (o Word numera sozinho via `numId=6` do próprio
template, o gerador nunca escreve "1.", "2." no texto).

Peças: `lib/mac-motor/slot5/gerarDespacho.ts` (preenche o template) · `app/api/mac/slot-05/despacho/
route.ts` (junta LIP + análise + assinante) · `scripts/montar-template-despacho-slot5.py` (refaz o
template quando o Despacho Geral original mudar).

**O que muda por processo**: cabeçalho (OS/PROJETO Nº/INTERESSADO/ASSUNTO/DESPACHO Nº, do LIP) ·
tabela "Controle de Etapas" (data de cada uma das até 5 análises — a data da 1ª nunca é
sobrescrita quando a 2ª é emitida, é histórico) · o miolo (exigências = itens marcados NÃO CONFORME,
agrupados pelo grupo do checklist) · data por extenso e assinatura do analista logado.

**Corrigido em 25/08/2026** (commits `0890830`, `c90f134` — ver histórico de versões deste manual
para a data de referência):
- **Item não divide mais entre páginas** — `keepNext`/`keepLines` em todos os parágrafos de um item
  (exigência + continuação + observação) exceto o último, na ordem exigida pelo schema OOXML (logo
  após `pStyle`, antes de `numPr`).
- **Logo do Slot 1**: a imagem que o template original trazia (flutuante, `behindDoc=1`, herdada de
  outra pessoa) **nunca apareceu nem no arquivo-fonte** — confirmado pelo Fábio. Trocada por
  `public/logo_prefeitura.png` (a mesma do Slot 1), inserida como imagem INLINE (sem posição/z-order
  ambígua) no cabeçalho.
- **Numeração de página "X/Y"** compacta no rodapé — o template não tinha nenhuma, via `w:fldSimple`
  PAGE/NUMPAGES.
- **Botão "Reemitir Despacho nº X"**: reaproveita o número já gravado na análise sem consultar a
  série nem consumir número novo (mesma lógica do Slot 1, `prepararNumeracao`) — antes o botão dizia
  "Reemitir" mas o modal sugeria o PRÓXIMO número da série, risco real de queimar um número à toa.
  Reemissão também usa o checklist e as observações **atuais** (o próprio fluxo salva o estado
  corrente antes de gerar), mantendo o número original mas com a data de emissão do dia da
  reemissão (a menos que o analista edite manualmente).

**Regras de negócio, iguais ao Slot 1/2**: numeração de despacho/parecer é **fonte única para todos
os slots** (`/api/numeracao/proximo`), nunca série própria por slot. `peek` ao abrir o modal,
`commit` só depois do `.docx` pronto — falha na geração nunca queima um número da faixa. Só entram
itens **ativos** do checklist — marca presa a item desativado do checklist sumiria calada, por isso
a rota devolve o cabeçalho `X-Exigencias-Perdidas` e a tela avisa.

**Armadilhas do template docx** (relevantes para qualquer edição futura do gerador):
- **Namespaces**: editar `document.xml` sem registrar todos os prefixos do `<w:document>` original
  faz o Word recusar o arquivo.
- **Texto fragmentado em runs**: campos não são strings contíguas — o número da CHEADV vive num run
  isolado, a data é 3 runs separados ("Goiânia, " / "26 de maio de 2026" / "."). A substituição mira
  o run exato, nunca a frase inteira.
- **`sectPr` é o último filho do `<w:body>`** e não pode ser removido no recorte.

### 8.2 Despacho Interno — construído, em produção

Não tem gerador próprio. A rota `/api/despacho-interno` já era agnóstica de slot (resolve o assunto
pelo slug, usa `lib/geradores.ts`, manda e-mail ao responsável, grava no MDP) — o Slot 5 reusa ela
inteira. Sai da MESMA série de numeração do despacho ao interessado, com `documento=despacho_interno`
discriminando o commit (sem isso um sobrescreveria o número do outro). O LIP não precisou de mudança
— o botão nunca foi travado por slot.

### 8.3 Laudo e Indeferimento — não construídos

Botões existem na tela (tracejados), geração nunca foi implementada — decisão consciente do Fábio
("depois a gente cria"). **Atenção antes de construir**: no Slot 1, o Laudo sai em formato `.xlsm`
(`lib/geradores/gerarLaudo.ts`, `/api/mac/gerar-laudo`), **não** `.docx` como o Despacho — não
presumir que o Slot 5 replica o formato `.docx`, confirmar com o Fábio antes.

Consequências de não existir ainda:
- A regra "Art. 6º — 180 dias" (seção 7.7) não pode ser implementada.
- `atendeAcessibilidade` no LIP (ver `MANUAL_SLOT5_LIP.md`, seção 8.5) não pode virar SIM
  automaticamente na emissão.
- O vínculo BIP no texto do despacho (coluna "Lei/artigo (BIP)" no Excel, hoje só leitura — o
  vínculo é do MODELO do checklist, não da análise de um processo específico) só entra no texto
  gerado quando o Fábio revisar item a item e aprovar essa incorporação — decisão pendente,
  registrada em memória separada, não construída.

### 8.4 Excel export/import do MAC do Slot 5

Formato `slot5-mac-2` (compatível com `-1` da planilha antiga — a importação aceita os dois).
**Bug corrigido**: a exportação dizia levar "TUDO o que é preciso para RESTAURAR", mas deixava de
fora `observacoes_por_item` — um ciclo backup → limpar MAC → reimportar perdia todas as observações
por item em silêncio.

**Escopo por análise** (25/08/2026): exportar, importar, "Limpar MAC" e LER PASTA agora recebem o
`analiseId` da tela. Antes todos agiam na análise de MAIOR NÚMERO — quem estivesse conferindo a
Análise 1 baixava a planilha da 3, limpava a 3 achando que limpava a 1, e mandava ao Gemini a lista
de pendências da 3.

**Marcas órfãs**: a análise do 50724 tem marcas apontando para itens que a reconciliação (seção 7)
desativou — descartadas corretamente no Excel e no despacho, mas ainda inflam o registro bruto.
Limpeza pendente, nunca pedida explicitamente.

---

## 9. LER PASTA (IA) do MAC — motor próprio, distinto do LIP

**Não confundir com o LER PASTA do LIP** (`MANUAL_SLOT5_LIP.md`, seção 3) — são mecanismos
diferentes, em rotas diferentes (`/api/mac/slot-05/ler-pasta` vs `/api/lip/ler-pasta`). O botão
existia desde 17/08/2026 mas **nunca tinha sido executado de verdade** até 18/08/2026 — nem em
teste, nem em produção.

### 9.1 Dois bugs reais de produção, achados na 1ª execução real

1. **`ArrayBuffer` detached** — mesma armadilha documentada no `MANUAL_SLOT5_LIP.md` (seção 3.4):
   `lerPastaSlot5` usa pdfjs para catalogar, que detacha o buffer recebido; a rota reusava o mesmo
   buffer depois para subir o PDF vencedor ao Gemini → sempre quebrava. Corrigido catalogando com
   uma cópia (`buffer.slice()`).
2. **Nome de arquivo acentuado quebra o header HTTP** do upload ao Gemini
   (`X-Goog-File-Name`) — mesma armadilha e mesma correção do LIP (sanitizar só a cópia usada no
   header).

### 9.2 O Atendimento vira papel reconhecido — decisão de arquitetura

Pedido original: automatizar o PDF do Atendimento para preencher o item 1 do MAC. A primeira
tentativa construiu um parser+comparação determinística separada (`lerAtendimento.ts`) — **o Fábio
corrigiu a direção**: *"eu tenho 48 itens... isso é só um item... esse pdf vai tá dentro da pasta"*
— ele queria o Atendimento como **mais um documento reconhecido** dentro do LER PASTA (IA) já
existente, usado holisticamente pelo Gemini para qualquer um dos 48 grupos, não um mecanismo
hardcoded à parte. Implementado assim: novo papel `"atendimento"` em `ASSINATURAS`
(`lib/lerPastaSlot5.ts`), reconhecido pelo texto do documento, adicionado a `PAPEIS_UTEIS` na rota
do MAC. `lerAtendimento.ts` foi **deletado** depois da correção de direção.

**Por que não é papel do LER PASTA do LIP**: o item 1 do MAC é uma CONFERÊNCIA (compara Atendimento
× LIP já preenchido) — só faz sentido depois do LIP estar pronto. Por isso mora no LER PASTA do
**MAC**, nunca no do LIP.

### 9.3 Estado real — nunca completou uma execução com sucesso

Confirmado por script rodando a mesma lógica da rota contra os arquivos reais do 50724: upload dos
6 PDFs ao Gemini funciona (os 2 bugs acima não travam mais), mas a chamada final `generateContent`
bateu em **503 (sobrecarga do servidor do Google) 4 vezes seguidas** — não é bug de código, é
externo, mesmo padrão já visto no teste histórico do 44353 (seção 5). **Ninguém nunca viu o
resultado classificado de verdade.**

Mitigação de 25/08/2026: a rota repete a chamada final até 3 vezes em 429/500/502/503/504, com
espera crescente e o motivo visível na barra de progresso — um 503 não joga mais fora a pasta
inteira que acabou de subir. `maxOutputTokens` passou a ser explícito e, quando o Gemini devolve
resposta vazia, o erro diz o `finishReason` (MAX_TOKENS, bloqueio…) em vez do genérico "resposta do
Gemini não é JSON". Ainda vale rodar fora do horário de pico.

---

## 10. Recurso relacionado, fora do Slot 5: "LER ARQUIVOS INDIVIDUAIS"

Construído em 20/08/2026 para os **Slots 1 e 2** (não o Slot 5) — botão que manda os documentos do
processo um por um ao Gemini, em vez de um PDF único (contorna o limite de 50MB de arquivo único).
Mencionado aqui só como contexto, porque revelou uma armadilha de arquitetura relevante para
qualquer prompt que processe documento isolado: enviar um documento por vez faz o modelo interpretar
"não vejo a prancha aqui" como "a prancha está ausente do processo" (`nao_conforme` em vez de
`null`) — corrigido com um bloco de prompt concatenado em runtime, sem tocar `lip_prompts`
compartilhado. **O Slot 5 usa rota própria** (`/api/mac/slot-05/*`), inteiramente separada de
`/api/mac/p3` — nada desse trabalho alcança o Slot 5, confirmado por diff a cada commit daquela
sessão.

---

## 11. Backlog oficial — 8 itens parados de propósito (snapshot de 20/08/2026)

Avaliação pedida pelo Fábio, cruzada contra o banco real. **Decisão explícita: não mexer em nenhum
destes sem ele pedir** — só memorizar. Não retomar sozinho (ver seção 12, rotina de trabalho do
Fábio).

1. **Reconciliação do checklist** — a maior parte estava pendente neste snapshot; **avançou muito
   desde então e foi declarada 100% fechada em 25/08/2026** (ver seção 7). Item tecnicamente
   superado por este manual, mantido aqui só para registro histórico da ordem em que os itens do
   backlog foram anotados.
2. **LER PASTA (IA) do MAC nunca terminou com sucesso** — segue valendo (seção 9.3).
3. **Bug de área obsoleta corrigido só no 50724, não em código geral** — segue valendo (ver
   `MANUAL_SLOT5_LIP.md`, seção 8.3). Sem script de detecção geral — se o mesmo padrão aparecer em
   outro processo, ninguém pega automaticamente.
4. **`outorgaOnerosa` depende do bug 3** — segue valendo (seção 4.3).
5. **Documentos do Slot 5 não geram** (Laudo, Indeferimento) — segue valendo (seção 8.3).
6. **Regra "180 dias sem movimentação" travada no item 5** — segue valendo (seção 7.7).
7. **Filtro "MÉDIO PORTE" sem alvo definido** — a condição (`grandePorte`) já existe no código;
   ninguém definiu ainda quais grupos do checklist esse filtro deve atingir.
8. **EIV/EIT — legislação recebida, parcialmente processada**: o Fábio mandou a Lei 11.127/2024
   (EIV) e a Lei 10.977/2023 (EIT) numa mensagem que cortou no meio antes de decidir se era para
   automatizar tudo. **Atualização**: parte disso JÁ foi implementada depois deste snapshot — os
   gatilhos de EIT/EIV com saída exigido/dispensado/SEM DADO existem hoje (seção 3.4). O que
   continua manual: a parte "está aprovado?" (depende de processo externo, nunca vai automatizar) e
   qualquer refinamento que dependa de "área ocupada pela atividade" virar campo confiável no LIP
   (hoje é `PENDENTE_VISAO`, não confiável para decidir sozinho).

**Nota**: no mesmo dia desse snapshot, a busca de coordenadas por IPTU no Mapa Fácil foi estendida ao
Slot 5 a pedido explícito — isso NÃO é uma pendência parada, foi executado (ver
`MANUAL_SLOT5_LIP.md`, seção 6). Não confundir os dois.

---

## 12. Governança — regras que valem para qualquer trabalho neste módulo

- **Slot 1 é intocável sem pedido explícito nomeando "Slot 1"** — regra suprema do Fábio, cobre
  telas, APIs, prompts, regras, fluxos, dados, fallbacks e qualquer comportamento compartilhado que
  possa atingir o Slot 1, mesmo como efeito colateral de uma tarefa que é sobre o Slot 5. O Slot 5
  tem `P3_MAC` próprio justamente para não depender do fallback compartilhado que hoje aponta para o
  Regularização/Aceite.
- **Cada slot fica travado por padrão** — só o(s) autorizado(s) explicitamente **na sessão atual**
  ficam destravados; autorização de sessão anterior não vale sozinha. Autorização vigente conhecida
  mais recente para o Slot 5: *"TA AUTORIZADO MEXER SO NO SLOT 5, EM TUDO... PROIBIDO SLOT 1 E 2"*
  (24/08/2026) — mas confirmar de novo no início de qualquer sessão nova, a regra é por sessão, não
  permanente.
- **O Fábio é analista de verdade, não só quem constrói o sistema.** Ele processa Regularização e
  Aprovação de Projeto na prefeitura de tempo real; existe meta de produção de Regularização que
  compete pelo tempo dele. Quando ele avisa que vai parar para bater meta, **não é para retomar
  trabalho de dev sozinho na sessão seguinte** — guardar o ponto exato de parada (qual item, qual
  arquivo, o que falta) para a retomada ser rápida, mas esperar ele pedir.
- **"Subir" significa `git commit` + `git push`** — ele normalmente pede as duas coisas juntas, não
  como passos separados. Ainda assim, sempre mostrar o diff/resumo antes de executar.
- **Mais de uma sessão de IA mexe neste repositório ao mesmo tempo** — sempre `git status`/`git log
  --oneline -10` no início de qualquer sessão nova, antes de assumir que o estado local bate com o
  que a memória registra.

---

## 13. Glossário específico do MAC

| Termo | Significado |
|---|---|
| **MAC** | Módulo de Análises e Conformidades — o checklist de conformidade legal/técnica |
| **Item / grupo** | Um item é uma exigência (`SUB N`); um grupo é uma seção do checklist (`ÍTEM N`, 1-48 + OBS=49) |
| **Postura** | Um dos 4 estados derivados que resumem como o URBIS trata um item: RESOLVIDO, NÃO APLICÁVEL, DADO NECESSÁRIO, VEREDITO HUMANO |
| **RESOLVIDO** | Regra determinística + fato disponível; analista só confirma |
| **DADO NECESSÁRIO** | O sistema sabe que precisa de um fato específico e pergunta ao analista, com evidência ilustrativa quando existir |
| **VEREDITO HUMANO** | Analista decide e justifica — catch-all para a maioria dos itens hoje |
| **ICCAP** | Índice de Controle de Captação de Água Pluvial — quadro na prancha, campo historicamente instável na leitura automática |
| **Outorga onerosa** | Cálculo que compara altura da edificação (até cobertura/forro/telhado) e área construída contra área do terreno |
| **Reconciliação** | O processo de 18-25/08/2026 que ajustou o checklist do banco para bater exatamente com a planilha real do Fábio |
| **Asterisco** | Marca convencionada na reconciliação para item que vem do Despacho Geral mas não tem par na planilha do Fábio |
| **`ordem >= 9000`** | Marca de rastro do import malfeito de 29/07/2026 — não é regra de negócio, é resíduo técnico |
| **Classificação BIP** | VINCULADO_BIP / SEM_FUNDAMENTO_BIP / REVISAO_MANUAL — o quanto um item se ancora num artigo de lei |
| **Classificação LIP** | AUTOMATIZAVEL / PARCIALMENTE_AUTOMATIZAVEL / MANUAL_COM_EVIDENCIA_LIP / REVISAO_MANUAL |

Para o vocabulário compartilhado com o LIP (Matriz de Rastreabilidade, declaração/resultado,
método/regra, MHD, BIP como módulo satélite), ver `MANUAL_SLOT5_LIP.md`, seção 10.

---

## 14. Auditoria geral do Slot 5 — 25/08/2026

Varredura da tela, das 16 rotas, do motor e do estado real do banco. O que foi corrigido:

### 14.1 Perda de dados

1. **Gravação encadeada apagava a anterior.** Toda ação que grava (`marcar`, filtros, LER PASTA,
   EIT/EIV) montava seu mapa a partir do `marcas` da renderização em que a função nasceu. Numa
   sequência dentro do mesmo clique — LER PASTA aplica os itens da IA e, logo depois, cada filtro
   de tema que a leitura confirmou — a segunda gravação salvava por cima da primeira e **apagava
   do banco as sugestões da IA que acabaram de ser gravadas**. Corrigido com um estado
   autoritativo em `useRef` (`estadoRef`): quem MUTA lê do ref, que é atualizado de forma
   síncrona; quem só EXIBE continua lendo o state.
2. **Observação por item e OBS geral só iam para o banco por acaso.** Digitar e fechar a aba
   perdia o texto. Agora salvam ao sair do campo (`onBlur`), 1,5s depois da última tecla, **e a
   qualquer clique na tela** (ver seção 14.11).
3. **Duas análises criadas por dois cliques rápidos.** Como qualquer marcação grava na hora, dois
   cliques num MAC ainda sem linha no banco entravam ao mesmo tempo em `garantirAnalise` e criavam
   duas. Agora a criação em voo fica num ref e o segundo clique espera a mesma promessa.

### 14.2 Ação na análise errada

4. **Exportar / Importar / Limpar MAC / LER PASTA** agiam sempre na análise de maior número, e
   não na que estava aberta. Todos passaram a receber o `analiseId` da tela; a rota devolve 404
   quando o id não pertence ao processo.
5. **O histórico não trocava junto com a análise.** Selecionar a Análise 1 mostrava a trilha da 3.

### 14.3 Trabalho refeito

6. **Filtro desfeito voltava a cada abertura** (ver 3.4).
7. **Unidade territorial e números de estudo só no navegador** (ver 3.5).
8. **Toast a cada abertura** ("Filtros avaliados — nada novo a retirar") removido; o registro de
   filtros na OBS passou a contar o que REALMENTE foi marcado, não o alcance total do filtro.

### 14.4 Trilha e documento

9. **Desmarcar não entrava no histórico.** A comparação só percorria as chaves do mapa novo; item
   devolvido para pendente some do mapa e ficava fora da trilha. Agora a comparação é sobre a
   união das chaves e a saída é registrada com `status_novo = "limpo"` — o mesmo rótulo que
   "Limpar MAC" já usava.
10. **A trilha creditava o dono da análise, não quem alterou.** Corrigido: `mac_historico` grava o
    usuário logado.
11. **Ordem dos grupos no despacho podia divergir da tela.** Onze grupos do Slot 5 têm itens
    acrescentados depois, com `ordem` na casa dos 9000; um grupo cuja única não conformidade
    estivesse num deles descia para o fim do documento. O despacho passou a ordenar os grupos pela
    MENOR ordem do grupo no checklist — a mesma posição do "ÍTEM N" do índice.

### 14.5 Achados na noite de 26/08, com processo real na mão

12. **A sigla da unidade territorial era inventada.** O Uso do Solo do 48535 escreve
    `ÁREA DE ADENSAMENTO BÁSICO` sem a sigla; `siglaDaUnidade` pescava "a última palavra curta" e
    adotava **`BASICO`** (no 48533, `AREA`; em "ÁREA DE OCUPAÇÃO SUSTENTÁVEL", **`DE`**). Agora usa
    a tabela de nomes por extenso que o próprio `promptP3.ts` já declara — `AAB`, `AA`, `AOS`,
    `ADD` — e, quando não reconhece, deixa **em branco** em vez de chutar.
13. **CNAE de preenchimento tratado como atividade real.** O Uso do Solo dos dois traz
    `000000008 — Comércio sem uso definido`. A IA lia certo, mas o motor tratava o código como uma
    atividade conhecida que simplesmente não era nenhuma das listadas: EIT e EIV iam para
    **dispensado** e os filtros retirariam 16 itens do checklist sozinhos. Código só de zeros
    agora vale **sem dado** — pendência não vira dispensa (`cnaeEhPlaceholder`).

### 14.6 Monitor de preenchimento — dois anéis lado a lado (26/08/2026)

Os anéis concêntricos escondiam qual número era qual. Agora são dois círculos iguais, lado a
lado, no mesmo padrão do Monitor IA do LIP:

- **marcado** — respondidos ÷ itens do checklist
- **por filtro** (azul) — quantos saíram sem o analista marcar

**Pendente, pedido do Fábio na mesma noite e não implementado:** separar um terceiro número, para
distinguir o que veio dos **filtros do banco** (`mac_slot5_filtros`, calculados a partir dos campos
do LIP — `COMERCIAL`, `APRO DE PROJ`, `S/ SUBSOLO`…) do que veio dos **filtros de tema**
(`FILTROS_TEMA`, com emoji, marcados pelo analista ou pela leitura da pasta — `🚦 Sem EIT`,
`🛫 Sem zona aeroportuária`…). A distinção existe e é visível na fonte gravada de cada item.

### 14.7 Três anéis e o "Limpar MAC" que zera de verdade (26/08/2026)

**Três monitores, não dois** — pedido do Fábio: *"total marcados, filtros, e LIP"*.

- **marcado** — respondidos ÷ itens
- **filtros** (azul) — temas marcados na tela ou pela leitura da pasta (`FILTROS_TEMA`,
  reconhecidos pelo rótulo gravado na fonte)
- **do LIP** (roxo) — os que saíram sozinhos pelos filtros de `mac_slot5_filtros`, calculados a
  partir dos campos do LIP (`COMERCIAL`, `APRO DE PROJ`, `S/ SUBSOLO`…)

O terceiro é o que interessa acompanhar: mede **quanto do checklist o LIP resolve sem ninguém
decidir nada**. No 48533, 200 dos 538 itens saíram assim.

**"Limpar MAC" passou a zerar tudo** — respostas, filtros, observações e **todas as análises** —
em vez de só apagar as respostas da análise aberta. Exclusão LÓGICA (`excluido_em`), nunca DELETE:
a linha continua no banco e dá para recuperar. A numeração de análises passou a ignorar as
excluídas, senão a próxima nasceria como nº 4 num processo que voltou a ter zero.

### 14.8 Sinalizado, não alterado

- `app/api/mac/slot-05/p3/route.ts` está **sem chamador** desde que `ler-pasta` assumiu; ficou de
  pé com aviso no cabeçalho. Quem for mexer no motor de leitura mexe em `ler-pasta`.
- `app/api/mac/slot-05/executar-piloto/route.ts` também não tem chamador de tela — é exercitada
  pelo `scripts/testar_mac_motor_slot5.mts`.
- `aplicabilidade.ts` (482 linhas) é **fallback**: com 13 filtros ativos em `mac_slot5_filtros`,
  ele nunca roda. O painel de filtros agora diz qual dos dois está no ar.
- Dois itens ativos do checklist compartilham `ordem = 52` (grupos CARIMBO e PROCESSOS
  MODIFICAÇÃO SEM ACRÉSCIMO). Não afeta a numeração da tela porque são de grupos diferentes, mas
  é candidato à próxima reconciliação.
- O filtro **MEDIO PORTE** está cadastrado sem grupos, itens nem termos: alcança zero itens e
  aparece corretamente em "Sem dado para decidir". Falta configurá-lo em Gerenciar Filtros.

### 14.9 Unidade territorial: o valor do LIP passou a valer como preenchimento automático (26/08/2026)

**A decisão registrada na seção 3.5 foi revertida, a pedido do Fábio.** O campo do filtro
UNIDADE TERRITORIAL ficava em branco até uma leitura de documento *dentro do MAC* (pasta ou
arquivo avulso) enxergar a sigla no Uso do Solo — o valor que o **LIP** já tinha lido não contava.
No processo 48533 isso significava abrir o MAC com o campo vazio mesmo o LIP já sabendo
`ÁREA ADENSÁVEL → AA` corretamente (mesma tabela da seção 14.5), e o analista tinha que digitar a
sigla à mão de novo.

Agora `/api/mac/slot-05/estudos` também devolve `unidadeTerritorialDoUsoDoSolo` (mais um campo em
`CAMPOS_MOSTRADOS`, sem tocar em `DadosEstudos`/`estudosExigencias.ts` — é só leitura extra do
mesmo LIP), e a tela usa esse valor como **último** fallback: só entra se a análise salva e o
`localStorage` do navegador não já tiverem um valor. Não muda a hierarquia que já existia (análise
> navegador), só acrescenta uma fonte abaixo delas. Uma leitura de documento dentro do MAC
continua podendo trocar a sigla depois, normalmente.

### 14.10 O laço LIP→MAC — 8 filtros novos marcam item sozinho a partir do cruzamento (26/08/2026)

Pendência que o Fábio pediu para cobrar nesta conversa (a recomendação de fechamento da noite de
26/08 — ver seção 12 do `MANUAL_SLOT5_LIP.md`): o motor de cruzamento já sabia dizer "isto
divergiu" ou "isto foi declarado e não entregue", mas ficava preso num texto livre — o analista
lia o campo do LIP e marcava o item do MAC à mão, um por um.

**8 filtros novos em `mac_slot5_filtros`, todos com prefixo `LAÇO LIP:`**, todos `CAMPO_LIP_IGUAL`
com `status_alvo = "nao_conforme"`, todos mirando o ITEM 1 ("INFORMAÇÕES NO SISTEMA ALVARÁ MAIS
FÁCIL") — porque esse item já lista, no próprio texto, exatamente os campos que o cruzamento
compara:

| Filtro | Campo do LIP acionador | Item do checklist |
|---|---|---|
| ÁREA DO TERRENO DIVERGENTE | `divergenciasChaves` contém `areaTerreno` | "Área do terreno;" |
| ÁREA CONSTRUÍDA DIVERGENTE | `divergenciasChaves` contém `areaTotal` | "Área construída, número de pavimentos..." |
| ART DE PROJETO DIVERGENTE | `divergenciasChaves` contém `numeroDeArtProjeto` | "Compatibilizar Nº das ARTs e RRTs;" |
| ART DE EXECUÇÃO DIVERGENTE | `divergenciasChaves` contém `numeroDeArtExecucao` | idem |
| ART DE CAIXA DIVERGENTE | `divergenciasChaves` contém `numeroDeArtCaixa` | idem |
| ART DECLARADA E NÃO ENTREGUE | `declaradoMasNaoEntregueChaves` contém `artNaoEntregue` | idem |
| VAGAS ATENDIDAS DIVERGENTES | `divergenciasChaves` contém `totalDeVagasAtendidasParaAtividade` | "Vagas atendidas para comércio;" |
| VAGAS PCD ATENDIDAS DIVERGENTES | `divergenciasChaves` contém `vagasPcdAtendidas` | "Vagas PcD" |

O valor de cada campo é uma lista com pipe nas duas pontas (`|areaTerreno|numeroDeArtProjeto|`);
o `valor_esperado` de cada filtro também vem com pipe (`|areaTerreno|`), então a comparação por
substring do `CAMPO_LIP_IGUAL` não deixa `numeroDeArtProjeto` bater dentro de
`numeroDeArtExecucao`, nem `areaTerreno` dentro de `areaTotal` — testado com `avaliarFiltros`
contra um LIP simulado antes de subir.

**Deliberadamente sem filtro** para as outras ~9 chaves que o cruzamento também cobre (endereço,
proprietário, responsável técnico, data de pagamento, vagas *exigidas*): nenhum item do checklist
cita esses campos no próprio texto, e inventar um mapeamento sem o item dizer isso seria decisão
de analista, não coisa que eu decido sozinho. Ver seção 15 do `MANUAL_SLOT5_LIP.md` para a lista
completa do que ficou de fora e por quê.

**Não testado ainda com leitura real de pasta ponta a ponta** — só com `avaliarFiltros` isolado.
O próximo processo lido no Slot 5 é o primeiro teste de verdade em produção.

### 14.11 Qualquer clique na tela grava (26/08/2026)

Pedido do Fábio, fechando a última janela de perda de trabalho. **Não é um salvamento por clique**
— seria uma enxurrada de requisições. É o **adiantamento** do salvamento que já estava agendado:

- Marcação de item já gravava na hora (não mudou nada aí).
- Observação (geral e por item) gravava no `onBlur` e 1,5s depois da última tecla.
- **Agora**: qualquer clique na tela descarrega imediatamente o que estiver pendente. Sem nada
  pendente, o clique não dispara requisição nenhuma.

Um `visibilitychange` cobre o caso de fechar/trocar de aba. O listener roda na **fase de captura**
do `document`, para gravar mesmo quando o clique é num elemento que chama `stopPropagation` (os
modais desta tela fazem isso). O timer da observação passou a zerar `obsTimer.current` ao disparar
— sem isso, o descarregador acharia que ainda havia pendência e mandaria uma gravação repetida a
cada clique seguinte.

**A janela que fechou:** digitar na observação e fechar a aba (ou trocar de janela) dentro do 1,5s
sem tirar o foco do campo — o `onBlur` não chega a disparar nesse caminho.

O LIP recebeu o mesmo tratamento na mesma data (ver seção 18 do `MANUAL_SLOT5_LIP.md`), com a
diferença de que lá o debounce é de 2s e vale para qualquer campo, não só a observação.

---

### 14.12 Quatro filtros de aplicabilidade revisados (26/08/2026)

Rodada pedida pelo Fábio olhando o 48533 na tela. Tudo em `mac_slot5_filtros` — **nenhuma linha de
código mudou**, é configuração de banco, e já vale sem deploy.

**1. `NÃO É LOTE DE ESQUINA` (novo, automático).** Aciona quando `esquina = NÃO` no LIP — campo que
o próprio leitor deriva de `quantasFrentes` (`nVias > 1 ? "SIM" : "NÃO"`), então "uma via só" já
cai aqui sozinho. Marca **9 itens** como Não se Aplica: os 5 de chanfro/afastamento em relação ao
chanfro (ord 145-149), os 2 de face de menor caixa em terreno com 3 vias (ord 137 e 140), o da
calçada a 10m da interseção dos alinhamentos (ord 296) e o do rebaixo a 10m da interseção (ord
319).

*Dois itens ficaram de fora de propósito*, e por isso a lista é explícita em `itens_ids` em vez de
um `termos_item: ["ESQUINA"]` que os varreria: ord 308 ("Para terrenos com testadas de até 50m… —
*Obs. Somar testadas no caso de esquina*") e ord 309 ("início do rebaixo das esquinas com mín.
5,00m"). Nos dois, "esquina" é observação lateral e a regra principal vale de qualquer jeito.

**2. `S/ CORREDOR` — de MANUAL para automático.** Passou a acionar por
`anexouCertidaoDeCorredorViario = NÃO`, retirando o **ÍTEM 16 (CORREDOR VIÁRIO)** inteiro, 8 itens.

> ⚠️ **Rótulo x conteúdo desse campo.** O rótulo diz "ANEXOU CERTIDÃO DE CORREDOR VIÁRIO?", mas o
> valor é `uds.corredorViario ? "SIM" : "NÃO"` (`lerPastaSlot5.ts`) — ou seja, responde **"o Uso do
> Solo aponta corredor?"**, não "a certidão foi anexada?". São perguntas diferentes: um lote em
> corredor cuja certidão não veio é exigência, não N/A. O filtro está correto porque usa o
> conteúdo real; o RÓTULO é que engana. Renomear é decisão do Fábio — não mexi.

**3. `SEM UTILIZAÇÃO DO RECUO FRONTAL` (novo, MANUAL).** Nenhum campo do LIP diz se o projeto ocupa
o recuo frontal, então é botão para o analista, no mesmo padrão do antigo `S/ CORREDOR`. Alcança
**7 itens** — os do Art. 67 e 68 da LC 364/2023 cujo assunto É a utilização do recuo (escadas e
rampas, piscina, marquise do Art. 67, guarita, abrigo de resíduos, subestação e o limite de 2%).

*Deixados de fora, cada um por um motivo:* marquises (ord 344-347) e subsolo aflorado (ord 124,
125, 127) já têm filtro próprio (`SEM MARQUISE`, `S/ SUBSOLO`) e teriam dois donos; Central/
Campinas (ord 143) fala de **obrigatoriedade** de ocupar, não de utilização opcional; e as vagas no
recuo (ord 389, 420-422, 9205) são o caso mais delicado — no próprio 48533 a manobra é pela
calçada, o que sugere que o projeto **usa** o recuo, então marcá-las N/A poderia estar errado
justamente aqui.

**4. `S/ ONEROSA` — cobertura ampliada.** A condição já estava certa (`CAMPO_LIP_AUSENTE` sobre
`outorgaOnerosa` + `tDC`; `ausente()` reconhece tanto "NP" quanto "NÃO"), mas o alcance era só 1
grupo + 1 item avulso. Com `termos_item: ["ONEROSA", "ONEROSO", "TDC"]` passou a **21 itens**, em 5
grupos — o do coeficiente (14), ALTURA DE EDIFICAÇÃO (2), DOCUMENTAÇÃO (2), OBSERVAÇÕES GERAIS DA
LEI DE ATIVIDADE (2) e ÍNDICE DE APROVEITAMENTO (1). Conferido que com `outorgaOnerosa = SIM` o
filtro não dispara.

Os quatro foram testados com `avaliarFiltros` contra LIPs simulados (o caso do 48533 e o inverso).
**Nenhum testado ainda com LER PASTA real ponta a ponta.**

---

### 14.13 Térreo e vagas: 6 filtros novos + 2 campos internos (26/08/2026)

Continuação da rodada de filtros pedida pelo Fábio olhando o 48533. Dois campos internos novos no
LIP (mesmo padrão de `divergenciasChaves` — não são `lip_campos`, só existem para o motor de
filtros ler com segurança):

- **`ehTerreo`** — `"SIM"` quando `pav === 1`. Existe porque comparar `pav` direto num filtro
  `CAMPO_LIP_IGUAL` seria perigoso: a comparação é substring, e `valor_esperado="1"` bateria dentro
  de `"10"`, `"11"`, `"21"`. Mesma lógica que já zera `acessoVertical`/`trafegoElevadores` no LIP,
  agora disponível para o MAC também.
- **`temVagasExigidas`** — `"SIM"` quando `totalDeVagasExigidasParaEssas > 0`. Existe porque o
  motor de filtros não tem como expressar "diferente de zero" com `CAMPO_LIP_IGUAL`.

**6 filtros novos:**

| Filtro | Gatilho | Alcance |
|---|---|---|
| TÉRREO — S/ PAVIMENTO SUPERIOR | `ehTerreo=SIM`, automático | 1 item (grupo ACESSIBILIDADE - NBR9050) |
| TÉRREO — S/ CIRCULAÇÃO VERTICAL | `ehTerreo=SIM`, automático | 8 itens, lista explícita (ver abaixo) |
| TEM VAGAS — S/ ISENÇÃO | `temVagasExigidas=SIM`, automático | 5 itens (grupo ISENÇÃO DE VAGAS) |
| SEM VAGAS EXTERNAS | MANUAL | 7 itens (CALÇADA + Rebaixo atividades §11º) |
| SEM VAGAS DESCOBERTAS | MANUAL | 4 itens (VAGAS uso habitacional/atividades gerais) |
| SEM LOCAÇÃO DE VAGAS | MANUAL | 10 itens (CARIMBO, CORREDOR VIÁRIO, DA QUANTIDADE DE VAGAS) |

**Por que "TÉRREO — S/ CIRCULAÇÃO VERTICAL" é lista explícita, não `termos_item`.** Primeiro teste
usou `termos_item: ["ESCADA", "PLATAFORMA", "ELEVAÇÃO VERTICAL", "ELEVADOR", "ELEVADORES",
"ELEVAÇÃO INCLINADA"]` (os termos que o Fábio pediu, literalmente) e pegou **falsos positivos
sérios**: "Apresentar vaga acessível... (2% do número total de vagas)" e a regra de acesso a
tanques de PISCINA — nenhum dos dois tem relação com número de pavimentos, entraram só por
coincidência da palavra "plataforma" em outro trecho do próprio texto do item. Reconstruído com 8
ids explícitos, cada um conferido individualmente:

1. "Para unidade que contenha mais de um pavimento: deverá ser previsto espaço..." — explícito
2. "Será obrigatória a instalação de elevadores nas edificações que excedam 12,00m..." (único item do grupo CIRCULAÇÃO HORIZONTAL E VERTICAL)
3. Anexar Tráfego de Elevadores (>12m)
4. Equipamento eletromecânico de circulação (elevador) — observação em prancha
5. Plataforma de elevação vertical (item 6.10.3) — observação em prancha
6. Plataforma de elevação inclinada — observação em prancha
7. "Em edificações comerciais, não é permitida somente a previsão de instalação de elevadores" — moot sem elevador algum
8. Largura mín. 1,5m fronteira às portas de elevadores/plataformas — moot sem elevador/plataforma

Ficaram de fora, **de propósito**, dois itens sobre caixa de escada de acesso a terraço descoberto
oriundo de TDC (grupo ALTURA DE EDIFICAÇÃO, Art. 73/74) — um terraço com escada própria pode
existir mesmo em edificação de 1 pavimento (acréscimo por TDC), então não é seguro presumir N/A só
pelo número de pavimentos do carimbo.

**Deliberadamente sem filtro automático** — "SEM VAGAS EXTERNAS"/"SEM VAGAS DESCOBERTAS"/"SEM
LOCAÇÃO DE VAGAS": nenhum campo do LIP diz onde ficam as vagas, se são cobertas, ou se o projeto
usa a opção de locação a 300m — os três continuam MANUAL, mesmo padrão do "SEM UTILIZAÇÃO DO RECUO
FRONTAL" (seção 14.12).

**Itens 20 e 30 ficaram de fora desta rodada**, adiados a pedido do Fábio: os textos ("se é
comercial → item 20 NP" e "1 pavimento → item 30 NP") não batiam com o conteúdo real desses grupos
(ÍNDICE PAISAGÍSTICO/ICCAP e MARQUISES E COBERTURAS, respectivamente — o próprio 48533, comercial,
tem ICCAP exigido de 1,35m³ no carimbo, então zerar o item 20 esconderia exigência real). Fica
pendência explícita — não implementado, não chutado.

### 14.14 Item partindo entre páginas no despacho — título de grupo sem `keepNext` (26/08/2026)

Achado ao vivo, o Fábio concluiu uma análise e viu um "item" partido entre duas páginas do
despacho gerado. `paragrafoItem()` (`gerarDespacho.ts`) já protegia isso desde antes — todo
parágrafo do item (exigência + continuações + observação) recebe `<w:keepNext/><w:keepLines/>`
exceto o último, grudando o bloco inteiro. Só o **título do grupo** (`paragrafoGrupo()`) não tinha
proteção nenhuma: podia ficar sozinho no fim de uma página com todos os itens do grupo começando
na seguinte — mesmo sintoma visual ("pedaço numa página, pedaço na outra"), na fronteira
título↔primeiro item em vez de dentro de um item. Corrigido com `<w:keepNext/>` no título.

**Não confirmado contra o despacho exato que gerou o achado** — não tenho como reproduzir a
geração fora da sessão do Fábio (precisa de análise real no banco). Se acontecer de novo, salvar o
`.docx` e mandar — dá pra abrir o XML e achar o ponto exato da quebra.

### 14.15 Filtro duplicado — "S/ EIT E EIV" desativado, botões da tela ganharam os órfãos (26/08/2026)

Achado do Fábio: o filtro `S/ EIT E EIV` (`mac_slot5_filtros`, `PALAVRA_AUSENTE`, alcançava só o
grupo EIT/EIV) duplicava os botões `🚦 Sem EIT`/`🏘️ Sem EIV` da tela (`FILTROS_TEMA`), que já
controlam o mesmo grupo de forma mais granular e ainda alcançam itens fora dele (DOCUMENTAÇÃO,
CARGA E DESCARGA, CALÇADA). Desativado (`ativo=false`, não apagado — a descrição no banco explica
por quê, pra quem olhar depois não achar que sumiu sem motivo).

**Antes de desativar, conferência de cobertura**: os botões da tela alcançavam 13 dos 18 itens do
grupo EIT/EIV por citarem a sigla EIT/RIT/EIV/RIV no texto. Os outros 5 são **continuação de
lista** (a primeira linha diz "EIT. Considerar os seguintes empreendimentos..." ou "Estarão
sujeitos ao EIV: Art.262...", e os itens seguintes só trazem o inciso, sem repetir a sigla) —
ficariam órfãos, sem filtro nenhum os alcançando. Corrigido com `idsExtras` — campo novo no tipo
`FiltroTema` (`page.tsx`), que SOMA ids explícitos aos `termos` (ao contrário de `idsExplicitos`,
que substitui): 1 item no `🏘️ Sem EIV` (operação urbana/lei específica, inc. VIII e IX) e 4 no
`🚦 Sem EIT` (Ceasa/supermercado ≥2.000m², terminal de cargas, aeródromo).

### 14.16 Análise nova nasce em branco + botão de copiar a anterior (26/08/2026)

Mudança pedida pelo Fábio depois de um incidente no Slot 1, aplicada aos três slots (1, 2 e 5).

**Antes**: `iniciarNovaAnalise(n)` copiava a análise anterior inteira — itens, fontes, observações
e aceites. Reanálise nascia idêntica à anterior.

**Agora**: a análise nova herda **apenas os `nao_aplica`**. Esses descrevem o lote e o tipo de
edificação (não é lote de esquina, não incide onerosa, não é corredor viário) e não mudam de uma
análise para a outra. `conforme`/`nao_conforme` é juízo sobre a prancha em mãos — e a prancha da
reanálise é outra —, então nasce vazio, para ser efetivamente reexaminado. Sem isso o analista
herda "conforme" dado sobre um desenho que já foi substituído, e assina por ele.

**Efeito colateral que motivou a mudança**: com a cópia automática, "análise N idêntica à N-1" era
o estado NORMAL logo após criar — indistinguível de uma gravação indevida. Em 26/08/2026 isso
escondeu por horas um problema real no Slot 1 (duas linhas de Análise 2 no banco, uma invisível na
tela). Nascendo em branco, duas análises iguais viram evidência de defeito, não ruído.

**Botão 📄**: cada análise a partir da 2ª ganhou, ao lado da lixeira, um botão que copia a análise
anterior por cima dela, com modal de confirmação. O atalho continua existindo — virou ato
deliberado em vez de padrão silencioso. A Análise 1 não tem o botão (não há de onde copiar).

**`selecionarAnalise` passou a reler do servidor**: antes usava o objeto da lista em memória, que
não acompanha gravações feitas por outra aba, outro dispositivo ou correção direta no banco.

**Trava no banco (vale para os três slots)**: índice único parcial
`analises_mac_unica_por_numero` sobre `(processo_codigo, tipo_processo, numero_analise)` com
`WHERE excluido_em IS NULL` — migration `2026_08_26_analises_mac_unica_por_numero.sql`, aplicada em
produção e verificada. Impede a "análise fantasma": duas linhas com o mesmo número, das quais a
tela mostra uma e a outra segue recebendo gravações invisíveis. Já havia um caso pré-existente
fora do Slot 5 (duas Análises 2 criadas com 171 ms de diferença, disparo duplo).

**Não aplicado ao Slot 5**: a bolinha laranja de "aba com item não respondido", que entrou só nos
Slots 1 e 2. A lista de grupos do Slot 5 já mostra `respondidos/total` e colore o grupo inteiro por
estado; decisão do Fábio de não mexer nela.

**Verificação**: typecheck limpo nos três slots; Slots 1 e 2 conferidos ao vivo no navegador. A
tela do Slot 5 **não pôde ser verificada visualmente** — exige sessão autenticada, indisponível no
ambiente local de quem fez a alteração. Vale conferir o botão 📄 no primeiro processo do Slot 5 com
duas ou mais análises.


### 14.17 Sequência de análises: liberar a próxima só quando a anterior tiver despacho/parecer emitido (26/08/2026)

Achado ao vivo pelo Fábio: clicou querendo abrir a Análise 2 no Slot 1, o clique caiu na Análise 3
(dedo em cima do botão errado) e o sistema **criou a Análise 3 em branco**, sem que a Análise 2
tivesse sido sequer respondida — muito menos despachada. Apagadas as duas manualmente (Análise 2
tinha 18 itens de trabalho real perdido no processo, Análise 3 nasceu vazia).

**Causa raiz — os três slots tinham o mesmo defeito**: `liberada` (a condição que habilita o botão
`Análise N`) checava só se a linha `numero_analise = N-1` **existia** em `analises_mac`:

```ts
const liberada = n === 1 || analises.some((a) => a.numero_analise === n - 1);
```

Uma análise existe assim que criada — em branco, sem nenhum despacho. Bastava a N-1 ter sido
aberta (nem respondida) para a N ficar clicável. O Slot 5 já calculava `jaEmitida` certo (usando
`numero_despacho`/`numero_parecer`) para colorir o botão de verde, mas `liberada` usava o mesmo
critério fraco dos outros dois — o comentário na tela dizia até "mesma regra do Slot 1/2: a N só
libera quando a N-1 existe", documentando o defeito como se fosse a regra pretendida.

**Por que `status` não servia de sinal**: `jaEmitida` no Slot 1/2 comparava `existente.status !==
"em_andamento"`, mas uma consulta no banco mostrou que **nenhuma análise emitida por despacho
normal muda de status** — das 105 linhas de produção com `status`, todas ficam em `"em_andamento"`
para sempre; só `"indeferido"` aparece como alternativa (7 linhas). O campo que de fato muda no
COMMIT do despacho é `numero_despacho`/`numero_parecer`, gravado atomicamente por
`/api/numeracao/proximo` (`route.ts:145`, grava em `analises_mac` via `analise_id`) — é esse o
sinal usado agora, nos três slots, tanto para `jaEmitida` quanto para `liberada`:

```ts
const anterior = analises.find((a) => a.numero_analise === n - 1);
const anteriorEmitida = !!anterior && !!(anterior.numero_despacho || anterior.numero_parecer);
const liberada = n === 1 || anteriorEmitida;
```

Despacho grava em `numero_despacho`; indeferimento e arquivamento gravam em `numero_parecer` (série
de parecer) — os dois contam como "emitida". O Laudo não consome número de faixa (não é despacho
nem parecer) e por isso não destrava a próxima análise sozinho — coerente, porque o Laudo é
normalmente o fecho do processo, não um passo intermediário.

**O botão continua acessível para análises que já existiam** antes desta correção mesmo sem
despacho na anterior (`disabled={!liberada && !existente}` não mudou) — a regra nova trava só a
**criação** de análises novas, não tranca trabalho em andamento legítimo que já estava na tela.

**Defesa em profundidade**: `selecionarOuCriarAnalise` repete a mesma checagem antes de chamar
`iniciarNovaAnalise`, com um aviso (`notificar`/`mostrarToast`) — o botão `disabled` já deveria
impedir o clique, mas a função não confia só nisso.

**Reproduzido por leitura nos três slots**, não compartilhado (regra do slot 1 do `CLAUDE.md`):
Slot 1 (`analise-regularizacao`), Slot 2 (`analise-aceite-sei`) e Slot 5 (este arquivo,
`analise-aprovacao-projeto`) cada um com sua própria cópia do trecho.

---

## Histórico de versões

| Versão | Data | Mudança |
|---|---|---|
| 1.17 | 2026-08-26 | Seção 14.17: `liberada` (botão Análise N) passa a checar despacho/parecer emitido na análise anterior (`numero_despacho`/`numero_parecer`), não a mera existência da linha — achado ao vivo: clique errado criou Análise 3 em branco sem a 2 sequer respondida. Reproduzido nos três slots (1, 2 e 5), com defesa em profundidade em `selecionarOuCriarAnalise` |
| 1.16 | 2026-08-26 | Seção 14.16: análise nova nasce em branco (herda só os `nao_aplica`) + botão 📄 de copiar a anterior a partir da 2ª, nos três slots; `selecionarAnalise` relê do servidor; índice único `analises_mac_unica_por_numero` em produção impede "análise fantasma" (duas linhas com o mesmo número). Bolinha laranja de aba incompleta ficou fora do Slot 5, por decisão do Fábio. Slot 5 não verificado visualmente (exige sessão) |
| 1.15 | 2026-08-26 | Seções 14.13-14.15: 6 filtros de térreo/vagas + 2 campos internos (`ehTerreo`, `temVagasExigidas`); título de grupo do despacho ganhou `keepNext` (item partindo entre páginas); filtro `S/ EIT E EIV` desativado por duplicar os botões da tela, 5 itens órfãos cobertos por `idsExtras` |
| 1.14 | 2026-08-26 | Seção 14.12: 4 filtros de aplicabilidade revisados — NÃO É LOTE DE ESQUINA (novo, automático por `esquina=NÃO`), S/ CORREDOR virou automático (ÍTEM 16 inteiro), SEM UTILIZAÇÃO DO RECUO FRONTAL (novo, manual) e S/ ONEROSA ampliado de 2 para 21 itens. Só configuração de banco, sem deploy |
| 1.13 | 2026-08-26 | Seção 14.11: qualquer clique na tela descarrega o salvamento pendente (observação geral e por item), fechando a janela de perder texto ao fechar a aba dentro do 1,5s; sem nada pendente o clique não dispara requisição |
| 1.12 | 2026-08-26 | Nenhuma mudança no MAC — conferido contra o LIP da mesma data (seção 6.5 do `MANUAL_SLOT5_LIP.md`): o painel da busca de coordenadas passou a abrir sempre no Slot 5. É tela do LIP, não toca em item de checklist, filtro nem documento emitido |
| 1.11 | 2026-08-26 | Nenhuma mudança no MAC — conferido contra o LIP da mesma data (seção 17 do `MANUAL_SLOT5_LIP.md`): cadeia de vagas (AOA, total exigido, PCD/idoso) calculada no LIP, nenhum item do checklist nem filtro tocado |
| 1.10 | 2026-08-26 | Seção 4.4: caixa de recarga passa a ler `areaImpermeabilizada` do LIP direto, em vez de recalcular terreno−permeável por conta própria dentro do motor — achado ao vivo no 48533, `REGRA_VERSAO_CAIXA_RECARGA` 4→5 |
| 1.9 | 2026-08-26 | Seção 14.10: laço LIP→MAC — 8 filtros novos (`LAÇO LIP:`) marcam item `nao_conforme` sozinho a partir do cruzamento declarado×entregue do LIP; tabela completa de campo→item e do que ficou de fora de propósito |
| 1.8 | 2026-08-26 | Sem mudança de comportamento no MAC — o campo `licencaPrevia` foi removido do LIP (ver seção 14 do `MANUAL_SLOT5_LIP.md`) e o único ponto tocado no MAC foi o texto do prompt P3 (`promptP3.ts`), que citava o campo como referência descritiva ao apoiar o ITEM 1; nenhum item do checklist nem filtro dependia dele |
| 1.7 | 2026-08-26 | Seção 3.5 e 14.9: unidade territorial do LIP volta a valer como preenchimento automático do filtro do MAC (como último fallback, atrás da análise salva e do navegador) — segunda reversão dessa regra, achado ao vivo no 48533 |
| 1.6 | 2026-08-26 | Nenhuma mudança no MAC — conferido contra o LIP da mesma data, que reordenou os campos da aba INÍCIO (Interessado, Projeto Nº, Ordem de Serviço Nº, Data Pagto. Taxa inicial pro topo; ver seção 13 do `MANUAL_SLOT5_LIP.md`). Reordenação de campo não muda leitura nem checklist |
| 1.0 | 2026-08-25 | Primeira versão do manual, consolidando toda a memória de sessão acumulada sobre o MAC do Slot 5 (motor, reconciliação, tela, documentos, backlog) e conferência ao vivo de contagens contra o banco |
| 1.1 | 2026-08-25 | Auditoria geral do Slot 5 (seção 14): gravação encadeada, escopo por análise, filtro recusado que não volta, observação que se salva sozinha, painel de EIT/EIV/carga, retry do Gemini, trilha de desmarcação, ordem dos grupos no despacho |
| 1.2 | 2026-08-25 | Regra suprema dos manuais versionados incorporada ao manual e ao `CLAUDE.md` do repositório |
| 1.5 | 2026-08-26 | Seção 14.7: três anéis no monitor (marcado · filtros · do LIP) e "Limpar MAC" zerando tudo por exclusão lógica, com a numeração ignorando as análises excluídas |
| 1.4 | 2026-08-26 | Seção 14.6: monitor com dois anéis lado a lado, no padrão do LIP. Conferido contra o motor de cruzamento do LIP da mesma noite (seção 12 do `MANUAL_SLOT5_LIP.md`), que passa a produzir `divergenciasEntreDocumentos` e `declaradoMasNaoEntregue` — a matéria-prima do laço LIP→MAC, ainda não construído |
| 1.3 | 2026-08-26 | Seção 14.5: sigla da unidade territorial deixa de ser inventada quando o Uso do Solo escreve o nome por extenso, e CNAE de preenchimento (`000000008`) passa a valer "sem dado" em vez de dispensar EIT/EIV sozinho. Conferido contra os defeitos de leitura do LIP da mesma noite (seção 11 do `MANUAL_SLOT5_LIP.md`) |
