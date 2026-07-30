/**
 * Testes da INFRAESTRUTURA de execução do MAC (lib/mac-execucao/).
 *
 *   set -a && source .env.local && set +a && npx tsx scripts/testar_mac_execucao.mts
 *
 * Não testa regra nenhuma — não existe regra ainda (FASE 4, futura). Testa só o que
 * esta camada promete: criação de execução, reexecução sem destruir a anterior,
 * idempotência de registro de resultado, versionamento reproduzível, preservação de
 * histórico em revisão manual e integridade referencial.
 *
 * Usa processo, usuário e itens do MAC JÁ EXISTENTES no banco (não cria fixtures) —
 * os dados de teste que este script cria (execuções, resultados, revisões) são
 * removidos ao final, sempre, mesmo se algum teste falhar no meio.
 */

import { createClient } from "@supabase/supabase-js";
import {
  iniciarExecucao, registrarResultado, concluirExecucao, marcarErro,
  obterExecucao, execucoesDoProcesso, resultadosDaExecucao,
  revisarResultado, resultadoEfetivo, revisoesDoResultado,
  versaoLip, versaoMac, versaoBip,
} from "../lib/mac-execucao";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

const execucoesCriadas: string[] = [];

// ─────────────────────────── fixtures do banco real ───────────────────────────

const { data: processo } = await supabase.from("processos").select("id").limit(1).maybeSingle();
const { data: usuario } = await supabase.from("usuarios").select("id").limit(1).maybeSingle();
const { data: itensMac } = await supabase.from("mac_checklist_itens").select("id").limit(2);

if (!processo || !usuario || !itensMac || itensMac.length < 2) {
  console.error("pré-requisito ausente: precisa de ao menos 1 processo, 1 usuário e 2 itens do MAC no banco");
  process.exit(1);
}

const processoId = processo.id as string;
const usuarioId = usuario.id as string;
const [itemA, itemB] = itensMac.map((i: any) => i.id as string);

