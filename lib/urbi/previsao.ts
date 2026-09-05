/**
 * lib/urbi/previsao.ts — previsão determinística de tempo/esforço (Fase 4 do mandato de 12
 * fases, 05/09/2026).
 *
 * ── AUDITORIA REAL, ANTES DE ESCREVER ISTO ────────────────────────────────────────────────────
 * O ÚNICO par de timestamps real que mede "quanto tempo um processo levou de ponta a ponta" é
 * `processos.analise_iniciada_em` → `analise_concluida_em` (já exposto por `vw_bdi_tempo_
 * etapas`). Não existe, hoje, nenhum timestamp separado pra "LIP concluído" nem "MAC concluído"
 * nem "esta análise específica" — só o ciclo inteiro. Por isso as previsões de granularidade
 * mais fina que "ciclo completo" SEMPRE voltam `base_insuficiente`, honestamente, em vez de
 * fabricar uma subdivisão que a fonte de dado não sustenta.
 *
 * AMOSTRA REAL (checada em 05/09/2026, script descartável): só 11 processos no banco inteiro têm
 * os dois timestamps preenchidos — 10 de Regularização (a maioria "0 dias", 1 caso real de 14,2
 * dias — dado real, não filtrado, mesmo sendo majoritariamente degenerado), 1 de Aceite SEI, 0
 * de Slot 5. `vw_bdi_aguardando_retorno` (situação='retornou') tem só 5 casos de Regularização,
 * 0 dos outros dois slots. Ou seja: HOJE, a esmagadora maioria das previsões vai
 * honestamente voltar "base insuficiente" — é o comportamento CORRETO pedido pelo Fábio ("nunca
 * apresentar certeza falsa"), não uma falha desta implementação. A amostra cresce sozinha
 * conforme mais processos são concluídos de verdade.
 *
 * Nunca chama Gemini. Nunca calcula situação/motor por conta própria — recebe `relatorio`
 * (Motor de Produção) já pronto, só pra decidir "suspensa" (depende de documento do
 * interessado) sem duplicar aquele cálculo.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { calcularFaixaArea } from "./catalogoConsultaPilha";
import type { RelatorioMotor } from "./motorProducao";

export type ConfiancaPrevisao = "alta" | "media" | "baixa";

export type PrevisaoTempo =
  | { status: "estimativa"; minDias: number; maxDias: number; confianca: ConfiancaPrevisao; amostra: number; fonte: string }
  | { status: "suspensa"; motivo: string }
  | { status: "base_insuficiente"; motivo: string; amostra: number };

const AMOSTRA_MINIMA = 5;
const LIMIAR_CONFIANCA_ALTA = 30;
const LIMIAR_CONFIANCA_MEDIA = 15;

function classificarConfianca(n: number): ConfiancaPrevisao {
  if (n >= LIMIAR_CONFIANCA_ALTA) return "alta";
  if (n >= LIMIAR_CONFIANCA_MEDIA) return "media";
  return "baixa";
}

function percentil(valoresOrdenados: number[], p: number): number {
  const idx = Math.min(valoresOrdenados.length - 1, Math.max(0, Math.floor(valoresOrdenados.length * p)));
  return Math.round(valoresOrdenados[idx] * 10) / 10;
}

/** Casos comparáveis: MESMO slot, e (quando há amostra suficiente pra isso) MESMA faixa de área.
 *  Nunca compara entre slots (área/complexidade têm domínios diferentes — mesma regra do
 *  catálogo semântico, Fase AA). Cai pra "só mesmo slot" quando a faixa reduz demais a amostra. */
