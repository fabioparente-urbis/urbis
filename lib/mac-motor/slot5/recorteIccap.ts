/**
 * lib/mac-motor/slot5/recorteIccap.ts — recorte automático dos blocos ICCAP de uma prancha PDF,
 * ANTES da extração pelo Gemini. Preparação puramente visual/geométrica: não chama IA, não decide
 * nada, não grava banco — só encontra ONDE cada bloco do quadro ICCAP está (por busca de texto na
 * camada do PDF) e devolve um PNG recortado por bloco encontrado, com a proveniência de cada um.
 *
 * ── DUAS CATEGORIAS, NÃO UM BLOCO SÓ ───────────────────────────────────────────────
 * O teste histórico do processo 44353 (2026-08-04) mostrou que a prancha real tem DOIS blocos
 * físicos distintos e distantes um do outro: o CABEÇALHO/carimbo (ICCAP, EXIGIDO/ATENDIDO) e o
 * MEMORIAL DE CÁLCULO (CÁLCULO DA ÁREA PERMEÁVEL/CAIXA DE RETENÇÃO, com a área impermeabilizada). A
 * primeira versão deste módulo só tinha âncoras do cabeçalho — o memorial nunca era procurado, e o
 * item MEMORIAL sempre abstinha por falta de recorte, não por falta de dado no documento. Agora as
 * âncoras são organizadas por `CategoriaBlocoIccap`, e o resultado é PER CATEGORIA: cada uma pode
 * ser encontrada ou abstida independentemente — nunca uma decide a outra, e a ausência de uma nunca
 * é fallback para a prancha inteira (ver `index.ts`, que é quem integra isto ao fluxo do ICCAP).
 *
 * ── POR QUE MUPDF PONTA A PONTA, NUNCA pdfjs-dist ─────────────────────────────────
 * `Page.search()` devolve `Quad[]` no MESMO sistema de coordenadas que `Pixmap`/`DrawDevice` usam
 * para renderizar (confirmado empiricamente: origem no topo-esquerda, Y crescendo para baixo — o
 * mesmo espaço que `lib/visao/rasterizar.ts` já assume para `Regiao`). Combinar a busca do pdfjs
 * (outro parser, outra convenção de eixo) com o recorte do mupdf produziria coordenadas de dois
 * espaços diferentes — a região recortada erraria o alvo de forma sutil e dependente do PDF.
 * `lib/lerPastaSlot5.ts` já sofreu o problema irmão (pdfjs empacotado não acha o worker em
 * serverless) — aqui o motivo é geométrico, não de empacotamento, mas a conclusão é a mesma: um
 * único motor de PDF, do começo ao fim.
 *
 * ── AGRUPAMENTO/DEDUPLICAÇÃO ───────────────────────────────────────────────────────
 * No teste histórico, 3 âncoras do CABEÇALHO (ICCAP, ÍNDICE CONTROLE, CAPTAÇÃO ÁGUA PLUVIAL) bateram
 * na MESMA tabelinha pequena do carimbo — sem agrupamento, isso gerava 3 recortes quase idênticos,
 * sobrepostos, desperdiçando chamada/imagem no Gemini por engano. A regra aqui é geométrica, não por
 * nome de âncora: duas ocorrências da MESMA categoria cujas regiões (já com margem) se SOBREPÕEM
 * formam um único recorte (união dos limites, com todas as âncoras/termos contribuintes
 * preservados); ocorrências distantes (não sobrepostas) permanecem recortes distintos — mesmo que
 * sejam da mesma categoria (ex.: cabeçalho duplicado em duas pranchas/páginas). Nunca agrupa entre
 * CATEGORIAS diferentes — cada recorte final pertence a uma única categoria.
 *
 * ── ABSTENÇÃO POR CATEGORIA, NÃO ERRO ──────────────────────────────────────────────
 * Nenhuma âncora de uma categoria encontrada em nenhuma página não é falha do módulo — é a
 * descoberta de que a prancha não tem (ou não tem na camada de texto) aquele bloco. O resultado
 * devolve `{ encontrado: false, motivo }` PARA AQUELA CATEGORIA e deixa quem chama decidir — nunca
 * faz fallback silencioso para a prancha inteira, e uma categoria abstida nunca impede a outra
 * categoria (já encontrada) de seguir seu fluxo normalmente.
 *
 * ── ISOLAMENTO ─────────────────────────────────────────────────────────────────────
 * Não importa nada de `lib/visao/*` — mesma decisão de não-acoplamento já tomada em
 * `gemini.ts`/`prompts.ts`. `lib/visao/rasterizar.ts` foi só CONSULTADO como referência de uso
 * seguro do mupdf (Pixmap + DrawDevice); o código abaixo é próprio do Slot 5 e não é importado
 * nem importa nada do Slot 1.
 *
 * ── CÓPIA DE BYTES ─────────────────────────────────────────────────────────────────
 * `pdfBytesOriginal` é copiado (`.slice()`) antes de abrir no mupdf — quem chama pode reaproveitar
 * o mesmo `Uint8Array`/`ArrayBuffer` de origem para outro consumidor (ex.: enviar a prancha inteira
 * para a extração de dimensões, em paralelo a este recorte), e nada aqui pode arriscar invalidar
 * esse outro uso.
 */

