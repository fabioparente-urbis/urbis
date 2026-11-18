# Plano da troca do Gemini — 01/12/2026

**Versão:** 0.3 · **Data:** 17/11/2026 · **Status:** DESENHO FECHADO pelo Fábio (LIP no 3.5-lite, MAC no 3.6). Nada implementado, nada em produção — aplicar só em 01/12.

## 1. Situação real hoje (conferida no código da `main`, 17/11)

- **Padrão de todo o URBIS** (`lib/constants.ts`, `GEMINI_MODEL`): já é `gemini-3.5-flash-lite` desde 03/11.
  LIP de todos os slots, MAC dos Slots 2/3/4, legendas de foto, Documentos SEI e URBI **já leem com o 3.5-lite**.
- **Exceção:** o MAC do Slot 1 (`app/api/regularizacao-sei/mac/p3/route.ts`) está **fixado no `gemini-2.5-flash`**.
  É a única leitura que para em 01/12.
- **Arquivo acima de 50MB:** `lib/modeloGemini.ts` escala sozinho para o `gemini-3.6-flash`.
- **Slot 5, MAC** (`mac/slot-05/p3` e `ler-pasta`): usa a variável `GEMINI_MODEL` do Railway, se existir; senão o 3.5-lite.

## 2. O estudo (17/11/2026)

**Como foi feito:** as rotas REAIS de leitura de cada slot rodaram sem alteração nenhuma, dentro de
`scripts/estudo_modelos_gemini.mts`. Só duas coisas trocadas por fora: o modelo da chamada e o bloqueio de
toda gravação no banco (nada gravado). 3 modelos × 3 rodadas × 1 processo real por slot. Nota de acerto =
igual à ficha do LIP salva / à análise do MAC feita à mão. Estabilidade = quanto as 3 rodadas concordam entre si.
Custo = tokens reais medidos (inclui o "raciocínio" do modelo, que é cobrado como saída).

| slot | processo | referência |
|---|---|---|
| 1 Regularização SEI | 24.5.000028498-2 | ficha salva + MAC análise 2 (338 edições à mão) |
| 2 Aceite SEI | 25.28.000001552-8 | ficha salva + MAC análise 3 (92 edições à mão) |
| 5 Aprovação de Projeto | 47737 | ficha salva + 370 itens marcados no MAC |
| 3 e 4 (PED) | sem processo no banco | prompts iguais aos do 1 e 2 (conferido por hash) — herdam o resultado |

### Resultado (médias de 3 rodadas; US$ por leitura)

| leitura | 2.5-flash | 3.5-flash-lite | 3.6-flash |
|---|---|---|---|
| **LIP Slot 1** — acerto / estab. / US$ | 69% / 88% / 0,152 | 67% / 87% / **0,038** | 69% / 91% / 0,129 |
| **LIP Slot 2** | 66% / 85% / 0,131 | **72% / 93% / 0,048** | 71% / 92% / 0,183 |
| **MAC Slot 1** | 56% / 77% / 0,184 | 56% / 87% / 0,019 | **68% / 93% / 0,081** |
| **MAC Slot 2** | inconclusivo (ver nota) | inconclusivo | inconclusivo |
| **MAC Slot 5** | 75% / 76% / 0,149 (1 rodada quebrou) | 82% / 92% / 0,071 | **87% / — / 0,127** (1 rodada veio incompleta) |
| **LIP Slot 5** (parte com IA) | não decisivo | não decisivo, o mais barato | não decisivo |

Tempo médio: 2.5 = 2 a 5 min (muitas vezes repetia a chamada); 3.5-lite = 15 a 40 s; 3.6 = 1 a 2 min.

### O que os números dizem

1. **O 2.5 não é o "bom e barato" que parecia.** Ele "pensa" muito (até 80 mil tokens de raciocínio por
   leitura) e muitas vezes repete a chamada. Medido, ele saiu **mais caro que o 3.6** no Slot 1 — o cálculo
   antigo de "3.6 custa 5x" contava só as páginas, não o raciocínio.
2. **LIP: o 3.5-lite empata com o 3.6** na qualidade, é tão estável quanto, e custa **3 a 4 vezes menos**.
3. **MAC: o 3.6 é o melhor** onde dá para medir (Slot 1 e Slot 5): acerta mais e repete o mesmo resultado.
   O 3.5-lite marca mais itens como conforme no Slot 1 (21–24 verdes contra 10–15 do 3.6) — é o jeito do "tudo verde".
4. **Todos falham de vez em quando:** o 3.6 devolveu uma resposta incompleta em 1 de 3 no Slot 5, o 2.5
   devolveu JSON quebrado em 1 de 3. A rota do MAC do Slot 5 não tenta de novo nesses casos — ver §5.
5. **Nota sobre o MAC do Slot 2:** a rota exige prova (página do SEI) para aceitar "conforme"/"não conforme";
   sem prova, o item volta em branco. Nas rodadas, a maioria dos itens voltou em branco para os 3 modelos
   (o 2.5 quase nunca deu prova). Por isso não dá para comparar modelos aqui — o desenho do Slot 2 pesa mais
   que o modelo. Quando o modelo deu provas (3.6 e 3.5-lite em 1 rodada cada), o 3.6 deu mais.
