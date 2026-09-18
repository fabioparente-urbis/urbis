# Plano — Leitura de arquivos individuais (Slots 1 e 2) + aperfeiçoamento do Aceite (Slot 2)

**Criado em:** 18/09/2026, a partir de uma sessão de investigação (Opus) com o Fábio.
**Execução:** outra sessão (Sonnet). Este documento é autossuficiente — não precisa da conversa original.
**Progresso:** ~85% concluído (**Bloco A — CONCLUÍDO**, 6 campos criados; **Bloco B —
CONCLUÍDO**, testado em produção pelo Fábio no Slot 1 com sucesso: marco temporal e cruzamento
entre documentos funcionando; **Bloco D — CONCLUÍDO**: motivos de indeferimento, comentário do
laudo, checklist todo auditado e decidido; **Bloco C — rascunho ESCRITO**
(`docs/prompts/ACEITE_P2_EXTRACAO_v36.md`), aguardando o "ok" do Fábio pra ativar; tudo publicado
no `main`, PRs #4 e #5) · ~15% restante (Bloco C — ativar depois do ok; Bloco E — ponte LIP→MAC,
próximo passo, pedido explícito do Fábio pros dois slots). Atualizar no próprio commit de cada
bloco, ver regra de % no fim.

---

## 0. Antes de começar — leia isto

1. **Leia o `CLAUDE.md` do repositório.** Regras que pesam aqui:
   - Slot 1 (`regularizacao`) é produção crítica. Só mexa no que este plano autoriza.
   - Slot 5 **não é tocado** por nada deste plano.
   - `ProcessoClient.tsx` é compartilhado por todos os slots: comportamento novo entra por **desvio
     por `tipo_processo`**, sem alterar o caminho dos outros.
   - Cada mudança real termina com uma entrada no **OBS COD**
     (`node scripts/registrar_obs_cod.mjs ...`), **uma por bloco**, e o item fica aberto.
   - Nunca emitir documento nem consumir número da faixa de numeração.
2. **Várias sessões rodam em paralelo no mesmo repositório, sem worktree.** Rode `git status` antes
   de cada `git add`, adicione **só os arquivos que você mexeu** (nunca `git add -A` ou `.`).
3. **Alterações não salvas no git que NÃO são deste plano** (estavam lá em 18/09, de outra sessão):
   `app/api/mac/p3/route.ts`, `app/analise-regularizacao/[codigo]/page.tsx`, `lib/mrp.ts`,
   `components/fatiadorSei/TelaFatiamento.tsx`, parte de `app/processo/ProcessoClient.tsx`,
   `supabase/migrations/2026_09_10_mrp_processo_codigo_corrigido.sql`.
   Não inclua nada disso nos seus commits. Pergunte ao Fábio o destino delas antes de começar.
   Em especial: a leitura em lote do MAC (`files` no P3), que a memória dá como "testada em
   produção", **nunca foi salva no git**.
   Se precisar editar `ProcessoClient.tsx`, use `git add -p` e leve só os seus trechos.
4. **Custo de Gemini:** não rode leitura real (paga) sem o Fábio pedir. Teste com funções puras,
   scripts em `scripts/` e `npx tsc --noEmit`. O teste real com PDF é o Fábio quem faz pela tela.
5. **Mudança em prompt ou checklist no banco = mudança de produção.** Escreva o rascunho num
   arquivo, mostre ao Fábio e só ative depois do "ok" dele.
6. O Fábio não é programador. Relatórios para ele em linguagem simples.

---

## Diagnóstico (por que este plano existe)

### D1. "Ler Arquivos Individuais" do LIP lê pior que "Ler Processo" (Slots 1 e 2)
- `processarVCP` (`app/processo/ProcessoClient.tsx`, ~linha 1613) manda **cada arquivo numa
  chamada S1→S2→S3 separada**. O Gemini nunca vê os documentos juntos.
- Os prompts P2_EXTRACAO (Regularização v22, Aceite v35) foram escritos para o **processo inteiro**:
  "procuracao: Sim se houver procuração no processo, **Não caso contrário**", "use a versão mais
  recente (maior SEI)", e o exemplo de JSON já traz `"embargo": "Não"`, `"tombado": "Não"`, etc.
  Lendo só a certidão, o modelo responde "Não" para procuração, embargo, outro processo, caixa...
- A mescla usa "o primeiro valor não vazio vence". O "Não" errado do 1º arquivo **trava o
  campo**, e o "Sim" certo que vem depois é descartado.
- O VCP também **joga fora** o marco temporal, os `alertasMAC`, as pendências e o inventário de
  documentos (o `lerLip` usa tudo isso). O cache do VCP guarda só `campos`.
- Custo: o prompt de ~14 mil caracteres é pago **uma vez por arquivo**.
- É o mesmo defeito que o MAC teve (commit `abb817f` e depois a leitura em lote). No LIP ele nunca
  foi corrigido.

### D2. A leitura do LIP não preenche o checklist do MAC (Slots 1 e 2)
- A ponte existe (Fase 9B): `app/api/lip/s3/route.ts` monta o prompt combinado LIP+MAC
  (`lib/documentosSei/leituraUnicaLipMac.ts`) e grava a sugestão em `mac_sugestoes_leitura_unica`.
  As telas do MAC (`analise-regularizacao` ~l.453, `analise-aceite-sei` ~l.403) já leem e oferecem
  "aplicar".
