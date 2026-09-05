/**
 * lib/urbi/alertasProducao.ts — alertas de produção consolidados (Fase 5 do mandato de 12
 * fases, 05/09/2026).
 *
 * PURO CONSOLIDADOR — nunca recalcula situação, contagem, Motor de Produção, linha de evidência
 * ou previsão. Só lê os campos JÁ GRAVADOS no retrato do Radar (`urbi_radar_retratos`) e
 * transforma em, no máximo, os 3 alertas mais úteis — "o URBI deve ajudar a agir, não produzir
 * relatório longo" (regra do Fábio). Nunca chama Gemini.
 *
 * Os 13 tipos pedidos e de onde cada um vem (nada duplicado, tudo reaproveitado):
 *  1-2. retorno próximo/além de 175/180 dias           → campos_consulta.dias_aguardando_retorno
 *  3.   documento cobrado sem retorno                   → linha_evidencia (alertasLinhaEvidencia)
 *  4.   retorno recebido sem nova conferência            → linha_evidencia (alertasLinhaEvidencia)
 *  5.   item reincidente                                 → linha_evidencia (alertasLinhaEvidencia)
 *  6.   cobrança repetida                                → linha_evidencia (alertasLinhaEvidencia)
 *  7.   LIP quase completo                               → campos_vazios/campos_totais
 *  8.   MAC com poucos bloqueios                         → pendencias_mac
 *  9.   processo próximo de emissão                      → alertas.esforco (Motor) + pendencias_mac
 *  10.  mudança de catálogo afeta marcação antiga         → motivo_disparo (Fase 3)
 *  11.  retrato desatualizado                            → estado / concluido_em
 *  12.  linha de evidência incompleta                    → linha_evidencia.registros[].grau_factual
 *  13.  previsão bloqueada por documento                 → previsao_tempo.status
 */
import { alertasLinhaEvidencia, type BlocoLinhaEvidencia } from "./linhaEvidencia";

export type AlertaProducao = { texto: string; prioridade: number };

const LIMITE_ALERTAS = 3;
/** Retrato sem execução concluída há mais que isto é "desatualizado" — mesma folga (3x a
 *  cadência esperada do job) já usada em formatarCartaoRadarComJob (lib/urbi/radarJob.ts). */
const LIMITE_RETRATO_DESATUALIZADO_HORAS = 6;

type RetratoParaAlertas = {
  estado: string;
  motivo_disparo: string | null;
  concluido_em: string | null;
  campos_consulta: any;
  campos_vazios: number | null;
  campos_totais: number | null;
  pendencias_mac: number | null;
  alertas: { esforco?: string } | null;
  linha_evidencia: BlocoLinhaEvidencia | null;
  previsao_tempo: { status: string } | null;
};

/** Monta a lista completa (sem cortar), ordenada por prioridade — quem chama decide quantos
 *  mostrar. `montarAlertasProducao` abaixo já corta pros 3 mais úteis, é o caminho normal.
 *  `incluirPrevisaoBloqueada` só deve ser `false` quando quem chama JÁ mostra
 *  `formatarPrevisao()` por extenso ao lado (ex.: chat por processo, Fase 4) — senão vira
 *  repetição da mesma informação. */
