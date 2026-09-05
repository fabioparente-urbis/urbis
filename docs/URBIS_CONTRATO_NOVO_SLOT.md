# Contrato de novo Slot — checklist, não abstração de código

**Status:** documentado em 05/09/2026, Fase 11 do mandato de 12 fases da Inteligência URBIS.
Nenhum código foi alterado para escrever isto — é um levantamento do que os 3 slots reais
(Regularização SEI, Aceite SEI, Aprovação de Projeto/Slot 5) já fazem hoje, virado checklist
para quando um slot novo (as PED confirmadas — ver `[[urbis-slots-3-4-ped-futuro]]` — ou
qualquer outro) for implementado de verdade.

## Princípio que governa este documento

CLAUDE.md já é explícito: **"Isolamento entre slots é regra, não estilo... quando o
comportamento precisa ser igual, o código é reproduzido por leitura, nunca compartilhado."**
Este "contrato" NÃO é uma interface TypeScript genérica que um slot novo implementaria e os
outros importariam — isso criaria justamente o arquivo central que a regra de isolamento
proíbe (editar para o slot novo arriscaria mudar os outros dois em silêncio). O contrato é
este CHECKLIST: uma lista do que precisa ser declarado, em qual arquivo, seguindo o padrão já
usado pelos 3 slots existentes — cada item novo é código isolado, só informado por este
documento, nunca compartilhado.

A ÚNICA exceção real de compartilhamento no sistema inteiro é a numeração de despachos/
pareceres (`/api/numeracao/proximo`), já declarada assim no CLAUDE.md — e é uma exceção
NOMEADA, não um padrão geral.

## Checklist, por camada (com onde cada slot real declara a sua)

### 1. Identificação do slot

**Não existe enum central em TypeScript.** `tipo_processo` é tipado como `string` solto em
`app/page.tsx:36` e `app/processo/ProcessoClient.tsx:33`, de propósito — os valores válidos
vêm em runtime da tabela `assuntos` (via `/api/admin/assuntos`), não de um union type fixo.
`lib/slots.ts` já opera genericamente sobre `assunto_id`/`ordem`, incluindo uma função
`padraoDoSlot()` que sintetiza nome de slot para qualquer número futuro.

**O que um slot novo precisa**: uma linha na tabela `assuntos` (nome, ordem, `tipo_processo`
canônico em snake_case). Nada em código precisa mudar só por isto — é dado, não declaração de
tipo. A única exceção é `lib/urbi/catalogoSemantico.ts:45`, que declara
`export type Slot = "regularizacao" | "aceite_sei" | "slot_05"` — um union LOCAL a esse
arquivo (não é a fonte de verdade do sistema, mas PRECISA ganhar o novo valor pra que a Camada
3 abaixo funcione pro slot novo).

### 2. Adaptador de dossiê — o ÚNICO ponto de entrada deliberadamente compartilhado

`lib/urbi/adaptadores/index.ts:16-20` já é, por desenho, o ponto único que decide qual
adaptador chamar:

```ts
export function montarDossieTecnico(tipoProcesso, entrada) {
  switch (tipoProcesso) {
    case "regularizacao": return montarDossieTecnicoRegularizacao(entrada);
    case "aceite_sei": return montarDossieTecnicoAceiteSei(entrada);
    case "slot_05": return montarDossieTecnicoSlot5(entrada);
    default: return null; // slot desconhecido/futuro sem adaptador ainda
  }
}
```

Comentário no próprio arquivo já antecipa isto: *"Um slot futuro (3, 4...) entra aqui com seu
próprio arquivo, sem tocar nos outros dois."* **O que um slot novo precisa**: um arquivo
`lib/urbi/adaptadores/<nomeDoSlot>.ts` novo (nunca reaproveitar `regularizacao.ts`/
`aceiteSei.ts`/`slot5.ts` por cópia direta de import) + um `case` novo neste switch. Até isso
existir, `default: return null` já degrada com segurança — nenhum slot sem adaptador quebra o
sistema, só fica sem dossiê (mesmo padrão "base insuficiente" do resto do projeto).

### 3. Campos do LIP e domínio semântico