import type { Quad } from "mupdf";

/** As categorias de bloco reconhecidas — cada uma é procurada e recortada independentemente. */
export type CategoriaBlocoIccap = "cabecalho_iccap" | "memorial_iccap";

export const CATEGORIAS_BLOCO_ICCAP: CategoriaBlocoIccap[] = ["cabecalho_iccap", "memorial_iccap"];

/** Uma âncora textual: nome lógico, categoria a que pertence, e os termos (sinônimos) que a identificam. */
export type AncoraIccap = {
  /** nome lógico da âncora — entra na lista de âncoras contribuintes do recorte (nunca a coordenada) */
  nome: string;
  categoria: CategoriaBlocoIccap;
  /** termos de busca — cada um tentado como substring literal via `Page.search()` (case-insensitive, confirmado empiricamente) */
  termos: string[];
};

/**
 * Âncoras padrão, por categoria — genéricas, sem posição/página/coordenada de processo nenhum:
 *   cabecalho_iccap: ICCAP, ÍNDICE DE CONTROLE, CAPTAÇÃO ÁGUA PLUVIAL (carimbo — EXIGIDO/ATENDIDO)
 *   memorial_iccap:  CÁLCULO DA ÁREA PERMEÁVEL, CAIXA DE RETENÇÃO, ÁREA PERMEÁVEL, ÁREA PERMEABILIZADA
 * Configurável: quem chama pode passar outra lista via `opcoes.ancoras`.
 */
export const ANCORAS_ICCAP_PADRAO: AncoraIccap[] = [
  { nome: "iccap", categoria: "cabecalho_iccap", termos: ["ICCAP"] },
  { nome: "indice-controle", categoria: "cabecalho_iccap", termos: ["ÍNDICE DE CONTROLE", "INDICE DE CONTROLE", "ÍNDICE CONTROLE", "INDICE CONTROLE"] },
  { nome: "captacao-agua-pluvial", categoria: "cabecalho_iccap", termos: ["CAPTAÇÃO DE ÁGUA PLUVIAL", "CAPTAÇÃO ÁGUA PLUVIAL", "CAPTACAO DE AGUA PLUVIAL", "CAPTACAO AGUA PLUVIAL"] },

  { nome: "calculo-area-permeavel", categoria: "memorial_iccap", termos: ["CÁLCULO DA ÁREA PERMEÁVEL", "CALCULO DA AREA PERMEAVEL"] },
  { nome: "caixa-de-retencao", categoria: "memorial_iccap", termos: ["CAIXA DE RETENÇÃO", "CAIXA DE RETENCAO"] },
  { nome: "area-permeavel", categoria: "memorial_iccap", termos: ["ÁREA PERMEÁVEL", "AREA PERMEAVEL"] },
  { nome: "area-permeabilizada", categoria: "memorial_iccap", termos: ["ÁREA PERMEABILIZADA", "AREA PERMEABILIZADA"] },
];

