# Plano — URBI Assessor Ativo (processo aberto + Pilha) · todos os slots ativos

**Data:** 08/09/2026 · **Versão:** v4 · **Estado:** Fases 1, 2, 3, 4 e 6 com código no ar (ver
status de cada uma abaixo) — todas testadas por `tsc`/`build`, nenhuma com o portão humano
confirmado por escrito ainda. Fase 5 levantada e bloqueada por decisão técnica em aberto (ver
abaixo). Fase 7 não precisa de código (relatório já existe). Fase 8 não iniciada (decisão de custo
real, não é trabalho de uma madrugada sozinha) ·
**Escopo:** todos os slots ativos (Regularização, Aceite SEI, Aprovação de Projeto) — URBI/BDI/
Radar/Motor de Produção são módulos **satélite**, servem os três ao mesmo tempo por desenho; não
há isolamento por slot a respeitar aqui como há em LIP/MAC.

---

## 1. O pedido

> "Preciso do URBI ativo e interativo, inteligente, que conhecendo o processo aberto (lendo tudo
> do LIP e MAC do processo aberto) ou da pilha de processos, ele assessore o analista agilizando
> a análise — revisando, fiscalizando, sugerindo, avisando, ajudando a responder campos,
> comparando campos."

## 2. O que já existe (auditoria — não construir de novo)

Achado central da auditoria (2 agentes, código real): **quase todo o "cérebro" já existe e já
roda de graça, mas quase nada dele aparece sozinho pro analista.** É praticamente tudo motor sem
painel — reativo, escondido atrás de clique ou de mensagem no chat.

| Peça | O que já faz | Onde | Proativo hoje? |
|---|---|---|---|
| **Vigia do processo** | Campos vazios/em X, incoerências, retrabalho, exigências recorrentes, referência legal só com vínculo real, triagem (mais simples/exige atenção/maior risco) | `lib/bdi/vigia.ts`, `components/bdi/VigiaProcesso.tsx` | Busca dado sozinho, mas **fica fechado por padrão** — regra do próprio Fábio (02/09): "consultar o Vigia é decisão do analista, não algo empurrado na cara dele". Sem badge de severidade no cabeçalho fechado. |
| **Dossiê factual** | Lê LIP + MAC + MHD + MDP/MRP + cruzamentos + evolução do checklist — tudo do processo aberto, sem precisar que o analista diga o código | `lib/urbi/montarDossie.ts` | Já sabe qual processo está aberto (pega da URL). Só é montado quando o chat é aberto e uma mensagem é mandada. |
| **Motor de Produção** | Prioriza até 3 ações (bloqueante → documento ausente → campo crítico → reincidência → divergência → observação), com "esforço provável" | `lib/urbi/motorProducao.ts` | Responde a **qualquer** mensagem no chat quando há processo em contexto — mas só se o chat estiver aberto e algo for digitado. Nunca aparece sozinho. |
| **Radar** | Job de fundo (`pg_cron`, ~1x/min, até 10 processos/20s por execução, até 200 processos visíveis) que roda dossiê + Motor de Produção + catálogo consultável + linha de evidência + previsão de tempo, **por processo**, e grava um "retrato" | `lib/urbi/radar.ts`, `lib/urbi/radarJob.ts` | Roda sozinho, sem sessão de analista precisar estar aberta (corrigido 05/09). Resultado só é lido quando alguém pergunta na Home/Pilha pelo chat. |
| **Perguntas da Pilha** | ~20 perguntas determinísticas ("mais perto de emitir", "menos pendências", "quais têm documento pendente"...) direto do retrato já pronto — nunca recalcula | `lib/urbi/perguntasPilha.ts` | 100% sob pergunta. A tela `/processos` **não lê nada disso** — só tem 1 badge próprio (aguardando retorno), calculado à parte. |
| **"Co-Analista"** | Não é um painel separado — é o MODO do chat quando há processo em contexto | `app/api/urbi/chat/route.ts` | Mesma limitação do chat: precisa abrir e escrever algo. |
| **Bolha de dica (`urbi:dica`)** | Único mecanismo genuinamente proativo hoje: aparece sozinha por 10s quando o analista preenche o Responsável Técnico e há histórico relevante | `app/processo/ProcessoClient.tsx`, `components/urbi/UrbiGlobal.tsx` | **Sim, de verdade.** Padrão pronto pra generalizar. |
| **`compararLip.ts`** | Sugere valor de campo do LIP a partir de documento já identificado, com aceite explícito | `lib/documentosSei/compararLip.ts` (Slots 1/2, Documentos Vivos) | Só dentro do Organizador de PDF SEI, não no fluxo geral do LIP. |
| **Custo** | Radar, Motor de Produção, perguntas da Pilha, Vigia: **100% SQL/determinístico, zero IA** (confirmado por comentário e por grep — nenhuma chamada Gemini nesses módulos) | — | Gemini só entra quando alguém pede leitura visual de PDF de verdade (`/api/lip/s2`, `/s3`, visão do Slot 5) |

