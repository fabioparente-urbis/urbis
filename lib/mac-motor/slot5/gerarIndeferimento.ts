/**
 * lib/mac-motor/slot5/gerarIndeferimento.ts — Parecer de INDEFERIMENTO do Slot 5 (Aprovação de Projeto).
 *
 * Mesma peça do Slot 1 (decisão do Fábio, 02/10/2026: "idêntico ao Slot 1, adaptado ao assunto"), mas
 * REPRODUZIDA por leitura, não importada: isolamento entre slots é regra (CLAUDE.md) — dois atos que hoje
 * se parecem são de setores diferentes e um ajuste num não pode mudar o outro em silêncio. Os helpers do
 * .docx (cabeçalho, rodapé, assinatura) também são cópia local, de lib/geradores.ts.
 *
 * Diferenças em relação ao Slot 1: assunto fixo "APROVAÇÃO DE PROJETO"; os motivos escolhidos NA TELA
 * saem impressos no parecer (no Slot 1 a rota os recebe mas não os repassa ao documento — achado de
 * 02/10/2026, mantido lá como está).
 *
 * NÃO consome número de parecer: ele chega pronto de /api/numeracao/proximo (série única, tipo=parecer).
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, Footer, AlignmentType, BorderStyle, WidthType,
  VerticalAlign, PageNumber, UnderlineType, TabStopType,
} from "docx";
import fs from "fs";
import path from "path";

const A4_W = 11906;
const A4_H = 16838;
const MARGINS = { top: 1000, right: 1080, bottom: 900, left: 1080 };
const CONTENT_W = A4_W - MARGINS.left - MARGINS.right;

function getLogoData() {
  try { return fs.readFileSync(path.join(process.cwd(), "public", "logo_prefeitura.png")); }
  catch { return null; }
}

function txt(text: string, opts: any = {}) {
  return new TextRun({
    text: String(text ?? ""), font: "Arial", size: opts.size || 20,
    bold: opts.bold || false,
    underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
    color: opts.color || "000000", italics: opts.italics || false,
  });
}

function p(children: any[], opts: any = {}) {
  return new Paragraph({
    alignment: opts.align !== undefined ? opts.align : AlignmentType.JUSTIFIED,
    spacing: { before: opts.before || 0, after: opts.after !== undefined ? opts.after : 120, line: 260 },
    indent: opts.indent ? { left: opts.indent, hanging: opts.hanging || 0 } : undefined,
    keepLines: true, keepNext: opts.keepNext || false, children,
  });
}

function vazio(after = 100) {
  return new Paragraph({ children: [txt("")], spacing: { before: 0, after } });
}

export type Assinante = { nome: string; matricula?: string; cargo?: string; registro?: string };

function blocoAssinaturaAnalista(ass: Assinante): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 300, after: 40 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 1 } },
    indent: { left: 2400, right: 2400 },
    children: [txt(ass.nome, { bold: true })],
  }));
  // Matrícula NÃO sai em documento — decisão de 25/07/2026. Ela continua
  // no cadastro do usuário e no tipo `Assinante` (as rotas seguem lendo do
  // banco), mas a assinatura publica so leva nome, cargo e CREA/CAU.
  if (ass.cargo) {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 30 },
      children: [txt(ass.cargo)],
    }));
  }
  if (ass.registro) {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 30 },
      children: [txt(ass.registro)],
    }));
  }
  return out;
}

function blocoLinhaEmBranco(label: string): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 360, after: 40 },
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 1 } },
      indent: { left: 2400, right: 2400 },
      children: [txt(`${label}: ___________`)],
    }),
  ];
}

function makeHeader(logoData: Buffer | null) {
  const nb = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const borders = { top: nb, bottom: nb, left: nb, right: nb };
  const logoCell = logoData
    ? new TableCell({ borders, width: { size: 3600, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, margins: { top: 0, bottom: 0, left: 0, right: 200 }, children: [new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 0, after: 0 }, children: [new ImageRun({ data: logoData, transformation: { width: 240, height: 118 }, type: "png" })] })] })
    : new TableCell({ borders, width: { size: 3600, type: WidthType.DXA }, children: [new Paragraph({ children: [txt("PREFEITURA DE GOIÂNIA", { bold: true })] })] });
  return new Header({ children: [
    new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [3600, CONTENT_W - 3600], borders: { top: nb, bottom: nb, left: nb, right: nb, insideHorizontal: nb, insideVertical: nb }, rows: [new TableRow({ children: [logoCell, new TableCell({ borders, width: { size: CONTENT_W - 3600, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, children: [
      new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 28 }, children: [txt("Secretaria Municipal de Eficiência", { bold: true, underline: true, size: 17, color: "375623" })] }),
      new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 28 }, children: [txt("Superintendência de Análise e Licenciamento", { bold: true, underline: true, size: 17, color: "375623" })] }),
      new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 0 }, children: [txt("Diretoria de Análise e Aprovação de Projetos", { bold: true, underline: true, size: 17, color: "375623" })] }),
    ] })] })] }),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "AAAAAA", space: 1 } }, spacing: { before: 80, after: 0 }, children: [txt("")] }),
  ] });
}

function makeFooter(label: string) {
  return new Footer({ children: [new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 1 } }, spacing: { before: 60 }, tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }], children: [txt("Página ", { size: 17 }), new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 17 }), txt(" de ", { size: 17 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 17 }), txt(`\t${label}`, { size: 17 })] })] });
}

function parseDataBR(s?: string | null): Date | null {
  const m = String(s ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
  return isNaN(dt.getTime()) ? null : dt;
}
function fmtDataLonga(data?: string | null, comSemana = false): string {
  const dt = parseDataBR(data) ?? new Date();
  return dt.toLocaleDateString("pt-BR", {
    ...(comSemana ? { weekday: "long" as const } : {}),
    day: "numeric", month: "long", year: "numeric",
  });
}


/**
 * Lê largura/altura de PNG ou JPEG direto dos bytes (sem depender de libs de imagem) —
 * necessário porque o docx exige a transformação explícita em pixels no ImageRun.
 */