export type BlocoIccap = {
  /** nome lógico estável do bloco: "<categoria>#<ordem>" — auditável, nunca reaproveitado entre blocos */
  nomeLogico: string;
  categoria: CategoriaBlocoIccap;
  /** nomes ÚNICOS das âncoras que contribuíram para este recorte (pode ser mais de uma, quando agrupadas) */
  ancoras: string[];
  /** termos literais ÚNICOS (dentre os sinônimos das âncoras) que casaram nesta região */
  termosEncontrados: string[];
  /** página onde foi encontrado, 0-based — mesma convenção do mupdf (Document/Page) */
  pagina: number;
  /** limites do recorte, em PONTOS do PDF (espaço mupdf), já com a margem aplicada e recortado à página */
  limitesPt: { x0: number; y0: number; x1: number; y1: number };
  png: Uint8Array;
  larguraPx: number;
  alturaPx: number;
  dpiEfetivo: number;
  ms: number;
};

/** Resultado de UMA categoria: encontrada (com 1+ blocos) ou abstenção explícita, nunca as duas coisas. */
export type ResultadoCategoriaIccap =
  | { encontrado: true; blocos: BlocoIccap[] }
  | { encontrado: false; motivo: string };

export type ResultadoRecorteIccap = {
  /** uma entrada por categoria — SEMPRE as duas chaves presentes, cada uma encontrada ou abstida independentemente */
  porCategoria: Record<CategoriaBlocoIccap, ResultadoCategoriaIccap>;
  ancorasBuscadas: string[];
  paginasVarridas: number;
  ms: number;
};

export type OpcoesRecorteIccap = {
  /** âncoras a buscar, em ordem — default ANCORAS_ICCAP_PADRAO */
  ancoras?: AncoraIccap[];
  /** margem somada ao bbox encontrado, em PONTOS do PDF (a busca de texto já devolve pontos, não frações) */
  margemPt?: number;
  /** maior dimensão do recorte final, em pixels — mesmo raciocínio de Regiao.alvoPx em lib/visao/tipos.ts */
  alvoPx?: number;
  /** máximo de ocorrências por termo, por página (repassado a Page.search) */
  maxOcorrenciasPorTermo?: number;
};

const MARGEM_PT_PADRAO = 40;
const ALVO_PX_PADRAO = 1400;
const MAX_OCORRENCIAS_PADRAO = 8;

type Retangulo = { x0: number; y0: number; x1: number; y1: number };

/** Bounding box (min/max) de todos os pontos de todos os quads de UMA ocorrência (pode ter mais de 1 quad quando o termo cruza linhas). */
function bboxDeQuads(quads: Quad[]): Retangulo {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of quads) {
    for (let i = 0; i < 8; i += 2) {
      x0 = Math.min(x0, q[i]); x1 = Math.max(x1, q[i]);
      y0 = Math.min(y0, q[i + 1]); y1 = Math.max(y1, q[i + 1]);
    }
  }
  return { x0, y0, x1, y1 };
}

function expandirEClampar(bbox: Retangulo, margem: number, caixaPagina: Retangulo): Retangulo | null {
  const x0 = Math.max(caixaPagina.x0, bbox.x0 - margem);
  const y0 = Math.max(caixaPagina.y0, bbox.y0 - margem);
  const x1 = Math.min(caixaPagina.x1, bbox.x1 + margem);
  const y1 = Math.min(caixaPagina.y1, bbox.y1 + margem);
  if (x1 <= x0 || y1 <= y0) return null; // geometria degenerada — margem negativa/página minúscula
  return { x0, y0, x1, y1 };
}

/** Dois retângulos se sobrepõem (AABB clássico) — usado para decidir se dois hits formam UM recorte. */
function sobrepoe(a: Retangulo, b: Retangulo): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