**Conclusão da auditoria:** dá pra entregar a maior parte do pedido **sem gastar 1 centavo de IA
a mais** — é reaproveitar dado que já é calculado a cada minuto e nunca chega à tela. O trabalho
real é **camada de apresentação + proatividade**, não motor novo.

---

## 3. Decisões que precisam ser suas antes de começar (D1-D4)

Mesma disciplina do plano de Documentos Vivos — decisão de UX/comportamento muda o desenho, não
é opinião técnica.

### D1/D2/D4 — RESOLVIDAS (07/09/2026): o Sinaleiro do URBI

Decisão do Fábio, refinada nesta sessão: o ícone do URBI (já existe, sempre visível,
`components/urbi/UrbiGlobal.tsx`) vira um **sinaleiro** — cor indica o tipo de intervenção
pendente, sem nunca empurrar nada sozinho na tela:

- 🟢 **Verde — Sugerir.** Campo vazio com valor disponível pra preencher, comparar campos. Sem
  pressa, é ajuda.
- 🟡 **Amarelo — Corrigir/Revisar.** Algo já preenchido diverge do documento ou de outro
  cruzamento (Vigia, `lib/urbi/cruzamento.ts`). Precisa de atenção.
- 🔴 **Vermelho — Fiscalizar/bloqueante.** Ação tier 1 do Motor de Produção, alerta de
  integridade, incoerência real. Trava a análise até resolver.
- **Sem cor** — nada pendente (estado de hoje).

Regras do sinaleiro:
1. **Nunca acumula.** Um ícone, uma cor por vez — a de maior prioridade quando há mais de um tipo
   (vermelho > amarelo > verde). Um número ao lado mostra quantos itens daquela cor existem.
2. **Clicar nunca aplica nada sozinho** — só abre a lista dos itens daquela cor, com motivo e
   fonte declarados (mesmo estilo do Vigia hoje). Aceitar uma sugestão continua sendo uma ação à
   parte, item por item — clicar no sinaleiro é "deixa eu ver o que é", não "aceito tudo".
3. **Cor + ícone/forma, nunca só cor** — acessibilidade (daltonismo).
4. Item que o analista já viu e decidiu ignorar não volta a incomodar, a menos que o fato mude
   (documento novo, campo alterado).

Isso resolve D1 (Vigia sem quebrar a regra "nunca empurrar na cara" — o sinaleiro é indicador, não
abertura forçada), D2 (chat "com algo a dizer" = a cor do sinaleiro) e D4 (generaliza `urbi:dica`
substituindo a bolha avulsa por um estado persistente e sempre no mesmo lugar).

### D3 — ainda em aberto: Na Pilha, ordenar por urgência é o padrão da tela, ou fica como opção
que o analista liga? Mudar o padrão de uma tela que todo mundo usa todo dia é mudança de hábito
de verdade — vale decidir com calma, não só tecnicamente. Fica pendente pra quando chegar na
Fase 2.

---

## 4. Princípios (herdados do que o URBIS já é)

1. **Custo zero por padrão.** Fases 1-6 abaixo não tocam Gemini — reaproveitam Radar/Vigia/Motor
   de Produção, que já são de graça. Só a Fase 8 (opcional) introduz IA, atrás de interruptor e
   teto, no mesmo modelo já usado em `lib/visao/index.ts`.
2. **Nunca decide sozinho.** Sugestão de campo, comparação, prioridade — tudo com aceite
   explícito do analista. Isso já é cultura do projeto (Documentos Vivos, Motor de Produção);
   este plano não muda essa regra em lugar nenhum.
3. **Fonte sempre declarada.** Toda dica/aviso/sugestão cita de onde veio (LIP, MAC, MHD, BDI) —
   já é como Vigia/Motor de Produção/perguntas da Pilha funcionam hoje; só falta espalhar isso pra
   mais lugares da tela.
