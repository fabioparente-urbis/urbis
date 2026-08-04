/**
 * lib/mac-motor/slot5/recorteIccap.ts — recorte automático dos blocos ICCAP de uma prancha PDF,
 * ANTES da extração pelo Gemini. Preparação puramente visual/geométrica: não chama IA, não decide
 * nada, não grava banco — só encontra ONDE o quadro ICCAP está (por busca de texto na camada do
 * PDF) e devolve um PNG recortado por bloco encontrado, com a proveniência de cada um.
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
 * ── ABSTENÇÃO, NÃO ERRO ────────────────────────────────────────────────────────────
 * Nenhuma âncora encontrada em nenhuma página não é falha do módulo — é a descoberta de que a
 * prancha não tem (ou não tem na camada de texto) o quadro procurado. `encontrado: false` devolve
 * motivo e deixa quem chama decidir — nunca faz fallback silencioso para a prancha inteira (ver
 * `index.ts`, que é quem integra isto ao fluxo do ICCAP).
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

/** Uma âncora textual: um nome lógico e os termos (sinônimos) que a identificam no documento. */
export type AncoraIccap = {
  /** nome lógico da âncora — usado para nomear os blocos encontrados por ela (nunca a coordenada) */
  nome: string;
  /** termos de busca — cada um tentado como substring literal via `Page.search()` (case-insensitive, confirmado empiricamente) */
  termos: string[];
};

/**
 * Âncoras padrão do quadro ICCAP — carimbo (EXIGIDO/ATENDIDO) e memorial (área impermeabilizada).
 * Configurável: quem chama pode passar outra lista via `opcoes.ancoras`.
 */
export const ANCORAS_ICCAP_PADRAO: AncoraIccap[] = [
  { nome: "iccap", termos: ["ICCAP"] },
  { nome: "indice-controle", termos: ["ÍNDICE DE CONTROLE", "INDICE DE CONTROLE", "ÍNDICE CONTROLE", "INDICE CONTROLE"] },
  { nome: "captacao-agua-pluvial", termos: ["CAPTAÇÃO DE ÁGUA PLUVIAL", "CAPTAÇÃO ÁGUA PLUVIAL", "CAPTACAO DE AGUA PLUVIAL", "CAPTACAO AGUA PLUVIAL"] },
];

export type BlocoIccap = {
  /** nome lógico estável do bloco: "<ancora>#<ordem>" — auditável, nunca reaproveitado entre blocos */
  nomeLogico: string;
  /** nome da AncoraIccap que encontrou este bloco */
  ancora: string;
  /** termo literal (dentre os sinônimos da âncora) que casou nesta ocorrência */
  termoEncontrado: string;
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

export type ResultadoRecorteIccap =
  | { encontrado: true; blocos: BlocoIccap[]; paginasVarridas: number; ms: number }
  | { encontrado: false; motivo: string; ancorasBuscadas: string[]; paginasVarridas: number; ms: number };

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

/** Bounding box (min/max) de todos os pontos de todos os quads de UMA ocorrência (pode ter mais de 1 quad quando o termo cruza linhas). */
function bboxDeQuads(quads: Quad[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of quads) {
    for (let i = 0; i < 8; i += 2) {
      x0 = Math.min(x0, q[i]); x1 = Math.max(x1, q[i]);
      y0 = Math.min(y0, q[i + 1]); y1 = Math.max(y1, q[i + 1]);
    }
  }
  return { x0, y0, x1, y1 };
}

/**
 * Varre TODAS as páginas do PDF, procurando cada âncora pela camada de texto (mupdf), e recorta em
 * PNG cada ocorrência encontrada (com margem). Nunca fixa página, posição ou coordenada — a busca é
 * geral, o mesmo código serve para qualquer prancha, não só o processo 44353 usado no teste histórico.
 *
 * Suporta MÚLTIPLOS blocos (mesma âncora repetida, ou âncoras diferentes) — cada ocorrência vira um
 * `BlocoIccap` independente, com seu próprio PNG e `nomeLogico`, nunca sobrescrevendo outro.
 *
 * Nunca lança em "não achei nada" — devolve `{ encontrado: false, motivo }`, abstenção limpa.
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
    const blocos: BlocoIccap[] = [];
    const contadorPorAncora = new Map<string, number>();
    let paginasVarridas = 0;

    for (let pagina = 0; pagina < totalPaginas; pagina++) {
      paginasVarridas++;
      const page = doc.loadPage(pagina);
      try {
        const caixa = page.getBounds(); // [x0, y0, x1, y1], mesmo espaço de Page.search()
        for (const ancora of ancoras) {
          for (const termo of ancora.termos) {
            const ocorrencias: Quad[][] = page.search(termo, maxOcorrencias) ?? [];
            for (const quads of ocorrencias) {
              const bboxTexto = bboxDeQuads(quads);
              const x0 = Math.max(caixa[0], bboxTexto.x0 - margemPt);
              const y0 = Math.max(caixa[1], bboxTexto.y0 - margemPt);
              const x1 = Math.min(caixa[2], bboxTexto.x1 + margemPt);
              const y1 = Math.min(caixa[3], bboxTexto.y1 + margemPt);
              if (x1 <= x0 || y1 <= y0) continue; // geometria degenerada — pula esta ocorrência, não quebra as demais

              const larguraPt = x1 - x0;
              const alturaPt = y1 - y0;
              const escala = alvoPx / Math.max(larguraPt, alturaPt);
              const bboxPx: [number, number, number, number] = [
                Math.round(x0 * escala), Math.round(y0 * escala),
                Math.round(x1 * escala), Math.round(y1 * escala),
              ];

              const tRecorte0 = performance.now();
              const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, bboxPx, false);
              pixmap.clear(255); // fundo branco: PDF sem fundo sai preto e o modelo não lê nada (mesmo motivo de rasterizar.ts)
              const device = new mupdf.DrawDevice(mupdf.Matrix.scale(escala, escala), pixmap);
              page.run(device, mupdf.Matrix.identity);
              device.close();
              const png = pixmap.asPNG() as Uint8Array;
              pixmap.destroy?.();

              const ordem = (contadorPorAncora.get(ancora.nome) ?? 0) + 1;
              contadorPorAncora.set(ancora.nome, ordem);

              blocos.push({
                nomeLogico: `${ancora.nome}#${ordem}`,
                ancora: ancora.nome,
                termoEncontrado: termo,
                pagina,
                limitesPt: { x0, y0, x1, y1 },
                png,
                larguraPx: bboxPx[2] - bboxPx[0],
                alturaPx: bboxPx[3] - bboxPx[1],
                dpiEfetivo: Math.round(escala * 72),
                ms: performance.now() - tRecorte0,
              });
            }
          }
        }
      } finally {
        page.destroy?.();
      }
    }

    if (blocos.length === 0) {
      return {
        encontrado: false,
        motivo: `nenhuma âncora (${todosOsTermos.join(", ")}) encontrada na camada de texto em ${paginasVarridas} página(s)`,
        ancorasBuscadas: todosOsTermos,
        paginasVarridas,
        ms: performance.now() - t0,
      };
    }
    return { encontrado: true, blocos, paginasVarridas, ms: performance.now() - t0 };
  } finally {
    doc.destroy?.();
  }
}
