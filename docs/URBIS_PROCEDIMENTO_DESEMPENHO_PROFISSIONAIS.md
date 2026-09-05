# Procedimento auditável — desempenho por profissional (autor/responsável técnico)

**Status: implementado parcialmente (Fase 9 do mandato de 12 fases, 05/09/2026)**
— `app/api/admin/urbi/desempenho-profissionais/route.ts`, exibida na aba
"Desempenho de profissionais" de `/admin/urbi`. Nenhum ranking, nenhuma nota,
nenhuma exposição pública de profissional — só contagem bruta, sessão
obrigatória (`Administrador`/`Diretora`, via `autenticar()` + `ctx.irrestrito`).
As seções abaixo continuam valendo; cada uma diz se já está implementada ou
segue como regra pra quando a base crescer.

Escopo: **profissional externo** (autor do projeto, responsável técnico —
arquiteto/engenheiro), não o analista interno do URBIS. Desempenho de analista
interno já existe e é público internamente via `vw_bdi_produtividade_mensal` /
`vw_bdi_analistas_desempenho`, consumidas em [app/api/bdi/stats/route.ts](../../app/api/bdi/stats/route.ts)
e exibidas em [app/admin/bdi/page.tsx](../../app/admin/bdi/page.tsx) — isso não muda aqui.

## 1. Fonte de identidade — nunca campo livre

A identidade profissional válida é sempre a linha em `profissionais`
([supabase/migrations/2026_07_16_create_profissionais.sql](../../supabase/migrations/2026_07_16_create_profissionais.sql)),
nunca o texto livre que ainda vive em `processos.dados` (chaves
`nome_responsavel_arq` / `nome_responsavel_eng` / `cau` / `crea`). Esse texto
livre é a *origem* do backfill, não a identidade final.

Vínculo processo↔profissional é sempre `processo_profissionais` (FK real
`processo_id`, não `processo_codigo` solto), filtrando `ativo = true`.