4. **Nenhum dado novo inventado.** Tudo isto é reaproveitar cálculo que já existe. Onde faltar
   dado, a resposta é "base insuficiente" — nunca estimativa disfarçada de fato.
5. **Vale pros três slots ativos ao mesmo tempo**, porque os módulos usados são satélite. Não se
   cria comportamento "só pro Slot 1" nem se duplica código por slot aqui.

---

## 5. Fases

Cada fase tem portão de saída — sem prova, não avança.

### Fase 1 — O Sinaleiro (ícone do URBI ganha cor, processo aberto)
Base de tudo que vem depois. `components/urbi/UrbiGlobal.tsx` já tem o ícone fixo na tela — ganha
um pequeno "farol" (cor + forma, nunca só cor) calculado a partir do que já é buscado hoje sem
custo novo: Vigia (`/api/bdi/vigia`, já dispara sozinho no `useEffect`) e, quando há processo em
contexto, o relatório do Motor de Produção. Prioridade fixa vermelho > amarelo > verde, nunca mais
de uma cor ao mesmo tempo, número do lado mostrando quantos itens. Clicar abre uma lista curta
(motivo + fonte de cada item, mesmo estilo do Vigia) — nunca aplica nada sozinho. O cabeçalho do
Vigia em si continua fechado por padrão (a regra de 02/09 não muda); o sinaleiro é quem avisa que
vale abrir.

**Portão:** processo com avisos reais mostra a cor e a contagem certas; processo limpo fica sem
cor (nunca "tudo verde" alarmista à toa). Cores nunca se acumulam — sempre uma só, a mais urgente.

**Status 08/09/2026 — revertido para a ideia original, sem widget separado:** o semáforo à parte
(`components/urbi/SinaleiroUrbi.tsx`, 3 luzes empilhadas, arrastável) foi apagado — na sua palavra,
"esse sinaleiro nunca deveria existir, o URBI que tem que ser turbinado". A cor não é mais um
widget adicional: é o próprio avatar do URBI (`components/urbi/UrbiGlobal.tsx`) que ganha o
filtro de cor (técnica `mix-blend-mode: color` sobre a foto, preservando textura — hue-rotate foi
descartado por distorcer de forma imprevisível) mais um selo com forma (▲ vermelho, ◆ amarelo,
● verde) e contagem, mantendo "cor + forma, nunca só cor". O avatar agora aparece em qualquer tela
(não só na Home) — resolve de vez o achado de 07/09 de que não existia ícone persistente do URBI
fora da Home. Clicar não abre mais uma lista separada: abre o chat direto, já contextualizado com
o motivo de cada item (o URBI fala o que encontrou), nunca fala sozinho sem clique. `lib/urbi/
sinaleiro.ts` (a função pura de cálculo de cor, `calcularSinaleiro` + `combinarComDicaRt`) foi
mantida — só o widget visual em cima dela mudou de lugar. Mapeamento de cor inalterado: vermelho =
alerta do Vigia + tier 1 do Motor; amarelo = atenção do Vigia + cruzamento (tier 5) + dica de RT;
verde = documento já no MHD, só falta vincular (tier 2, esforço "rápido"). Se 3 cores se mostrarem
poucas, o Fábio já sinalizou que dá pra criar mais — não implementado ainda, é observação para o
futuro. Portão formal (teste ao vivo em processo com aviso real vs. processo limpo) ainda pendente
de confirmação sua com o código novo.

### Fase 2 — Pilha ativa: esforço e alertas do Radar na tela `/processos`
A tela da Pilha passa a ler `urbi_radar_retratos` (mesma fonte que já alimenta as perguntas do
chat) pra mostrar, por linha: esforço provável (rápido/exige atenção/depende de documento/base
insuficiente) e contagem de pendências — com opção de ordenar por isso. Nenhuma chamada nova ao
Radar; só leitura do que ele já grava a cada ~1 min.

**Portão:** ordenar a Pilha por "esforço" bate com o que a pergunta "mais perto de emitir?" no
chat já responde pros mesmos processos — mesma fonte, mesma resposta, sem divergência.

**Status 07/09/2026 — código no ar, portão humano pendente:** `/api/processos` anexa
`esforco_provavel`/`pendencias_radar` (retrato mais recente de `urbi_radar_retratos`, sem
consulta nova); `/processos` ganhou badge por linha e a opção "Esforço (mais rápido primeiro)" no
seletor de ordenação. `tsc`/`build` limpos. Falta você conferir se a ordenação bate com o que o
chat responde pros mesmos processos — não testado interativamente (exige sessão logada).