- **O interruptor `urbis_config.leitura_unica_lip_mac_ativo` está `false`** e a tabela de sugestões
  está vazia (medido em 18/09).
- Furos que aparecem ao ligar:
  - No VCP, cada arquivo faz `upsert` por `processo_codigo` e **apaga a sugestão do anterior**.
    O Bloco B resolve isso.
  - Sem `analises_mac` criada antes da leitura, a sugestão é **pulada sem aviso**.
  - O interruptor é global: ligado, ele também valeria para o Slot 5 se o S3 for chamado nele.
    Precisa ser restrito aos Slots 1 e 2.

### D3. Regras do Aceite (Slot 2) — versão CORRIGIDA pelo Fábio em 18/09
Tabela oficial (LC 314/2018, Título II / IN 7/2024 item 9):

| Tema | Regra |
|---|---|
| Marco temporal | edificação existente **até 19/10/1995** |
| Comprovação | **Vistoria Fiscal + 1 dos 4**: declaração de energização CELG/Equatorial, talão de IPTU anterior a 19/10/1995, averbação em cartório, planta aerofotogramétrica de 1992. Dos 4, procurar **primeiro a imagem aérea**; só se ela não identificar a edificação, passar aos outros documentos. |
| Projeto / ART | **até 200,00 m²** de área construída: só croqui cotado, ART/RRT dispensada. **Acima de 200 m²: projeto completo (levantamento) + ART/RRT — EXIGÍVEL.** |
| Uso do Solo | dispensado (Art. 7º §2º exclui o inciso I). Pode ser apresentado, nunca cobrado. |
| Caixa de recarga | não prevista no Título II, **não é cobrada. Mas se o requerente apresentar, tem que estar certa** (volume, memorial, ART da caixa). |
| Limite | uma vez por imóvel (Art. 8º, parágrafo único). Já existe o aviso de imóvel duplicado. |
| **Fora do Aceite** | Corpo de Bombeiros, TAC/mitigação, licença ambiental, esgotamento sanitário, e tudo de Habite-se de obra nova (alvará de construção, "confere com projeto aprovado", ampliação durante a obra, habite-se parcial). |

**Atenção:** até 18/09 o sistema foi construído com a regra ERRADA "ART e caixa nunca exigíveis"
(laudo, checklist, prompt). Este plano corrige.

### D4. Situação atual do Aceite (medida em 18/09)
- `lib/marcoTemporal.ts`: data certa por slot (1995 no Aceite, 04/03/2022 na Regularização). Mas o
  bloco de prompt e o veredito **só olham a vistoria fiscal**. Os 4 documentos não são procurados.
- Prompt P2_EXTRACAO Aceite **v35** (`lip_prompts.id = 14`): `tempoExistencia` = "Sim só se a
  vistoria atesta Apta". Contradiz a regra de comprovação. Os padrões "NÃO" no exemplo JSON repetem
  o problema do D1.
- Tela do MAC do Aceite, janela de indeferimento
  (`app/analise-aceite-sei/[codigo]/page.tsx` ~l.2947): o motivo diz *"Reforma ou construção após
  **04/03/2022** — não elegível para **regularização**"* e oferece *"Uso do solo não definido"*.
  As duas coisas estão erradas no Aceite.
- Checklist do Aceite (modelo `da29333d-0d9d-4a1b-a810-8dfe8ebbf6b4`, 55 itens ativos): itens
  com a regra da Regularização, por exemplo:
  - `522314ae` (caixa, "acima de 250 m²");
  - `02589912` (artCx, "acima de 250m²");
  - `cfde2b8b` (artLev, "Art. 2º inc. VII");
  - `70f42389` ("Rever Uso do Solo");
  - `b1f69e47` (CNAE);
  - corredor viário: `c557f20f`, `83ec2c26`, `21c86749`;
  - caixa: `d27a06b0`, `375bdf3b`, `88e2317c`, `dd67da7e`.
  Os itens `f1bf5485` (tempoExistencia) e `ab5b19bd` (foto) já estão com 1995: não mexer.
- **Processo físico:** o LIP do Aceite **não tem o campo** e o prompt v35 **não pede o dado**.
  - O Slot 1 tem o campo: `lip_campos` com `chave = processoFisico`, rótulo "Nº Processo Físico",
    aba "1. Identificação" do assunto Regularização (`aba_id ea1ec9df-...`, ordem 3).
  - A aba "1. Identificação" do Aceite é `aba_id = a3a2a750-af06-4b2b-bb69-62457804f433`
    (assunto `cb574aa0-5040-4fd0-aa60-14b64d9a047a`). Não tem esse campo.
  - Mesmo assim, o despacho do Aceite (`app/api/despacho-aceite-sei/route.ts:28`) e a tela do MAC
    do Aceite **já leem** `dados.processoFisico`. Hoje leem vazio.

### D5. Prompt pessoal do Fábio — o que se aproveita
O prompt dele foi adaptado pelo ChatGPT para "Habite-se", que é outro ato. Aproveitar **só as regras**:
- **Status final em vez de "Não" por ausência** (Apresentado / Dispensado por lei / Não informado /
  Pendente). Na prática: não escrever "Não" quando só não achou. Deixar `null` e explicar.