6. **LIP do Slot 5:** a ficha vem quase toda da "Ler Pasta", que **não usa IA**. A parte com IA preenche
   poucos campos; o modelo quase não muda o resultado. Fica no mais barato.

## 3. A melhor opção por slot (qualidade primeiro, depois economia)

| slot | LIP | MAC | por quê |
|---|---|---|---|
| 1 Regularização SEI | **3.5-flash-lite** | **3.6-flash** | LIP empata e custa 4x menos; MAC do 3.6 acerta mais e não "esverdeia" |
| 2 Aceite SEI | **3.5-flash-lite** | **3.6-flash** | LIP: lite foi o melhor; MAC: mesmo motivo do Slot 1 (o estudo do 2 foi inconclusivo) |
| 3 Regularização PED | **3.5-flash-lite** | **3.6-flash** | mesmos prompts do Slot 1 |
| 4 Aceite PED | **3.5-flash-lite** | **3.6-flash** | mesmos prompts do Slot 2 |
| 5 Aprovação de Projeto | **3.5-flash-lite** | **3.6-flash** + tentar de novo se vier incompleto | LIP quase sem IA; MAC do 3.6 acertou mais |
| PDF acima de 50MB | 3.6 (como já é hoje) | 3.6 | o 3.5-lite também tem teto — conferir no dia |

**Custo estimado por processo (LIP + MAC), Slot 1:** hoje ≈ US$ 0,22 (LIP lite + MAC 2.5) → proposta ≈ **US$ 0,12**.
Mais barato que hoje E melhor no MAC. Se o preço do 3.6 dobrar em 01/01/2027 (aviso anterior, conferir), ≈ US$ 0,20.

Difere da ideia do Fábio (LIP do Slot 5 no 3.6) só porque, no Slot 5, o LIP quase não usa IA — pagar o 3.6 ali não muda o resultado.

## 4. O que muda no código no dia 01/12 (lista fechada — NÃO aplicar antes)

| # | onde | de → para |
|---|---|---|
| A | `lib/constants.ts` → `GEMINI_MODEL` | continua `gemini-3.5-flash-lite` (LIP de todos, SEI, URBI) — **nada muda** |
| B | `app/api/regularizacao-sei/mac/p3/route.ts` | `"gemini-2.5-flash"` fixo → `"gemini-3.6-flash"` |
| C | `app/api/aceite-sei/mac/p3/route.ts`, `app/api/regularizacao-ped/mac/p3/route.ts`, `app/api/aceite-ped/mac/p3/route.ts` | padrão → `"gemini-3.6-flash"` (cada slot com a sua linha, sem código comum) |
| D | `app/api/mac/slot-05/p3/route.ts` e `ler-pasta/route.ts` | `GEMINI_MODEL` do ambiente → `"gemini-3.6-flash"` + repetir a chamada quando vier incompleta |
| E | `lib/iaUso.ts` | conferir o preço do 3.6 na tabela |

Conferir antes de mexer: se a "leitura única LIP+MAC" (interruptor por slot) estiver ligada, LIP e MAC saem
numa chamada só e usam um modelo só — nesse caso, a chamada combinada fica no 3.6.

## 5. Roteiro do dia 01/12 (≈30 minutos)

1. Uma chamada de teste ao `gemini-2.5-flash` para confirmar que saiu do ar.
2. Aplicar B, C, D, E — `tsc` limpo, commit, subir.
3. Ler 1 processo conhecido no Slot 1, 1 no Slot 2 e 1 no Slot 5 e conferir com o que o Fábio já sabe.
4. Conferir na aba Rastreabilidade (`urbis_api_calls`) o modelo e o custo de cada chamada.
5. Registrar no OBS COD.

**Voltar atrás:** reverter o commit. Nada de banco envolvido.

## 6. Até lá (combinado com o Fábio)

- Nada é trocado em produção.
- O Fábio lê o máximo de processos novos até 30/11 (LIP + MAC salvos) para concluir em dezembro.
  Em dezembro, **não reler** o que já foi lido.
- MAC do Slot 1 vindo "quase tudo conforme" → reler na hora e avisar.
- Limite do estudo: 1 processo por slot. Repetir em mais processos firma a decisão:
  `npx tsx --env-file=.env.local scripts/estudo_modelos_gemini.mts <caso>` e
  `python3 scripts/estudo_modelos_gemini_analisar.py <pasta>`.

## 7. Histórico

- 0.3 (17/11/2026) — Fábio fechou o desenho: LIP no 3.5-lite e MAC no 3.6 em todos os slots. Se algum LIP de dezembro vier ruim, o plano B é passar o LIP para o 3.6 (uma linha).
- 0.2 (17/11/2026) — estudo completo dos 5 slots (rotas reais, 3 modelos × 3 rodadas); opção por slot; lista fechada do dia 01/12.
- 0.1 (17/11/2026) — plano criado; situação real conferida na `main`.