### Fase 3 — Sinaleiro cobre também o histórico de Responsável Técnico
Hoje o único aviso genuinamente proativo do sistema é a bolha `urbi:dica` (só pra histórico de
RT). Esta fase migra essa dica pra dentro do sinaleiro (cor amarela, mesmo critério de hoje) em
vez de uma bolha avulsa de 10s que pode passar despercebida — fica persistente até o analista ver.

**Portão:** preencher um RT com histórico relevante acende o sinaleiro amarelo, com o mesmo dado
que a bolha antiga mostrava; nada se perde na migração.

**Status 07/09/2026 — código no ar, migração deliberadamente conservadora:** o evento `urbi:dica`
agora TAMBÉM acende o sinaleiro em amarelo (persistente até abrir e fechar a lista uma vez),
vermelho continuando a vencer. A bolha avulsa antiga (peek de 10s em `UrbiGlobal.tsx`) **não foi
removida** — ficou rodando em paralelo, de propósito: mexer nela sem poder testar ao vivo era
risco desnecessário. Retirar a bolha antiga fica pra quando você confirmar que o sinaleiro já
cobre bem o caso. `tsc`/`build` limpos; portão de conferir "nada se perde" ainda não testado por
você (precisa preencher um RT com histórico real e ver os dois avisos).

### Fase 4 — Chat abre já sabendo do processo (resumo automático ao abrir, não ao digitar)
Hoje o relatório do Motor de Produção só aparece depois que o analista manda uma mensagem. Passa
a aparecer como primeira mensagem do URBI assim que o painel do chat é aberto dentro de um
processo — o analista não precisa perguntar "e aí, como está esse processo".

**Portão:** abrir o chat em qualquer processo mostra situação + próxima ação sem digitar nada;
abrir na Home (sem processo) continua exatamente como hoje.

**Status 07/09/2026 — código no ar, portão humano pendente:** `UrbiChat.tsx` ganhou
`abrirComRelatorioMotor()`, chamada no lugar da saudação genérica sempre que há `processoCodigo` e
não existe uma `mensagemInicial` de dica já pronta (Fase 3 continua tendo prioridade quando as
duas coincidem). Mesmas duas funções puras que `app/api/urbi/chat/route.ts` já usa quando o
analista escreve com processo em contexto — nenhuma regra nova. Fora de processo (Home), nada
muda. `tsc`/`build` limpos; não testado interativamente (exige sessão logada).

### Fase 5 — Ajudar a responder e comparar campos, fora do Organizador de PDF SEI
O padrão de `lib/documentosSei/compararLip.ts` (sugerir valor de campo a partir de documento já
identificado no MHD, aceite explícito) generaliza pro Vigia: campo vazio que JÁ tem documento
correspondente no MHD (mesmo cruzamento que já fizemos no Motor de Produção, §6/§21 do plano de
Documentos Vivos) ganha um botão "usar valor do documento X" direto no aviso do Vigia — não só
dentro do Organizador.

**Portão:** um campo vazio com documento correspondente no MHD mostra a sugestão no Vigia; aceitar
grava exatamente como o LIP já grava hoje (mesmo mecanismo, nunca um caminho de escrita novo).

**Status 07/09/2026 — levantada, NÃO implementada esta rodada.** O caminho de dado existe e foi
confirmado no código (não é mais suposição): `lib/documentosSei/persistencia.ts` já grava
`mhd_documentos` (papel/escopo) + `mhd_versoes` (vigente) + `mhd_conteudos.dados.idSei` de verdade
para os Slots 1/2, a partir do Organizador de PDF SEI — a dúvida inicial de que isso só existiria
pro Slot 5 (via `mhd_resultados_campo`) estava errada; `mhd_resultados_campo` É exclusivo do Slot
5, mas o caminho certo pra 1/2 é outro (o do parágrafo acima), e ele existe. O que falta é
engenharia, não dado: (1) `VigiaProcesso.tsx` hoje não recebe nenhuma prop de gravação — precisa
de `onAceitarCampos` (mesma assinatura que os dois Organizadores já usam,
`aceitarCamposOrganizador` em `ProcessoClient.tsx`, reaproveitável tal qual); (2) `Aviso`
(`lib/bdi/vigia.ts`) não carrega hoje nenhuma referência a campo/documento — precisa de um
`sugestaoCampo?: { chave, valor, fonte }` opcional, calculado numa função nova que cruza LIP vazio
× `mhd_documentos`/`mhd_versoes`/`mhd_conteudos` do processo (reaproveitando
`CAMPO_POR_PAPEL_PECA`/`ROTULO_CAMPO_LIP` de `compararLip.ts`, nunca duplicando a regra); (3) essa
nova função populada por uma consulta a mais em `/api/bdi/vigia`. Não implementado esta madrugada
por decisão de segurança: é escrita em LIP (mesmo atrás de aceite explícito) numa área que eu não
consigo testar sem sessão logada — prefiro entregar o levantamento certo a arriscar um cruzamento
de dado errado sem verificação.