- **Tabela de documentos com data e emissor**, com `*` na versão final.
- **A versão que vale é a que define o status final** (retificação ou substituição), não só a de
  maior SEI.
- **Checagem cruzada** vistoria + fotos + declaração do RT para: obra concluída; calçada (piso
  tátil, rampas, ausência de degraus); águas pluviais não lançadas na calçada.
- **Despacho da chefia = o ÚLTIMO ato.**
- **Uso constatado na vistoria** (no Aceite o documento de uso do solo não é exigido).
- O formato de saída continua o JSON atual. As tabelas do prompt dele não entram.

---

## Bloco A — Campos que faltam na tela do LIP do Aceite + a leitura deles (Slot 2) · pedido direto do Fábio

Pedido do Fábio (18/09): *"no LIP do slot 2 não achei o processo físico... e ele tem que ser
preenchido nas leituras de PDF"*, *"não achei no LIP a documentação: COMAER"*, *"MEXER NA INTERFACE
DO LIP SLOT 2 E NOS PROMPTS PRA LER"*.

Comparação medida em 18/09 (`lip_abas`/`lip_campos`, Regularização `33e01883-...` × Aceite
`cb574aa0-...`). Campos que o Slot 1 tem e o Aceite não:

| Campo (chave) | Rótulo no Slot 1 | Aba no Aceite | Decisão |
|---|---|---|---|
| `processoFisico` | Nº Processo Físico | 1. Identificação `a3a2a750-...` | **ENTRA** (pedido) |
| `comaer` | DOC SEI — COMAER | 7. Documentos `8e904571-...` | **ENTRA** (pedido) |
| `flAnac` | Folha/SEI — Anuência ANAC | 8. Vistoria e Uso `f5685c08-...` | **ENTRA** (Fábio confirmou "sim", 18/09) |
| `flExercito` | Folha/SEI — Anuência Exército | 8. Vistoria e Uso | **ENTRA** (idem) |
| `areaLaudo` / `areaArt` / `areaVistoria` | área segundo laudo / ART / fiscal | 2. Áreas `bd91045a-...` | **ENTRA** (idem) |
| `seiComprovacao` (novo) | "DOC SEI — Comprovação do Tempo de Existência" | 7. Documentos | **ENTRA** (idem). Companheiro do já existente `tipoComprovacao` (guarda o TIPO) — este guarda o Nº SEI do documento |
| uso do solo (`tipoUso`, `usoSolo`, CNAEs 3-5, descrições), `certCorredorViario`, `indiceCaptacao`, `existente`/`areaAprovada`, `certidaoRememDesm`, áreas do Slot 1 | — | — | **NÃO entram**: uso do solo é dispensado no Aceite; remembramento e área existente já têm equivalentes próprios (`remembramento`, `areaExistente`); áreas do Aceite têm outra divisão |

Passos:
1. **Interface — CONCLUÍDO em 18/09/2026** (os 2 campos confirmados de imediato pelo Fábio,
   "já sobe pq to precisando"): `processoFisico` e `comaer` foram criados em `lip_campos`, só no
   Aceite. Aplicado direto no banco por script avulso e registrado em
   `supabase/migrations/2026_09_18_lip_aceite_processo_fisico_comaer.sql` (idempotente, para
   reprodutibilidade — já não precisa ser rodado de novo). Resultado:
   - aba "1. Identificação" (`a3a2a750-...`): `processoFisico` entrou na ordem 3 (logo após
     "Processo SEI"), empurrando `quadra..crea` uma posição cada (agora 4 a 11);
   - aba "7. Documentos" (`8e904571-...`): `comaer` entrou na ordem 11, com o mesmo
     label/placeholder/valor_padrao do Slot 1 ("DOC SEI — COMAER", "Nº SEI ou NP", padrão "NP").
     A duplicidade de ordem 7 entre `foto`/`certLimites` (herdada, não é deste bloco) **não foi
     mexida** — sinalizar ao Fábio se atrapalhar a exibição.
   - **CONCLUÍDO em 18/09/2026 (2ª leva):** Fábio confirmou "sim" para os 3 pendentes.
     `flAnac`/`flExercito` (aba Vistoria e Uso), `areaLaudo`/`areaArt`/`areaVistoria` (aba Áreas)
     e `seiComprovacao` (aba Documentos, campo novo) criados — registrado em
     `supabase/migrations/2026_09_18_lip_aceite_2a_leva_campos.sql`. **Os 6 campos originais do
     Bloco A estão todos criados na tela.**
   - **Bônus da mesma leva:** o Fábio respondeu também a citação legal certa para o ART/RRT
     acima de 200 m² (pendência do Bloco D) — "IN 7, item 9" (Instrução Normativa nº 7/2024,
     Anexo I, item 9). Corrigido direto o item de checklist `cfde2b8b` (artLev), que citava
     errado "Art. 2º, inc. VII da LC 314/2018" (artigo do Título I) sem limiar de área — agora
     cita a IN 7/2024 com o corte de 200 m² explícito. Retirado da tabela pendente do Bloco D.
   - **O que falta pra este bloco fechar:** os campos criados ainda não são lidos por nenhum
     prompt — ver passo 2. Até lá, todos ficam visíveis na tela mas só preenchem com digitação
     manual do analista.
