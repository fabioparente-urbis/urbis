# URBIS OFFLINE — estudo de viabilidade

**Versão:** 0.3 (estudo, nada implementado; 6 riscos decididos pelo Fábio, seção 10)
**Data:** 22/09/2026
**Pedido:** "crie o urbis off pra que eu possa trabalhar no urbis mesmo offline... mesmo se o
Railway ou Supabase ou internet cair... assim que voltar sincroniza. Quero o projeto, o estudo da
viabilidade apenas."
**Origem:** apagão parcial do Supabase em 22/09/2026 (ver memória `urbis_offline_ideia`).

---

## 1. Resposta curta

**É viável, mas não "tudo".** Dá para o analista continuar trabalhando durante uma queda,
consultando e preenchendo ficha e checklist, e o sistema envia tudo sozinho quando a conexão
volta. Três coisas **não** funcionam offline, por natureza e não por falta de esforço:

1. **Leitura por IA** (Gemini lendo PDF, URBI conversando). Ela depende da internet.
2. **Ver o trabalho de outro analista em tempo real.** Offline, cada um só enxerga a última
   cópia que baixou.
3. **Entrar no sistema pela primeira vez no dia sem internet.** Só entra offline quem já estava
   logado naquele computador.

A **numeração de despachos e pareceres**, que na conversa anterior parecia a trava principal, é
**mais viável do que eu tinha dito**. Explico na seção 4.

Recomendação: fazer em **3 etapas**, cada uma útil sozinha (seção 7). A primeira já resolveria o
apagão de hoje.

---

## 2. Os três tipos de queda: cada um é um problema diferente

"Offline" são na verdade três situações. O URBIS hoje tem três peças: o **navegador** do
analista, o **servidor** (Next.js no Railway) e o **banco** (Supabase).

| Queda | O que cai | O que acontece hoje | O que o URBIS OFF faria |
|---|---|---|---|
| **A. Supabase fora** (caso de 22/09) | só o banco | a tela abre, mas nada carrega nem salva; o login cai | tela abre, mostra a cópia local e guarda o que for salvo numa fila |
| **B. Railway fora** | servidor + tudo que passa por ele | a página nem abre | a página abre a partir da cópia guardada no navegador, com o mesmo comportamento de A |
| **C. Internet do analista fora** | tudo | a página nem abre | igual a B |

**Descoberta importante:** o navegador **nunca** fala direto com o Supabase. Todas as telas
passam pelo servidor (`fetch("/api/...")`, cerca de 170 chamadas diferentes; só a tela de
redefinir senha usa o Supabase direto). Consequência:

- nas quedas **B e C**, hoje o sistema morre inteiro, porque até a página vem do servidor;
- para sobreviver a B e C, o próprio **programa** (telas, código, estilos) precisa ficar guardado
  no navegador. Isso se chama "service worker". Sem ele, cache de dados não adianta nada, porque
  a tela nem chega a abrir.

---

## 3. O que existe hoje e já ajuda

O URBIS já guarda coisas no navegador (IndexedDB), então o caminho não é novo:

| O quê | Onde | Serve para o OFF? |
|---|---|---|
| PDF do SEI por processo (até 5 processos, 180 dias) | `lib/documentosSei/cachePdfNavegador.ts` | **sim**: o PDF já estaria lá offline |
| Rascunho do último fatiamento, por usuário | `lib/documentosSei/rascunhoFatiador.ts` | **sim**: é exatamente o padrão da fila |
| Renovação silenciosa da sessão | `middleware.ts` | parcialmente (ver seção 5) |
| Numeração com proteção contra duplicar e com retry seguro | `app/api/numeracao/proximo/route.ts` | **sim**: é a base da seção 4 |

Não existe hoje: service worker, cópia local de ficha ou checklist, nem fila de envio.

---

## 4. Numeração: por que é mais viável do que parecia

Na conversa anterior eu disse que a numeração travava tudo, porque é "fonte única para todos os
slots". Lendo o código agora, **a faixa é de cada analista**: `urbis_numeracao_faixas` é filtrada
por `usuario_id`, e cada um cadastra a própria faixa. A regra de "fonte única" (CLAUDE.md) quer
dizer "mesma rota e mesmas regras para todos os slots", não um contador disputado por todos os
analistas.

Ou seja: **dois analistas diferentes nunca disputam o mesmo número.** O único conflito possível é
o **mesmo analista** emitindo offline em **dois computadores** ao mesmo tempo.

