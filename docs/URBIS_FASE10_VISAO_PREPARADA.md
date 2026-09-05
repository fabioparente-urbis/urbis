# Fase 10 do mandato de 12 fases — visão preparada, mas desligada

**Status:** auditoria concluída, 05/09/2026. Nenhum código de `lib/visao/` ou
`lib/mac-motor/slot5/` foi alterado por esta fase — só leitura, e este documento novo.
`urbis_config.visao_ligada` confirmado `false` no banco real na data desta auditoria.
Nenhuma chamada ao Gemini aconteceu por causa deste trabalho.

Pedido original: preparar (sem executar) receitas de leitura visual para 11 tipos de
prancha/documento, com contrato de evidência (documento/página/região/trecho/valor/domínio
semântico/confiança/limitação) para cada um. Esta auditoria confrontou o pedido com o que já
existe no repositório antes de escrever qualquer linha nova — 6 dos 11 já têm cobertura real
(ativa ou preparada); os outros 5 não têm hoje nem receita nem campo de destino no LIP do
Slot 5, e fabricar prompt/validador para um valor sem lugar pra ir seria tratar hipótese como
fato, prática que este projeto proíbe (mesmo princípio já aplicado em achados de fases
anteriores — ver Fase 8 sobre `atualizado_em` contaminado, Fase 9 sobre "aprovação" sem fato
real).

## Duas famílias de contrato de evidência já existem — nenhuma nova foi criada

O sistema já tem DOIS mecanismos paralelos de leitura visual, cada um com seu próprio contrato
de evidência (nunca unificados até hoje — achado registrado abaixo, não corrigido nesta fase):

1. **`lib/visao/` (tipo `Receita`, ver `lib/visao/tipos.ts`)** — usado por `executarVisao()`
   (`lib/visao/index.ts`), acionado só na leitura de pasta do Slot 5. Contrato por campo:
   `Interpretacao.porCampo[chave]` = `{ok:true, valor, confianca}` ou `{ok:false, motivo}`, com
   a região (`RegiaoAbsoluta`: página + coordenadas fracionárias) resolvida à parte pelo
   localizador. **Não tem campo `trecho`** (citação do texto-fonte) — só `valor`+`confiança`.
2. **`lib/mac-motor/slot5/prompts.ts` (tipo `PromptSlot5`, fatos `FatoExtraido`)** — usado pelo
   motor de execução do MAC (`lib/mac-motor/slot5/index.ts`), 3 prompts já ATIVOS em produção
   (`PROMPT_DIMENSOES_TERRENO`, `PROMPT_CAIXA_RECARGA`, `PROMPT_QUADRO_AREAS_CARIMBO`) mais 1
   isolado/experimental (`carimboMetadados.ts`). Contrato por fato: `{nome, valor, unidade,
   documento, pagina, trecho, confianca, observacao}` OU `{nome, abstencao:true, motivo,
   documento}` — **este SIM tem `trecho`**, exigido em todo prompt desta família.

**Achado real, não corrigido nesta fase:** o contrato de `lib/visao/` é mais fraco que o de
`lib/mac-motor/slot5/` no único ponto que falta — ausência de `trecho` estruturado impede um
humano conferir qual texto-fonte sustentou o valor sem reabrir o PDF. Corrigir isso exigiria
tocar `lib/visao/interpretar.ts`, que já processa as 2 receitas ATIVAS em produção
(`CALCULO_DE_VAGAS`, `ICCAP`) — mudança de parser sem poder testar contra o Gemini real (fora
de escopo desta rodada) é risco desnecessário para um ganho que nenhuma receita ativa pediu
até hoje. Fica registrado como melhoria pendente, não como bug urgente.

## Mapeamento dos 11 itens pedidos × estado real