function montarTodosOsAlertas(r: RetratoParaAlertas, incluirPrevisaoBloqueada: boolean): AlertaProducao[] {
  const alertas: AlertaProducao[] = [];

  // 1-2 · retorno próximo/além de 175/180 dias
  const dias = r.campos_consulta?.dias_aguardando_retorno;
  if (dias?.disponivel && typeof dias.valor === "number") {
    if (dias.valor >= 180) alertas.push({ texto: `Retorno do interessado com ${dias.valor} dias ou mais — muito acima do esperado.`, prioridade: 1 });
    else if (dias.valor >= 175) alertas.push({ texto: `Retorno do interessado perto de 180 dias (${dias.valor}).`, prioridade: 2 });
  }

  // 3-6, 12 · linha de evidência (reaproveitada, nunca recalculada)
  if (r.linha_evidencia?.registros?.length) {
    for (const texto of alertasLinhaEvidencia(r.linha_evidencia)) alertas.push({ texto, prioridade: 3 });
    if (r.linha_evidencia.registros.some((reg) => reg.grau_factual === "base_insuficiente")) {
      alertas.push({ texto: "Linha de evidência incompleta — base insuficiente pra provar a origem de uma cobrança.", prioridade: 4 });
    }
  }

  // 7 · LIP quase completo
  if (typeof r.campos_vazios === "number" && typeof r.campos_totais === "number" && r.campos_totais > 0 && r.campos_vazios > 0 && r.campos_vazios <= 3) {
    alertas.push({ texto: `LIP quase completo — só ${r.campos_vazios} campo(s) crítico(s) vazio(s) de ${r.campos_totais}.`, prioridade: 5 });
  }

  // 8 · MAC com poucos bloqueios
  if (typeof r.pendencias_mac === "number" && r.pendencias_mac > 0 && r.pendencias_mac <= 2) {
    alertas.push({ texto: `MAC com poucos bloqueios — ${r.pendencias_mac} pendência(s) na última análise.`, prioridade: 5 });
  }

  // 9 · processo próximo de emissão (mesmo critério de "mais perto de emitir" da Pilha, Camada 2)
  if (r.alertas?.esforco === "rapido" && (r.pendencias_mac ?? 99) <= 1) {
    alertas.push({ texto: "Processo próximo de emissão (esforço rápido, poucas pendências).", prioridade: 2 });
  }

  // 10 · mudança de catálogo afeta marcação antiga (Fase 3 — motivo_disparo já diz isso)
  if (r.motivo_disparo?.includes("mudança de catálogo")) {
    alertas.push({ texto: "O catálogo do MAC mudou depois da última marcação deste processo — vale reconferir itens antigos.", prioridade: 2 });
  }

  // 11 · retrato desatualizado
  if (r.estado === "pendente" || r.estado === "em_atualizacao") {
    alertas.push({ texto: "Retrato aguardando atualização do Radar (mudança recente ainda não reprocessada).", prioridade: 6 });
  } else if (r.concluido_em) {
    const horas = (Date.now() - new Date(r.concluido_em).getTime()) / 3_600_000;
    if (horas > LIMITE_RETRATO_DESATUALIZADO_HORAS) {
      alertas.push({ texto: `Retrato desatualizado — última pré-análise há ${Math.round(horas)}h.`, prioridade: 6 });
    }
  }

  // 13 · previsão bloqueada por documento
  if (incluirPrevisaoBloqueada && r.previsao_tempo?.status === "suspensa") {
    alertas.push({ texto: "Previsão de tempo bloqueada — depende de documento do interessado.", prioridade: 4 });
  }

  return alertas;
}

/**
 * Só os N mais úteis (prioridade menor = mais urgente), sem duplicar texto. Passe
 * `incluirPrevisaoBloqueada: false` quando o chamador JÁ mostra `formatarPrevisao()` por
 * extenso ao lado (chat por processo) — senão a mesma informação apareceria duas vezes.
 */
export function montarAlertasProducao(r: RetratoParaAlertas, opcoes?: { limite?: number; incluirPrevisaoBloqueada?: boolean }): string[] {
  const limite = opcoes?.limite ?? LIMITE_ALERTAS;
  const incluirPrevisaoBloqueada = opcoes?.incluirPrevisaoBloqueada ?? true;
  const todos = montarTodosOsAlertas(r, incluirPrevisaoBloqueada).sort((a, b) => a.prioridade - b.prioridade);
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const a of todos) {
    if (vistos.has(a.texto)) continue;
    vistos.add(a.texto);
    saida.push(a.texto);
    if (saida.length >= limite) break;
  }
  return saida;
}