Além disso, a rota já tem duas proteções que servem ao OFF sem mudança:

- **número forçado** (`&numero=`): o servidor aceita "quero gravar exatamente o 147";
- **retry seguro**: se o 147 já foi gravado, pedir de novo devolve ok sem gastar outro número;
- **proteção contra corrida**: se o contador mudou no meio, devolve 409 em vez de duplicar.

**Desenho proposto para emitir offline:**

1. Enquanto está online, o navegador guarda uma cópia da faixa do analista (início, fim, próximo).
2. Offline, o clique do analista em emitir (a autorização continua sendo o clique dele, regra do
   CLAUDE.md) usa o próximo número local e marca "emitido offline, aguardando confirmação".
3. Na volta, a fila envia `commit` com o número forçado. Se o servidor aceitar, fica confirmado.
4. **Trava de segurança:** emissão offline só é permitida em **um computador por analista**,
   marcado como "computador offline" enquanto estava online. Os outros computadores dele, se
   ficarem offline, podem consultar e preencher, mas **não emitir**.

**Risco que sobra, e que precisa de decisão sua:** um despacho emitido offline vai para o SEI de
verdade. Se, apesar da trava, o número já tiver sido usado (por exemplo, a trava foi desfeita à
mão), o documento já está no mundo com número repetido, e o sistema só pode **avisar** na volta,
não desfazer. A alternativa conservadora é **não emitir offline**: preencher tudo, deixar o
documento pronto e numerar na volta. Isso casa com a regra "consumir número só depois do
documento pronto" e não tem risco nenhum. **Minha recomendação é começar pela conservadora.**

> **DECIDIDO (22/09, Fábio):** emite offline, em qualquer computador, sem a trava de um
> computador por analista. Na hora de emitir offline, o sistema mostra um aviso para ter cuidado:
> o número só é confirmado quando a conexão voltar. Motivo: ele usa sempre o mesmo Mac. A Etapa 3
> entra no plano, sem a trava do passo 4.
>
> **Furo achado na mesma conversa:** o cadastro de faixa só conferia sobreposição contra as
> faixas do próprio analista, então outro analista podia cadastrar os números de outra pessoa.
> Os números são do analista a quem foram atribuídos, "independente de URBIS". Medido: 5 faixas,
> todas do Fábio, 0 sobreposições, nenhum número usado por dois analistas. Corrigido na branch
> `fix/numeracao-faixa-sobreposicao`: a rota confere contra todos, e uma constraint no banco
> ficou para aplicar.

---

## 5. Login offline

Hoje `autenticar()` (`lib/auth.ts`) pergunta ao Supabase, **a cada requisição**, se o token é
válido. Com o Supabase fora, todo mundo vira "não autenticado", e foi isso que apareceu em 22/09.

Proposta:

- **Offline, quem manda é o navegador:** se aquele computador tem uma sessão válida recente
  (por exemplo, das últimas 24h), abre o modo OFF com a identidade guardada. Nada vai ao servidor
  nesse momento, então não há nada a proteger lá.
- **Na volta, quem manda é o servidor, como hoje:** cada item da fila é enviado com o token real
  e passa pela validação normal. Se o token não valer mais, a fila **espera** um novo login; não
  descarta e não envia como outro usuário.
- Isso **não reabre** a falha corrigida em 02/09 (cookie `urbis_id` forjável), porque a
  identidade local nunca autoriza nada no servidor.

Limite: quem não estava logado naquele computador não entra offline. Não tem como contornar isso
com segurança.

---

## 6. O que fica, o que não fica e o que fica com ressalva

| Ação | Queda A (Supabase) | Quedas B/C (Railway/internet) |
|---|---|---|
| Abrir Pilha, ficha LIP e checklist MAC de processos já abertos antes | ✅ cópia local | ✅ cópia local |
| Abrir processo **nunca aberto** naquele computador | ❌ | ❌ |
| Preencher/corrigir ficha LIP | ✅ entra na fila | ✅ entra na fila |
| Marcar checklist MAC | ✅ entra na fila | ✅ entra na fila |
| Fatiar PDF (Organizador) | ✅ já é local | ✅ já é local, com PDF em cache |
| Gerar o .docx do despacho/parecer | ✅ servidor está de pé | ⚠️ só se o gerador for levado para o navegador (ver 8.3) |
| Numerar documento | ⚠️ seção 4 | ⚠️ seção 4 |
| Leitura por IA (Gemini), URBI | ✅ funciona, mas o resultado vai para a fila | ❌ precisa de internet |
| Satélites (MRP, MDP, MAP, MHD, tags) | ⏳ registrados quando a fila sincroniza | ⏳ idem |
| Painéis de gestão (BDI, admin) | ❌ mostram dado velho, com aviso | ❌ idem |