function uniao(a: Retangulo, b: Retangulo): Retangulo {
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

type Hit = { ancora: string; termo: string; bboxExpandido: Retangulo };

/**
 * Agrupa hits da MESMA categoria por sobreposição geométrica (union-find sobre o bbox JÁ expandido
 * pela margem — é esse o footprint que seria renderizado, então é ele que decide se dois hits
 * colidiriam). Hits sem sobreposição alguma, mesmo da mesma categoria, permanecem em grupos
 * separados — nunca elimina um grupo por estar distante de outro.
 */
function agruparPorSobreposicao(hits: Hit[]): Hit[][] {
  const pai = hits.map((_, i) => i);
  function raiz(i: number): number { while (pai[i] !== i) i = pai[i]; return i; }
  function unir(i: number, j: number) { const ri = raiz(i), rj = raiz(j); if (ri !== rj) pai[ri] = rj; }
  for (let i = 0; i < hits.length; i++) {
    for (let j = i + 1; j < hits.length; j++) {
      if (sobrepoe(hits[i].bboxExpandido, hits[j].bboxExpandido)) unir(i, j);
    }
  }
  const grupos = new Map<number, Hit[]>();
  for (let i = 0; i < hits.length; i++) {
    const r = raiz(i);
    const lista = grupos.get(r) ?? [];
    lista.push(hits[i]);
    grupos.set(r, lista);
  }
  return [...grupos.values()];
}

/** Todos os blocos encontrados, de TODAS as categorias que foram encontradas — para quem só quer a lista plana (ex.: montar os documentos a enviar ao Gemini). Categorias abstidas contribuem 0 blocos, nunca lançam. */
export function blocosEncontrados(resultado: ResultadoRecorteIccap): BlocoIccap[] {
  return CATEGORIAS_BLOCO_ICCAP.flatMap((categoria) => {
    const r = resultado.porCategoria[categoria];
    return r.encontrado ? r.blocos : [];
  });
}

/**
 * Varre TODAS as páginas do PDF, procurando cada âncora (por categoria) pela camada de texto
 * (mupdf), agrupa hits sobrepostos da MESMA categoria em um único recorte, e recorta em PNG cada
 * grupo resultante. Nunca fixa página, posição ou coordenada — a busca é geral, o mesmo código serve
 * para qualquer prancha, não só o processo 44353 usado no teste histórico.
 *
 * Devolve um resultado POR CATEGORIA — uma pode ser encontrada e a outra abstida, sem que uma
 * decida a outra. Nunca lança em "não achei nada"; cada categoria ausente devolve
 * `{ encontrado: false, motivo }`, abstenção limpa.
 */
export async function recortarBlocosIccap(
  pdfBytesOriginal: Uint8Array,
  opcoes: OpcoesRecorteIccap = {},
): Promise<ResultadoRecorteIccap> {
  const t0 = performance.now();
  const ancoras = opcoes.ancoras ?? ANCORAS_ICCAP_PADRAO;
  const margemPt = opcoes.margemPt ?? MARGEM_PT_PADRAO;
  const alvoPx = opcoes.alvoPx ?? ALVO_PX_PADRAO;
  const maxOcorrencias = opcoes.maxOcorrenciasPorTermo ?? MAX_OCORRENCIAS_PADRAO;
  const todosOsTermos = ancoras.flatMap((a) => a.termos);

  // cópia própria dos bytes — nunca reaproveita o buffer de quem chamou (ver cabeçalho do arquivo)
  const pdfBytes = pdfBytesOriginal.slice();

  // import dinâmico: o mupdf é ESM assíncrono (WASM) — mesmo padrão de lib/visao/rasterizar.ts
  const mupdf: any = await import("mupdf");
  const doc = mupdf.Document.openDocument(pdfBytes, "application/pdf");
  try {
    const totalPaginas = doc.countPages();
    // hits crus, por categoria, acumulados por TODAS as páginas — o agrupamento roda por página
    // (um grupo nunca cruza página) mas a coleta é feita de uma vez, por simplicidade.
    const hitsPorCategoriaEPagina = new Map<CategoriaBlocoIccap, Map<number, Hit[]>>(
      CATEGORIAS_BLOCO_ICCAP.map((c) => [c, new Map<number, Hit[]>()]),
    );
    // blocos já recortados (em PNG), acumulados por categoria ao longo de TODAS as páginas
    const blocosPorCategoriaAcumulados = new Map<CategoriaBlocoIccap, BlocoIccap[]>(
      CATEGORIAS_BLOCO_ICCAP.map((c) => [c, [] as BlocoIccap[]]),
    );
    let paginasVarridas = 0;

    for (let pagina = 0; pagina < totalPaginas; pagina++) {
      paginasVarridas++;
      const page = doc.loadPage(pagina);
      try {
        const b = page.getBounds(); // [x0, y0, x1, y1], mesmo espaço de Page.search()
        const caixaPagina: Retangulo = { x0: b[0], y0: b[1], x1: b[2], y1: b[3] };
        for (const ancora of ancoras) {
          const porPagina = hitsPorCategoriaEPagina.get(ancora.categoria)!;
          for (const termo of ancora.termos) {
            const ocorrencias: Quad[][] = page.search(termo, maxOcorrencias) ?? [];
            for (const quads of ocorrencias) {
              const bboxExpandido = expandirEClampar(bboxDeQuads(quads), margemPt, caixaPagina);
              if (!bboxExpandido) continue; // geometria degenerada — pula esta ocorrência, não quebra as demais
              const lista = porPagina.get(pagina) ?? [];
              lista.push({ ancora: ancora.nome, termo, bboxExpandido });
              porPagina.set(pagina, lista);
            }
          }
        }

        // recorte é feito DENTRO do loop de página — a `page` do mupdf só é válida enquanto o
        // documento está aberto e esta página não foi destruída; renderizar depois exigiria
        // reabrir a página, então o mais simples e seguro é recortar aqui e guardar os PNGs.
        for (const categoria of CATEGORIAS_BLOCO_ICCAP) {
          const hitsDestaPagina = hitsPorCategoriaEPagina.get(categoria)!.get(pagina) ?? [];
          if (hitsDestaPagina.length === 0) continue;
          const grupos = agruparPorSobreposicao(hitsDestaPagina);
          for (const grupo of grupos) {
            const limitesPt = grupo.slice(1).reduce((acc, h) => uniao(acc, h.bboxExpandido), grupo[0].bboxExpandido);
            const larguraPt = limitesPt.x1 - limitesPt.x0;
            const alturaPt = limitesPt.y1 - limitesPt.y0;
            const escala = alvoPx / Math.max(larguraPt, alturaPt);
            const bboxPx: [number, number, number, number] = [
              Math.round(limitesPt.x0 * escala), Math.round(limitesPt.y0 * escala),
              Math.round(limitesPt.x1 * escala), Math.round(limitesPt.y1 * escala),
            ];

            const tRecorte0 = performance.now();
            const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, bboxPx, false);
            pixmap.clear(255); // fundo branco: PDF sem fundo sai preto e o modelo não lê nada (mesmo motivo de rasterizar.ts)
            const device = new mupdf.DrawDevice(mupdf.Matrix.scale(escala, escala), pixmap);
            page.run(device, mupdf.Matrix.identity);
            device.close();
            const png = pixmap.asPNG() as Uint8Array;
            pixmap.destroy?.();

            const blocosDaCategoria = blocosPorCategoriaAcumulados.get(categoria)!;
            const ordem = blocosDaCategoria.length + 1;
            blocosDaCategoria.push({
              nomeLogico: `${categoria}#${ordem}`,
              categoria,
              ancoras: [...new Set(grupo.map((h) => h.ancora))],
              termosEncontrados: [...new Set(grupo.map((h) => h.termo))],
              pagina,
              limitesPt,
              png,
              larguraPx: bboxPx[2] - bboxPx[0],
              alturaPx: bboxPx[3] - bboxPx[1],
              dpiEfetivo: Math.round(escala * 72),
              ms: performance.now() - tRecorte0,
            });
          }
        }
      } finally {
        page.destroy?.();
      }
    }

    const porCategoria = {} as Record<CategoriaBlocoIccap, ResultadoCategoriaIccap>;
    for (const categoria of CATEGORIAS_BLOCO_ICCAP) {
      const blocos = blocosPorCategoriaAcumulados.get(categoria)!;
      const termosDaCategoria = ancoras.filter((a) => a.categoria === categoria).flatMap((a) => a.termos);
      porCategoria[categoria] = blocos.length > 0
        ? { encontrado: true, blocos }
        : { encontrado: false, motivo: `nenhuma âncora de "${categoria}" (${termosDaCategoria.join(", ")}) encontrada na camada de texto em ${paginasVarridas} página(s)` };
    }

    return { porCategoria, ancorasBuscadas: todosOsTermos, paginasVarridas, ms: performance.now() - t0 };
  } finally {
    doc.destroy?.();
  }
}
