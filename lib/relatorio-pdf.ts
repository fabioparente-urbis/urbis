import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from "pdf-lib";
import * as fs from "fs";
import * as path from "path";

export interface ConfigRelatorio {
  titulo: string;
  subtitulo?: string;
  analista: string;
  periodo: string;
  geradoPor: string;
  conteudo: SecaoRelatorio[];
}

export interface SecaoRelatorio {
  titulo: string;
  linhas: LinhaRelatorio[];
}

export interface LinhaRelatorio {
  colunas: string[];
}

export async function gerarRelatorioPDF(config: ConfigRelatorio): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold    = await doc.embedFont(StandardFonts.HelveticaBold);

  // Logo URBIS como marca d'água
  let logoImage: any = null;
  try {
    const logoPath = path.join(process.cwd(), "public", "logo_urbis.png");
    const logoBytes = fs.readFileSync(logoPath);
    logoImage = await doc.embedPng(logoBytes);
  } catch {}

  const A4_W = 595;
  const A4_H = 842;
  const MARGIN = 50;
  const COR_PRIMARIA = rgb(0.18, 0.27, 0.47); // azul institucional
  const COR_CINZA    = rgb(0.4, 0.4, 0.4);
  const COR_LINHA    = rgb(0.85, 0.85, 0.85);

  let page = doc.addPage([A4_W, A4_H]);
  let y = A4_H - MARGIN;

  function novaPage() {
    page = doc.addPage([A4_W, A4_H]);
    y = A4_H - MARGIN;
    desenharMarcaDagua(page);
    desenharRodape(page);
  }

  function desenharMarcaDagua(p: PDFPage) {
    if (!logoImage) return;
    const dims = logoImage.scale(1);
    const maxW = A4_W * 0.55;
    const scale = maxW / dims.width;
    const w = dims.width * scale;
    const h = dims.height * scale;
    p.drawImage(logoImage, {
      x: (A4_W - w) / 2,
      y: (A4_H - h) / 2,
      width: w,
      height: h,
      opacity: 0.07,
    });
  }

  function desenharRodape(p: PDFPage) {
    p.drawLine({
      start: { x: MARGIN, y: 35 },
      end:   { x: A4_W - MARGIN, y: 35 },
      thickness: 0.5,
      color: COR_LINHA,
    });
    p.drawText("URBIS — Sistema de Análise de Projetos · Prefeitura de Goiânia", {
      x: MARGIN, y: 22, size: 7, font: fontRegular, color: COR_CINZA,
    });
    p.drawText(`Documento gerado automaticamente em ${new Date().toLocaleString("pt-BR")}`, {
      x: MARGIN, y: 12, size: 7, font: fontRegular, color: COR_CINZA,
    });
  }

  function checkY(needed = 20) {
    if (y - needed < 80) novaPage();
  }

  // ── Marca d'água e rodapé na primeira página
  desenharMarcaDagua(page);
  desenharRodape(page);

  // ── Cabeçalho institucional
  // Logo prefeitura
  try {
    const prefPath = path.join(process.cwd(), "public", "logo_prefeitura.png");
    const prefBytes = fs.readFileSync(prefPath);
    const prefImg = await doc.embedPng(prefBytes);
    const prefDims = prefImg.scale(1);
    const prefH = 45;
    const prefW = (prefDims.width / prefDims.height) * prefH;
    page.drawImage(prefImg, { x: MARGIN, y: y - prefH, width: prefW, height: prefH, opacity: 1 });
  } catch {}

  // Texto institucional
  page.drawText("PREFEITURA DE GOIÂNIA", {
    x: MARGIN + 60, y: y - 12, size: 9, font: fontBold, color: COR_PRIMARIA,
  });
  page.drawText("Secretaria Municipal de Planejamento e Habitação", {
    x: MARGIN + 60, y: y - 24, size: 8, font: fontRegular, color: COR_CINZA,
  });
  page.drawText("Diretoria de Análise de Projetos — DIRAAP", {
    x: MARGIN + 60, y: y - 35, size: 8, font: fontRegular, color: COR_CINZA,
  });

  y -= 60;

  // Linha separadora
  page.drawLine({
    start: { x: MARGIN, y }, end: { x: A4_W - MARGIN, y },
    thickness: 1.5, color: COR_PRIMARIA,
  });
  y -= 20;

  // ── Título do relatório
  page.drawText(config.titulo.toUpperCase(), {
    x: MARGIN, y, size: 14, font: fontBold, color: COR_PRIMARIA,
  });
  y -= 18;

  if (config.subtitulo) {
    page.drawText(config.subtitulo, {
      x: MARGIN, y, size: 10, font: fontRegular, color: COR_CINZA,
    });
    y -= 14;
  }

  // ── Metadados
  const dataAtual = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
  const metaDados = [
    `Goiânia, ${dataAtual}`,
    `Analista: ${config.analista}`,
    `Período: ${config.periodo}`,
    `Gerado por: ${config.geradoPor}`,
  ];
  y -= 5;
  for (const m of metaDados) {
    page.drawText(m, { x: MARGIN, y, size: 9, font: fontRegular, color: COR_CINZA });
    y -= 13;
  }
  y -= 10;

  page.drawLine({
    start: { x: MARGIN, y }, end: { x: A4_W - MARGIN, y },
    thickness: 0.5, color: COR_LINHA,
  });
  y -= 20;

  // ── Seções de conteúdo
  for (const secao of config.conteudo) {
    checkY(40);

    // Título da seção
    page.drawRectangle({
      x: MARGIN, y: y - 4, width: A4_W - MARGIN * 2, height: 18,
      color: rgb(0.93, 0.95, 0.98),
    });
    page.drawText(secao.titulo.toUpperCase(), {
      x: MARGIN + 6, y: y + 1, size: 9, font: fontBold, color: COR_PRIMARIA,
    });
    y -= 22;

    // Linhas
    let par = false;
    for (const linha of secao.linhas) {
      checkY(16);
      if (par) {
        page.drawRectangle({
          x: MARGIN, y: y - 3, width: A4_W - MARGIN * 2, height: 14,
          color: rgb(0.97, 0.97, 0.97),
        });
      }
      const colW = (A4_W - MARGIN * 2) / linha.colunas.length;
      linha.colunas.forEach((col, i) => {
        page.drawText(col || "—", {
          x: MARGIN + 4 + i * colW, y, size: 8, font: fontRegular,
          color: rgb(0.2, 0.2, 0.2),
          maxWidth: colW - 8,
        });
      });
      y -= 15;
      par = !par;
    }
    y -= 10;
  }

  // ── Assinatura (busca diretora dinamicamente — passada no config)
  checkY(80);
  y -= 20;
  const xAssin = A4_W / 2 - 80;
  page.drawLine({
    start: { x: xAssin, y }, end: { x: xAssin + 160, y },
    thickness: 0.8, color: rgb(0.3, 0.3, 0.3),
  });
  y -= 12;
  page.drawText(config.geradoPor, {
    x: xAssin + 80 - (config.geradoPor.length * 2.5), y,
    size: 9, font: fontBold, color: rgb(0.2, 0.2, 0.2),
  });
  y -= 12;
  page.drawText("Diretora — DIRAAP", {
    x: xAssin + 80 - 40, y,
    size: 8, font: fontRegular, color: COR_CINZA,
  });
  y -= 10;
  page.drawText("Diretoria de Análise de Projetos · Prefeitura de Goiânia", {
    x: xAssin + 80 - 70, y,
    size: 7, font: fontRegular, color: COR_CINZA,
  });

  return doc.save();
}
