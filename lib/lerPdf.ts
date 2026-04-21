// lib/lerPdf.ts
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

export async function lerPdf(buffer: Uint8Array) {
  const resultado = await pdfParse(Buffer.from(buffer));
  return {
    texto: resultado.text ?? "",
    paginas: resultado.numpages ?? 0,
  };
}