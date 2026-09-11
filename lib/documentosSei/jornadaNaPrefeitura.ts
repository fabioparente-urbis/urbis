import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { analisarJornada, agregarPortfolio, type AnaliseJornada, type AnalisePortfolio } from "./analiseFluxo";
import { lerEventosFluxo, agruparPorProcesso, type EventoBruto } from "./lerEventosFluxo";
import { normalizarSetor } from "./normalizarSetor";

/**
 * lib/documentosSei/jornadaNaPrefeitura.ts — a ponte entre o Módulo de Análise de Fluxo (Fases
 * 10-12) e o resto do sistema (URBI, BDI).
 *
 * POR QUE EXISTE: a auditoria de 11/09/2026 achou que `fluxo_processo_eventos` era lida APENAS
 * pelo painel `/admin/analise-fluxo`. Nada no BDI e nada no URBI sabia que a tabela existia — o
 * URBI não conseguia responder "onde esse processo travou" embora o fato estivesse gravado. Isso
 * contrariava a regra do CLAUDE.md de que todo módulo principal dispara para TODOS os satélites,
 * e deixava parado justamente o achado §5.3 que motivou o plano inteiro (o sistema não enxerga a
 * prefeitura).
 *
 * MEDIDO em 11/09/2026, e é o que torna isto útil: **65 dos 82 processos ativos (79%) também
 * estão no acervo carregado** — para 4 de cada 5 processos que o analista tem em mãos, a jornada
 * real pela prefeitura já está gravada e pode ser mostrada.
 *
 * SÓ LEITURA, custo zero: nenhuma IA, nenhuma tabela nova, nenhuma escrita.
 */

export type JornadaNaPrefeitura = {
  encontrada: boolean;
  totalDocumentos: number;
  duracaoDias: number | null;
  faixa: string | null;
  /** onde o processo mais esperou, já normalizado e ordenado do maior para o menor */
  esperaPorSetor: { setor: string; dias: number }[];
  retrabalho: number;
  /**
   * As duas pontas que produziram `duracaoDias` — vêm da ordenação por DATA, não por página, senão
   * o intervalo exibido não fecha com a duração (achado ao conferir o processo 25.5.000027562-9).
   */
  primeiroDocumentoEm: string | null;
  ultimoDocumentoEm: string | null;
  analise: AnaliseJornada | null;
};

/**
 * Jornada do processo pela prefeitura, reconstruída dos carimbos do próprio PDF (Fase 10).
 * Devolve `encontrada: false` — nunca lança e nunca inventa — quando o processo não está no
 * acervo carregado, que é o caso de todo processo novo.
 */
export async function jornadaDoProcesso(codigo: string): Promise<JornadaNaPrefeitura> {
  const vazia: JornadaNaPrefeitura = {
    encontrada: false, totalDocumentos: 0, duracaoDias: null, faixa: null,
    esperaPorSetor: [], retrabalho: 0, primeiroDocumentoEm: null, ultimoDocumentoEm: null, analise: null,
  };
  if (!codigo) return vazia;

  // Um processo só: cabe folgado no teto de 1000 linhas, não precisa paginar.
  const { data, error } = await supabaseAdmin
    .from("fluxo_processo_eventos")
    .select("titulo, setor, data_documento, pagina_ini")
    .eq("processo_codigo", codigo)
    .order("pagina_ini");
  if (error || !data || data.length === 0) return vazia;

  const eventos = data.map((r: any) => ({ titulo: r.titulo, setor: r.setor, dataDocumento: r.data_documento }));
  const analise = analisarJornada(eventos);

  return {
    encontrada: true,
    totalDocumentos: eventos.length,
    duracaoDias: analise.duracaoDias,
    faixa: analise.faixa,
    esperaPorSetor: analise.tempoPorSetor.map(({ setor, dias }) => ({ setor, dias })),
    retrabalho: analise.retrabalho,
    primeiroDocumentoEm: analise.primeiraDataConfiavel,
    ultimoDocumentoEm: analise.ultimaDataConfiavel,
    analise,
  };
}

/**
 * Retrato do acervo inteiro, para servir de RÉGUA: "esse processo está há 300 dias parado" só quer
 * dizer alguma coisa ao lado de "no acervo, o típico esperando esse setor é 296 dias".
 *
 * Cacheado em memória porque ler e agregar 2441 linhas a cada dossiê seria caro e o número muda
 * só quando roda uma carga nova.
 */
