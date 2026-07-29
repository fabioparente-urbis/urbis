/**
 * lib/visao/rasterizar.ts — recorta uma região de página de PDF em PNG.
 *
 * mupdf, e não pdfjs+canvas, por uma razão de deploy: mupdf é WASM puro. Binário nativo (node-canvas,
 * @napi-rs/canvas) é a classe de dependência que quebra em serverless. Medido em 29/07/2026 na
 * prancha A0 da amostra: recorte de região a ~1600px de lado custa ~700ms e ~1,2MB.
 *
 * Renderiza APENAS o bbox — `Pixmap` do tamanho da região + `DrawDevice` com a matriz de escala.
 * Rasterizar a página inteira da prancha custaria 2,6s e ~186MB de pixmap cru, para depois jogar
 * fora 95% dos pixels.
 */

import type { Regiao } from "./tipos";

export type Recorte = {
  png: Uint8Array;
  larguraPx: number;
  alturaPx: number;
  /** geometria efetiva, em pontos do PDF — é isto que vai para a evidência */
  pontos: { x0: number; y0: number; x1: number; y1: number };
  dpiEfetivo: number;
  ms: number;
};

export async function recortar(pdf: Uint8Array, regiao: Regiao): Promise<Recorte> {
  const t0 = performance.now();
  // import dinâmico: o mupdf é ESM assíncrono (WASM) e não pode ser exigido no topo de um módulo
  // carregado por caminho síncrono. Também mantém o WASM fora do caminho de quem não usa visão.
  const mupdf: any = await import("mupdf");

  const doc = mupdf.Document.openDocument(pdf, "application/pdf");
  try {
    if (regiao.pagina >= doc.countPages()) {
      throw new Error(`página ${regiao.pagina} não existe (documento tem ${doc.countPages()})`);
    }
    const page = doc.loadPage(regiao.pagina);
    const caixa = page.getBounds();
    const larguraPt = caixa[2] - caixa[0];
    const alturaPt = caixa[3] - caixa[1];

    // escala derivada do ALVO EM PIXELS, não de DPI fixo — ver o comentário de `Regiao.alvoPx`
    const larguraRegiaoPt = larguraPt * (regiao.x1 - regiao.x0);
    const alturaRegiaoPt = alturaPt * (regiao.y1 - regiao.y0);
    const escala = regiao.alvoPx / Math.max(larguraRegiaoPt, alturaRegiaoPt);

    const bbox = [
      Math.round((caixa[0] + larguraPt * regiao.x0) * escala),
      Math.round((caixa[1] + alturaPt * regiao.y0) * escala),
      Math.round((caixa[0] + larguraPt * regiao.x1) * escala),
      Math.round((caixa[1] + alturaPt * regiao.y1) * escala),
    ];

    const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, bbox, false);
    pixmap.clear(255); // fundo branco: PDF sem fundo sai preto e o modelo não lê nada
    const device = new mupdf.DrawDevice(mupdf.Matrix.scale(escala, escala), pixmap);
    page.run(device, mupdf.Matrix.identity);
    device.close();
    const png = pixmap.asPNG() as Uint8Array;
    pixmap.destroy?.();
    page.destroy?.();

    return {
      png,
      larguraPx: bbox[2] - bbox[0],
      alturaPx: bbox[3] - bbox[1],
      pontos: {
        x0: caixa[0] + larguraPt * regiao.x0, y0: caixa[1] + alturaPt * regiao.y0,
        x1: caixa[0] + larguraPt * regiao.x1, y1: caixa[1] + alturaPt * regiao.y1,
      },
      dpiEfetivo: Math.round(escala * 72),
      ms: performance.now() - t0,
    };
  } finally {
    doc.destroy?.();
  }
}
