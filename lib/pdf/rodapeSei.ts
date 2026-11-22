/**
 * lib/pdf/rodapeSei.ts — utilitário PURO (sem regra de slot): lê o texto de cada página de um ou
 * mais PDFs baixados do SEI para conferir se uma "prova" citada pela IA existe de fato.
 *
 * Todo PDF gerado pelo SEI carimba um rodapé digital em cada página, inclusive nas escaneadas:
 *   "Vistoria Simples (8898330)   SEI 25.28.000001552-8 / pg. 99"
 * Então dá para conferir, sem IA, se o documento de SEI 8898330 está na página 99.
 *
 * Criado em 05/11/2026 (pedido do Fábio: o MAC do Aceite "aprovou tudo" e o Gemini inventou fato
 * que não está no PDF). Quem decide o que fazer com a prova que não confere é a rota de cada slot.
 */

export type PaginaRodape = { arquivo: number; indice: number; texto: string };

export type IndiceRodape = {
  paginas: PaginaRodape[];
  /** false quando nenhuma página tem o rodapé do SEI (PDF que não veio do SEI) — aí não há como conferir. */
  temRodapeSei: boolean;
};

const RE_RODAPE = /\/\s*pg\.\s*\d+/i;

/** Lê o texto de cada página. Nunca lança: PDF ilegível volta como índice vazio. */
export async function indexarRodapes(buffers: Uint8Array[]): Promise<IndiceRodape> {
  const paginas: PaginaRodape[] = [];
  try {
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    for (let a = 0; a < buffers.length; a++) {
      try {
        const doc = await pdfjs.getDocument({ data: buffers[a], useSystemFonts: true, isEvalSupported: false }).promise;
        for (let p = 1; p <= doc.numPages; p++) {
          const page = await doc.getPage(p);
          const tc = await page.getTextContent();
          const texto = (tc.items as any[]).map((i) => i.str ?? "").join(" ").replace(/\s+/g, " ");
          paginas.push({ arquivo: a, indice: p, texto });
          page.cleanup?.();
        }
        await doc.destroy?.();
      } catch (e: any) {
        console.error(`[rodapeSei] arquivo ${a} ilegível:`, e?.message);
      }
    }
  } catch (e: any) {
    console.error("[rodapeSei] pdfjs indisponível:", e?.message);
  }
  return { paginas, temRodapeSei: paginas.some((p) => RE_RODAPE.test(p.texto)) };
}

/**
 * A prova confere quando alguma página traz o SEI citado E é a página citada — pelo rodapé
 * ("/ pg. 99") ou, se o arquivo não tiver rodapé, pela posição da página no próprio PDF.
 */
export function provaConfere(indice: IndiceRodape, sei: string, pagina: number): boolean {
  const s = String(sei ?? "").replace(/\D/g, "");
  if (!s || !Number.isFinite(pagina) || pagina <= 0) return false;
  const rePg = new RegExp(`/\\s*pg\\.\\s*${pagina}(?!\\d)`, "i");
  return indice.paginas.some((p) => {
    if (!p.texto.replace(/[.\-]/g, "").includes(s) && !p.texto.includes(s)) return false;
    if (rePg.test(p.texto)) return true;
    return !RE_RODAPE.test(p.texto) && p.indice === pagina;
  });
}
