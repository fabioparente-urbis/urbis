/**
 * lib/documentosSei/analiseFluxo.ts — Fase 11 do plano de leitura de PDF (§3.4): a partir da
 * jornada gravada pela Fase 10 (`fluxo_processo_eventos`), calcula tempo total, tempo por setor,
 * faixa de tempo e retrabalho. Só soma o que a Fase 10 já extraiu — não lê PDF, não chama IA.
 *
 * Princípio do próprio plano (§3.4, "sobre a precisão da medição de tempo"): a data de um
 * documento não é o dia exato em que o processo entrou/saiu do setor. A decisão de gestão se
 * apoia em ORDEM DE GRANDEZA, não em calendário — por isso o resultado é sempre uma FAIXA, nunca
 * um número que finge precisão que o dado não tem.
 */
import { parseDataDocumento } from "./parseDataDocumento";

export type EventoFluxo = {
  titulo: string;
  setor: string | null;
  dataDocumento: string | null;
};

export type FaixaTempo = "menos de 30 dias" | "30 a 90 dias" | "90 a 365 dias" | "mais de 1 ano";

export type TempoPorSetor = { setor: string; dias: number };

export type AnaliseJornada = {
  totalEventos: number;
  eventosComData: number;
  eventosComSetor: number;
  /** dias entre a data mais antiga e a mais recente consideradas confiáveis — null se não deu pra medir */
  duracaoDias: number | null;
  faixa: FaixaTempo | null;
  tempoPorSetor: TempoPorSetor[];
  /** contagem de despachos que indicam devolução para correção (título com "pendência"/"diligência") */
  retrabalho: number;
  /** datas descartadas por destoarem demais das outras (ex: data de nascimento em cópia de RG anexada) */
  datasDescartadasComoRuido: number;
};

const RUIDO_ANOS = 5; // datas a mais de 5 anos da mediana do próprio processo são tratadas como ruído (§ ver parseDataDocumento)
const PADRAO_RETRABALHO = /pend[êe]nc|dilig[êe]nc/i;

function faixaPorDias(dias: number): FaixaTempo {
  if (dias < 30) return "menos de 30 dias";
  if (dias < 90) return "30 a 90 dias";
  if (dias < 365) return "90 a 365 dias";
  return "mais de 1 ano";
}

export function analisarJornada(eventos: EventoFluxo[]): AnaliseJornada {
  const comData = eventos
    .map((e) => ({ ...e, data: parseDataDocumento(e.dataDocumento) }))
    .filter((e): e is EventoFluxo & { data: Date } => e.data !== null)
    .sort((a, b) => a.data.getTime() - b.data.getTime());

  let confiaveis = comData;
  let descartadas = 0;
  if (comData.length >= 2) {
    const mediana = comData[Math.floor(comData.length / 2)].data.getTime();
    const limiteMs = RUIDO_ANOS * 365 * 24 * 60 * 60 * 1000;
    confiaveis = comData.filter((e) => Math.abs(e.data.getTime() - mediana) <= limiteMs);
    descartadas = comData.length - confiaveis.length;
  }

  let duracaoDias: number | null = null;
  if (confiaveis.length >= 2) {
    const ms = confiaveis[confiaveis.length - 1].data.getTime() - confiaveis[0].data.getTime();
    duracaoDias = Math.round(ms / (24 * 60 * 60 * 1000));
  }

  const tempoPorSetorMap = new Map<string, number>();
  for (let i = 0; i < confiaveis.length - 1; i++) {
    const atual = confiaveis[i];
    if (!atual.setor) continue;
    const dias = Math.round((confiaveis[i + 1].data.getTime() - atual.data.getTime()) / (24 * 60 * 60 * 1000));
    if (dias <= 0) continue;
    tempoPorSetorMap.set(atual.setor, (tempoPorSetorMap.get(atual.setor) ?? 0) + dias);
  }
  const tempoPorSetor = [...tempoPorSetorMap.entries()]
    .map(([setor, dias]) => ({ setor, dias }))
    .sort((a, b) => b.dias - a.dias);

  return {
    totalEventos: eventos.length,
    eventosComData: comData.length,
    eventosComSetor: eventos.filter((e) => e.setor).length,
    duracaoDias,
    faixa: duracaoDias === null ? null : faixaPorDias(duracaoDias),
    tempoPorSetor,
    retrabalho: eventos.filter((e) => PADRAO_RETRABALHO.test(e.titulo)).length,
    datasDescartadasComoRuido: descartadas,
  };
}

export type PortfolioSetor = { setor: string; medianaDias: number; processos: number };

export type AnalisePortfolio = {
  totalProcessos: number;
  processosComDuracaoMedida: number;
  contagemPorFaixa: Record<FaixaTempo, number>;
  /** MEDIANA, não média — com poucos processos um único outlier (ver §5.4 do plano/OBS COD
   * 11/09/2026: processo esquecido anos num setor) distorce a média sem dizer nada sobre o
   * caso comum. É o "ordinário antes do extraordinário" pedido pelo Fábio. */
  tempoTipicoPorSetor: PortfolioSetor[];
  retrabalhoMedio: number;
};

function mediana(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2;
}

/** Agrega várias jornadas (um processo cada) num retrato do portfólio. Não lê o banco. */
export function agregarPortfolio(porProcesso: EventoFluxo[][]): AnalisePortfolio {
  const jornadas = porProcesso.map(analisarJornada);

  const contagemPorFaixa: Record<FaixaTempo, number> = {
    "menos de 30 dias": 0, "30 a 90 dias": 0, "90 a 365 dias": 0, "mais de 1 ano": 0,
  };
  for (const j of jornadas) if (j.faixa) contagemPorFaixa[j.faixa]++;

  const diasPorSetor = new Map<string, number[]>();
  for (const j of jornadas) {
    for (const { setor, dias } of j.tempoPorSetor) {
      const lista = diasPorSetor.get(setor) ?? [];
      lista.push(dias);
      diasPorSetor.set(setor, lista);
    }
  }
  const tempoTipicoPorSetor = [...diasPorSetor.entries()]
    .map(([setor, dias]) => ({ setor, medianaDias: Math.round(mediana(dias)), processos: dias.length }))
    .sort((a, b) => b.medianaDias - a.medianaDias);

  return {
    totalProcessos: jornadas.length,
    processosComDuracaoMedida: jornadas.filter((j) => j.duracaoDias !== null).length,
    contagemPorFaixa,
    tempoTipicoPorSetor,
    retrabalhoMedio: jornadas.length ? Math.round(mediana(jornadas.map((j) => j.retrabalho)) * 10) / 10 : 0,
  };
}
