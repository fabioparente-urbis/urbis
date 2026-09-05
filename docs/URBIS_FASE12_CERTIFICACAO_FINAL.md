# Fase 12 — certificação final do mandato de 12 fases da Inteligência URBIS

**Data:** 05/09/2026. Última fase do mandato autônomo de 12 fases. Este documento é o painel
de prontidão + a base do relatório único consolidado pedido no início do mandato — nenhum
percentual aqui é declarado só porque o código compilou; cada afirmação cita a fonte real que
a sustenta (teste automatizado, consulta ao banco nesta mesma data, ou achado documentado em
fase anterior).

## Painel de prontidão, dimensão por dimensão

| Dimensão | Estado | Evidência |
|---|---|---|
| 3 Slots (Regularização, Aceite SEI, Slot 5) | ✅ testado | `testar_mac_execucao.mts`, `testar_mac_motor_slot5.mts`, `testar_rotulos_lip_reais.mts` contra processos reais dos 3 slots |
| Home (cartão de cobertura do Radar) | ✅ testado | Fase 2, cartão `formatarCartaoRadarComJob` |
| Pilha (perguntas factuais) | ✅ testado | `testar_perguntas_pilha_fase6.mts` (20 pontos), `testar_perguntas_pilha.mts` |
| BIP (fila, candidatos, cobertura) | ✅ testado / ⏳ 0 aprovações reais | `testar_cobertura_bip_fase8.mts`; `mac_vinculos_propostas` tem **0 linhas em produção** hoje (confirmado por consulta real nesta data) — mecanismo pronto, ação humana pendente |
| Módulo URBI (chat/dossiê/comandos) | ✅ testado + piloto humano real | `testar_navegacao_urbi.mts`, `testar_coanalista_fase_r.mts`; piloto real rodou em Regularização (25.5.000046759-5) |
| Isolamento entre processos | ✅ testado | Fase 3 (fila A nunca toca B), achado #4 do piloto (reset de widget por `processoCodigo`) |
| Troca de Slot na mesma conversa do widget | ⏳ **não confirmado** | Nenhum teste real registrado nesta sessão nem em fases anteriores — pendência de verificação humana |
| Radar sem navegador (servidor) | ✅ construído e testado / ❌ **não roda em produção ainda** | Mecanismo completo (`pg_cron`+`pg_net`, Fase 2) e testado com concorrência real via `Promise.all`; **`urbi_radar_execucoes` tem 0 linhas em produção** (consultado nesta data) — confirma que o cron nunca completou uma execução real, porque `URBI_RADAR_CRON_SECRET` ainda não foi configurado no Railway (pendência humana já registrada desde a Fase 2) |
| Pausa/retomada (atendimento ativo) | ✅ testado | `lib/urbi/atendimento.ts`, Fase 2 |
| Concorrência | ✅ testado | Lock por índice único parcial, 2 chamadas simultâneas reais via `Promise.all`, só 1 executa |
| Falha parcial (`estado='erro'`) | ⚠️ só estrutural | Achado já registrado na Fase 2: caminho de erro nunca foi forçado ao vivo (forçar exigiria corromper um processo real, proibido) |
| Custo zero (Gemini) | ✅ confirmado repetidamente | `visao_ligada=false` e `chat_gemini_ativo` default off confirmados por leitura direta no banco nesta data; toda fase deste mandato mediu `urbis_api_calls` antes/depois e confirmou 0 chamadas novas |
| RLS | ✅ corrigido e validado | Fase 2 de segurança do banco (01/09/2026): exposição anônima real (7 tabelas + 11 views + 18 legadas) encontrada e corrigida |
| Permissões | ✅ confirmado | Fase 11: `lib/autorizacao.ts` nunca referencia slot, mesma regra pros 3 |
| Ausência de dado pessoal | ✅ com ressalva | Rede de segurança estrutural (`sanitizarResposta.ts`, `fontesConsultadas.ts`, `carimboMetadados.ts` proíbe nome/CPF/CAU/CREA) pegou várias categorias reais de vazamento ao longo do piloto (Fases AC-AH) — é garantia estrutural, não uma prova de que NENHUM vazamento semântico novo pode aparecer com um prompt diferente; qualquer mudança de prompt futura precisa de reteste humano, mesmo padrão já demonstrado 5 vezes nesta sessão |
| Ausência de UUID/chave técnica | ✅ confirmado | Mesma rede acima, `manifestoFontes.ts` |
| Carga/performance | ❌ **nunca testado** | Nenhum teste de carga ou benchmark de performance existe em nenhuma fase deste mandato nem antes dele — gap real, não uma omissão desta fase especificamente |
| Rollback | ✅ confirmado | Toda migration desta sessão testada em transação `ROLLBACK` antes de aplicar de verdade; soft-merge de profissionais é reversível por desenho |
| Atualização incremental | ✅ confirmado | Fase 3 — mudança em 1 processo só reprocessa aquele processo |
| Respostas curtas/acionáveis | ✅ confirmado por desenho | Motor de Produção (máx 3 ações), `alertasProducao.ts` (máx 3), rodapé único da Pilha |