const TTL_MS = 10 * 60 * 1000;
type Cache = { em: number; porProcesso: Map<string, { titulo: string; setor: string | null; dataDocumento: string | null }[]> };
let cache: Cache | null = null;

/** Acervo inteiro agrupado por processo, cacheado — a base de tudo abaixo. */
async function acervoAgrupado(): Promise<Cache["porProcesso"] | null> {
  if (cache && Date.now() - cache.em < TTL_MS) return cache.porProcesso;
  try {
    const linhas = await lerEventosFluxo<EventoBruto>(
      supabaseAdmin,
      "processo_codigo, titulo, setor, data_documento, pagina_ini",
    );
    const porProcesso = agruparPorProcesso(linhas);
    cache = { em: Date.now(), porProcesso };
    return porProcesso;
  } catch {
    return null; // fonte opcional: quem chama registra como cobertura indisponível
  }
}

export async function referenciaDoAcervo(): Promise<AnalisePortfolio | null> {
  const porProcesso = await acervoAgrupado();
  return porProcesso ? agregarPortfolio([...porProcesso.values()]) : null;
}

export type LinhaPanorama = {
  codigo: string;
  duracaoDias: number | null;
  faixa: string | null;
  idasEVindas: number;
  /** setor onde este processo mais esperou, e a régua do acervo para ele */
  ondeMaisEsperou: { setor: string; dias: number; medianaDoAcervo: number | null } | null;
};

/**
 * Cruza os processos ATIVOS do sistema com a jornada que o acervo conhece de cada um. É o que o
 * BDI não tinha: as views dele medem o trabalho feito DENTRO do URBIS (§5.3 do plano — a medição
 * de tempo por etapa devolve "minutos de análise", e amostras reais davam "0 dias"), nunca o
 * trajeto do processo pela prefeitura.
 *
 * Devolve FATO, ordenado do que mais esperou para o que menos esperou. Não classifica processo
 * como atrasado, não sugere ação: a leitura é do analista.
 */
export async function panoramaDosAtivos(codigosAtivos: string[]): Promise<{
  linhas: LinhaPanorama[];
  comJornadaConhecida: number;
  totalAtivos: number;
} | null> {
  const porProcesso = await acervoAgrupado();
  if (!porProcesso) return null;

  const acervo = agregarPortfolio([...porProcesso.values()]);
  const medianaPorChave = new Map(
    acervo.tempoTipicoPorSetor.map((s) => [normalizarSetor(s.setor)?.chave ?? s.setor, s.medianaDias]),
  );

  const linhas: LinhaPanorama[] = [];
  for (const codigo of codigosAtivos) {
    const eventos = porProcesso.get(codigo);
    if (!eventos) continue;
    const a = analisarJornada(eventos);
    const pior = a.tempoPorSetor[0] ?? null;
    linhas.push({
      codigo,
      duracaoDias: a.duracaoDias,
      faixa: a.faixa,
      idasEVindas: a.retrabalho,
      ondeMaisEsperou: pior
        ? { setor: pior.setor, dias: pior.dias, medianaDoAcervo: medianaPorChave.get(pior.chave) ?? null }
        : null,
    });
  }
  linhas.sort((a, b) => (b.duracaoDias ?? -1) - (a.duracaoDias ?? -1));
  return { linhas, comJornadaConhecida: linhas.length, totalAtivos: codigosAtivos.length };
}

/**
 * Compara a espera deste processo com a régua do acervo, setor a setor. Só devolve linha quando os
 * dois lados existem — sem lado do acervo não há comparação, e afirmar "acima do normal" sem
 * régua seria inventar.
 */
export function compararComAcervo(
  jornada: JornadaNaPrefeitura,
  acervo: AnalisePortfolio | null,
): { setor: string; diasNesteProcesso: number; medianaDoAcervo: number; acimaDoTipico: boolean }[] {
  if (!acervo || !jornada.encontrada) return [];
  const porChave = new Map(
    acervo.tempoTipicoPorSetor.map((s) => [normalizarSetor(s.setor)?.chave ?? s.setor, s.medianaDias]),
  );
  return jornada.esperaPorSetor
    .map((s) => {
      const mediana = porChave.get(normalizarSetor(s.setor)?.chave ?? s.setor);
      if (mediana === undefined) return null;
      return {
        setor: s.setor,
        diasNesteProcesso: s.dias,
        medianaDoAcervo: mediana,
        acimaDoTipico: s.dias > mediana,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.diasNesteProcesso - a.diasNesteProcesso);
}
