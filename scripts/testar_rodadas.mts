/**
 * Teste da ordenação de rodadas (lib/rodadas.ts).
 *
 *   npx tsx scripts/testar_rodadas.mts
 *
 * O caso que motivou o arquivo: subpastas IRMÃS têm a mesma profundidade de caminho, e a versão
 * anterior dava rodada 2 para "Correção 01", "Correção 02" e "Correção 03". Não toca no banco.
 */
import { mapaDeRodadas, numeroNoNome, dataNoNome } from "../lib/rodadas";

let f = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "ok    " : "FALHA ") + m); if (!c) f++; };
const arq = (p: string, mod = 0) => ({ caminhoRelativo: p, nome: p.split("/").pop()!, modificadoEm: mod });

let r = mapaDeRodadas([
  arq("Proc/PROJETO.pdf"), arq("Proc/Correção 01/p.pdf"),
  arq("Proc/Correção 02/p.pdf"), arq("Proc/Correção 03/p.pdf"),
]);
ok(r.rodadaDoArquivo("Proc/PROJETO.pdf", "").rodada === 1, "raiz = rodada 1");
ok(r.rodadaDoArquivo("Proc/Correção 01/p.pdf", "").rodada === 2, "Correção 01 = rodada 2");
ok(r.rodadaDoArquivo("Proc/Correção 02/p.pdf", "").rodada === 3, "Correção 02 = rodada 3");
ok(r.rodadaDoArquivo("Proc/Correção 03/p.pdf", "").rodada === 4, "Correção 03 = rodada 4");
ok(!r.ambigua, "numeradas não são ambíguas");
ok(r.pastas[1].criterio === "numero-no-nome", "critério = número no nome");

r = mapaDeRodadas([arq("P/x.pdf"), arq("P/REV9/a.pdf"), arq("P/REV10/b.pdf")]);
ok(r.rodadaDoArquivo("P/REV9/a.pdf", "").rodada === 2 && r.rodadaDoArquivo("P/REV10/b.pdf", "").rodada === 3,
   "REV9 antes de REV10 (a ordem alfabética erraria)");

r = mapaDeRodadas([arq("P/x.pdf"), arq("P/2026-05-30/a.pdf"), arq("P/2026-04-30/b.pdf")]);
ok(r.rodadaDoArquivo("P/2026-04-30/b.pdf", "").rodada === 2, "data mais antiga = rodada 2");
ok(r.pastas[1].criterio === "data-no-nome", "critério = data no nome (mês não é confundido com nº)");

r = mapaDeRodadas([arq("P/x.pdf"), arq("P/depois/a.pdf", 2000), arq("P/antes/b.pdf", 1000)]);
ok(r.rodadaDoArquivo("P/antes/b.pdf", "").rodada === 2, "sem pista no nome, usa a data do arquivo");
ok(!r.ambigua, "data do arquivo resolve, não é ambíguo");

r = mapaDeRodadas([arq("P/x.pdf"), arq("P/correcao/a.pdf"), arq("P/anexos/b.pdf")]);
ok(r.ambigua, "sem número, sem data e sem mtime → AMBÍGUA (pergunta, não escolhe calado)");

r = mapaDeRodadas([arq("P/x.pdf"), arq("P/A/1.pdf"), arq("P/A/B/2.pdf")]);
ok(r.rodadaDoArquivo("P/A/B/2.pdf", "").rodada > r.rodadaDoArquivo("P/A/1.pdf", "").rodada,
   "aninhada mais profunda vem depois");

ok(numeroNoNome("Correção 02") === 2 && numeroNoNome("REV04") === 4 && numeroNoNome("3ª análise") === 3,
   "números no nome");
ok(numeroNoNome("2026") === null, "ano de 4 dígitos não é número de rodada");
ok(numeroNoNome("2026-05-30") === null, "data no nome não vira número de rodada");
ok(dataNoNome("ARQ.20260430.REV04") === Date.UTC(2026, 3, 30), "data compacta no nome");

console.log(f ? `\n${f} FALHA(S)` : "\ntodos passaram");
process.exit(f);