function dimensoesImagem(buffer: Buffer, tipo: "png" | "jpg"): { width: number; height: number } {
  if (tipo === "png") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  // JPEG: percorre os marcadores até achar um SOFn (dimensões ficam nele).
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


export async function gerarIndeferimentoSlot5(dados: { processo: string; interessado: string; analises: { numero: number; data: string; despacho?: string }[]; naoConformes?: string[]; observacoes?: string; endereco?: string; analista?: string; crea?: string; setor?: string; assinante?: Assinante; gerente?: Assinante; diretora?: Assinante; numeroParecer?: string; assunto?: string; data?: string; fotos?: { base64: string; tipo: "png" | "jpg"; legenda: string }[]; }): Promise<Buffer> {
  const logoData = getLogoData();
  const assinante: Assinante = dados.assinante || {
    nome: dados.analista || "Engº Fábio Parente Martins Santos",
    cargo: "Análise e Licenciamento de Edificações",
    registro: dados.crea || "CREA 11716/D-GO",
  };
  const dataGoiania = fmtDataLonga(dados.data);
  const ano = new Date().getFullYear().toString();
  const CW = A4_W - MARGINS.left - MARGINS.right;
  const nb = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const half = Math.floor(CW / 2);
  const quart = Math.floor(CW / 4);
  const brd = { top: nb, bottom: nb, left: nb, right: nb };
  const children: Paragraph[] = [];

  children.push(vazio(160));
  children.push(p([txt("Processo / Projeto:  "), txt(dados.processo, { bold: true })], { align: AlignmentType.LEFT, after: 80 }));
  children.push(p([txt("Interessado:  "), txt(dados.interessado, { bold: true })], { align: AlignmentType.LEFT, after: 80 }));
  children.push(p([txt("Assunto:  "), txt(dados.assunto || "APROVAÇÃO DE PROJETO", { bold: true })], { align: AlignmentType.LEFT, after: 200 }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200 }, children: [txt(`PARECER Nº   ${dados.numeroParecer || "___"}   |   ${ano}`, { bold: true, size: 22 })] }));
  children.push(p([txt("AO INTERESSADO/AUTOR")], { align: AlignmentType.LEFT, after: 120 }));
  children.push(p([txt("Versam os autos sobre a solicitação de "), txt("APROVAÇÃO DE PROJETO", { bold: true }), txt(`, para o imóvel situado à `), txt(dados.endereco || dados.processo, { bold: true }), txt(". O processo obteve as seguintes análises:")], { after: 100 }));
  dados.analises.filter(a => a.data && a.data !== "NP").forEach((a, i, arr) => {
    const ordinal = ["Primeira", "Segunda", "Terceira", "Quarta", "Quinta"][a.numero - 1] || `${a.numero}ª`;
    children.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 0, after: 50, line: 240 }, indent: { left: 440, hanging: 280 }, keepLines: true, keepNext: i < arr.length - 1, children: [txt("• ", { bold: true }), txt(`${ordinal} análise: `, { bold: true }), txt(`realizada em ${a.data}`), txt(a.despacho ? `, por meio do Despacho nº ${a.despacho}.` : ".")] }));
  });
  children.push(vazio(140));
  /* Decreto nº 2.531, de 1º/07/2024 (em vigor; seu Art. 17 revogou o 2.559/2018). Mapeamento
   * feito pelo texto oficial em 18/09/2026, autorizado pelo Fábio:
   *   indeferir: Art. 8º §4º II (2.559) → Art. 8º § 7º (2.531), "o processo será indeferido";
   *   recurso:   Art. 9º (2.559), 15 dias da publicação → Art. 9º (2.531), 15 dias ÚTEIS da EMISSÃO;
   *   arquivar:  Art. 4 inciso 4.5 (2.559) não tem equivalente → Art. 9º (2.531), Seção "Do Recurso".
   * Os modelos da chefia (INDEFERIMENTO/ARQUIVAMENTO regularização) ainda citam o 2.559. */
  children.push(p([txt("O Decreto nº 2.531, de 1º de julho de 2024, que revogou o Decreto nº 2.559, de 13 de dezembro de 2018, institui procedimentos administrativos para análise e aprovação de projetos arquitetônicos no âmbito do Município de Goiânia. Por não cumprimento ao exigido nos despachos anteriormente listados, essa Diretoria de Análise e Aprovação de Projetos "), txt("INDEFERE", { bold: true }), txt(" o prosseguimento dos autos, nos termos do Artigo 8º, § 7º do Decreto nº 2.531/2024.")], { after: 120 }));
  if (dados.naoConformes?.length) {
    children.push(vazio(80));
    children.push(p([txt("Motivos do indeferimento:", { bold: true })], { after: 60 }));
    dados.naoConformes.forEach((motivo, idx) => {
      children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { before: 0, after: 60, line: 260 }, indent: { left: 440, hanging: 280 }, keepLines: true, children: [txt(`${idx + 1}.  ${motivo}`, { size: 20 })] }));
    });
    children.push(vazio(80));
  }
  if (dados.observacoes) {
    children.push(p([txt("Observações: ", { bold: true }), txt(dados.observacoes)], { after: 100 }));
  }
  if (dados.fotos?.length) {
    children.push(vazio(80));
    children.push(p([txt("Documentação fotográfica anexa:", { bold: true })], { after: 100 }));
    for (const foto of dados.fotos) {
      const buffer = Buffer.from(foto.base64, "base64");
      const { width, height } = dimensoesImagem(buffer, foto.tipo);
      const larguraMax = 420;
      const escala = width > larguraMax ? larguraMax / width : 1;
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { before: 0, after: 40 },
        children: [new ImageRun({ data: buffer, transformation: { width: Math.round(width * escala), height: Math.round(height * escala) }, type: foto.tipo })],
      }));
      if (foto.legenda) {
        children.push(p([txt(foto.legenda, { italics: true, size: 18 })], { align: AlignmentType.CENTER, after: 160 }));
      }
    }
  }
  children.push(p([txt("Informamos que o interessado/autor poderá apresentar recurso ou justificativa em até "), txt("15 (quinze) dias úteis", { bold: true }), txt(", contados a partir da data de emissão deste parecer, conforme previsto no Artigo 9º do Decreto nº 2.531/2024. Em caso de recurso julgado improcedente, deverá ser solicitada a abertura de novo processo.")], { after: 160 }));
  children.push(p([txt("Sem nada mais no momento.")], { align: AlignmentType.LEFT, after: 60 }));
  children.push(vazio(200));

  blocoAssinaturaAnalista(assinante).forEach(par => children.push(par));
  if (dados.gerente) { blocoAssinaturaAnalista(dados.gerente).forEach(par => children.push(par)); }
  else { blocoLinhaEmBranco("Gerente").forEach(par => children.push(par)); }
  if (dados.diretora) { blocoAssinaturaAnalista(dados.diretora).forEach(par => children.push(par)); }
  else { blocoLinhaEmBranco("Diretor").forEach(par => children.push(par)); }
  children.push(vazio(120));
  children.push(new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [half, half], borders: { top: nb, bottom: nb, left: nb, right: nb, insideHorizontal: nb, insideVertical: nb }, rows: [new TableRow({ children: [new TableCell({ borders: brd, width: { size: half, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [txt(`Goiânia, ${dataGoiania}`)] })] }), new TableCell({ borders: brd, width: { size: half, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt("SEFIC / DIRAAP / GERAED")] })] })] })] }) as any);

  const doc = new Document({ styles: { default: { document: { run: { font: "Arial", size: 20 } } } }, sections: [{ properties: { page: { size: { width: A4_W, height: A4_H }, margin: MARGINS } }, headers: { default: makeHeader(logoData) }, footers: { default: makeFooter("Indeferimento") }, children }] });
  return await Packer.toBuffer(doc) as Buffer;
}