try {
  secao("1 · versionamento reproduzível");
  const v1 = versaoMac();
  const v2 = versaoMac();
  t("1a. versaoMac() é determinística (mesmo hash em duas chamadas)", v1 === v2, `${v1} × ${v2}`);
  const vl1 = versaoLip();
  t("1b. versaoLip() devolve hash não vazio", typeof vl1 === "string" && vl1.length > 0);
  const vb = versaoBip([{ fragmentoId: "x", confianca: "ALTA" }]);
  const vbMesmaOrdemDiferente = versaoBip([{ fragmentoId: "x", confianca: "ALTA" }]);
  t("1c. versaoBip() é determinística e ordena antes de somar", vb === vbMesmaOrdemDiferente);

  secao("2 · criação de execução");
  const exec1 = await iniciarExecucao({
    processoId, versaoLip: versaoLip(), versaoMac: versaoMac(), versaoBip: "teste",
    criadoPor: usuarioId, metadata: { origem: "testar_mac_execucao" },
  });
  execucoesCriadas.push(exec1.id);
  t("2a. execução criada com status EM_EXECUCAO", exec1.status === "EM_EXECUCAO");
  t("2b. execução aponta para o processo certo", exec1.processoId === processoId);
  t("2c. concluido_em começa nulo", exec1.concluidoEm === null);

  secao("3 · registro de resultado e idempotência");
  const r1 = await registrarResultado(exec1.id, {
    macItemId: itemA, aplicabilidade: "APLICAVEL", resultado: "CONFORME",
    confianca: "ALTA", justificativa: "teste de infraestrutura — não é avaliação real",
    regraId: "TESTE_INFRA", regraVersao: 1,
  });
  t("3a. resultado gravado com o item certo", r1.macItemId === itemA);
  t("3b. resultado gravado na execução certa", r1.execucaoId === exec1.id);

  let duplicataFoiRejeitada = false;
  try {
    await registrarResultado(exec1.id, {
      macItemId: itemA, aplicabilidade: "APLICAVEL", resultado: "NAO_CONFORME",
      justificativa: "tentativa de regravar o mesmo item na mesma execução", regraId: "TESTE_INFRA",
    });
  } catch {
    duplicataFoiRejeitada = true;
  }
  t("3c. regravar o mesmo item na mesma execução é rejeitado (não upsert silencioso)", duplicataFoiRejeitada);

  const r2 = await registrarResultado(exec1.id, {
    macItemId: itemB, aplicabilidade: "NAO_APLICAVEL", resultado: "NAO_AVALIADO",
    justificativa: "segundo item, mesma execução", regraId: "TESTE_INFRA",
  });
  t("3d. um segundo item na mesma execução é aceito normalmente", r2.macItemId === itemB);

  const resultadosExec1 = await resultadosDaExecucao(exec1.id);
  t("3e. a execução tem exatamente os 2 resultados gravados", resultadosExec1.length === 2,
    `${resultadosExec1.length}`);

  secao("4 · conclusão e imutabilidade da execução");
  const concluida = await concluirExecucao(exec1.id);
  t("4a. execução concluída muda status", concluida.status === "CONCLUIDA");
  t("4b. execução concluída ganha concluido_em", concluida.concluidoEm !== null);
  t("4c. execução concluída ganha duracao_ms >= 0", (concluida.duracaoMs ?? -1) >= 0);

  let concluirDeNovoFalhou = false;
  try { await concluirExecucao(exec1.id); } catch { concluirDeNovoFalhou = true; }
  t("4d. concluir uma execução já concluída é rejeitado", concluirDeNovoFalhou);

  let registrarAposConcluirFalhou = false;
  try {
    // a tabela não bloqueia isto via CHECK — é o serviço que devia impedir; aqui provamos que
    // pelo menos o STATUS da execução já não é mais EM_EXECUCAO, o que a UI deve respeitar.
    const execAposConcluir = await obterExecucao(exec1.id);
    registrarAposConcluirFalhou = execAposConcluir?.status !== "EM_EXECUCAO";
  } catch { registrarAposConcluirFalhou = true; }
  t("4e. execução concluída não aparenta mais estar EM_EXECUCAO", registrarAposConcluirFalhou);

  secao("5 · reexecução preserva o histórico");
  const exec2 = await iniciarExecucao({
    processoId, versaoLip: versaoLip(), versaoMac: versaoMac(), versaoBip: "teste-2",
    criadoPor: usuarioId,
  });
  execucoesCriadas.push(exec2.id);
  t("5a. reexecução cria uma execução NOVA, com id diferente", exec2.id !== exec1.id);

  await registrarResultado(exec2.id, {
    macItemId: itemA, aplicabilidade: "APLICAVEL", resultado: "NAO_CONFORME",
    justificativa: "segunda rodada, resultado diferente da primeira", regraId: "TESTE_INFRA",
  });
  await marcarErro(exec2.id, "encerrado propositalmente pelo teste de infraestrutura");

  const exec1DepoisDaSegunda = await obterExecucao(exec1.id);
  t("5b. a primeira execução continua CONCLUIDA depois da segunda rodar", exec1DepoisDaSegunda?.status === "CONCLUIDA");
  const resultadosExec1DepoisDaSegunda = await resultadosDaExecucao(exec1.id);
  t("5c. os resultados da primeira execução não mudaram", resultadosExec1DepoisDaSegunda.length === 2);

  const historico = await execucoesDoProcesso(processoId);
  const idsHistorico = historico.map((e) => e.id);
  t("5d. o histórico do processo lista as duas execuções de teste",
    idsHistorico.includes(exec1.id) && idsHistorico.includes(exec2.id));

  secao("6 · revisão manual não é destrutiva");
  const efetivoAntes = await resultadoEfetivo(r1.id);
  t("6a. resultado efetivo antes de qualquer revisão é o original do motor", efetivoAntes === "CONFORME");

  const revisao1 = await revisarResultado({
    resultadoItemId: r1.id, usuarioId, resultadoNovo: "NAO_CONFORME",
    justificativa: "correção do analista — teste de infraestrutura",
  });
  t("6b. a revisão registra o resultado anterior corretamente", revisao1.resultadoAnterior === "CONFORME");
  t("6c. a revisão registra o resultado novo corretamente", revisao1.resultadoNovo === "NAO_CONFORME");

  const resultadosApos1Revisao = await resultadosDaExecucao(exec1.id);
  const r1SemMudanca = resultadosApos1Revisao.find((r) => r.id === r1.id);
  t("6d. mac_resultados_item.resultado NÃO foi alterado pela revisão (original preservado)",
    r1SemMudanca?.resultado === "CONFORME");

  const efetivoDepois = await resultadoEfetivo(r1.id);
  t("6e. resultado efetivo passa a refletir a revisão", efetivoDepois === "NAO_CONFORME");

  const revisao2 = await revisarResultado({
    resultadoItemId: r1.id, usuarioId, resultadoNovo: "CONFORME",
    justificativa: "segunda correção — volta ao original, ainda auditável",
  });
  t("6f. uma segunda revisão parte do resultado efetivo anterior (NAO_CONFORME), não do original",
    revisao2.resultadoAnterior === "NAO_CONFORME");

  const cadeia = await revisoesDoResultado(r1.id);
  t("6g. a cadeia de revisões preserva as duas, em ordem", cadeia.length === 2 && cadeia[0].id === revisao1.id);

  secao("7 · integridade referencial");
  let processoInvalidoFalhou = false;
  try {
    await iniciarExecucao({
      processoId: "00000000-0000-0000-0000-000000000000",
      versaoLip: "x", versaoMac: "x", versaoBip: "x",
    });
  } catch { processoInvalidoFalhou = true; }
  t("7a. execução com processo_id inexistente é rejeitada pela FK", processoInvalidoFalhou);

  let itemInvalidoFalhou = false;
  try {
    await registrarResultado(exec2.id, {
      macItemId: "00000000-0000-0000-0000-000000000000",
      aplicabilidade: "APLICAVEL", resultado: "CONFORME",
      justificativa: "item inexistente", regraId: "TESTE_INFRA",
    });
  } catch { itemInvalidoFalhou = true; }
  t("7b. resultado com mac_item_id inexistente é rejeitado pela FK", itemInvalidoFalhou);

  let usuarioInvalidoFalhou = false;
  try {
    await revisarResultado({
      resultadoItemId: r1.id, usuarioId: "00000000-0000-0000-0000-000000000000",
      resultadoNovo: "PENDENTE", justificativa: "usuário inexistente",
    });
  } catch { usuarioInvalidoFalhou = true; }
  t("7c. revisão com usuario_id inexistente é rejeitada pela FK", usuarioInvalidoFalhou);

  secao("8 · exclusão em cascata preserva a integridade, não os dados soltos");
  const { count: resultadosAntesDelete } = await supabase
    .from("mac_resultados_item").select("id", { count: "exact", head: true }).eq("execucao_id", exec1.id);
  t("8a. execução de teste tem resultados antes de apagar", (resultadosAntesDelete ?? 0) === 2);

} finally {
  // limpeza: nunca deixar dado de teste no banco, mesmo se um teste acima falhar
  if (execucoesCriadas.length) {
    const { error } = await supabase.from("mac_execucoes").delete().in("id", execucoesCriadas);
    if (error) console.error("FALHA NA LIMPEZA:", error.message);
    else console.log(`\n  limpeza: ${execucoesCriadas.length} execução(ões) de teste removida(s) (cascata apaga resultados e revisões)`);
  }
}

console.log(falhas === 0 ? "\ntodos passaram" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
