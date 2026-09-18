// ============================================================
// lib/geradores/aceiteSei/docxBase.ts
// Base de docx dos documentos do ALVARÁ DE ACEITE (Slot 2).
//
// ISOLAMENTO DE SLOT (CLAUDE.md): reprodução POR LEITURA dos helpers
// equivalentes de `lib/geradores.ts`. Nada é importado de lá, e nada
// daqui deve ser importado por outro slot.
//
// Compartilhar DENTRO do Slot 2 é permitido e desejável — o isolamento
// que a regra exige é ENTRE slots. Os quatro documentos do Aceite
// (despacho, indeferimento, arquivamento, despacho interno) usam esta
// base; se um dia divergirem do Slot 1, divergem juntos, sem tocar na
// Regularização.
//
// A LOGO é a padrão do URBIS (`public/logo_prefeitura.png`) e continua
// compartilhada de propósito: é o brasão da instituição, não algo de
// slot. Conferido em 17/09/2026 — a imagem embarcada no .docx é byte a
// byte a mesma do arquivo em `public/`.
// ============================================================

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, Footer, AlignmentType, BorderStyle, WidthType,
  VerticalAlign, PageNumber, UnderlineType, TabStopType,
} from "docx";
import fs from "fs";
import path from "path";

export { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, AlignmentType, BorderStyle, WidthType };

export const A4_W = 11906;
export const A4_H = 16838;
export const MARGINS = { top: 1000, right: 1080, bottom: 900, left: 1080 };
export const CONTENT_W = A4_W - MARGINS.left - MARGINS.right;
/** Borda "nenhuma" — usada nas tabelas de layout (rodapé de data/setor). */
export const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

export type Assinante = { nome: string; matricula?: string; cargo?: string; registro?: string };

export function getLogoData(): Buffer | null {
  try { return fs.readFileSync(path.join(process.cwd(), "public", "logo_prefeitura.png")); }
  catch { return null; }
}

export function txt(text: string, opts: any = {}) {
  return new TextRun({
    text: String(text ?? ""), font: "Arial", size: opts.size || 20,
    bold: opts.bold || false,
    underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
    color: opts.color || "000000", italics: opts.italics || false,
  });
}

export function p(children: any[], opts: any = {}) {
  return new Paragraph({
    alignment: opts.align !== undefined ? opts.align : AlignmentType.JUSTIFIED,
    spacing: { before: opts.before || 0, after: opts.after !== undefined ? opts.after : 120, line: 260 },
    indent: opts.indent ? { left: opts.indent, hanging: opts.hanging || 0 } : undefined,
    keepLines: true, keepNext: opts.keepNext || false, children,
  });
}

export function vazio(after = 100) {
  return new Paragraph({ children: [txt("")], spacing: { before: 0, after } });
}

/** Matrícula não sai em documento (decisão de 25/07/2026): só nome, cargo e CREA/CAU. */
export function blocoAssinaturaAnalista(ass: Assinante): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 300, after: 40 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 1 } },
    indent: { left: 2400, right: 2400 },
    children: [txt(ass.nome, { bold: true })],
  }));
  if (ass.cargo) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 30 }, children: [txt(ass.cargo)] }));
  if (ass.registro) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 30 }, children: [txt(ass.registro)] }));
  return out;
}

/** Linha para assinatura à mão, quando o gerente/diretor não está cadastrado. */
export function blocoLinhaEmBranco(label: string): Paragraph[] {
  return [new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 360, after: 40 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 1 } },
    indent: { left: 2400, right: 2400 },
    children: [txt(`${label}: ___________`)],
  })];
}

export function makeHeader(logoData: Buffer | null) {
  const borders = { top: NB, bottom: NB, left: NB, right: NB };
  const logoCell = logoData
    ? new TableCell({ borders, width: { size: 3600, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, margins: { top: 0, bottom: 0, left: 0, right: 200 }, children: [new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 0, after: 0 }, children: [new ImageRun({ data: logoData, transformation: { width: 240, height: 118 }, type: "png" })] })] })
    : new TableCell({ borders, width: { size: 3600, type: WidthType.DXA }, children: [new Paragraph({ children: [txt("PREFEITURA DE GOIÂNIA", { bold: true })] })] });
  return new Header({ children: [
    new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [3600, CONTENT_W - 3600], borders: { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB }, rows: [new TableRow({ children: [logoCell, new TableCell({ borders, width: { size: CONTENT_W - 3600, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, children: [
      new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 28 }, children: [txt("Secretaria Municipal de Planejamento Urbano e Habitação", { bold: true, underline: true, size: 17, color: "375623" })] }),
      new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 28 }, children: [txt("Superintendência da Ordem Pública", { bold: true, underline: true, size: 17, color: "375623" })] }),
      new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 0 }, children: [txt("Diretoria de Análise e Aprovação de Projetos", { bold: true, underline: true, size: 17, color: "375623" })] }),
    ] })] })] }),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "AAAAAA", space: 1 } }, spacing: { before: 80, after: 0 }, children: [txt("")] }),
  ] });
}

export function makeFooter(label: string) {
  return new Footer({ children: [new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 1 } }, spacing: { before: 60 }, tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }], children: [txt("Página ", { size: 17 }), new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 17 }), txt(" de ", { size: 17 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 17 }), txt(`\t${label}`, { size: 17 })] })] });
}

/** Rodapé "Goiânia, <data>" à esquerda e o setor à direita, em tabela sem borda. */
export function rodapeDataSetor(dataTexto: string, setor: string) {
  const half = Math.floor(CONTENT_W / 2);
  const brd = { top: NB, bottom: NB, left: NB, right: NB };
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [half, half],
    borders: { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB },
    rows: [new TableRow({ children: [
      new TableCell({ borders: brd, width: { size: half, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [txt(`Goiânia, ${dataTexto}`)] })] }),
      new TableCell({ borders: brd, width: { size: half, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt(setor)] })] }),
    ] })],
  });
}

export function subtituloSecao(titulo: string) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 240, after: 100, line: 260 },
    keepLines: true, keepNext: true,
    children: [txt(titulo, { bold: true })],
  });
}

/**
 * Data de emissão. O cliente manda "dd/mm/aaaa"; vazio ou inválido cai
 * para hoje. Meio-dia local para a data não escorregar de dia ao formatar
 * (o servidor Railway roda em UTC).
 */
export function parseDataBR(s?: string | null): Date | null {
  const m = String(s ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
  return isNaN(dt.getTime()) ? null : dt;
}

export function fmtDataLonga(data?: string | null, comSemana = false): string {
  const dt = parseDataBR(data) ?? new Date();
  return dt.toLocaleDateString("pt-BR", {
    ...(comSemana ? { weekday: "long" as const } : {}),
    day: "numeric", month: "long", year: "numeric",
  });
}

/** Largura/altura de PNG ou JPEG lidas dos bytes — o docx exige a transformação em pixels. */
export function dimensoesImagem(buffer: Buffer, tipo: "png" | "jpg"): { width: number; height: number } {
  if (tipo === "png") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  // JPEG: percorre os marcadores até achar um SOFn (as dimensões ficam nele).
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  return { width: 420, height: 300 };
}

/** Monta o Document A4 com cabeçalho e rodapé padrão do Aceite. */
export function montarDocumento(children: Paragraph[], rotuloRodape: string, logoData: Buffer | null) {
  return new Document({
    styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
    sections: [{
      properties: { page: { size: { width: A4_W, height: A4_H }, margin: MARGINS } },
      headers: { default: makeHeader(logoData) },
      footers: { default: makeFooter(rotuloRodape) },
      children,
    }],
  });
}