**Nunca usar como identidade:**
- o objeto JSONB de `processos.dados` inteiro ou qualquer campo dele direto;
- qualquer valor batendo com a lista de sentinelas já definida em
  [app/api/profissionais/historico/route.ts:4-21](../../app/api/profissionais/historico/route.ts#L4-L21)
  (`NP`, `N.P.`, `CAU-NP`, `N/A`, `SEM RESPONSÁVEL` etc. — reaproveitar essa
  função `ehSentinela`, não duplicar a lista).

## 2. Identidade validada — pré-requisito, não detalhe

**Reconciliado em 05/09/2026 (Fase 9):** este critério estrito
(`profissionais.validado = true` **e** pelo menos um vínculo com
`processo_profissionais.confirmado_por` preenchido) hoje classificaria **os 25
profissionais da base inteira** como "identidade não confirmada" — não existe
ainda nenhum fluxo que grave essa confirmação humana, então `validado` nunca
foi setado como `true` para ninguém. Aplicar só este critério esvaziaria a
tela, escondendo um fato útil (CAU/CREA presente) atrás de um fato que ainda
não pode existir.

A rota implementada expõe **os dois sinais lado a lado, sem escolher um**:
- `identidade_validada` = CAU ou CREA gravado (o que já existe hoje, útil
  mesmo sem confirmação humana — nome sozinho já teve colisão documentada
  nesta base antes do soft-merge existir);
- `identidade_confirmada_humana` = o critério estrito deste documento
  (`validado=true` + `confirmado_por`), hoje sempre `false` na prática, porque
  o fato que o comprova ainda não existe — e é isso mesmo, não é bug.

Quando existir um fluxo de confirmação humana (fora de escopo desta fase),
`identidade_confirmada_humana` passa a ter valores reais sem precisar mudar a
rota — o campo já está pronto, só esperando o fato.

Cadeia de soft-merge (`merged_into_id`) sempre resolvida até o registro vivo
antes de contar — mesmo laço já implementado em
[historico/route.ts:74-89](../../app/api/profissionais/historico/route.ts#L74-L89).

**Também da Fase 9:** detecção de candidatos a duplicata (`CAU`/`CREA` iguais
após normalizar formatação — ver `lib/profissionais/canonicalizar.ts`), pois a
base real tem CAU/CREA sem máscara fixa (`"3186/D-GO"`, `"1019837780D-GO"`,
`"CREA-1020076283DGO"` são todos formatos reais observados nos mesmos 25
registros). Só sugere pra revisão humana via o soft-merge já existente —
nunca funde nada sozinho.

## 3. Amostra mínima — sem isso, sem número

**Ajustado em 05/09/2026 (Fase 9):** o limiar implementado é **5** processos
distintos vinculados (`papel` = `autor_arquiteto` ou `responsavel_engenheiro`,
`ativo = true`), não 2 como este documento pedia originalmente — alinhado de
propósito ao mesmo limiar (`AMOSTRA_MINIMA_PROCESSOS`) já usado na aba
Recorrência (Fase H), pra não ter dois números de "amostra mínima" diferentes
convivendo no mesmo painel administrativo sem motivo. Abaixo do limiar, a
resposta é **"dados insuficientes"**, nunca uma métrica com denominador baixo
— mesmo padrão de `base_insuficiente` já usado em
[lib/bdi/dossie.ts](../../lib/bdi/dossie.ts) e `lib/bdi/vigia.ts`. Com os 25
profissionais reais de hoje (máximo 3 processos distintos cada), nenhum
atinge o limiar — resultado esperado, não falha da tela.

## 4. Separar terminal comprovado de terminal presumido — LACUNA REAL

O pedido original é separar "aprovado/deferido" de "concluído/arquivado/
indeferido". **Hoje só existe UM estado terminal com prova real no dado**:
arquivamento/indeferimento, via tag `processos.tags` (`indeferimento` |
`arquivamento`) — a mesma regra de
[lib/bdi/situacao.ts:154-210](../../lib/bdi/situacao.ts#L154-L210), que
documenta explicitamente por que "concluído" foi deixado de fora: "não existe,
em nenhum slot, um fato que prove que um processo terminou de vez" (linhas
22-26 do mesmo arquivo).

**Não existe hoje nenhum sinal real de "aprovado/deferido"** equivalente em
confiabilidade. Inventar esse sinal agora seria tratar hipótese como fato —
proibido pelas regras deste projeto. Antes de qualquer métrica de "aprovação",
precisa existir um fato novo e gravado (ex.: emissão de laudo de aprovação
como marco, ou um campo de resultado final que hoje não existe).

**Divergência já encontrada — RESOLVIDA em 05/09/2026 (Fase 9):**
[historico/route.ts](../../app/api/profissionais/historico/route.ts#L114-L124)
já foi corrigida para contar indeferimento pela tag de `processos.tags`,
nunca mais por `analises_mac.status` (comentário no próprio arquivo referencia
esta correção). `desempenho-profissionais/route.ts` nasceu já usando a mesma
fonte (`temTagArquivamento`, tag-only). Os dois caminhos estão unificados na
fonte mais auditada — nenhuma ação pendente aqui.

Até essa lacuna fechar, a métrica por profissional só pode contar, com prova
real:
- nº de processos vinculados (fato: `processo_profissionais`);
- nº de arquivados/indeferidos (fato: tag, fonte única acima);
- nº "em andamento" = vinculados menos arquivados/indeferidos (resto, sem
  presumir aprovação).

## 5. Retrabalho — mesma fonte do resto do BDI

Agregar por profissional a partir de `vw_bdi_retrabalho_por_passada` /
`mac_historico`, cruzando pelo `processo_id`/`processo_codigo` dos vínculos
ativos — mesma view já usada em `lib/bdi/dossie.ts` e no vigia. Não recalcular
retrabalho com lógica própria.

## 6. Nunca público, sempre explicável

- Rota que expuser isso tem que exigir sessão válida (mesmo padrão de
  `autenticar()` — ver correção aplicada agora em
  [historico/route.ts](../../app/api/profissionais/historico/route.ts), que
  estava sem essa checagem).
- Sem tela pública, sem exportação, sem citação em documento oficial.
- Cada número devolvido declara a fonte (tabela/view) e o motivo, mesmo padrão
  de `motivo`/`fonte` já usado em `lib/bdi/situacao.ts` e `lib/bdi/dossie.ts` —
  nunca um score sem explicação de onde saiu.
- Quem estiver na faixa "dados insuficientes" (seção 3) ou "identidade não
  confirmada" (seção 2) nunca aparece classificado ao lado de quem tem base —
  são categorias separadas, não o fim de uma escala.

## Contrato futuro — o que continua deliberadamente fora de escopo

1. **"Aprovação/deferimento" como métrica** — segue proibido (seção 4): não
   existe fato gravado equivalente em confiabilidade à tag de arquivamento.
2. **"Documentos frequentemente ausentes" por profissional** — pedido original
   do mandato de Fase 9, avaliado e **deliberadamente não implementado**: o
   único sinal parecido hoje ("documento ausente") vive só no fluxo de leitura
   visual do Slot 5 (`lib/mac-motor/slot5/*`, Gemini/`visao_ligada=false`,
   desligado por regra suprema) — usar campo-LIP-vazio como proxy pros Slots
   1/Aceite SEI arriscaria confundir "ainda não preenchido" com "profissional
   não entregou", o mesmo tipo de sinal contaminado que a Fase 8 já encontrou
   e descartou para BIP (`atualizado_em` vs mudança real de catálogo). Fica
   registrado como pergunta em aberto, não como funcionalidade adiada por
   preguiça: precisa de um fato novo e confiável antes de existir.
3. **Reingestão viva** (auto-popular `profissionais`/`processo_profissionais`
   a cada LIP salvo) — exigiria alterar `app/api/processo/salvar/route.ts`,
   código operacional de Slot, proibido nesta rodada sem autorização explícita
   para aquele slot especificamente. A base só cresce hoje por backfill manual
   (`scripts/backfill_profissionais.mjs`, rodado 2x em 17/07/2026).

---
**Histórico:** criado em 03/09/2026, junto do fechamento da Fase 5 do plano
de Inteligência URBIS (Co-Analista) — preparação apenas, conforme instrução
explícita de não implementar ranking nesta rodada. **Atualizado em 05/09/2026
(Fase 9 do mandato de 12 fases):** rota de leitura implementada
(`app/api/admin/urbi/desempenho-profissionais/route.ts`), reconciliada com o
critério estrito de identidade (seção 2, dois sinais lado a lado), amostra
mínima alinhada a 5 (seção 3), divergência de indeferimento confirmada
resolvida (seção 4), detecção de candidatos a duplicata de CAU/CREA adicionada
(`lib/profissionais/canonicalizar.ts`). "Aprovação" e "documentos ausentes"
continuam fora de escopo, por falta de fato real — ver Contrato futuro acima.
