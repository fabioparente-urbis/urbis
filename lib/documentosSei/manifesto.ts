/**
 * lib/documentosSei/manifesto.ts — Fase 5 do plano Documentos Vivos
 * (docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md §6). Gera `00_Manifesto_Documental.pdf`: uma tabela, por
 * documento, com título, ID SEI, páginas de origem, estado (Fase 4), motivo, confiança.
 *
 * Roda no NAVEGADOR (`lib/documentosSei/pacoteVigenteClient.ts` chama isto) — por isso não
 * reaproveita `lib/relatorio-pdf.ts` (que usa `fs`/`path` pra carregar logos e só roda em Node).
 * Versão deliberadamente mais simples: pdf-lib puro, sem logo, sem marca d'água — o objetivo é um
 * índice auditável, não um documento institucional.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type ItemManifesto = {
  titulo: string;
  idSei: string;
  paginaIni: number;
  paginaFim: number;
  estado: string;
  motivo: string;
  confianca: string;
  /** preenchido só quando o item não entrou no pacote (ex.: papel ambíguo, sem recorte gerado) */
  observacao?: string;
};

const A4_W = 595;
const A4_H = 842;
const MARGEM = 40;
const COR_TITULO = rgb(0.1, 0.1, 0.1);
const COR_TEXTO = rgb(0.25, 0.25, 0.25);
const COR_LINHA = rgb(0.85, 0.85, 0.85);

function quebrarLinhas(texto: string, fonte: PDFFont, tamanho: number, larguraMax: number): string[] {
  const palavras = texto.split(/\s+/);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const teste = atual ? `${atual} ${p}` : p;
    if (fonte.widthOfTextAtSize(teste, tamanho) > larguraMax && atual) {
      linhas.push(atual);
      atual = p;
    } else {
      atual = teste;
    }
  }
  if (atual) linhas.push(atual);
  return linhas.length ? linhas : [""];
}

/**
 * Monta o manifesto: cabeçalho com o número do processo e a data de geração, depois uma linha por
 * item (título, ID SEI, páginas, estado, confiança, motivo — motivo quebra em várias linhas
 * quando precisa). Pagina automaticamente quando o conteúdo não cabe mais.
 */
export async function gerarManifestoPdf(numeroProcesso: string, itens: ItemManifesto[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonteNormal = await doc.embedFont(StandardFonts.Helvetica);
  const fonteNegrito = await doc.embedFont(StandardFonts.HelveticaBold);

  let pagina: PDFPage = doc.addPage([A4_W, A4_H]);
  let y = A4_H - MARGEM;

  function novaPagina() {
    pagina = doc.addPage([A4_W, A4_H]);
    y = A4_H - MARGEM;
  }
  function precisaDe(altura: number) {
    if (y - altura < MARGEM) novaPagina();
  }

  pagina.drawText("Manifesto Documental", { x: MARGEM, y, size: 16, font: fonteNegrito, color: COR_TITULO });
  y -= 22;
  pagina.drawText(`Processo ${numeroProcesso} · gerado em ${new Date().toLocaleString("pt-BR")}`, {
    x: MARGEM, y, size: 9, font: fonteNormal, color: COR_TEXTO,
  });
  y -= 12;
  pagina.drawText(`${itens.length} documento(s)`, { x: MARGEM, y, size: 9, font: fonteNormal, color: COR_TEXTO });
  y -= 20;

  const larguraUtil = A4_W - MARGEM * 2;
  for (const item of itens) {
    const linhasMotivo = quebrarLinhas(`Motivo: ${item.motivo}`, fonteNormal, 8, larguraUtil);
    const alturaBloco = 14 + 12 + linhasMotivo.length * 10 + (item.observacao ? 10 : 0) + 8;
    precisaDe(alturaBloco);

    pagina.drawText(`${item.titulo} (SEI ${item.idSei})`, { x: MARGEM, y, size: 10, font: fonteNegrito, color: COR_TITULO });
    y -= 13;
    const paginas = item.paginaIni === item.paginaFim ? `pg. ${item.paginaIni}` : `pg. ${item.paginaIni}–${item.paginaFim}`;
    pagina.drawText(`${paginas} · estado: ${item.estado} · confiança: ${item.confianca}`, {
      x: MARGEM, y, size: 8.5, font: fonteNormal, color: COR_TEXTO,
    });
    y -= 11;
    for (const linha of linhasMotivo) {
      pagina.drawText(linha, { x: MARGEM, y, size: 8, font: fonteNormal, color: COR_TEXTO });
      y -= 10;
    }
    if (item.observacao) {
      pagina.drawText(item.observacao, { x: MARGEM, y, size: 8, font: fonteNegrito, color: rgb(0.6, 0.35, 0) });
      y -= 10;
    }
    pagina.drawLine({ start: { x: MARGEM, y: y - 2 }, end: { x: A4_W - MARGEM, y: y - 2 }, thickness: 0.5, color: COR_LINHA });
    y -= 10;
  }

  return doc.save();
}
