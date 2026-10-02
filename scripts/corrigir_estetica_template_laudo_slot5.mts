/**
 * scripts/corrigir_estetica_template_laudo_slot5.mts — iguala a estética de public/templates/laudo_slot5.xlsx
 * à do laudo feito à mão pelo Fábio (.xls), célula a célula: fundo, bordas (estilo e cor) e negrito/cor da fonte.
 *
 * Por quê: o template veio de um arquivo com paleta de cores customizada ("indexed"); o exceljs grava o índice
 * mas não a paleta, e o Excel passou a pintar cinza como roxo e azul. Aqui as cores viram RGB explícito.
 *
 *   npx tsx scripts/corrigir_estetica_template_laudo_slot5.mts "<LAUDO ... .xls feito à mão>"
 */
import ExcelJS from "exceljs";
import { lerXls } from "./ler_xls_estilos.mjs";

const origem = process.argv[2];
if (!origem) { console.error("passe o caminho do .xls feito à mão"); process.exit(1); }
const ler = lerXls(origem);

const ESTILO: Record<number, ExcelJS.BorderStyle | undefined> = {
  0: undefined, 1: "thin", 2: "medium", 3: "dashed", 4: "dotted", 5: "thick", 6: "double", 7: "hair",
  8: "mediumDashed", 9: "dashDot", 10: "mediumDashDot", 11: "dashDotDot", 12: "mediumDashDotDot", 13: "slantDashDot",
};

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile("public/templates/laudo_slot5.xlsx");
const ws = wb.getWorksheet("Laudo5")!;

let tocadas = 0;
for (let r = 1; r <= 152; r++) for (let c = 1; c <= 38; c++) {
  const x = ler(r, c); if (!x) continue;
  const cel = ws.getCell(r, c);
  cel.fill = x.fill && !x.fill.startsWith("~")
    ? { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + x.fill } }
    : { type: "pattern", pattern: "none" } as ExcelJS.Fill;
  const borda: any = {};
  for (const lado of ["left", "right", "top", "bottom"] as const) {
    const est = ESTILO[(x.bordaEst as any)[lado]];
    if (est) borda[lado] = { style: est, color: { argb: "FF" + ((x.bordaCor as any)[lado] ?? "000000") } };
  }
  cel.border = borda;
  cel.font = { ...(cel.font ?? {}), bold: !!x.bold, color: { argb: "FF" + (x.fontColor ?? "000000") } };
  tocadas++;
}
// Comentário vazio em D6: o Excel o desenha como uma caixa grande com ícone de alerta por cima do laudo.
const d6: any = ws.getCell("D6"); d6.note = undefined; delete d6._comment; delete d6._value.model.comment;
await wb.xlsx.writeFile("public/templates/laudo_slot5.xlsx");
console.log("estética igualada em", tocadas, "células");