### Fase 6 — "Briefing do dia" na Home/Pilha
Resumo textual determinístico (template, não Gemini) ao abrir a Home: "hoje: N processo(s) com
ação bloqueante, M pronto(s) pra despachar, K com retorno vencendo" — construído só com os
retratos já existentes, mesma fonte da Fase 2.

**Portão:** os números do briefing batem exatamente com o que as perguntas equivalentes no chat
já respondem.

**Status 07/09/2026 — código no ar, portão humano pendente:** `/api/processos` passou a expor
`tem_acao_bloqueante` (tier 1 do Motor) e `sem_pendencias_motor` (`acoes.length === 0`), lidos do
mesmo retrato da Fase 2 — nenhuma consulta nova. A Home ganhou a seção "Briefing do dia" com a
frase exata do template. `tsc`/`build` limpos; não testado interativamente.

### Fase 7 — Capacidade do Radar (medir antes de decidir)
Hoje: até 10 processos/execução, a cada ~1 min, 200 processos visíveis por consulta. Antes de
aumentar qualquer limite, medir contra o volume real de processos ativos hoje (quantos precisam
de retrato atualizado por hora) — só sobe teto/frequência se a medição mostrar fila acumulando.
Decisão técnica, não de produto.

**Portão:** relatório de fila/atraso real (já existe em `/admin/urbi`, aba Radar) mostrado antes
de qualquer mudança de configuração.

**Status 07/09/2026 — confirmado que não precisa de código novo.** A aba "Pré-análise da Pilha"
em `/admin/urbi` (`app/admin/urbi/page.tsx`, consumindo `/api/admin/urbi/radar`) já mostra:
estado do processador de servidor, cobertura (com retrato pronto / fila pendente / em atualização
/ atualizados nos últimos 15 min), execuções recentes, fila pendente linha a linha e erros
recentes. Esta fase é 100% decisão sua, olhando esse painel — nenhum limite foi tocado.

### Fase 8 — Camada de IA sob pedido (opcional, custo real)
Só depois das fases determinísticas no ar. Um botão explícito "peça ao URBI pra revisar este
processo com atenção" — Gemini lendo o que o determinístico não alcança (ex.: coerência de texto
livre, leitura de imagem/desenho). Mesmo modelo de governança já usado (`lib/visao/index.ts`):
interruptor próprio, teto por processo/hora, custo mostrado antes do clique, nunca automático.

**Portão:** com o interruptor desligado, zero chamadas de IA a mais que hoje.

---

## 6. Cronograma

**Sessões, não calendário** — mesma lógica já usada no plano de Documentos Vivos: depende de
quantas sessões você abre por semana, não de dias corridos. A tabela abaixo dá os dois números:
sessões estimadas e o prazo em dois ritmos de referência.

| Fase | Sessões | Ritmo dedicado (~1 sessão/dia útil) | Ritmo normal (~2-3 sessões/semana) |
|---|---|---|---|
| 1 — Vigia com badge | 1 | 1 dia útil | 2-3 dias |
| 2 — Pilha ativa (esforço/alertas) | 1-2 | 1-2 dias úteis | 3-7 dias |
| 3 — Aviso proativo generalizado | 1-2 | 1-2 dias úteis | 3-7 dias |
| 4 — Chat abre sabendo do processo | 1 | 1 dia útil | 2-3 dias |
| 5 — Ajudar/comparar campos fora do Organizador | 2 | 2 dias úteis | 5-7 dias |
| 6 — Briefing do dia | 1 | 1 dia útil | 2-3 dias |
| 7 — Capacidade do Radar (medição + eventual ajuste) | 1 | 1 dia útil | 2-3 dias |
| 8 — Camada de IA sob pedido (opcional) | 2 | 2 dias úteis | 5-7 dias |
| **Total (1-7, sem a camada opcional de IA)** | **8-10** | **~2 semanas corridas** | **~4-6 semanas corridas** |
| **Total com Fase 8** | **10-12** | **~2,5 semanas corridas** | **~5-8 semanas corridas** |