**Regra dos satélites (CLAUDE.md):** cada ação guardada na fila precisa, na volta, disparar
**todos** os satélites que dispararia online. A fila guarda a **ação** ("marcou item X",
"salvou campo Y"), não uma cópia crua da tabela, e reenvia pela mesma rota de sempre. Assim MRP,
MDP e os outros recebem o fato normalmente, só que atrasado. A data registrada deve ser a do
**momento do clique**, não a da sincronização, senão a produtividade do dia do apagão some do
MRP.

---

## 7. Plano em etapas

Cada etapa funciona sozinha e pode parar ali.

### Etapa 1 — "Não perder o que eu estava fazendo" (resolve a queda A, a de 22/09)
- Cópia local da ficha LIP e do checklist MAC toda vez que o analista abre um processo.
- Fila local para salvar: se o servidor responder erro de conexão, guarda e tenta de novo depois.
- Selo visível na tela: 🟢 online / 🟡 offline, N alterações aguardando / 🔴 conflito.
- Login: com o Supabase fora, não derruba quem já estava logado.
- **Estimativa (não medida): 1 a 2 semanas.** O esforço está nos 4 arquivos grandes (~14 mil
  linhas: `ProcessoClient.tsx` + 3 páginas de análise), que teriam que trocar o `fetch` direto
  por uma camada que sabe usar a fila.

### Etapa 2 — "Abrir o URBIS sem servidor" (resolve B e C)
- Service worker guardando o programa, para a página abrir mesmo sem Railway ou internet.
- Identidade local (seção 5).
- **Estimativa (não medida): 1 semana.** O risco técnico é o Next.js 16: o service worker não
  vem pronto e precisa ser testado com cuidado para não servir **versão velha** do sistema depois
  de um deploy, que é o erro clássico desse tipo de recurso.

### Etapa 3 — "Emitir offline" — **FORA DO PLANO** (Risco 6: documentos só online)
- Gerador de .docx rodando no navegador.
- Numeração offline com trava de um computador por analista.
- **Estimativa (não medida): 1 a 2 semanas**, mais o teste com numeração de verdade (feito por
  você na tela, nunca por mim).

**Isolamento de slots:** a fila e o cache são infraestrutura genérica, no mesmo padrão de
`cachePdfNavegador.ts`. Já a **ligação de cada tela** com a fila é por slot, e segue a regra de
sempre: Slot 1 só com sua autorização explícita. Sugestão de ordem: **Slot 5 primeiro**, Slot 2
em seguida, Slot 1 por último, quando o mecanismo já tiver rodado nos outros.

---

## 8. Riscos e decisões pendentes

### 8.1 Conflito de edição (dois lados mexeram no mesmo campo)
Analista A edita offline, analista B edita online o mesmo processo. Na volta:
- **Proposta:** campo a campo. Se só um lado mexeu, vale esse. Se os dois mexeram no mesmo
  campo, **nada é sobrescrito em silêncio**: aparece 🔴 e o analista escolhe. Regra "nunca deixar
  item sumir em silêncio" do CLAUDE.md.
- Hoje não há como saber quem mexeu depois, porque as tabelas não guardam "versão" por registro.
  Precisaria de uma coluna de data/versão em `lip`/`analises_mac`. **Mudança de banco, a
  confirmar.**

> **DECIDIDO (22/09, Fábio):** não acontece aqui, porque cada processo é de um analista só.
> **Sem coluna nova no banco.** Fica só uma proteção barata: a fila guarda o valor que o campo
> tinha quando foi baixado e, na volta, se o servidor tiver outro valor, **avisa** em vez de
> sobrescrever calado. Assim nada some em silêncio.

### 8.2 Fila perdida
Se o analista limpar o navegador ou trocar de computador antes de sincronizar, o que estava na
fila some. Mitigação: o selo 🟡 fica visível e insistente, e há um botão "exportar pendências"
para um arquivo, como garantia. **Não dá para eliminar esse risco, só reduzir.**

