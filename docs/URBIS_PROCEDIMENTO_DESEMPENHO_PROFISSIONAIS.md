# Procedimento auditável — desempenho por profissional (autor/responsável técnico)

**Status: preparação, não implementado.** Nenhum ranking, nenhuma nota, nenhuma
exposição pública de profissional existe hoje a partir deste documento. Ele só
registra as regras que uma futura métrica TEM que seguir, para quando houver
base real (mínimo de 2 processos por profissional, conforme critério abaixo).

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

Só entra na métrica quem tiver `profissionais.validado = true` **e**
pelo menos um vínculo com `processo_profissionais.confirmado_por` preenchido
(confirmação humana registrada, colunas já existentes na tabela — ver migration
citada acima, linhas 43-44). Profissional sem essa validação fica de fora da
métrica e conta à parte como "identidade não confirmada" — nunca aparece
misturado a quem já foi conferido.

Cadeia de soft-merge (`merged_into_id`) sempre resolvida até o registro vivo
antes de contar — mesmo laço já implementado em
[historico/route.ts:74-89](../../app/api/profissionais/historico/route.ts#L74-L89).

## 3. Mínimo de 2 processos — sem isso, sem número

Abaixo de 2 processos vinculados (`papel` = `autor_arquiteto` ou
`responsavel_engenheiro`, `ativo = true`, contando processos distintos —
um processo pode gerar 2 vínculos, ex. arquiteto e engenheiro no mesmo
processo), a resposta é **"dados insuficientes"**, nunca uma métrica com
denominador 1. Mesmo padrão de `base_insuficiente` já usado em
[lib/bdi/dossie.ts](../../lib/bdi/dossie.ts) e `lib/bdi/vigia.ts`.

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

**Divergência já encontrada, para resolver antes de agregar por profissional:**
[historico/route.ts:111](../../app/api/profissionais/historico/route.ts#L111)
conta indeferimento por `analises_mac.status === "indeferido"`, enquanto
`lib/bdi/situacao.ts` conta por tag de `processos.tags` — e o próprio
`situacao.ts` (linhas 147-152) documenta que `analises_mac.status` **não é
confiável**: de 70 análises com despacho já commitado, 65 (93%) continuam
`em_andamento`, e só a tag muda de fato o resultado. Ou seja, o contador de
indeferidos que já roda hoje no chat do URBI pode estar **subcontando** —
antes de virar métrica de desempenho, os dois caminhos têm que ser
unificados na fonte mais auditada (tag, não status).

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

## Resumo do que falta para implementar (fora de escopo deste documento)

1. Resolver a divergência de indeferimento (seção 4) — decisão de produto,
   não só código.
2. Definir o fato real de "aprovação" antes de contar aprovação.
3. Só então: rota de leitura (sessão obrigatória), agregando por
   `profissionais.id` com as regras 1-5 acima, testada com dado fabricado
   (profissional com <2 processos, profissional não validado, sentinela,
   soft-merge) antes de qualquer exposição real.

---
**Histórico:** criado em 03/09/2026, junto do fechamento da Fase 5 do plano
de Inteligência URBIS (Co-Analista) — preparação apenas, conforme instrução
explícita de não implementar ranking nesta rodada.