| # | Item pedido | Estado real | Fonte |
|---|---|---|---|
| 1 | **Quadro de áreas** | ✅ Preparada (`ativa:false`), no catálogo desde Fase O (04/09) | `lib/visao/quadroAreas.ts` (`QUADRO_AREAS_COMPLETO`) |
| 2 | **Memoriais** | ✅ Coberta pelo item 1 — `tipoQuadroIdentificado` já reconhece `memorial_de_calculo` como um dos 4 tipos de quadro classificáveis; não é receita separada porque memorial de cálculo É um dos lugares onde o quadro de áreas aparece, não um documento à parte | `lib/visao/quadroAreas.ts:49` |
| 3 | **Carimbos** | ✅ Preparada, isolada (arquétipo 4, 03/09) — extrai só metadado não-pessoal (número de projeto/prancha, escala, data, título), nunca nome/CPF/CAU/CREA do carimbo. Nunca foi importada por nenhuma rota/tela; extração não validada contra Gemini real ainda | `lib/mac-motor/slot5/experimental/carimboMetadados.ts` |
| 4 | **Onerosa** (outorga onerosa, via altura da edificação) | ⏸ Pendente por decisão de CONTEÚDO, já registrada antes desta fase — `alturaDaEdificacao` é `PENDENTE_VISAO`: um corte real tem várias cotas de altura (total, entrepiso, platibanda), e escolher qual delas conta pra outorga onerosa é decisão jurídica do Fábio, não um problema de extração. Nenhuma ação de código pendente até essa decisão vir | `lib/mac-motor/slot5/outorgaOnerosa.ts:10-14` |
| 5 | **Caixa de recarga** | ✅ JÁ ATIVA — `PROMPT_CAIXA_RECARGA` chama o Gemini de verdade hoje, mas só quando o analista aciona a leitura/conferência de pasta do Slot 5 (ação humana, decisão anterior a este mandato de 12 fases, fora do escopo de "preparar sem executar") | `lib/mac-motor/slot5/index.ts:175`, `lib/mac-motor/slot5/prompts.ts:127` |
| 6 | **Planta de situação** | ❌ Sem receita e sem campo de destino no LIP do Slot 5 hoje (recuos/implantação no lote não têm chave estruturada lá — `area_recuo` existe como domínio semântico só em Regularização/Aceite SEI, não em Slot 5) — ver "Contrato futuro" abaixo | — |
| 7 | **Térreo** | ❌ Idem — só faz sentido junto do item 8 (pavimento é o mesmo tipo de planta, o térreo é só o primeiro) | — |
| 8 | **Pavimentos** | ❌ Idem — nenhuma chave LIP no Slot 5 pede área/dado por pavimento fora do que `QUADRO_AREAS_COMPLETO.areasPorPavimento` já cobre (item 1); uma leitura de PLANTA (não de quadro) por pavimento pediria outro tipo de dado (ex.: contagem de cômodos, afastamento) sem fonte LIP hoje | — |
| 9 | **Cobertura** (a prancha, não a área) | ❌ Idem | — |
| 10 | **Cortes** | ❌ Idem — é justamente de onde viria `alturaDaEdificacao` (item 4), então tocar cortes sem a decisão do item 4 primeiro seria construir a metade errada do problema | — |
| 11 | **Fachadas** | ❌ Idem | — |

## Contrato futuro — itens 6 a 11 (plantas sem campo de destino)

Os 6 itens sem cobertura têm uma causa raiz comum: **nenhum deles tem hoje uma chave LIP no
Slot 5 pronta para receber o valor extraído.** Escrever um prompt Gemini "prepara" a
extração, mas sem domínio semântico (`lib/urbi/catalogoSemantico.ts`) e sem chave LIP de
destino, o valor lido não teria pra onde ir — a mesma armadilha que a Fase 9 evitou ao não
inventar "documentos frequentemente ausentes" sem fato real, e que a Fase 8 evitou ao não usar
`atualizado_em` como proxy contaminado.

**O que falta, antes de qualquer prompt real ser escrito** (decisão de produto, não de código):
1. Para cada planta (situação/pavimento/cobertura/corte/fachada), decidir QUAL valor concreto
   o URBIS precisa extrair dela — hoje o pedido nomeia o DESENHO, não o DADO. "Ler a planta de
   situação" não é uma receita executável até alguém decidir se o alvo é recuo, área de
   implantação, orientação solar, ou outra coisa.
2. Criar a chave LIP (ou decidir que o valor não vai para o LIP, e para onde vai) e o domínio
   semântico correspondente — só depois faz sentido escrever `localizacao.alvo`+`prompt`, nos
   mesmos moldes de `QUADRO_AREAS_COMPLETO`.
3. **Cortes especificamente dependem do item 4 (onerosa)** — a mesma decisão de "qual cota de
   altura conta" bloqueia os dois.
4. Testar contra prancha real autorizada antes de `ativa:true`, mesmo checklist já usado em
   `CHECKLIST_ATIVACAO_VISAO` (`lib/visao/quadroAreas.ts`).

Nenhum destes 4 pontos é uma tarefa de código — são decisões que só o Fábio (ou quem tiver
autoridade sobre o Slot 5) pode tomar. Até lá, os itens 6-11 continuam fora do catálogo
`RECEITAS`, por desenho, não por esquecimento.

## Guardas que continuam valendo, confirmadas nesta auditoria

- `urbis_config.visao_ligada = false` (confirmado por leitura direta no banco em 05/09/2026) —
  desliga as 3 receitas ativas de `lib/visao/` de uma vez; nenhuma receita preparada
  (`ativa:false`) roda mesmo com o interruptor geral ligado, checado ANTES de orçamento ou
  recorte (`executarVisao`).
- Interruptor por receita (`Receita.ativa`) é independente do interruptor geral — os itens 1-3
  (quadro de áreas, memoriais, carimbos) continuam `ativa:false`/isolados mesmo que alguém
  ligasse `visao_ligada` amanhã.
- Tetos existentes continuam sendo o único limite de custo real: 40 chamadas/processo/hora,
  120/usuário/hora — nenhum teto novo foi necessário porque nada novo foi ativado.
- `mhd_interpretacoes_visao` — não reconferido nesta auditoria (Fase 8/9 já confirmaram 0
  linhas antes); nenhuma leitura de linha aqui, então nenhum código para checar de novo mudou.

---
**Histórico:** criado em 05/09/2026, Fase 10 do mandato de 12 fases da Inteligência URBIS —
auditoria e documentação apenas, zero código alterado, zero chamada ao Gemini.
