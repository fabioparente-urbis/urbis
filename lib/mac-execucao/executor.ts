/**
 * lib/mac-execucao/executor.ts — infraestrutura de execução do MAC.
 *
 * Isto NÃO é o motor de regras (FASE 4, futura). É a camada que garante que toda
 * execução — de qualquer regra, hoje ou daqui a um ano — fica registrada de forma
 * reproduzível, idempotente e auditável:
 *
 *   iniciarExecucao   → abre uma rodada nova. Nunca reaproveita nem sobrescreve outra.
 *   registrarResultado → grava o resultado de um item DENTRO dessa rodada. Uma linha
 *                        por item por execução — chamar duas vezes para o mesmo item
 *                        na mesma execução é erro, não upsert silencioso.
 *   concluirExecucao  → fecha a rodada. Depois disso, mac_resultados_item daquela
 *                        execução é histórico — não se edita.
 *   revisarResultado  → correção humana. Sempre um INSERT em mac_resultados_revisoes,
 *                        nunca um UPDATE em mac_resultados_item. O valor original do
 *                        motor continua acessível para sempre.
 *
 * Nenhuma função aqui decide SE um item é conforme — isso é regra, e regra não mora
 * nesta camada (FASE 4). Aqui só garantimos onde e como o resultado de uma regra fica
 * gravado.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type {
  Aplicabilidade, Confianca, Execucao, EvidenciaLip, NovoResultadoItem,
  Resultado, ResultadoItem, RevisaoResultado, StatusExecucao, VinculoBipUsado,
} from "./tipos";

// ─────────────────────────── mapeamento linha↔domínio ───────────────────────────

function paraExecucao(r: any): Execucao {
  return {
    id: r.id,
    processoId: r.processo_id,
    versaoLip: r.versao_lip,
    versaoMac: r.versao_mac,
    versaoBip: r.versao_bip,
    status: r.status,
    iniciadoEm: r.iniciado_em,
    concluidoEm: r.concluido_em,
    duracaoMs: r.duracao_ms,
    criadoPor: r.criado_por,
    metadata: r.metadata_json ?? {},
  };
}

function paraResultadoItem(r: any): ResultadoItem {
  return {
    id: r.id,
    execucaoId: r.execucao_id,
    macItemId: r.mac_item_id,
    aplicabilidade: r.aplicabilidade,
    resultado: r.resultado,
    confianca: r.confianca,
    justificativa: r.justificativa,
    evidencias: r.evidencias_json ?? [],
    camposLip: r.campos_lip_json ?? {},
    vinculosBip: r.vinculos_bip_json ?? [],
    regraId: r.regra_id,
    regraVersao: r.regra_versao,
    requerRevisao: r.requer_revisao,
    criadoEm: r.criado_em,
  };
}

function paraRevisao(r: any): RevisaoResultado {
  return {
    id: r.id,
    resultadoItemId: r.resultado_item_id,
    usuarioId: r.usuario_id,
    resultadoAnterior: r.resultado_anterior,
    resultadoNovo: r.resultado_novo,
    justificativa: r.justificativa,
    criadoEm: r.criado_em,
  };
}

// ─────────────────────────── execução ───────────────────────────

export type IniciarExecucaoParams = {
  processoId: string;
  versaoLip: string;
  versaoMac: string;
  versaoBip: string;
  criadoPor?: string | null;
  metadata?: Record<string, unknown>;
};

/** Abre uma nova rodada de execução. Sempre INSERT — nunca reaproveita uma execução anterior. */
export async function iniciarExecucao(params: IniciarExecucaoParams): Promise<Execucao> {
  const { data, error } = await supabaseAdmin
    .from("mac_execucoes")
    .insert({
      processo_id: params.processoId,
      versao_lip: params.versaoLip,
      versao_mac: params.versaoMac,
      versao_bip: params.versaoBip,
      criado_por: params.criadoPor ?? null,
      metadata_json: params.metadata ?? {},
    })
    .select("*")
    .single();
  if (error) throw new Error(`mac_execucoes: ${error.message}`);
  return paraExecucao(data);
}

/** Grava o resultado de UM item dentro de uma execução. Erro se o item já tem resultado nesta execução. */
export async function registrarResultado(
  execucaoId: string,
  entrada: NovoResultadoItem,
): Promise<ResultadoItem> {
  const { data, error } = await supabaseAdmin
    .from("mac_resultados_item")
    .insert({
      execucao_id: execucaoId,
      mac_item_id: entrada.macItemId,
      aplicabilidade: entrada.aplicabilidade,
      resultado: entrada.resultado,
      confianca: entrada.confianca ?? null,
      justificativa: entrada.justificativa,
      evidencias_json: entrada.evidencias ?? [],
      campos_lip_json: entrada.camposLip ?? {},
      vinculos_bip_json: entrada.vinculosBip ?? [],
      regra_id: entrada.regraId,
      regra_versao: entrada.regraVersao ?? 1,
      requer_revisao: entrada.requerRevisao ?? false,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error(
        `mac_resultados_item: item ${entrada.macItemId} já tem resultado na execução ${execucaoId} — reexecutar exige uma execução nova, não regravar a mesma`,
      );
    }
    throw new Error(`mac_resultados_item: ${error.message}`);
  }
  return paraResultadoItem(data);
}

