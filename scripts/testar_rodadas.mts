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

/* Pasta dentro de pasta de rodada é ORGANIZAÇÃO, não rodada nova (regra do Fábio, 17/08/2026).
 * O teste anterior afirmava o contrário — foi ele que deixou passar o processo 50724, onde três
 * pastas reais viraram seis rodadas e as duas pastas temáticas de dentro "venceram" a vigência. */
r = mapaDeRodadas([arq("P/x.pdf"), arq("P/A/1.pdf"), arq("P/A/B/2.pdf")]);
ok(r.rodadaDoArquivo("P/A/B/2.pdf", "").rodada === r.rodadaDoArquivo("P/A/1.pdf", "").rodada,
   "subpasta de subpasta HERDA a rodada, não cria outra");
ok(r.pastas.length === 2, "P/A/B não vira pasta de rodada própria");

r = mapaDeRodadas([
  arq("50724/Anexados pela Prefeitura/a.pdf"),
  arq("50724/Anexados pelo interessado/REQ.pdf"),
  arq("50724/Anexados pelo interessado/COMAER/c.pdf"),
  arq("50724/Anexados pelo interessado/CERTIDAO DE CORREDOR/d.pdf"),
  arq("50724/Arquivos Iniciais/e.pdf"),
]);
ok(r.pastas.length === 4, "50724: três pastas de rodada + raiz (antes davam seis)");
ok(r.rodadaDoArquivo("50724/Anexados pelo interessado/COMAER/c.pdf", "").rodada ===
   r.rodadaDoArquivo("50724/Anexados pelo interessado/REQ.pdf", "").rodada,
   "50724: COMAER está na mesma rodada do REQ que o acompanha");
ok(r.rodadaDoArquivo("50724/Arquivos Iniciais/e.pdf", "").rodada <
   r.rodadaDoArquivo("50724/Anexados pelo interessado/REQ.pdf", "").rodada,
   "50724: 'Arquivos Iniciais' não pode vencer a vigência das correções");
ok(r.ambigua, "50724: ordem das demais segue ambígua — pergunta, não escolhe calado");

ok(numeroNoNome("Correção 02") === 2 && numeroNoNome("REV04") === 4 && numeroNoNome("3ª análise") === 3,
   "números no nome");
ok(numeroNoNome("2026") === null, "ano de 4 dígitos não é número de rodada");
ok(numeroNoNome("2026-05-30") === null, "data no nome não vira número de rodada");
ok(dataNoNome("ARQ.20260430.REV04") === Date.UTC(2026, 3, 30), "data compacta no nome");

console.log(f ? `\n${f} FALHA(S)` : "\ntodos passaram");
process.exit(f);
