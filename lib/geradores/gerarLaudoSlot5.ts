/**
 * lib/geradores/gerarLaudoSlot5.ts — grava o Laudo do Slot 5 (.xlsx) a partir do LIP.
 *
 * Isolado do Slot 1: template próprio (`public/templates/laudo_slot5.xlsx`, aba `Laudo5`) e
 * cálculo próprio (`lib/mac-motor/slot5/laudoSlot5.ts`). Não importa `gerarLaudo.ts`.
 * O layout vem do laudo que o Fábio já assina; o template é regenerável por
 * `scripts/gerar_template_laudo_slot5.mts`.
 */

import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";
import { calcularLaudo, type DadosLipLaudo } from "@/lib/mac-motor/slot5/laudoSlot5";

export type EntradaLaudoSlot5 = {
  dados: DadosLipLaudo;
  /** "Nome\nCargo\nGerência\nPREFEITURA DE GOIÂNIA" — texto da assinatura (J145). */
  assinatura?: string;
  dataEmissao?: Date;
};

export async function gerarLaudoSlot5(entrada: EntradaLaudoSlot5): Promise<{ buffer: Buffer; avisos: string[] }> {
  const modelo = path.join(process.cwd(), "public", "templates", "laudo_slot5.xlsx");
  if (!fs.existsSync(modelo)) throw new Error("template do laudo do Slot 5 não encontrado (public/templates/laudo_slot5.xlsx)");

  const dataEmissao = entrada.dataEmissao ?? new Date();
  const { celulas, avisos } = calcularLaudo(entrada.dados, { dataEmissao });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(modelo);
  const ws = wb.getWorksheet("Laudo5");
  if (!ws) throw new Error('aba "Laudo5" não encontrada no template');

  for (const [coord, valor] of Object.entries(celulas)) {
    // "" apaga a célula — nunca deixa dado de outro processo nem um 0 que pareça resposta.
    ws.getCell(coord).value = coord === "M144" ? dataEmissao : valor === "" ? null : valor;
  }
  // Assinatura no mesmo destaque do laudo original: nome em negrito sublinhado, resto normal.
  if (entrada.assinatura) {
    const [nome, ...resto] = entrada.assinatura.split("\n");
    const base = { size: 8, name: "Calibri", family: 2 };
    ws.getCell("J145").value = {
      richText: [
        { text: nome, font: { ...base, bold: true, underline: true, color: { argb: "FF000000" } } },
        { text: resto.length ? "\n" + resto.join("\n") : "", font: { ...base, color: { argb: "FF000000" } } },
      ],
    };
    ws.getCell("J145").alignment = { wrapText: true, horizontal: "center", vertical: "middle" };
  }

  const out = await wb.xlsx.writeBuffer();
  return { buffer: Buffer.from(out as ArrayBuffer), avisos };
}