> **DECIDIDO (22/09, Fábio):** selo 🟡 bem visível + **backup automático** das pendências num
> arquivo a cada 30 min enquanto houver pendência offline. Nota técnica: o navegador pode pedir
> permissão para downloads automáticos, ou para escrever numa pasta escolhida, na primeira vez.
> Isso precisa ser testado no Chrome/Safari do Mac antes de prometer.

### 8.3 Gerador de documento no servidor
Os geradores de .docx (`lib/geradores.ts`, `lib/geradores/aceiteSei/docxBase.ts`,
`lib/mac-motor/slot5/gerarDespachoInterno.ts`) leem arquivos do disco do servidor (logo,
modelos) e, num caso, consultam a tabela `assuntos`. A biblioteca `docx` roda no navegador, mas
cada gerador teria que ser adaptado. Só é necessário na Etapa 3.

> **DECIDIDO (22/09, Fábio):** geração de documentos fica **só online**. Consequência: sem o
> .docx não há emissão offline, então **a Etapa 3 sai do plano** e, na prática, o Risco 1 vira
> "preparar offline, numerar e emitir na volta". O aviso de cuidado do Risco 1 só volta a valer
> se um dia a geração offline for reaberta.

### 8.4 Dado sensível no computador
A cópia local fica no navegador, sem senha além da do Windows/Mac. Hoje já é assim com o PDF do
SEI (180 dias). Proposta: o mesmo teto de validade e limpeza ao fazer logout. **A confirmar com
você.**

> **DECIDIDO (22/09, Fábio):** 180 dias + apaga no logout, **mas mandando para a Lixeira do
> admin** (`/admin/lixeira`, já existe). Interpretação registrada, sujeita a correção dele:
> - cópia local de algo **já sincronizado** é só apagada do Mac, porque o original está no
>   servidor;
> - tudo que **seria perdido de verdade** vai para a Lixeira do admin, numa aba nova "Offline",
>   restaurável: pendência vencida sem sincronizar, pendência recusada pelo servidor, valor
>   perdedor num aviso de conflito (Risco 2). Nada do offline é destruído.

### 8.5 Versão velha do sistema (Etapa 2)
Se o service worker for mal feito, o analista pode ficar dias rodando uma versão antiga sem
saber. Precisa de aviso "nova versão disponível, recarregue" e de um teste disso antes de ir para
produção.

> **DECIDIDO (22/09, Fábio):** aviso "nova versão disponível" com botão Atualizar; se ele não
> clicar, atualiza sozinho na próxima vez que abrir o URBIS. Nunca recarrega no meio do trabalho.

---

## 9. Decisões que são suas

1. **Emitir offline, ou só preparar offline e numerar na volta?** (seção 4; recomendo começar por
   "preparar").
2. **Começar pela Etapa 1 no Slot 5?** (recomendado)
3. **Aceitar uma coluna nova de versão nas tabelas da ficha/análise?** (8.1)
4. **Por quanto tempo a cópia local pode ficar no computador?** (8.4)

---

## 10. Decisões registradas

| # | Risco | Decisão | Data |
|---|---|---|---|
| 1 | Número repetido ao emitir offline | Emite offline em qualquer PC, com aviso de cuidado na emissão | 22/09/2026 |
| 6 | Gerar .docx offline | Não: documentos só online, então a Etapa 3 sai e o Risco 1 vira "preparar offline, emitir online" | 22/09/2026 |
| 5 | Versão velha do sistema no Mac | Aviso + atualiza sozinho no próximo abrir, nunca no meio do trabalho | 22/09/2026 |
| 4 | Dado sensível guardado no Mac | 180 dias + apaga no logout; o que seria perdido vai para a Lixeira do admin (aba Offline) | 22/09/2026 |
| 3 | Pendência perdida antes de sincronizar | Selo visível + backup automático em arquivo a cada 30 min | 22/09/2026 |
| 2 | Dois editando o mesmo campo | Não acontece (processo é de um analista só); sem coluna nova, só aviso se o valor mudou | 22/09/2026 |

## Histórico de versões

| Versão | Data | O que mudou |
|---|---|---|
| 0.3 | 22/09/2026 | Riscos 2 a 6 decididos; Etapa 3 removida (documentos só online). |
| 0.2 | 22/09/2026 | Risco 1 decidido (emitir offline com aviso); furo de sobreposição de faixa entre analistas registrado. |
| 0.1 | 22/09/2026 | Estudo inicial. Corrige a avaliação da conversa anterior: a faixa de numeração é por analista, não disputada entre todos. |
