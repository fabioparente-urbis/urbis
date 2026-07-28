/**
 * Teste de regressão da leitura da pasta do slot 5 (lib/lerPastaSlot5.ts).
 *
 *   npx tsx scripts/testar_leitura_pasta.mts "~/Desktop/SLOT 5"
 *
 * Roda a MESMA biblioteca que a rota /api/lip/ler-pasta usa, sem subir servidor e sem IA.
 * Referência atual da pasta de amostra: 45 campos, 13 conferências, 0 chamadas de IA.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { lerPastaSlot5, type ArquivoEntrada } from "../lib/lerPastaSlot5";

const raiz = process.argv[2].replace(/^~/, process.env.HOME!);
const entradas: ArquivoEntrada[] = [];
const push = (dir: string, rodada: number) => {
  for (const nome of fs.readdirSync(dir).sort()) {
    if (nome.startsWith(".")) continue;
    const full = path.join(dir, nome);
    if (fs.statSync(full).isFile()) {
      const buffer = new Uint8Array(fs.readFileSync(full));
      entradas.push({ nome, rodada, hash: crypto.createHash("sha256").update(buffer).digest("hex"), buffer });
    }
  }
};
push(raiz, 1);
fs.readdirSync(raiz).filter(n => !n.startsWith(".") && fs.statSync(path.join(raiz,n)).isDirectory()).sort()
  .forEach((s, i) => push(path.join(raiz, s), i + 2));

const r = await lerPastaSlot5(entradas);

console.log("── CATÁLOGO ──");
for (const it of r.catalogo) {
  console.log(`  [r${it.rodada}] ${it.nome.padEnd(38)} ${it.papeis.join("+").padEnd(28)} ${it.confianca.padEnd(6)} ${it.paginas}p ${it.dataDocumento ?? "sem data"}${it.revisao ? " "+it.revisao : ""}${it.soPresenca ? "  [só presença]" : ""}`);
}
console.log("\n── OBRIGATÓRIOS ──");
for (const o of r.obrigatorios) if (!o.presente) console.log(`  ✘ ${o.nome}`);
console.log("\n── CAMPOS DO LIP ──");
const porOrigem: Record<string, string[]> = {};
for (const [k, v] of Object.entries(r.campos)) (porOrigem[v.origem] ||= []).push(`${k.padEnd(36)} ${String(v.valor).padEnd(28)} ← ${v.fonte}`);
for (const o of ["lido","calculado","padrao"]) { console.log(` ${o.toUpperCase()} (${(porOrigem[o]||[]).length})`); (porOrigem[o]||[]).forEach(l=>console.log("   "+l)); }
console.log(`\n  TOTAL: ${Object.keys(r.campos).length} de 136 campos`);
console.log("\n── CONFERÊNCIAS ──");
const ic: any = { "CONFERE":"✔", "NÃO CONFERE":"✘", "ALERTA":"⚠", "SEM DADO":"?", "INFORMATIVO":"i" };
for (const c of r.conferencias) console.log(`  ${ic[c.estado]} [${c.estado}] ${c.nome}\n      ${c.detalhe}`);
const cnt = (e: string) => r.conferencias.filter((c) => c.estado === e).length;
console.log(`\n  ${cnt("CONFERE")} confere · ${cnt("NÃO CONFERE")} não confere · ${cnt("SEM DADO")} sem dado`);
console.log(`\n  custo: ${JSON.stringify(r.custo)}`);
