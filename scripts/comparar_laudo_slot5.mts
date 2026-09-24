/**
 * scripts/comparar_laudo_slot5.mts — compara um laudo gerado pelo URBIS com o que o analista
 * fez à mão (mesmo processo). Lista célula a célula o que diverge; nada é "corrigido" aqui —
 * cada divergência é decisão do analista (LIP desatualizado? erro de mapa? ajuste manual?).
 *
 *   npx tsx scripts/comparar_laudo_slot5.mts <gerado.xlsx> <feito_a_mao.xlsm|xlsx>
 */
import ExcelJS from "exceljs";
import { parseNumeroBR } from "../lib/mac-motor/slot5/util";

const [, , gerado, manual] = process.argv;
if (!gerado || !manual) { console.error("uso: <gerado> <feito_a_mao>"); process.exit(1); }

const ler = async (f: string) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(f); return wb.getWorksheet("Laudo5")!; };
const [a, b] = [await ler(gerado), await ler(manual)];

const bruto = (v: any) => { if (v && typeof v === "object" && "result" in v) v = v.result; if (v instanceof Date) return v.toISOString().slice(0, 10); return v ?? ""; };
const num = (v: any) => typeof v === "number" ? v : (typeof v === "string" && /^[\d.,]+$/.test(v.trim()) ? (v.includes(",") ? parseNumeroBR(v) : Number(v)) : null);

let iguais = 0; const difs: string[] = [];
for (let r = 1; r <= 152; r++) for (let c = 1; c <= 38; c++) {
  const cel = a.getCell(r, c);
  if (cel.isMerged && cel.master.address !== cel.address) continue;   // escrava de mesclagem repete o valor da âncora
  const g = bruto(cel.value), m = bruto(b.getCell(r, c).value);
  if (g === "" && m === "") continue;
  const gn = num(g), mn = num(m);
  const ok = gn !== null && mn !== null ? Math.abs(gn - mn) < 1e-6 : String(g).trim() === String(m).trim();
  const coord = a.getCell(r, c).address;
  if (ok) iguais++; else difs.push(`${coord.padEnd(5)} gerado=${JSON.stringify(g).slice(0, 45).padEnd(48)} feito à mão=${JSON.stringify(m).slice(0, 45)}`);
}
console.log(`células iguais: ${iguais} · divergentes: ${difs.length}\n`);
console.log(difs.join("\n"));
