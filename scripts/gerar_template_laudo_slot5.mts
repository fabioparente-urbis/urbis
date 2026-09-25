/**
 * scripts/gerar_template_laudo_slot5.mts — monta public/templates/laudo_slot5.xlsx.
 *
 * Uso (rodar uma vez, ou quando o Fábio mudar o layout do laudo dele):
 *   npx tsx scripts/gerar_template_laudo_slot5.mts "<caminho do LAUDO...xlsm de um processo pronto>"
 *
 * Parte de um laudo já finalizado (só valores, layout intacto) e esvazia as células que são
 * do PROCESSO — para nenhum dado de outro processo vazar para o laudo novo. Tudo que é rótulo,
 * constante da lei e formatação fica como está. Os botões de macro do Excel (formas fora da
 * área de impressão B2:N152) não sobrevivem, e o arquivo sai como .xlsx (sem VBA).
 */
import ExcelJS from "exceljs";
import { calcularLaudo } from "../lib/mac-motor/slot5/laudoSlot5";

const origem = process.argv[2];
if (!origem) { console.error("passe o caminho do laudo .xlsm de origem"); process.exit(1); }

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(origem);
const ws = wb.getWorksheet("Laudo5");
if (!ws) throw new Error('aba "Laudo5" não encontrada');

// 1) toda célula que o gerador escreve
const escritas = new Set(Object.keys(calcularLaudo({}, { dataEmissao: new Date() }).celulas));
// 2) digitadas à mão a cada processo, sem campo no LIP
for (const c of ["I58","J58","K58","L58","I59","J59","K59","L59","H58","H59"]) escritas.add(c);
escritas.add("J145");

for (const coord of escritas) ws.getCell(coord).value = null;
ws.getCell("D6").note = undefined as any;   // comentário encadeado do Excel, sem serventia aqui

await wb.xlsx.writeFile("public/templates/laudo_slot5.xlsx");
console.log("template gravado —", escritas.size, "células esvaziadas");