Tabela `lip_campos` (por `aba_id` → `lip_abas`, escopada por `assunto_id`) é onde o slot
declara seus campos de tela. Em paralelo, `lib/urbi/catalogoSemantico.ts` mapeia cada chave
LIP pro domínio semântico real (`CampoSemantico = {slot, chave, rotuloHumano, dominio,
unidade}`), NUNCA reaproveitando a chave de outro slot mesmo quando o significado é idêntico
— "área impermeável" já é `areaImpermeavel` (Regularização/Aceite) vs `areaImpermeabilizada`
(Slot 5), nomes DIFERENTES pro MESMO domínio (`area_impermeavel`), de propósito.

**O que um slot novo precisa**: linhas em `lip_campos` (a tela) + uma linha em
`CAMPOS_SEMANTICOS` (`catalogoSemantico.ts`) por chave que precisar de comparação/consulta —
nunca herdar a linha de outro slot. Esquecer isto não quebra nada: `dominioDoCampo()` retorna
`null` pra chave não catalogada, e qualquer consulta que dependa dela vira "base insuficiente"
honestamente, nunca um valor adivinhado.

### 4. Catálogo MAC (checklist de conformidade)

`mac_checklist_modelos` tem `tipo_processo`+`assunto_id` próprios; `mac_checklist_itens.
modelo_id` amarra cada item a UM modelo só. `lib/slots.ts` já usa essa cadeia pra
zerar/clonar um slot sem tocar nos outros (`mac_checklist_itens` apagados só por
`modelo_id IN (modelos do assunto)`).

**O que um slot novo precisa**: um `mac_checklist_modelos` novo (`POST /api/mac/checklists`,
que já suporta `copiar_de` outro modelo como ponto de partida, se fizer sentido copiar a
estrutura) + seus próprios itens. Igual à Camada 3: itens de outros slots nunca são afetados,
por FK.

### 5. Documentos / papéis de documento — DECISÃO DE PRODUTO, não herança automática

Aqui não há herança neutra — é uma escolha real: Slot 5 tem classificador automático de pasta
inteira (`lib/lerPastaSlot5.ts`, 2282 linhas, casa conteúdo/nome de arquivo contra um
vocabulário fechado de `papel`) alcançado por `app/api/lip/ler-pasta/route.ts` e um botão
"📁 LER PASTA" (upload de pasta, `webkitdirectory`) só visível quando `ehSlot5` em
`ProcessoClient.tsx`. Regularização/Aceite SEI usam um upload manual multi-arquivo mais
simples (mesmo botão, ramo `!ehSlot5`), sem classificador automático equivalente.

**O que um slot novo precisa decidir**: qual dos dois caminhos ele segue (ou um terceiro).
Copiar o classificador de pasta do Slot 5 sem adaptação seria importar heurística feita pro
vocabulário documental de Aprovação de Projeto pra outro contexto — errado por padrão, exige
olhar caso a caso. Se optar pelo caminho simples (como Regularização/Aceite), nenhum código
novo de classificação é necessário.

### 6. BIP (vínculo LIP/MAC × legislação)

`mac_bip_vinculos` está escopado só via `mac_item_id → mac_checklist_itens.modelo_id →
tipo_processo` — nenhuma coluna de slot direta. Achado real já registrado em código
(`app/api/bdi/prioridades/route.ts:155-159`): Slot 5 tem ~85% de cobertura BIP, Regularização/
Aceite SEI têm **0%** — não é bug de FK, é ausência de trabalho humano de vinculação.

**O que um slot novo precisa**: nada de código — a fila de propostas
(`mac_vinculos_propostas`, `/admin/vinculos-lip-bip`) já funciona por `assunto`/`tipo_processo`
genericamente. **Esperar 0% de cobertura BIP no dia 1 é o estado NORMAL e correto** — nunca
tratar isso como falha do slot novo, mesmo padrão documentado pros 2 slots antigos.

### 7. Sinais do Radar — nada a declarar

`lib/urbi/radar.ts` trata `tipo_processo` como dado opaco (`string | null`), sem nenhum
`if (tipo_processo === ...)`. Escopo por tipo (ex.: mudança de catálogo invalidando só
retratos do MESMO tipo) já é genérico. **Um slot novo funciona no Radar automaticamente**,
assim que tiver um adaptador de dossiê (Camada 2) — não precisa de nenhuma mudança em
`radar.ts`.

### 8. Motor de Produção — nada a declarar

`lib/urbi/motorProducao.ts` não tem parâmetro de slot nenhum — consome só o dossiê já
normalizado pelo adaptador (Camada 2). **Mesma conclusão da Camada 7**: funciona pro slot novo
sem mudança, desde que o adaptador exista e devolva os campos que o Motor espera.

