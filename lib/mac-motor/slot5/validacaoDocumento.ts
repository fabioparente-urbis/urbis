/**
 * lib/mac-motor/slot5/validacaoDocumento.ts — validação de PDF na fronteira do motor.
 *
 * A rota recebe arquivos de fora (upload do analista) — MIME declarado pelo cliente não é
 * confiável, e um arquivo grande ou corrompido não pode chegar ao upload no Gemini (gasta cota e
 * pode travar a chamada). Checagem em 3 camadas: tamanho, MIME declarado, assinatura real do
 * arquivo (magic bytes) — as duas primeiras são baratas e filtram a maioria dos erros de uso; a
 * terceira é a que importa de verdade (um .txt renomeado para .pdf passa pelas duas primeiras).
 */

export const TAMANHO_MAXIMO_PDF_BYTES = 25 * 1024 * 1024; // 25MB — parâmetro de engenharia, ajustável

export type ResultadoValidacaoPdf = { ok: true } | { ok: false; motivo: string };

const ASSINATURA_PDF = "%PDF-"; // todo PDF válido começa com isto (spec ISO 32000)

export function validarPdf(params: {
  bytes: Uint8Array;
  mimeDeclarado: string | null;
  nomeArquivo: string;
  tamanhoBytes: number;
}): ResultadoValidacaoPdf {
  const { bytes, mimeDeclarado, nomeArquivo, tamanhoBytes } = params;

  if (tamanhoBytes <= 0) {
    return { ok: false, motivo: `"${nomeArquivo}" está vazio` };
  }
  if (tamanhoBytes > TAMANHO_MAXIMO_PDF_BYTES) {
    return {
      ok: false,
      motivo: `"${nomeArquivo}" tem ${(tamanhoBytes / 1024 / 1024).toFixed(1)}MB — o limite é ${TAMANHO_MAXIMO_PDF_BYTES / 1024 / 1024}MB`,
    };
  }
  if (mimeDeclarado !== "application/pdf") {
    return { ok: false, motivo: `"${nomeArquivo}" foi enviado como "${mimeDeclarado ?? "desconhecido"}", não "application/pdf"` };
  }
  if (bytes.byteLength < ASSINATURA_PDF.length) {
    return { ok: false, motivo: `"${nomeArquivo}" é pequeno demais para ser um PDF válido` };
  }
  const cabecalho = String.fromCharCode(...bytes.slice(0, ASSINATURA_PDF.length));
  if (cabecalho !== ASSINATURA_PDF) {
    return { ok: false, motivo: `"${nomeArquivo}" não começa com a assinatura %PDF- — não é um PDF de verdade, apesar do nome/MIME` };
  }
  return { ok: true };
}
