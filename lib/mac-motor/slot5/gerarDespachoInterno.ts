/**
 * lib/mac-motor/slot5/gerarDespachoInterno.ts — Despacho Interno do Slot 5 (Aprovação de Projeto).
 *
 * Comunicação de uma gerência para outra sobre um processo: número da mesma série dos demais
 * despachos, destinatário, corpo livre e assinatura de quem emite.
 *
 * VISUALMENTE IDÊNTICO ao do Slot 1 e TOTALMENTE INDEPENDENTE dele (decisão do Fábio, 25/08/2026):
 * o layout foi reproduzido por leitura de `lib/geradores.ts`, nunca importado. Um ajuste no
 * despacho interno da Regularização não pode mudar o da Aprovação de Projeto, e vice-versa — são
 * atos de setores diferentes que só por ora se parecem.
 *
 * O cabeçalho aqui é o do Slot 5: Secretaria Municipal de Eficiência / Superintendência de Análise
 * e Licenciamento / Diretoria de Análise e Aprovação de Projetos — o mesmo do Despacho Geral da
 * Aprovação de Projeto, não o da Regularização.
 */

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, Footer, AlignmentType, BorderStyle, WidthType, VerticalAlign,
  PageNumber, TabStopType,
} from "docx";
import fs from "fs";
import path from "path";

const A4_W = 11906;
const A4_H = 16838;
const MARGINS = { top: 1000, right: 1080, bottom: 900, left: 1080 };
const CW = A4_W - MARGINS.left - MARGINS.right;

export type AssinanteSlot5 = {
  nome: string;
  cargo?: string | null;
  registro?: string | null;
};

function logo(): Buffer | null {
  try { return fs.readFileSync(path.join(process.cwd(), "public", "logo_prefeitura.png")); }
  catch { return null; }
}

function txt(texto: string, opts: { size?: number; bold?: boolean; underline?: boolean; color?: string } = {}) {
  return new TextRun({
    text: String(texto ?? ""), font: "Arial", size: opts.size ?? 20,
    bold: opts.bold ?? false,
    underline: opts.underline ? { type: "single" as const } : undefined,
    color: opts.color ?? "000000",
  });
}

function p(filhos: TextRun[], opts: { align?: any; before?: number; after?: number } = {}) {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.JUSTIFIED,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 120, line: 260 },
    children: filhos,
  });
}

const vazio = (after = 100) => new Paragraph({ children: [txt("")], spacing: { before: 0, after } });

/** Cabeçalho da Diretoria de Análise e Aprovação de Projetos — o do Slot 5. */
function cabecalho() {
  const img = logo();
  const nb = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const bordas = { top: nb, bottom: nb, left: nb, right: nb };
  const celLogo = img
    ? new TableCell({
        borders: bordas, width: { size: 1800, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
        margins: { top: 0, bottom: 0, left: 0, right: 200 },
        children: [new Paragraph({ children: [new ImageRun({ data: img, transformation: { width: 90, height: 90 }, type: "png" })] })],
      })
    : new TableCell({
        borders: bordas, width: { size: 1800, type: WidthType.DXA },
        children: [new Paragraph({ children: [txt("PREFEITURA DE GOIÂNIA", { bold: true, size: 14 })] })],
      });

  const celTexto = new TableCell({
    borders: bordas, width: { size: CW - 1800, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    children: [
      p([txt("Secretaria Municipal de Eficiência", { bold: true, size: 17 })], { align: AlignmentType.RIGHT, after: 24 }),
      p([txt("Superintendência de Análise e Licenciamento", { bold: true, size: 17 })], { align: AlignmentType.RIGHT, after: 24 }),
      p([txt("Diretoria de Análise e Aprovação de Projetos", { bold: true, size: 17 })], { align: AlignmentType.RIGHT, after: 0 }),
    ],
  });

  return new Header({
    children: [
      new Table({
        width: { size: CW, type: WidthType.DXA }, columnWidths: [1800, CW - 1800],
        borders: { top: nb, bottom: nb, left: nb, right: nb, insideHorizontal: nb, insideVertical: nb },
        rows: [new TableRow({ children: [celLogo, celTexto] })],
      }),
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "AAAAAA", space: 1 } },
        spacing: { before: 100, after: 0 }, children: [txt("")],
      }),
    ],
  });
}

function rodape() {
  return new Footer({
    children: [new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 1 } },
      spacing: { before: 60 },
      tabStops: [{ type: TabStopType.RIGHT, position: CW }],
      children: [
        txt("Página ", { size: 17 }),
        new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 17 }),
        txt(" de ", { size: 17 }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 17 }),
        txt("\tDespacho Interno", { size: 17 }),
      ],
    })],
  });
}

function blocoAssinatura(a: AssinanteSlot5): Paragraph[] {
  const out: Paragraph[] = [new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 300, after: 40 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 1 } },
    indent: { left: 2400, right: 2400 },
    children: [txt(a.nome, { bold: true })],
  })];
  // Matrícula não sai em documento (decisão de 25/07/2026) — só nome, cargo e CAU/CREA.
  if (a.cargo) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, children: [txt(a.cargo)] }));
  if (a.registro) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, children: [txt(a.registro)] }));
  return out;
}

export async function gerarDespachoInternoSlot5(dados: {
  processo: string;
  interessado: string;
  numeroDespacho: string;
  /** dd/mm/aaaa — a data escolhida no modal, não a de geração do arquivo. */
  data: string;
  assunto: string;
  destino: string;
  corpo: string;
  assinante: AssinanteSlot5;
}): Promise<Buffer> {
  const nb = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const bordas = { top: nb, bottom: nb, left: nb, right: nb };
  const meia = Math.floor(CW / 2);
  const ano = dados.data.slice(-4) || String(new Date().getFullYear());

  const filhos: (Paragraph | Table)[] = [
    vazio(160),
    p([txt("Processo / Projeto:  "), txt(dados.processo, { bold: true })], { align: AlignmentType.LEFT, after: 80 }),
    p([txt("Interessado:  "), txt(dados.interessado, { bold: true })], { align: AlignmentType.LEFT, after: 80 }),
    p([txt("Assunto:  "), txt(dados.assunto, { bold: true })], { align: AlignmentType.LEFT, after: 200 }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200 },
      children: [txt(`DESPACHO Nº ${dados.numeroDespacho} / ${ano}`, { bold: true, size: 22 })],
    }),
    p([txt(`À ${dados.destino}`)], { align: AlignmentType.LEFT, after: 160 }),
    ...dados.corpo.split("\n").map((linha) => p([txt(linha || " ")], { after: 80 })),
    vazio(200),
    ...blocoAssinatura(dados.assinante),
    vazio(120),
    new Table({
      width: { size: CW, type: WidthType.DXA }, columnWidths: [meia, meia],
      borders: { top: nb, bottom: nb, left: nb, right: nb, insideHorizontal: nb, insideVertical: nb },
      rows: [new TableRow({
        children: [
          new TableCell({ borders: bordas, width: { size: meia, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [txt(`Goiânia, ${dados.data}`)] })] }),
          new TableCell({ borders: bordas, width: { size: meia, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt("SEFIC / DIRAAP")] })] }),
        ],
      })],
    }),
  ];

  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
    sections: [{
      properties: { page: { size: { width: A4_W, height: A4_H }, margin: MARGINS } },
      headers: { default: cabecalho() },
      footers: { default: rodape() },
      children: filhos as any,
    }],
  });
  return Packer.toBuffer(doc);
}