### 9. Regras determinísticas próprias do slot — isolamento É obrigatório aqui

Prova real de isolamento: `lib/caixaRecargaSlot1.ts` (Regularização, LC 314/2018) tem
comentário explícito proibindo import cruzado com `lib/mac-motor/slot5/`; e vice-versa,
`lib/mac-motor/slot5/regras/*.ts` (LC 349/2022) só importa de dentro do próprio diretório.
Confirmado por grep: nenhum consumidor cruza os dois hoje.

**O que um slot novo precisa**: SEMPRE um arquivo/diretório próprio pra qualquer regra
determinística nova (ex.: `lib/caixaRecargaSlotPED.ts` ou `lib/mac-motor/slotPED/regras/*`),
mesmo que a fórmula pareça idêntica à de um slot existente na data de hoje — reproduzir o
cálculo por leitura, nunca importar do slot original.

### 10. Permissões — nada a declarar

`lib/autorizacao.ts` decide acesso só por perfil/gerência/dono do processo
(`usuario.irrestrito`, `analista_id`, `gerenciaDoPerfil`) — nenhuma referência a
`tipo_processo`/slot em lugar nenhum do arquivo. **Um slot novo herda o modelo de permissão
automaticamente**, sem nenhuma linha de código nova.

### 11. Prompts do LIP — isolados por design, com fallback seguro

Tabela `lip_prompts` tem `assunto_id`; `app/api/lip/s2/route.ts` (e `s3`) já tentam o prompt
do assunto primeiro e só caem pro prompt global se o slot não tiver o seu — comportamento
antigo preservado, nunca quebra por ausência. Slot 5 tem, ADICIONALMENTE, prompts
hardcoded em `lib/mac-motor/slot5/prompts.ts`/`promptP3.ts` pro motor híbrido de MAC — algo
que Regularização/Aceite não têm equivalente (não existe "motor híbrido" pra eles hoje).

**O que um slot novo precisa**: linhas em `lip_prompts` por `assunto_id`, quando o texto
genérico não servir. Sem elas, cai no prompt global — funciona, só não é personalizado.

### 12. Tela do LIP (`ProcessoClient.tsx`) — arquivo único, desvio por tipo

Confirma o texto do CLAUDE.md: `ehSlot5 = tipoUrl === "slot_05"` (linha 205) e variações
inline decidem rota de MAC, comportamento de upload, flags como `laudoDefinidoNesteSlot`. **O
que um slot novo precisa**: um novo desvio (`ehSlotPED = tipoUrl === "..."`, ou o `switch`
citado abaixo) dentro do MESMO arquivo — nunca um arquivo `ProcessoClientPED.tsx` separado,
que duplicaria toda a tela em vez de só o comportamento que realmente diverge.

## Achado real, sinalizado e NÃO corrigido nesta fase

A auditoria encontrou **3 cópias quase idênticas** do mesmo switch de roteamento de tela MAC
dentro de `ProcessoClient.tsx` (por volta das linhas 2770-2771, 2783 e 3286 — todas do tipo
`tipoUrl === "slot_05" ? "/analise-aprovacao-projeto" : tipoUrl === "aceite_sei" ? "/analise-
aceite-sei" : "/analise-regularizacao"`). Isto NÃO é violação da regra de isolamento entre
slots (é o MESMO arquivo compartilhado por desenho, Camada 12 acima) — é triplicação
evitável DENTRO de um arquivo que já é compartilhado por convenção. Consolidar num helper
local ajudaria manutenção (um slot novo exigiria editar 1 lugar, não 3), mas
`ProcessoClient.tsx` é operacional dos 3 slots reais — tocá-lo sem pedido explícito pra essa
tela viola a regra de trabalho do CLAUDE.md ("não mexer num slot sem pedido explícito").
Fica como achado, não como correção.

## O que este documento NÃO é

- Não é uma interface `SlotAdapter` genérica em TypeScript para os slots implementarem.
- Não cria nenhuma tabela ou coluna nova.
- Não altera nenhum dos 3 slots existentes.
- Não implementa Regularização PED nem Aceite PED — só prepara o checklist pra quando isso
  acontecer (ver `[[urbis-slots-3-4-ped-futuro]]`).

---
**Histórico:** criado em 05/09/2026, Fase 11 do mandato de 12 fases da Inteligência URBIS —
auditoria e documentação apenas, zero código de produção alterado.