2. **Leitura (prompt v36, Bloco C1) — PENDENTE.** Para cada campo que entrar, acrescentar a chave no JSON de
   saída e a regra de onde procurar. Referência de redação: o prompt do Slot 1 v22 e
   `app/api/lip/analisar/route.ts:39`.
   - `processoFisico`: capa ou protocolo, menção a "processo físico nº", processo antigo
     digitalizado ou referenciado. Nunca confundir com o nº SEI do processo atual nem com o de outro
     imóvel.
   - `comaer`: SEI de 7 dígitos da anuência ou manifestação do COMAER. `"NP"` se
     `vistoriaAreaAeroportuaria = "Não"`; `null` se a área é aeroportuária e o documento não foi
     achado (é pendência, não "NP").
   - `flAnac` / `flExercito`: mesma lógica do `comaer`, amarrados a `vistoriaAreaAeroportuaria` /
     `vistoriaAreaMilitar`.
   - `areaLaudo` / `areaArt` / `areaVistoria`: só preencher se o respectivo documento (Laudo
     Técnico / ART de levantamento / Termo de Vistoria) citar uma área explicitamente — não
     calcular, não inferir. Vazio (não "NP") se o documento não citar área. Servem só para o
     analista comparar com a área do Aceite (`areaAceite`), igual ao Slot 1.
   - `seiComprovacao`: o Nº SEI do documento usado para provar 19/10/1995 — o mesmo documento que
     já alimenta `tipoComprovacao` (que guarda o TIPO: "Vistoria Fiscal"/"Google
     Earth"/"Energização"/etc.). Foto primeiro (regra D3): se a foto aérea identificar a
     edificação, `seiComprovacao` é o SEI dela; só cai para um dos outros 3 documentos (Art. 7º
     §1º) se a foto não identificar.
   - Conferir a lista `CAMPOS_NP` em `app/api/lip/s3/route.ts:218`. Ela é comum aos slots: se a chave
     nova estiver lá, `null` vira `"NP"` sozinho. Decidir se é isso que se quer no Aceite, sem mexer
     no comportamento do Slot 1.
3. `corrigirSeiFisico` (`ProcessoClient.tsx:139`) já vale para todos os slots: se o modelo puser o
   físico em `processo`, ele é movido. Não precisa mexer.
4. O despacho do Aceite (`app/api/despacho-aceite-sei/route.ts:28`) e o MAC do Aceite **já leem**
   `processoFisico`, que hoje vem vazio. Depois do bloco, conferir pelo código que passa a sair
   preenchido. Não gerar documento real.
5. Se o gerador do laudo do Aceite (`gerarLaudoAceiteSei.ts`, mapa de células) tiver célula para
   algum desses campos, ligar. **Não criar célula nova na planilha do Fábio.**

## Bloco B — "Ler Arquivos Individuais" do LIP = mesma leitura do "Ler Processo" (Slots 1 e 2)

**CÓDIGO CONCLUÍDO em 18/09/2026 (Sonnet).** Falta só o passo 9 (teste real do Fábio pela tela,
com Gemini pago) para fechar o bloco.

Ideia: juntar os arquivos escolhidos **num PDF só, no navegador**, e mandar pelo **mesmo caminho do
`lerLip`**. O Gemini vê tudo junto, como no processo inteiro. Nenhuma rota do servidor mudou.

1. ✅ Em `processarVCP` (`ProcessoClient.tsx` ~1675): desvio **só** quando
   `marcoTemporalDoTipo(tipoUrl) !== null` (Regularização ou Aceite — reaproveitada a função de
   `lib/marcoTemporal.ts`, em vez de duplicar a checagem de prefixo). Chama
   `processarVCPComoLeituraUnica()`. Qualquer outro `tipoUrl` (Slot 5 incluído) cai no
   `processarVCP` antigo, **intocado**.
2. ✅ Módulo novo `lib/documentosSei/juntarArquivosLeitura.ts` (`juntarArquivosParaLeitura` /
   `juntarArquivosComoFile`), com `pdf-lib`:
   - PDF: `PDFDocument.load(bytes, { ignoreEncryption: true })` e `copyPages` de todas as páginas;
   - PNG/JPG: `embedPng`/`embedJpg`, página do tamanho da imagem (reduzida proporcionalmente se
     maior que A4);
   - arquivo que falhar: erro com o **nome do arquivo** (testado, ver passo 8);
   - mantém a ordem escolhida pelo analista;
   - nome do arquivo final: `${idUrl} - arquivos individuais (${n}).pdf`.
3. ✅ Tamanho: se o PDF juntado passar de `LIMITE_BYTES_PLATAFORMA`,
   `processarVCPComoLeituraUnica` para com mensagem clara ("leia em dois lotes menores") ANTES de
   chamar `lerLip`.
4. ✅ Chama `lerLip([arquivoJuntado], modoFinal, origem)`, com `modoFinal` pela mesma lógica que o
   VCP antigo usava. `setVcpModo(null)` e `setVcpArquivos([])` no fim. `lendoLip`/cronômetro são
   geridos pelo próprio `lerLip` (não duplicados); `vcpProcessando` fecha no `finally` da função
   nova.
5. ✅ `lerLip` ganhou o parâmetro opcional `origem?: { rotulo: string; arquivos: string[] }`
   (3ª posição, sem quebrar nenhum chamador existente — nenhum outro passa esse argumento). Quando
   presente, o cabeçalho da OBS vira `LEITURA DO PROCESSO (LIP) — ARQUIVOS INDIVIDUAIS` + a lista
   dos nomes originais, nos dois blocos (sucesso e erro) e no toast inicial.
6. ✅ O S4 (cruzamento entre arquivos, mais abaixo em `processarVCP`) não é tocado — só deixa de
   ser chamado no caminho novo, porque `processarVCPComoLeituraUnica` nunca entra nessa função.
7. ✅ Cache: nada de código extra — o `arquivoJuntado` passa pelo hash/cache que `lerLip` já faz
   sozinho para qualquer arquivo.
8. ✅ Teste — `scripts/testar_juntar_arquivos_leitura.mts`: junta 2 PDFs (2 e 3 páginas) + 1 PNG,
   confere 6 páginas no resultado, reabre o PDF final e confere de novo, e confere que um arquivo
   corrompido lança erro **nomeando o arquivo** (não passa em silêncio). Todos os casos passaram.
   `npx tsc --noEmit` limpo com as mudanças.
9. ✅ **TESTADO EM PRODUÇÃO pelo Fábio em 18/09/2026, Slot 1** (processo `25.5.000061039-8`, 9
   arquivos/33 páginas): sucesso. Confirma que a correção resolveu os dois problemas de raiz do
   D1:
   - **Marco temporal apareceu** — antes sumia sempre no VCP; saiu com veredito, trecho citado e
     fonte;
   - **Cruzamento entre documentos funcionando** — a leitura em conjunto achou uma divergência de
     área real entre 3 documentos (`areaTotal`/`areaLaudo`/`areaArt` = 444,05 m² × `areaVistoria`
     = 285,85 m²) e reportou em "Incompatibilidades" — o VCP antigo não tinha esse tipo de
     cruzamento;
   - 51 campos preenchidos, 12 documentos mapeados corretamente dentro do PDF juntado, 1:37 de
     duração, sem erro;
   - Cabeçalho da OBS saiu "ARQUIVOS INDIVIDUAIS" com os 9 nomes, como esperado.
   Achado cosmético, não corrigido (fora de escopo — é o MODELO escrevendo, não o código, e é
   prompt do Slot 1): a "fonte" do marco temporal saiu com o texto literal "SEI null" quando o
   documento não tinha SEI (`"Fonte: Termo de Vistoria Fiscal, SEI null, página 31-32"`) — o
   prompt pede pro modelo escrever o SEI, e ele escreveu a palavra "null" em vez de omitir.
   **Bloco B está CONCLUÍDO.**

## Bloco C — Prompt do Aceite v36 + marco temporal do Aceite (só Slot 2)

**C1. Rascunho do P2_EXTRACAO Aceite v36 — ESCRITO em 18/09/2026, aguardando o "ok" do Fábio
antes de ativar.** Arquivo completo em `docs/prompts/ACEITE_P2_EXTRACAO_v36.md`, com um resumo
das 9 mudanças no topo e um checklist de conferência no fim. Cobre: os 7 campos novos do Bloco A;
marco temporal reescrito (foto → 4 documentos → vistoria, sempre exigindo a vistoria também);
ART/RRT com o corte de 200 m² (IN 7/2024, Anexo I, item 9); caixa de recarga procurada mesmo sem
gatilho por área e conferida se apresentada; fim do "Não" automático em embargo/procuração/
tombamento; despacho = último ato; inventário com data/emissor; cruzamento vistoria×fotos×RT.
Ainda **NÃO ativado no banco** — a v35 continua valendo em produção.

Partir do texto do v35 (`lip_prompts.id = 14`), escrever em
`docs/prompts/ACEITE_P2_EXTRACAO_v36.md` e mostrar ao Fábio. Mudanças:
- **Campos novos do Bloco A** (processo físico, COMAER e os que o Fábio confirmar), com as regras de leitura do Bloco A, passo 2.
- **Fim do "Não" por ausência:** para procuracao, embargo, tombado e outro processo, "SIM" só com o
  documento visto; "NÃO" só quando o processo mostra que não existe (ex.: certidão negativa,
  vistoria dizendo "sem embargo"); do contrário `null`, com o motivo em
  `observacoes` (C) / `pendencias`. **Tirar os valores "NÃO" já prontos do exemplo JSON**
  (trocar por "..."). `onerosa` continua sendo calculado.
  A tela espera SIM/NÃO: `null` = campo vazio, e isso é aceitável.
- **ART/RRT:** extrair `artLev`/`nroArtLev` quando houver. Se a área do aceite for maior que
  200 m² e não houver ART/RRT de levantamento, registrar em `pendencias`:
  "ART/RRT exigível (área > 200 m²) não encontrada". Até 200 m²: anotar "croqui cotado — ART
  dispensada".
- **Caixa:** `caixa = "Sim"` só se o requerente apresentou. Nesse caso extrair `volMin`, `volAt`,
  `caixas`, `areaImpermeavel`, `artCx`/`nroArtCx` e registrar pendência se o volume adotado for
  menor que o mínimo ou faltar memorial ou ART da caixa. Sem caixa apresentada: `"Não"` (não é
  exigível, então aqui "Não" é correto).
- **Tempo de existência:**
  - `tempoExistencia = "Sim"` quando há vistoria fiscal **e** pelo menos 1 dos 4 documentos com
    data anterior a 19/10/1995;
  - procurar primeiro a imagem aérea (aerofotogramétrica de 1992 ou ortofoto), depois energização,
    talão de IPTU, averbação;
  - `tipoComprovacao` = qual documento foi achado;
  - `dataEnergizacao` como hoje;
  - `"Não"` só se o documento mostrar data posterior ou o fiscal disser "não apta";
  - senão `null`, com o motivo.
- **Inventário em `observacoes` (B):** "Tipo | SEI | data | emissor | pág. X-Y", `*` na versão final,
  e marcar os documentos de processos antigos.
- **Versão que vale:** a que define o status final. Se um documento declara substituir ou retificar
  outro, vale o substituto. Na falta disso, vale o maior SEI.
- **Cruzamento:** `vistoriaEstruturaConcluida`, `vistoriaCalcadas` (piso tátil, rampas, sem
  degraus) e `vistoriaAguasPluviais` (não lançar na calçada) vêm da vistoria, conferidos com as
  fotos e a declaração do RT. Se divergirem: manter o valor da vistoria e registrar pendência.
- **Despacho CHEADV:** o **último** ato da chefia.
- **Uso constatado:** se não houver documento de uso do solo, registrar em `observacoes` o uso
  constatado na vistoria. **Não criar chave nova** em `lip_campos` sem o Fábio pedir.
- **Não incluir:** bombeiros, TAC, licença ambiental, esgoto, itens de Habite-se.

Ativação, depois do ok do Fábio:
- inserir a linha v36 (`chave P2_EXTRACAO`, `assunto_id cb574aa0-...`, `ativo = true`,
  `versao_anterior = 35`, `conteudo_backup` = texto do v35);
- pôr `ativo = false` no v35;
- conferir as colunas reais da tabela antes.
Como desfazer: reativar o v35. O cache do Gemini é por hash do prompt, então a mudança passa a
valer sozinha (ver `app/api/lip/cache-gemini/route.ts`).

**C2. Bloco de marco temporal próprio do Aceite** (`lib/marcoTemporal.ts`).
- `blocoPromptMarcoTemporal`: acrescentar um ramo **só para Aceite**, que pede, além do parecer do
  fiscal, `comprovacaoDocumental: { tipo, data, sei, trecho }` (1 dos 4, imagem aérea primeiro).
  **O texto da Regularização tem que continuar idêntico.** Fazer um teste que compara a string de
  saída para "regularizacao" com a de antes.
- `avaliarMarcoTemporal`, só no Aceite:
  - `naoApta = true` só se o fiscal disser não apta (o fiscal decide, como hoje);
  - se nenhum dos 4 documentos for achado, a mensagem diz "vistoria sem documento de comprovação:
    conferir", com `naoApta = null`.
- Mostrar a comprovação nas linhas de Observações (`_linhasMarco` no `lerLip`), somente quando
  existir.
- Teste: `scripts/testar_marco_temporal_aceite.mts`, com casos puros (fiscal apta + foto, fiscal
  apta sem documento, fiscal não apta, Regularização inalterada).

**C3. P3_MAC Aceite v8** (o que julga o checklist). Mesmo processo de rascunho e ok:
- acrescentar a regra da ART acima de 200 m²;
- caixa: conferida só quando apresentada;
- comprovação por vistoria + 1 dos 4;
- itens de uso do solo e corredor = "nao_aplica" quando o documento não existe (já é assim).

## Bloco D — Correções de tela, laudo e checklist do Aceite (só Slot 2)

1. ✅ **CONCLUÍDO em 18/09/2026 — Motivos de indeferimento**
   (`app/analise-aceite-sei/[codigo]/page.tsx` ~l.2947): grep confirmou que os textos são só
   strings soltas nessa tela — não são comparados por igualdade em nenhum outro lugar (nem
   `lib/bdi/vigia.ts`, nem gerador de parecer). Trocado:
   - marco: "Reforma ou construção após 04/03/2022 — não elegível para regularização" →
     "Edificação concluída após 19/10/1995 — não atende ao marco temporal do Alvará de Aceite
     (LC 314/2018, Título II)";
   - removida "Uso do solo não definido...";
   - "mais de 7 pavimentos" **mantido**, e a dúvida ficou **RESOLVIDA** no "pente fino" de
     18/09 (achado abaixo): o próprio checklist do Aceite exige isso, confirmado.
   O Slot 1 (`analise-regularizacao` ~l.3234) **não foi tocado** (conferido: nenhuma linha mudou
   nesse arquivo neste bloco).
2. ✅ **CONCLUÍDO em 18/09/2026 — Laudo do Aceite**
   (`lib/geradores/aceiteSei/gerarLaudoAceiteSei.ts`): auditado o arquivo inteiro — **nenhum
   trecho de código** trata ART ou caixa como "nunca exigível"; o gerador só ESCREVE no Painel os
   valores primitivos que vieram do LIP (inclusive ART/RRT e caixa, quando existem), nunca zera
   nem bloqueia campo. O problema era só o comentário "DECISÕES DE CONTEÚDO", que descrevia a
   regra errada — corrigido para refletir D3 (ART exigível acima de 200 m²; caixa conferida se
   apresentada) e deixado explícito que a regra de EXIGIR/CONFERIR é da leitura (prompt), não
   deste gerador. **Nenhuma fórmula do template foi tocada.**
3. **"Pente fino" pedido pelo Fábio em 18/09** ("olha a primeira aba... tem dezenas de itens
   iguais") — feita uma auditoria completa dos 55 itens ativos do checklist do Aceite (todos os 8
   grupos, texto integral lido). Dois achados corrigidos de imediato (baixo risco, sem impacto em
   análise em andamento — conferido: nenhuma das 3 análises existentes do Aceite tinha marcação
   nesses itens), registrados em
   `supabase/correcoes/2026_09_18_aceite_checklist_apl_bombeiro.sql`:
   - ✅ **Grupo "No Setor Central/APL: Art.15 LC 314/2018"** (a 1ª aba, a que o Fábio viu): 8
     itens ativos repetindo o MESMO parágrafo de abertura (4 linhas) 8 vezes, cada um só
     acrescentando 1 bullet — e 2 bullets eram **idênticos** ("índice paisagístico mínimo de
     15%" 2x). Fábio confirmou que o grupo faz sentido no Aceite, só o conteúdo tinha bug.
     Consolidado em 1 item (`20e6aac3`) com os 7 parâmetros em lista, sem repetir o parágrafo; os
     outros 6 desativados (nunca apagados). O item dos templos religiosos (`8a9fb944`) é regra
     distinta, intocado. **O mesmo bug existe também no Slot 1** (9 itens, mesmo padrão,
     modelo `00000000-...`) — **não tocado**, fora do escopo autorizado.
   - ✅ **Item `88e2317c`** (caixa de recarga, grupo Carimbo 1/2): tinha uma 2ª frase exigindo
     "aprovação do projeto sob regramento do Corpo de Bombeiro" — Bombeiros já estava confirmado
     como **fora do escopo do Aceite** nesta mesma sessão. Removida só essa frase; a frase sobre
     memorial de cálculo da caixa fica, com "se a caixa for apresentada" explícito.
   - ✅ **RESOLVIDO** (não precisou de SQL): a dúvida sobre "mais de 7 pavimentos"/APP-APM no
     motivo de indeferimento (item 1 acima) — o item de checklist `72a48f6f` (grupo
     Levantamento) já EXIGE isso no Aceite: "Para que o projeto seja passível de aprovação por
     Alvará de Aceite: máximo de 7 pavimentos; altura máxima 21,00m; não obstruir/ocupar APM,
     APP ou logradouro público". Mantido como estava, comentário do código atualizado.
   - **Achado, NÃO corrigido (Slot 1, fora do escopo autorizado):** item `74877912` no checklist
     do Slot 1 tem a data inexistente "041/03/2022" (mesmo tema do Aceite que já foi corrigido
     ontem). **Já identificado por outra sessão** com SQL pronto, comentado, aguardando
     autorização — `supabase/correcoes/2026_09_18_auditoria_consolidado.sql`, Parte B, item B2.
     Não duplicado aqui.
   - **CONCLUÍDO em 18/09/2026 — os 5 itens restantes foram todos decididos pelo Fábio.**
     Desativados 4 (`b1f69e47`, `522314ae`, `02589912`, `70f42389`) — nunca apagados, ver
     `mac_checklist_itens.ativo`. Corredor viário (`c557f20f`, `83ec2c26`, `21c86749`)
     **confirmado que vale no Aceite** ("Sim, vale no Aceite" — regra urbanística geral,
     independente do imóvel ser antigo ou novo): mantido ativo, sem mudança. SQL em
     `supabase/correcoes/2026_09_18_aceite_checklist_desativa_4_itens.sql`.
     **O checklist do Aceite está com a auditoria de conteúdo fechada** (nada mais pendente de
     decisão nesta rodada).

   | Item (8 primeiros dígitos) | Chave/Grupo | O que tinha | Decisão do Fábio |
   |---|---|---|---|
   | `b1f69e47` | Carimbo 1/2 | Pede CNAE conforme "Uso do Solo Específico", cita Art.20/Art.11 §2 da IN nº 4 (linguagem de projeto NOVO/aprovação) | ✅ Desativado |
   | `522314ae` | caixa / Levantamento | "Apresentar poço/caixa para edificações **acima de 250 m²**..." | ✅ Desativado |
   | `02589912` | artCx / Documentação | "...será **indispensável**... –**Art.2º §4º**. Anexar ART/RRT..." | ✅ Desativado |
   | `70f42389` | — / Documentação | "Rever Uso do Solo. A atividade TEM USO ESPECÍFICO" | ✅ Desativado |
   | `c557f20f`, `83ec2c26`, `21c86749` | corredor / Corredor Viário | Regras de indicar faixa de corredor viário no carimbo/planta | ✅ Mantido ativo — vale no Aceite |
   | `d27a06b0`, `375bdf3b`, `dd67da7e` | caixa / Levantamento | Como desenhar/locar a caixa corretamente (memorial, locação, sem detalhe de planta) | Mantido como estava (já era condicional, compatível com D3) |

   Depois do ok do Fábio: `UPDATE mac_checklist_itens SET ativo = false WHERE id = '...'` para
   desativar (nunca `DELETE`), e `UPDATE ... SET texto = '...'` para reescrever os 2 casos de
   reescrita. Sem sobreposição com `~/.claude/plans/auditoria-slots-1-2-5-2026-09-18.md` (achado
   #5 daquele plano é a data `041/03/2022` no checklist **do Slot 1** — modelo
   `00000000-0000-0000-0000-000000000001` — não é este modelo do Aceite; **não mexer lá sem
   pedido explícito do Slot 1**).

## Bloco E — Leitura do LIP preenchendo o checklist do MAC (Slots 1 e 2) · depende do Bloco B

1. `app/api/lip/s3/route.ts`: montar o prompt combinado **só se `tipoProcesso` for Regularização ou
   Aceite**. O Slot 5 nunca entra, mesmo com o interruptor ligado.
2. Devolver no resultado do job o estado da sugestão do MAC:
   `macSugestao: "gravada" | "sem_analise_mac" | "desligado" | "falhou"`.
   O `lerLip` escreve uma linha em Observações, por exemplo: "Checklist do MAC: sugestão gravada" ou
   "não recebeu sugestão: a análise do MAC ainda não foi criada".
3. Auditar as telas do MAC (`analise-regularizacao` ~453-500, `analise-aceite-sei` ~403-450):
   aplicar a sugestão **só pode preencher item vazio**, nunca sobrescrever o analista. Corrigir se
   não for assim.
4. Ligar o interruptor é **decisão do Fábio**, por SQL:
   `update urbis_config set leitura_unica_lip_mac_ativo = true where id = 1;`
   Depois, medir numa leitura real (`urbis_api_calls.tokens_saida` antes e depois) e reportar o
   custo extra.

---

## Ordem de execução e %

| Bloco | Peso | Depende de |
|---|---|---|
| A — campos que faltam no LIP do Aceite (processo físico, COMAER…) | 10% | decisões do Fábio sobre ANAC/Exército/áreas/comprovação |
| B — arquivos individuais = leitura única | 25% | — |
| C — prompt v36 + marco do Aceite + P3 v8 | 30% | A (C1 leva o processo físico) |
| D — tela, laudo e checklist do Aceite | 20% | C (mesmas regras) |
| E — ponte LIP→MAC | 15% | B |

Ao terminar cada bloco:
- `tsc` limpo;
- commit só dos arquivos do bloco, numa branch própria a partir de `main`;
- atualizar a linha **Progresso** no topo deste arquivo **no mesmo commit** (% concluído e
  restante);
- registrar no OBS COD;
- resumo curto e simples para o Fábio.

---

## Fora do plano original, mesma sessão — "despacho" da CHEADV sem o ano

**CONCLUÍDO em 18/09/2026.** Pedido direto do Fábio, cobrindo os DOIS slots explicitamente
("rever os prompts", plural — descreveu o mesmo bug nos dois): o campo `despacho` (nº do ato da
CHEADV/Uso do Solo) estava vindo só com o número ("1492"), sem o ano ("1492/2025"). Achado: os
dois prompts P2_EXTRACAO (Regularização id=13 v22, Aceite id=14 v35) instruíam explicitamente
"APENAS o número do ato" — com um exemplo que MOSTRAVA o documento como "DESPACHO Nº 1374/2024"
mas pedia pro modelo devolver só "1374", cortando o ano de propósito. Corrigido nos dois: agora
pede o número **com o ano**, exatamente como está escrito no documento.
Conferido antes de mudar: `despacho` não é concatenado com ano em nenhum gerador de documento —
sem risco de duplicar o ano em nenhum documento oficial.
SQL em `supabase/correcoes/2026_09_18_despacho_cheadv_com_ano.sql`. **Slot 1 tocado com
autorização explícita desta mensagem** (exceção pontual do plano — o resto do Slot 1 continua
fora de escopo).

## Fora do plano original, mesma sessão — checklist do Slot 1, grupo Art.15/APL duplicado

**CONCLUÍDO em 18/09/2026.** Pedido direto do Fábio, com foto da tela do MAC do Slot 1 (aba "No
Setor Central/APL: Art.15 LC 314/2018", a primeira aba) e foto do documento de referência da
chefia mostrando o formato correto: o MESMO bug do checklist do Aceite (ver Bloco D) também
existia no checklist do Slot 1 — 8 itens repetindo o mesmo parágrafo de abertura, com 2 bullets
idênticos. Consolidado em 1 item (`92112534`), os outros 6 desativados (nunca apagados); o item
dos templos religiosos (`1e7c1380`) é regra distinta, intocado.
**Cuidado extra em relação ao Aceite:** 96 análises reais do Slot 1 têm marcação nesses itens
(640 marcações). Conferido antes de aplicar: em TODAS elas, os 8 itens do grupo estavam sempre
marcados com o MESMO status entre si (uso de "Todos Conformes"/"Todos N/A", nunca item a item) —
manter o item sobrevivente com o status que já tinha preserva o resultado exibido em toda
análise existente.
SQL em `supabase/correcoes/2026_09_18_regularizacao_checklist_apl_duplicado.sql`. **Slot 1
tocado com autorização explícita desta mensagem, escopo restrito a este único grupo do
checklist** — nada mais do Slot 1 foi tocado.