**Ordem recomendada:** 1 → 2 → 4 (as três de maior ganho por menor esforço, todas de graça) → 3 →
6 → 5 (mais trabalhosa) → 7 → 8 (só se decidir que vale o custo).

---

## 7. Riscos

| # | Risco | Mitigação |
|---|---|---|
| 1 | Virar "empurra tudo na cara" e o analista desligar o URBI mentalmente | D1/D2/D4 decididos antes de codar; badge/bolha, nunca abertura forçada, por padrão |
| 2 | Pilha reordenada por padrão muda hábito de quem já usa a tela todo dia | D3 explícito; considerar rollout como opção "ligada" antes de virar padrão |
| 3 | Fase 5 (sugerir campo fora do Organizador) criar caminho de escrita paralelo ao do LIP | Reaproveitar EXATAMENTE o mecanismo de salvar já existente, nunca um novo |
| 4 | Radar não aguentar mais volume se a Fase 2/3 aumentarem a dependência dele | Fase 7 mede antes de prometer — não presume capacidade |
| 5 | Fase 8 (IA) virar custo recorrente sem perceber | Mesmo modelo de teto/interruptor já validado em produção (`lib/visao`) |

## 8. Critérios de conclusão

- Vigia mostra severidade sem precisar abrir (Fase 1).
- Pilha ordenável por esforço/urgência batendo com o que o chat já responde (Fase 2).
- Pelo menos 1 aviso proativo real fora do caso de Responsável Técnico (Fase 3).
- Chat entrega situação do processo sem o analista perguntar (Fase 4).
- Pelo menos 1 campo do LIP preenchido a partir de sugestão do Vigia, fora do Organizador de PDF
  SEI (Fase 5).
- Zero chamada de IA nova até a Fase 8 ser explicitamente decidida.
- `tsc`/`build` limpos a cada fase, commit por fase, tabela de progresso atualizada no mesmo
  commit — mesma disciplina do plano de Documentos Vivos.

---

**Histórico de versões**
- v1 — 07/09/2026 — criado, a partir de auditoria real (2 agentes) do que já existe (Vigia,
  dossiê, Motor de Produção, Radar, perguntas da Pilha, `urbi:dica`). D1-D4 abertas.
- v2 — 07/09/2026 — D1/D2/D4 fechadas: o ícone do URBI vira um **sinaleiro** (🟢 sugerir / 🟡
  corrigir-revisar / 🔴 fiscalizar-bloqueante), sempre uma cor só, número junto, clicar só abre a
  lista — nunca aplica sozinho. Ideia e cores do próprio Fábio (sinaleiro de trânsito), refinada
  na sessão. Fases 1 e 3 reescritas em torno do sinaleiro. D3 (ordenação padrão da Pilha) segue
  aberta, decidir na Fase 2.
- v3 — 07/09/2026 (madrugada, sessão autônoma pedida pelo Fábio: "faz todas as fases ai") — Fases
  1, 2, 3, 4 e 6 implementadas, `tsc`/`build` limpos a cada commit, todas em produção. Fase 1
  testada e confirmada por você ao vivo (virou semáforo de verdade + arraste, dois ajustes pedidos
  na hora). Fases 2, 3, 4 e 6 têm código no ar mas **nenhum portão humano confirmado ainda** —
  ficam pra você conferir. Fase 5 levantada em detalhe (o caminho de dado existe, via
  `lib/documentosSei/persistencia.ts`) mas não implementada — decisão de não escrever em campo do
  LIP sem poder testar ao vivo. Fase 7 não precisa de código (painel já existe). Fase 8 não
  iniciada de propósito (custo real, decisão sua). Nenhuma chamada de IA nova em nenhuma fase.
- v4 — 08/09/2026 — Fase 1 revertida a pedido seu: o semáforo virou widget de mais, não devia
  existir separado. `components/urbi/SinaleiroUrbi.tsx` apagado; a cor (mesma função pura de
  `lib/urbi/sinaleiro.ts`) agora tinge o próprio avatar do URBI em `UrbiGlobal.tsx` (filtro
  `mix-blend-mode`, selo com forma + contagem), presente em qualquer tela, não só na Home. Clicar
  abre o chat direto e contextualizado — nunca uma lista à parte, nunca fala sem clique. Observação
  sua registrada: se 3 cores não bastarem, dá pra criar mais. Portão ao vivo desta versão ainda
  pendente da sua confirmação.