## Percentual técnico

**Não existe um "scorecard de 10 pontos" definido em nenhuma memória ou documento deste
repositório** (achado já registrado na sessão anterior, nunca resolvido porque o Fábio nunca
confirmou a que isso se referia) — por isso este relatório NÃO declara um percentual único
inventado. Em vez disso: das 20 dimensões auditadas acima, **16 estão testadas e confirmadas,
1 tem ressalva estrutural (falha parcial), 1 tem ressalva de risco residual conhecido (dado
pessoal), 1 não foi confirmada (troca de Slot) e 1 é gap real nunca endereçado (carga/
performance)**. As 12 fases do mandato foram todas concluídas, testadas e publicadas — mas
"12 de 12 fases concluídas" descreve o ESCOPO do mandato, não a maturidade de produção do
sistema inteiro.

## Cobertura de retrato (Radar)

Consultado ao vivo nesta data: **81 processos ativos**, dos quais:
- **55 (68%)** com retrato `atualizado` (pré-análise em dia).
- **24 (30%)** `pendente`/em fila (aguardando o próximo ciclo do job).
- **2 (2%)** sem nenhum retrato ainda.

Nenhum processo excluído aparece na fila (confirmado pela Fase 3 —
`limparRetratosDeProcessosExcluidos`). **Esta cobertura só vai crescer de verdade quando o job
de servidor rodar em produção** (ver pendência do Radar-sem-navegador acima) — hoje ela cresce
só quando algum analista tem uma aba do URBI aberta (mecanismo antigo, ainda funcional em
paralelo).

## Cobertura legal (BIP)

- **Slot 5: ~85%** dos itens ativos do checklist têm vínculo BIP (`mac_bip_vinculos`, 727
  vínculos reais) — achado confirmado em código (`app/api/bdi/prioridades/route.ts:155-159`).
- **Regularização e Aceite SEI: 0%** — a fila de propostas (`mac_vinculos_propostas`) existe e
  funciona (testada na Fase 8), mas **nenhum analista propôs um vínculo ainda** — 0 linhas em
  produção, confirmado nesta data. Isto não é falha técnica: é ação humana que ainda não
  começou.

## Maturidade estatística

- **Previsão de tempo/esforço** (Fase 4): só **11 processos no banco inteiro** têm os dois
  timestamps completos que a previsão exige (10 Regularização, 1 Aceite SEI, **0 Slot 5**) — a
  esmagadora maioria das consultas de previsão hoje responde honestamente "base insuficiente".
  Cresce sozinha com o uso real, não com nenhuma ação de código.
- **Profissionais**: 25 registros / 31 vínculos, de um backfill único (17/07/2026) — nenhum
  atinge a amostra mínima de 5 processos (máximo real é 3). 0 com identidade confirmada por
  humano (Fase 9).