/** Fecha a rodada. Erro se a execução já não estiver EM_EXECUCAO (imutabilidade: fecha uma vez só). */
export async function concluirExecucao(execucaoId: string): Promise<Execucao> {
  const atual = await obterExecucao(execucaoId);
  if (!atual) throw new Error(`mac_execucoes: execução ${execucaoId} não encontrada`);
  if (atual.status !== "EM_EXECUCAO") {
    throw new Error(`mac_execucoes: execução ${execucaoId} já está ${atual.status} — não pode ser concluída de novo`);
  }

  const concluidoEm = new Date();
  const duracaoMs = concluidoEm.getTime() - new Date(atual.iniciadoEm).getTime();

  const { data, error } = await supabaseAdmin
    .from("mac_execucoes")
    .update({ status: "CONCLUIDA", concluido_em: concluidoEm.toISOString(), duracao_ms: duracaoMs })
    .eq("id", execucaoId)
    .eq("status", "EM_EXECUCAO")
    .select("*")
    .single();
  if (error) throw new Error(`mac_execucoes: ${error.message}`);
  return paraExecucao(data);
}

/** Marca a execução como ERRO — usado quando o motor não consegue terminar a rodada. */
export async function marcarErro(execucaoId: string, motivo: string): Promise<Execucao> {
  const atual = await obterExecucao(execucaoId);
  if (!atual) throw new Error(`mac_execucoes: execução ${execucaoId} não encontrada`);
  if (atual.status !== "EM_EXECUCAO") {
    throw new Error(`mac_execucoes: execução ${execucaoId} já está ${atual.status}`);
  }

  const { data, error } = await supabaseAdmin
    .from("mac_execucoes")
    .update({
      status: "ERRO",
      concluido_em: new Date().toISOString(),
      metadata_json: { ...atual.metadata, erro: motivo },
    })
    .eq("id", execucaoId)
    .eq("status", "EM_EXECUCAO")
    .select("*")
    .single();
  if (error) throw new Error(`mac_execucoes: ${error.message}`);
  return paraExecucao(data);
}

export async function obterExecucao(execucaoId: string): Promise<Execucao | null> {
  const { data, error } = await supabaseAdmin
    .from("mac_execucoes").select("*").eq("id", execucaoId).maybeSingle();
  if (error) throw new Error(`mac_execucoes: ${error.message}`);
  return data ? paraExecucao(data) : null;
}

/** Todas as execuções de um processo, mais recente primeiro — o histórico nunca é apagado. */
export async function execucoesDoProcesso(processoId: string): Promise<Execucao[]> {
  const { data, error } = await supabaseAdmin
    .from("mac_execucoes")
    .select("*").eq("processo_id", processoId).order("iniciado_em", { ascending: false });
  if (error) throw new Error(`mac_execucoes: ${error.message}`);
  return (data ?? []).map(paraExecucao);
}

export async function resultadosDaExecucao(execucaoId: string): Promise<ResultadoItem[]> {
  const { data, error } = await supabaseAdmin
    .from("mac_resultados_item")
    .select("*").eq("execucao_id", execucaoId);
  if (error) throw new Error(`mac_resultados_item: ${error.message}`);
  return (data ?? []).map(paraResultadoItem);
}

// ─────────────────────────── revisão humana ───────────────────────────

export type RevisarResultadoParams = {
  resultadoItemId: string;
  usuarioId: string;
  resultadoNovo: Resultado;
  justificativa: string;
};

/**
 * Registra uma correção humana. NUNCA faz UPDATE em mac_resultados_item — o valor que
 * o motor produziu continua lá, intacto, para sempre. `resultado_anterior` é sempre o
 * resultado EFETIVO no momento da revisão (a revisão mais recente, se houver; senão o
 * original), então uma cadeia de revisões conta a história completa, na ordem certa.
 */
export async function revisarResultado(params: RevisarResultadoParams): Promise<RevisaoResultado> {
  const resultadoAnterior = await resultadoEfetivo(params.resultadoItemId);
  if (!resultadoAnterior) {
    throw new Error(`mac_resultados_revisoes: item de resultado ${params.resultadoItemId} não encontrado`);
  }

  const { data, error } = await supabaseAdmin
    .from("mac_resultados_revisoes")
    .insert({
      resultado_item_id: params.resultadoItemId,
      usuario_id: params.usuarioId,
      resultado_anterior: resultadoAnterior,
      resultado_novo: params.resultadoNovo,
      justificativa: params.justificativa,
    })
    .select("*")
    .single();
  if (error) throw new Error(`mac_resultados_revisoes: ${error.message}`);
  return paraRevisao(data);
}

/** O resultado que vale HOJE para um item: a revisão mais recente, ou o original do motor. */
export async function resultadoEfetivo(resultadoItemId: string): Promise<Resultado | null> {
  const { data: revisoes, error: errRevisoes } = await supabaseAdmin
    .from("mac_resultados_revisoes")
    .select("resultado_novo, criado_em")
    .eq("resultado_item_id", resultadoItemId)
    .order("criado_em", { ascending: false })
    .limit(1);
  if (errRevisoes) throw new Error(`mac_resultados_revisoes: ${errRevisoes.message}`);
  if (revisoes && revisoes.length > 0) return revisoes[0].resultado_novo as Resultado;

  const { data: item, error: errItem } = await supabaseAdmin
    .from("mac_resultados_item").select("resultado").eq("id", resultadoItemId).maybeSingle();
  if (errItem) throw new Error(`mac_resultados_item: ${errItem.message}`);
  return item ? (item.resultado as Resultado) : null;
}

export async function revisoesDoResultado(resultadoItemId: string): Promise<RevisaoResultado[]> {
  const { data, error } = await supabaseAdmin
    .from("mac_resultados_revisoes")
    .select("*").eq("resultado_item_id", resultadoItemId).order("criado_em", { ascending: true });
  if (error) throw new Error(`mac_resultados_revisoes: ${error.message}`);
  return (data ?? []).map(paraRevisao);
}

export type {
  Aplicabilidade, Confianca, Execucao, EvidenciaLip, NovoResultadoItem,
  Resultado, ResultadoItem, RevisaoResultado, StatusExecucao, VinculoBipUsado,
};