async function buscarCasosComparaveis(tipoProcesso: string, faixaArea: string | null): Promise<number[]> {
  const { data: base } = await supabaseAdmin
    .from("vw_bdi_tempo_etapas")
    .select("codigo, dias")
    .eq("tipo_processo", tipoProcesso);
  const linhas = (base ?? []) as any[];
  if (linhas.length === 0) return [];

  if (faixaArea) {
    const codigos = linhas.map((l) => l.codigo);
    const { data: processos } = await supabaseAdmin.from("processos").select("codigo, area_construida").in("codigo", codigos);
    const faixaPorCodigo = new Map((processos ?? []).map((p: any) => [p.codigo, calcularFaixaArea(typeof p.area_construida === "number" ? p.area_construida : Number(p.area_construida) || null)]));
    const mesmaFaixa = linhas.filter((l) => faixaPorCodigo.get(l.codigo) === faixaArea);
    if (mesmaFaixa.length >= AMOSTRA_MINIMA) return mesmaFaixa.map((l) => l.dias).filter((d) => typeof d === "number");
  }
  return linhas.map((l) => l.dias).filter((d) => typeof d === "number");
}

/**
 * Previsão do CICLO COMPLETO (analise_iniciada_em → analise_concluida_em) — a única
 * granularidade com timestamp real hoje. Recebe `d` (dossiê) e `relatorio` (Motor de Produção)
 * já calculados por quem chama — nunca recalcula situação/esforço.
 */
export async function preverCicloCompleto(d: Record<string, any>, relatorio: RelatorioMotor): Promise<PrevisaoTempo> {
  if (relatorio?.esforco === "depende_documento") {
    return { status: "suspensa", motivo: "depende de documento do interessado" };
  }

  const tipoProcesso: string | null = d.processo?.tipo_processo ?? null;
  if (!tipoProcesso) return { status: "base_insuficiente", motivo: "slot não identificado", amostra: 0 };

  const areaNum = typeof d.processo?.area_construida === "number" ? d.processo.area_construida : Number(d.processo?.area_construida) || null;
  const faixaArea = calcularFaixaArea(areaNum);
  const amostra = await buscarCasosComparaveis(tipoProcesso, faixaArea);

  if (amostra.length < AMOSTRA_MINIMA) {
    return { status: "base_insuficiente", motivo: `só ${amostra.length} caso(s) comparável(is) concluído(s) no histórico — abaixo do mínimo de ${AMOSTRA_MINIMA}`, amostra: amostra.length };
  }

  const ordenados = [...amostra].sort((a, b) => a - b);
  const minDias = percentil(ordenados, 0.25);
  const maxDias = percentil(ordenados, 0.75);
  return {
    status: "estimativa",
    minDias, maxDias,
    confianca: classificarConfianca(amostra.length),
    amostra: amostra.length,
    fonte: "BDI — vw_bdi_tempo_etapas (ciclo completo: início da análise → conclusão)",
  };
}

/**
 * Granularidades pedidas pelo Fábio que NÃO têm timestamp real hoje (conclusão do LIP,
 * conclusão do MAC, análise atual isolada) — sempre `base_insuficiente`, honestamente, nunca
 * uma subdivisão fabricada do ciclo completo.
 */
export function previsaoGranularidadeIndisponivel(granularidade: "lip" | "mac" | "analise_atual"): PrevisaoTempo {
  const nomes: Record<string, string> = { lip: "conclusão do LIP", mac: "conclusão do MAC", analise_atual: "esta análise especificamente" };
  return { status: "base_insuficiente", motivo: `não existe, hoje, um timestamp real separado pra "${nomes[granularidade]}" — só o ciclo completo (início→conclusão da análise) é medido`, amostra: 0 };
}

/** Texto curto e honesto — nunca apresenta certeza falsa, sempre traz amostra/confiança/fonte. */
export function formatarPrevisao(p: PrevisaoTempo): string {
  if (p.status === "suspensa") return `Previsão suspensa: ${p.motivo}.`;
  if (p.status === "base_insuficiente") return `Base insuficiente para estimativa (${p.motivo}).`;
  const dias = (n: number) => (n === Math.round(n) ? `${n}` : n.toFixed(1));
  return `Estimativa: ${dias(p.minDias)}–${dias(p.maxDias)} dia(s) · confiança ${p.confianca} · ${p.amostra} caso(s) comparável(is) · fonte: ${p.fonte}.`;
}