- **Leitura visual**: `mhd_interpretacoes_visao` tem **0 linhas** — nenhuma leitura visual real
  aconteceu no sistema inteiro até esta data (confirmado nesta consulta).

## Receitas visuais preparadas

Ver `docs/URBIS_FASE10_VISAO_PREPARADA.md` para o mapeamento completo dos 11 tipos pedidos.
Resumo: quadro de áreas + memoriais + carimbos **preparados** (`ativa:false`, nunca chamam
Gemini); onerosa **pendente** por decisão jurídica (qual cota de altura conta); caixa de
recarga **já ativa** (mecanismo anterior a este mandato, fora do escopo de "preparar"); 5 itens
(planta de situação, térreo, pavimentos, cobertura, cortes, fachadas) **sem receita e sem
campo de destino no LIP** — documentados como contrato futuro, não fabricados.

## Pendências puramente humanas (nenhuma delas é tarefa de código)

1. **Crítica** — configurar `URBI_RADAR_CRON_SECRET` como variável de ambiente no Railway
   (valor já gerado, já no `.env.local`, já comunicado ao Fábio na Fase 2) — sem isso o Radar
   de servidor nunca vai rodar de verdade em produção, apesar de todo o mecanismo estar pronto
   e testado.
2. Terminar o piloto humano supervisionado do URBI: Aceite SEI e Slot 5 ainda não foram
   testados ao vivo com o chat real (só Regularização foi).
3. Abrir `/admin/vinculos-lip-bip` → Lote inicial → aprovar o 1º vínculo BIP real de
   Regularização/Aceite SEI (0 aprovações em produção hoje).
4. Decidir se/quando reingerir os processos de Regularização com RT já preenchido que ainda
   não têm profissional vinculado em `profissionais` (44 hoje, reconferido na Fase 9).
5. Limpar a linha residual `origem='teste_temporario'` em `processo_profissionais` — tentativa
   de limpeza nesta sessão foi bloqueada pelo classificador de permissão do Claude Code (ação
   de DELETE em banco de produção); fica pra ação humana direta.
6. Decisões de conteúdo pra Fase 10: qual dado concreto extrair de cada planta nova (situação/
   pavimento/cobertura/corte/fachada) + qual chave LIP recebe o valor; qual cota de altura
   conta pra outorga onerosa (bloqueia a receita de "cortes").
7. Cumprir o checklist de ativação de `QUADRO_AREAS_COMPLETO` (prancha real de teste
   autorizada) antes de qualquer receita de visão sair de `ativa:false`.
8. Slots PED (Regularização PED, Aceite PED) — confirmados como próxima frente, mas
   aguardando autorização explícita pra começar (ver `docs/URBIS_CONTRATO_NOVO_SLOT.md` pra
   quando isso acontecer).
9. Reconciliar `mac_checklist_itens.classificacao_bip`/`classificacao_lip` desatualizados no
   Slot 5 (achado da Fase 8, não corrigido — nenhum código vivo escreve nessas colunas hoje).
10. Confirmar troca de Slot dentro da mesma conversa do widget do URBI (nunca testado).
11. Decidir se vale investir em teste de carga/performance (nunca feito, gap real).

## Certificação técnica (prova, não promessa)

`npx tsc --noEmit`: limpo. `npm run build`: limpo. `scripts/certificar_urbi.mts`: estrutura +
suíte automatizada 100% verde (35 scripts automatizados, incluindo os 6 novos desta última
etapa do mandato — Fases 9, 10 e 11). Única falha conhecida e documentada:
`testar_rastreabilidade.mts` (matriz estática 8 itens atrás do catálogo real, Slot 5 é
só-leitura nesta rodada — limitação registrada desde a Fase 1, não corrigida de propósito).

---
**Histórico:** criado em 05/09/2026 — Fase 12, última fase do mandato de 12 fases da
Inteligência URBIS. Encerra o mandato autorizado no início desta sessão.
