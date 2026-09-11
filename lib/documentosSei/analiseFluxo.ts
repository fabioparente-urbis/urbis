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
import { normalizarSetor, exibicaoPreferida } from "./normalizarSetor";

export type EventoFluxo = {
  titulo: string;
  setor: string | null;
  dataDocumento: string | null;
};

export type FaixaTempo = "menos de 30 dias" | "30 a 90 dias" | "90 a 365 dias" | "mais de 1 ano";

export type TempoPorSetor = { setor: string; chave: string; dias: number };

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
  /** intervalos cujo setor não passou em `normalizarSetor` (endereço, área, lixo de OCR) */
  intervalosSemSetorUtil: number;
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

  // A espera entre dois documentos é creditada ao setor que emitiu o documento SEGUINTE — foi ele
  // que segurou o processo até produzir a sua peça. Creditar ao anterior (como esta função fazia
  // até 11/09/2026) nomeia quem já tinha terminado, e o painel existe justamente pra responder
  // "onde intervir primeiro". Decisão do Fábio em 11/09/2026, depois de ver os dois rankings.
  const tempoPorSetorMap = new Map<string, { dias: number; grafias: string[] }>();
  let intervalosSemSetorUtil = 0;
  for (let i = 0; i < confiaveis.length - 1; i++) {
    const seguinte = confiaveis[i + 1];
    const dias = Math.round((seguinte.data.getTime() - confiaveis[i].data.getTime()) / (24 * 60 * 60 * 1000));
    if (dias <= 0) continue;
    const setor = normalizarSetor(seguinte.setor);
    if (!setor) { intervalosSemSetorUtil++; continue; }
    const acc = tempoPorSetorMap.get(setor.chave) ?? { dias: 0, grafias: [] };
    acc.dias += dias;
    acc.grafias.push(setor.exibicao);
    tempoPorSetorMap.set(setor.chave, acc);
  }
  const tempoPorSetor = [...tempoPorSetorMap.entries()]
    .map(([chave, { dias, grafias }]) => ({ chave, setor: exibicaoPreferida(grafias), dias }))
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
    intervalosSemSetorUtil,
  };
}

export type PortfolioSetor = { setor: string; medianaDias: number; processos: number };

export type RetrabalhoPortfolio = {
  /** quantos processos voltaram pelo menos uma vez */
  processosComRetrabalho: number;
  totalProcessos: number;
  /** mediana de voltas ENTRE OS QUE VOLTARAM — 0 quando ninguém voltou */
  medianaEntreOsQueVoltaram: number;
  maximo: number;
};

export type AnalisePortfolio = {
  totalProcessos: number;
  processosComDuracaoMedida: number;
  contagemPorFaixa: Record<FaixaTempo, number>;
  /** MEDIANA, não média — com poucos processos um único outlier (ver §5.4 do plano/OBS COD
   * 11/09/2026: processo esquecido anos num setor) distorce a média sem dizer nada sobre o
   * caso comum. É o "ordinário antes do extraordinário" pedido pelo Fábio. */
  tempoTipicoPorSetor: PortfolioSetor[];
  /** setores que existem mas ficaram fora do ranking por aparecerem em menos processos que o piso */
  setoresOcultadosPorAmostra: number;
  retrabalho: RetrabalhoPortfolio;
};

/**
 * Piso de amostra para entrar no ranking. MEDIDO em 11/09/2026: sem piso, 54 das 89 linhas vinham
 * de um único processo — a "mediana" dessa linha é só a duração daquele processo, com aparência de
 * estatística. Uma linha só aparece se o setor foi visto em pelo menos dois processos.
 */
const MINIMO_PROCESSOS_NO_RANKING = 2;

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

  const diasPorSetor = new Map<string, { dias: number[]; grafias: string[] }>();
  for (const j of jornadas) {
    for (const { chave, setor, dias } of j.tempoPorSetor) {
      const acc = diasPorSetor.get(chave) ?? { dias: [], grafias: [] };
      acc.dias.push(dias);
      acc.grafias.push(setor);
      diasPorSetor.set(chave, acc);
    }
  }
  const ranking = [...diasPorSetor.values()]
    .map(({ dias, grafias }) => ({
      setor: exibicaoPreferida(grafias),
      medianaDias: Math.round(mediana(dias)),
      processos: dias.length,
    }))
    .sort((a, b) => b.medianaDias - a.medianaDias);
  const tempoTipicoPorSetor = ranking.filter((s) => s.processos >= MINIMO_PROCESSOS_NO_RANKING);

  // Retrabalho é contagem com muitos zeros: a mediana sobre TODOS os processos dava 0 e o painel
  // dizia "retrabalho típico: 0", que se lê como "não há retrabalho" — falso, 31 de 101 processos
  // voltaram pelo menos uma vez (medido em 11/09/2026). Diz-se quantos voltaram e quanto voltaram.
  const voltas = jornadas.map((j) => j.retrabalho);
  const dosQueVoltaram = voltas.filter((n) => n > 0);

  return {
    totalProcessos: jornadas.length,
    processosComDuracaoMedida: jornadas.filter((j) => j.duracaoDias !== null).length,
    contagemPorFaixa,
    tempoTipicoPorSetor,
    setoresOcultadosPorAmostra: ranking.length - tempoTipicoPorSetor.length,
    retrabalho: {
      processosComRetrabalho: dosQueVoltaram.length,
      totalProcessos: jornadas.length,
      medianaEntreOsQueVoltaram: dosQueVoltaram.length ? Math.round(mediana(dosQueVoltaram) * 10) / 10 : 0,
      maximo: voltas.length ? Math.max(...voltas) : 0,
    },
  };
}
