# Plano — Governança de gasto com IA (LIP / MAC / URBI / BDI)

**Data:** 07/09/2026 · **Versão:** v2 · **Estado:** planejamento; só o aviso padrão de "IA desligada" (§5.6) já está no ar ·
**Escopo:** todo gasto com Gemini no URBIS, em todos os módulos e slots. Não é projeto de um slot —
é infraestrutura transversal, como `lib/visao` e o MHD.

Nasce de um incidente real do dia 07/09/2026 e de uma ideia do Fábio ("um botão liberando gastos
com Gemini, um pro LIP, um pro MAC, um pro URBI, um geral por usuário, por slot, e um geral").

---

## 1. O incidente que originou o plano

Auditoria de 07/09/2026 (`docs/AUDITORIA_2026_09_07.md`) classificou como "não verificável por uma
sessão de IA" a checagem de que `documentos_vivos_gemini_ativo` estava desligado em produção — o
§22 do plano de Documentos Vivos **afirmava por escrito** que estava. O Fábio insistiu em rodar o
comando. Estava **LIGADO**, e o botão pago esteve clicável nos dois slots por dias.

Ninguém clicou: zero chamadas, custo zero. Mas foi o achado de maior custo potencial da auditoria,
e ele só apareceu porque uma pessoa duvidou de um documento.

Na mesma conferência apareceu `chat_gemini_ativo` ligado desde 04/09, também sem ninguém saber.

**A lição, que é o eixo deste plano:** o URBIS não tem falta de freio. Tem interruptor, teto por
hora, cache e registro de chamadas espalhados por todo lado. O que faltou foi **alguém conseguir
ver o painel** — e um interruptor que ninguém vê é um interruptor que fica ligado.

---

## 2. O que a auditoria de fato encontrou (números, não impressão)

**15 arquivos chamam o Gemini. Existem 3 interruptores.**

| Interruptor | Onde | Cobre |
|---|---|---|
| `visao_ligada` | `urbis_config` (coluna) | `lib/visao` |
| `documentos_vivos_gemini_ativo` | `urbis_config` (coluna) | Fase 8 do Organizador |
| `chat_gemini_ativo` | `urbi_config` (chave/valor) | chat do URBI |

Os outros 12 pontos **não podem ser desligados de lugar nenhum**. Alguns têm teto por hora — teto
não é interruptor: limita o ritmo, não permite parar.

**5 pontos chamam o Gemini e não registram a chamada em `urbis_api_calls`:**
`app/api/mac/buscar`, `app/api/mac/p3`, `app/api/mac/slot-05/ler-pasta`,
`app/api/mac/slot-05/p3`, `lib/mac-motor/slot5/gemini.ts`. Também `app/api/bdi/indexar-lei` e
`app/api/lip/ler-documento`.

É por isso que o MAC aparece com **US$ 0,00 em 90 dias**: não é economia, é cegueira. E as rotas do
MAC que registram se rotulam como módulo `"BDI"`, então a própria coluna `modulo` não é confiável
para separar gasto por módulo — que é exatamente o que a ideia do Fábio quer fazer.

**Duas tabelas de configuração com nomes quase idênticos:**
`urbis_config` (com S, uma linha, uma coluna por interruptor) e `urbi_config` (sem S, chave/valor).
Olhar só uma dá falsa sensação de segurança — foi parte da cegueira do dia 07/09.

**`lib/visao` falha ABERTO.** `lib/visao/index.ts:60`: se a leitura do interruptor der erro, devolve
"ligado". O Organizador faz o contrário e documenta por quê. Dois módulos com filosofias opostas
sobre a mesma pergunta.

**Gasto real, para calibrar tudo o que vem abaixo:** US$ 0,21 em 30 dias, somando todos os
módulos. **Dinheiro não é o problema hoje.** O plano existe para que continue não sendo quando o
uso crescer, e para que ninguém precise confiar num documento para saber o que está ligado.

---

## 3. A ideia do Fábio, e o que muda nela

> "um botão liberando GASTOS com GEMINI no LIP/MAC e URBI... um pro lip, um pro mac, um pro URBI...
> e um geral por usuário... por slot... e geral"

**O que se mantém — a hierarquia**, com a regra que a faz funcionar:

```
Geral  →  Módulo (LIP / MAC / URBI / BDI)  →  Slot  →  Usuário
```

**O MAIS RESTRITIVO VENCE.** Uma chamada só acontece se TODOS os níveis acima permitirem. Sem essa
regra, hierarquia vira confusão ("liguei o do LIP e não funcionou, por quê?"); com ela, o botão
geral é um botão de pânico de verdade.

**O que muda — botão vira ORÇAMENTO.** A palavra que o Fábio usou é a certa: *gastos*. E gasto não
se controla com liga/desliga. Botão é binário e **esquecível** — foi assim que dois interruptores
ficaram ligados por dias. Orçamento em dinheiro (US$ X/mês por módulo) se controla sozinho, porque
**acaba**. Ninguém precisa lembrar de desligar.

**O que muda — por usuário é orçamento, não botão.** Um botão por analista vira trabalho
administrativo eterno e mais coisa esquecida ligada. Um teto padrão por usuário, com exceção só
para quem precisar, dá o mesmo controle sem a manutenção.

**O princípio que atravessa as duas mudanças:** mais interruptor não conserta um problema causado
por interruptor esquecido. Cada botão novo é uma coisa a mais para ficar ligada sem querer.

---

## 4. Decisões que precisam ser do Fábio, antes de codar

**D1 — Os números.** Qual o teto global mensal em dinheiro? Sugestão para começar: **US$ 20/mês
global**, ~100× o consumo atual — não atrapalha nada hoje e transforma qualquer defeito em
incidente barato. Por módulo e por usuário, só depois de a Fase 0 mostrar o gasto real separado.

**D2 — Teto estourado: bloqueia ou avisa?** Recomendação: **bloqueia**, com mensagem clara na tela
dizendo o que fazer. Teto que só avisa é relatório, não teto — e a regra declarada do projeto é
custo zero por padrão.

**D3 — Unificar as duas tabelas de config?** Recomendação: **não migrar as antigas.** Criar a
tabela de governança nova como fonte única do que é NOVO, e deixar `visao_ligada` /
`chat_gemini_ativo` onde estão, lidas pela camada nova. Migrar config viva de produção é risco sem
retorno proporcional.

**D4 — Prazo obrigatório ao ligar?** Recomendação: **sim, com padrão de 7 dias.** É o único item
do plano que RESOLVE o incidente de 07/09 em vez de avisar sobre ele.

---

## 5. Princípios

1. **Falhar fechado, sempre.** Erro ao ler configuração = desligado. Nos 15 pontos, sem exceção —
   inclusive corrigindo `lib/visao`, que hoje falha aberto.
2. **Nada gasta sem aparecer.** Chamada que não registra não existe para o painel, e o que não
   aparece não se governa. Registro vem antes de controle (por isso a Fase 0 é a Fase 0).
3. **Ver antes de mexer.** O painel mostra primeiro o que está ligado, desde quando, por quem e por
   quê; os botões vêm depois. A falha de 07/09 foi de visão, não de controle.
4. **Quem liga, assina.** Ligar registra usuário, data, prazo e motivo em texto livre.
5. **Custo zero por padrão** continua valendo — nada aqui liga nada sozinho.
6. **Bloqueio por IA desligada tem UM texto só, e ele diz o que fazer.** Regra do Fábio
   (07/09/2026): quando o analista pedir algo que precisa de IA e ela estiver DESLIGADA, a resposta
   é sempre *"Os gastos com IA estão desligados. Solicite ao Administrador que libere gastos com IA
   para usar esta função."* — constante `AVISO_IA_DESLIGADA` em `lib/constants.ts`, nunca frase
   inventada por cada rota.

   **Só vale para bloqueio por interruptor/orçamento.** Teto de RITMO ("20 páginas/hora", "limite
   de chamadas/hora") continua dizendo "tente de novo daqui a pouco": ali pedir liberação não
   adianta nada, o bloqueio se desfaz sozinho, e mandar o analista incomodar o Administrador por
   algo que passa em uma hora é ruído que ensina a ignorar o aviso.

   **O aviso vem ANTES de qualquer confirmação de custo.** Perguntar "confirma US$ 0,004?" e só
   depois dizer que está desligado faz a pessoa aprovar um gasto que nunca poderia acontecer.

   **Estado de hoje:** implementado nos dois pontos da Fase 8 do Organizador. O chat já tinha texto
   equivalente por conta própria (`CHAT_DESLIGADO`) e será unificado na Fase 2. `lib/visao` é o
   caso pior e **não foi tocado**: hoje ele degrada em SILÊNCIO — o campo do analista fica vazio e
   ele não tem como saber que faltou liberar IA nem que existe alguém que destrava. Corrigir isso
   é mudança de comportamento visível no Slot 5, que obriga a atualizar os dois manuais versionados
   (`CLAUDE.md`), então entra como trabalho próprio na Fase 1 — não de passagem.
6. **Transversal, nunca por slot.** Isto é infraestrutura como `lib/visao`: um código só serve os
   três slots. A regra de isolamento do `CLAUDE.md` vale para LIP/MAC, não para governança.

---

## 6. Fases, cada uma com portão

### Fase 0 — Acabar com os pontos cegos de registro *(1 sessão · bloqueia todo o resto)*
Fazer os 7 pontos que hoje não registram passarem a chamar `registrarChamadaIA`, e corrigir o
rótulo de `modulo` nas rotas do MAC que se declaram "BDI". Sem isto, qualquer teto por módulo é
teto sobre número inventado.

**Portão:** uma semana de uso normal e todo módulo que chama Gemini aparece em `urbis_api_calls`
com o rótulo certo. Conferido com o script de interruptores, que passa a mostrar gasto por módulo.

### Fase 1 — Teto global em dinheiro + falhar fechado *(1 sessão)*
Um número, valendo para tudo, lido de `urbis_api_calls.custo_estimado_usd`. Protege os 12 pontos
sem interruptor **sem precisar mexer em 12 arquivos** — é o maior retorno por esforço do plano
inteiro. Junto, `lib/visao` passa a falhar fechado **e a dizer ao analista que está desligada**
(§5.6) em vez de deixar o campo vazio sem explicação — com os dois manuais do Slot 5 atualizados na
mesma sessão, como manda o `CLAUDE.md`.

**Portão:** com o teto baixado a zero, nenhuma chamada nova acontece em nenhum módulo, e a tela
diz por quê. Com o teto normal, nada muda no uso do dia a dia.

### Fase 2 — Fonte única de governança *(1 sessão)*
Tabela nova, com nível (geral/módulo/slot/usuário), ligado, prazo, orçamento, quem ligou, motivo.
As duas tabelas antigas ficam onde estão (D3) e passam a ser lidas pela camada nova.

**Portão:** uma função só responde "esta chamada pode acontecer?" para qualquer ponto do sistema, e
os 15 pontos passam por ela.

### Fase 3 — Hierarquia por módulo e slot, com prazo e motivo *(1-2 sessões)*
A ideia do Fábio, com o mais-restritivo-vence. Ligar exige prazo (D4) e motivo.

**Portão:** desligar o geral impede gasto mesmo com todos os de baixo ligados; um interruptor com
prazo vencido se comporta como desligado sem ninguém tocar nele.

### Fase 4 — Painel no `/admin` *(1-2 sessões)*
Topo: o que está ligado agora, desde quando, quem ligou, motivo, prazo, e gasto do mês por módulo.
Só abaixo disso, os controles.

**Portão:** o Fábio responde "o que está ligado e quanto gastei este mês?" olhando uma tela, sem
abrir banco e sem me perguntar.

### Fase 5 — Orçamento por usuário e modo "só eu" *(1 sessão)*
Teto padrão por usuário e, ao ligar, a opção de valer **só para quem ligou** — que é o motivo real
pelo qual as pessoas ligam e esquecem: queriam testar, não liberar para todo mundo.

**Portão:** ligar em modo "só eu" permite o gasto na sessão do admin e recusa na de outro usuário.

---

## 7. Riscos

| # | Risco | Mitigação |
|---|---|---|
| 1 | O plano criar 20 interruptores novos e piorar o problema que veio consertar | Orçamento no lugar de botão; por usuário é teto, não chave; prazo obrigatório |
| 2 | Teto bloquear trabalho real num dia ruim | D1 começa ~100× acima do consumo atual; mensagem de bloqueio diz exatamente o que fazer |
| 3 | Mexer em `lib/visao` e no chat, que são produção | Fase 1 só troca falha-aberto por falha-fechado; hierarquia só entra na Fase 3, depois do painel existir |
| 4 | Migrar config viva e derrubar módulo | D3: não migrar. Camada nova lê as antigas |
| 5 | Virar projeto grande e o URBIS ficar sem os portões do Documentos Vivos | Fases 0 e 1 valem sozinhas e somam 2 sessões; o resto pode esperar |

---

## 8. Ordem e onde dá para parar

```
Fase 0 (registro)  →  Fase 1 (teto em dinheiro)   ←── PARE AQUI SE QUISER
                                                        ~80% da proteção, 2 sessões
Fase 2 (fonte única) → Fase 3 (hierarquia) → Fase 4 (painel) → Fase 5 (usuário)
```

**As Fases 0 e 1 são o corte mínimo com retorno real.** Um teto global em dinheiro, sobre números
confiáveis, protege todos os 15 pontos de uma vez. O painel é conforto — importante, mas conforto.

**Recomendação honesta de prioridade:** fazer as Fases 0 e 1, e só então voltar para os portões
humanos do Documentos Vivos, que continuam abertos. O gasto atual é US$ 0,21/mês; o sistema ainda
não foi provado funcionando. Governar melhor um gasto que não existe, antes de provar o que já foi
construído, seria trocar de assunto.

---

## 9. Critérios de conclusão

- Todo ponto que chama Gemini registra a chamada, com módulo e slot corretos.
- Nenhum ponto falha aberto.
- Um teto em dinheiro bloqueia gasto em qualquer módulo, comprovado baixando-o a zero.
- "O que está ligado agora?" se responde por tela, nunca por documento.
- Todo interruptor ligado tem prazo, autor e motivo.
- `tsc`/`build` limpos, tabela de progresso atualizada no mesmo commit do código.

---

## 10. Prazo e % concluído

| Fase | Sessões | % da fase | Estado |
|---|---|---|---|
| 0 — pontos cegos de registro | 1 | ⬜ 0% | não iniciada |
| 1 — teto em dinheiro + falhar fechado | 1 | 🟡 10% | aviso padrão de "IA desligada" (§5.6) já implementado nos 2 pontos da Fase 8; falta o teto em si e o `lib/visao` |
| 2 — fonte única de governança | 1 | ⬜ 0% | não iniciada |
| 3 — hierarquia com prazo e motivo | 1-2 | ⬜ 0% | não iniciada |
| 4 — painel no /admin | 1-2 | ⬜ 0% | não iniciada |
| 5 — orçamento por usuário + "só eu" | 1 | ⬜ 0% | não iniciada |
| **Total** | **6-8** | **≈2%** | planejamento fechado, aguardando D1-D4 |

Regra herdada dos outros planos: esta tabela é atualizada a CADA commit deste projeto, no mesmo
commit que leva o código — nunca depois.

---

## 11. O que já existe e não deve ser reconstruído

- `lib/iaUso.ts` — `registrarChamadaIA`, já grava custo estimado por token. A Fase 0 é só passar a
  chamá-la nos pontos cegos.
- `scripts/conferir_interruptores_ia.mts` — já responde "o que está ligado?" pelas duas tabelas,
  com gasto de 30 dias. É o embrião do painel da Fase 4.
- `lib/visao/index.ts` — o modelo de governança de referência (interruptor + teto + cache), citado
  por todos os outros. Só precisa parar de falhar aberto.
- `lib/urbi/limites.ts` — teto do chat por hora, fonte única com o painel de prontidão.
- `/admin/urbi` e `/admin/rastreabilidade` — já leem `urbis_api_calls` e mostram custo. O painel da
  Fase 4 mora ao lado, não por cima.

---

**Histórico de versões**
- v2 — 07/09/2026 — regra nova do Fábio (§5.6): bloqueio por IA desligada tem texto único, que diz
  ao analista para solicitar liberação ao Administrador. Distinção acrescentada na conversa: vale
  só para bloqueio por interruptor/orçamento — teto de ritmo continua dizendo "tente daqui a
  pouco", porque ali pedir liberação não resolve nada. Implementado já nos dois pontos da Fase 8 do
  Organizador (constante `AVISO_IA_DESLIGADA`), inclusive ANTES da confirmação de custo. `lib/visao`
  fica para a Fase 1 por exigir atualização dos manuais do Slot 5.
- v1 — 07/09/2026 — criado a partir do incidente do dia (interruptor do Gemini ligado em produção
  contra o que o plano de Documentos Vivos afirmava) e da ideia do Fábio de botões de liberação de
  gasto por módulo/slot/usuário. Auditoria real dos 15 pontos de chamada, 3 interruptores, 7 pontos
  sem registro e 2 tabelas de config. Ideia mantida na hierarquia e mudada em dois pontos: botão
  vira orçamento, e por usuário vira teto. D1-D4 abertas. Nada implementado.
