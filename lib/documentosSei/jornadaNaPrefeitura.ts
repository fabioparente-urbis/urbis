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
let cache: { em: number; portfolio: AnalisePortfolio } | null = null;

export async function referenciaDoAcervo(): Promise<AnalisePortfolio | null> {
  if (cache && Date.now() - cache.em < TTL_MS) return cache.portfolio;
  try {
    const linhas = await lerEventosFluxo<EventoBruto>(
      supabaseAdmin,
      "processo_codigo, titulo, setor, data_documento, pagina_ini",
    );
    const portfolio = agregarPortfolio([...agruparPorProcesso(linhas).values()]);
    cache = { em: Date.now(), portfolio };
    return portfolio;
  } catch {
    return null; // fonte opcional: quem chama registra como cobertura indisponível
  }
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
