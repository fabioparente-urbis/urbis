# Plano — URBI Assessor Ativo (processo aberto + Pilha) · todos os slots ativos

**Data:** 07/09/2026 · **Versão:** v1 · **Estado:** planejamento, nada implementado ainda ·
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

### D1 — O Vigia ganha só um badge, ou passa a abrir sozinho quando tem coisa grave?
Você mesmo fixou a regra "nunca empurrar na cara" em 02/09. Um badge de severidade no cabeçalho
FECHADO (ex.: "🔴 3 avisos") não quebra essa regra (ainda precisa clicar pra ver o conteúdo) — abrir
sozinho, quebraria. Recomendo: **badge, não abertura automática** — mas é sua regra, sua decisão.

### D2 — O chat abre sozinho com um resumo ao entrar no processo, ou só fica "com algo a dizer"?
Hoje é 100% manual (botão ou Shift+U). Abrir sozinho ao entrar em CADA processo pode incomodar
quem já conhece o caso. Alternativa: um indicador (ex.: ícone do URBI "aceso") quando há ação
tier 1/2 pendente, sem abrir nada — o analista decide clicar.

### D3 — Na Pilha, ordenar por urgência é o padrão da tela, ou fica como opção que o analista liga?
Mudar o padrão da ordenação de uma tela que todo mundo já usa todo dia é mudança de hábito de
verdade — vale decidir com cuidado, não só tecnicamente.

### D4 — Generalizar a bolha de dica (`urbi:dica`) pra Vigia e Motor de Produção — todo aviso vira
uma bolha temporária de 10s, ou os mais importantes merecem um lugar fixo na tela (não some
sozinho)? Bolha é menos intrusiva; lugar fixo é mais fácil de não perder.

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

### Fase 1 — Vigia com badge de severidade (processo aberto)
Cabeçalho do Vigia, hoje sempre neutro/fechado, ganha uma cor/contagem calculada do que já é
buscado no `useEffect` existente (nenhuma consulta nova) — ex.: "🔎 Vigia do processo · 🔴 3
avisos". Continua fechado por padrão (D1). Zero custo, mudança pequena e de baixo risco.

**Portão:** processo com avisos reais mostra a contagem certa no cabeçalho fechado; processo sem
avisos não mostra nada (nunca "0 avisos" alarmista à toa).

### Fase 2 — Pilha ativa: esforço e alertas do Radar na tela `/processos`
A tela da Pilha passa a ler `urbi_radar_retratos` (mesma fonte que já alimenta as perguntas do
chat) pra mostrar, por linha: esforço provável (rápido/exige atenção/depende de documento/base
insuficiente) e contagem de pendências — com opção de ordenar por isso. Nenhuma chamada nova ao
Radar; só leitura do que ele já grava a cada ~1 min.

**Portão:** ordenar a Pilha por "esforço" bate com o que a pergunta "mais perto de emitir?" no
chat já responde pros mesmos processos — mesma fonte, mesma resposta, sem divergência.

### Fase 3 — Aviso proativo generalizado (Vigia + Motor de Produção → bolha)
Generaliza o mecanismo `urbi:dica` (hoje só usado pra histórico de Responsável Técnico): quando o
processo abre e o Motor de Produção tem ação tier 1 (bloqueante) ou o Vigia acha incoerência real,
dispara a mesma bolha de 10s — sem abrir o chat inteiro. Depende de D2/D4.

**Portão:** processo com pendência bloqueante real mostra a bolha ao abrir; processo limpo não
mostra nada (nunca bolha vazia).

### Fase 4 — Chat abre já sabendo do processo (resumo automático ao abrir, não ao digitar)
Hoje o relatório do Motor de Produção só aparece depois que o analista manda uma mensagem. Passa
a aparecer como primeira mensagem do URBI assim que o painel do chat é aberto dentro de um
processo — o analista não precisa perguntar "e aí, como está esse processo".

**Portão:** abrir o chat em qualquer processo mostra situação + próxima ação sem digitar nada;
abrir na Home (sem processo) continua exatamente como hoje.

### Fase 5 — Ajudar a responder e comparar campos, fora do Organizador de PDF SEI
O padrão de `lib/documentosSei/compararLip.ts` (sugerir valor de campo a partir de documento já
identificado no MHD, aceite explícito) generaliza pro Vigia: campo vazio que JÁ tem documento
correspondente no MHD (mesmo cruzamento que já fizemos no Motor de Produção, §6/§21 do plano de
Documentos Vivos) ganha um botão "usar valor do documento X" direto no aviso do Vigia — não só
dentro do Organizador.

**Portão:** um campo vazio com documento correspondente no MHD mostra a sugestão no Vigia; aceitar
grava exatamente como o LIP já grava hoje (mesmo mecanismo, nunca um caminho de escrita novo).

### Fase 6 — "Briefing do dia" na Home/Pilha
Resumo textual determinístico (template, não Gemini) ao abrir a Home: "hoje: N processo(s) com
ação bloqueante, M pronto(s) pra despachar, K com retorno vencendo" — construído só com os
retratos já existentes, mesma fonte da Fase 2.

**Portão:** os números do briefing batem exatamente com o que as perguntas equivalentes no chat
já respondem.

### Fase 7 — Capacidade do Radar (medir antes de decidir)
Hoje: até 10 processos/execução, a cada ~1 min, 200 processos visíveis por consulta. Antes de
aumentar qualquer limite, medir contra o volume real de processos ativos hoje (quantos precisam
de retrato atualizado por hora) — só sobe teto/frequência se a medição mostrar fila acumulando.
Decisão técnica, não de produto.

**Portão:** relatório de fila/atraso real (já existe em `/admin/urbi`, aba Radar) mostrado antes
de qualquer mudança de configuração.

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
