/**
 * scripts/fase0_medir_fatiador.mts — Fase 0 do plano de leitura de PDF
 * (`docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md` §6): "Taxa de acerto atual do fatiador nos
 * processos reais: quantos documentos identifica, quantos ficam pendentes, quantas vezes
 * departamento/assinante/data saem vazios."
 *
 * Roda `fatiarPdfSei` (lib/documentosSei/fatiar.ts) — determinístico, ZERO IA, ZERO REDE — contra
 * PDFs reais de processo, fora do navegador. Não grava nada, não chama Gemini, não gasta um
 * centavo: é só o mesmo código que já roda no navegador do analista, com relatório no terminal.
 *
 *   npx tsx scripts/fase0_medir_fatiador.mts "/caminho/para/o.pdf" ["/outro.pdf" ...]
 *   npx tsx scripts/fase0_medir_fatiador.mts --detalhe "/caminho/para/o.pdf"   (lista cada evento)
 *
 * `--detalhe` serve para conferir contra um gabarito humano — processo já organizado manualmente
 * em arquivos separados por ID SEI no nome (achado real: 09/09/2026, comparação contra o processo
 * 24.5.000024350-0 bateu ID SEI exato em 9 de 10 documentos; o único "erro" nem foi de página, foi
 * de classificação de conteúdo — ver OBS COD).
 */
import { readFile } from "node:fs/promises";
import { fatiarPdfSei, type ResultadoFatiamento } from "../lib/documentosSei/fatiar";

const detalhe = process.argv.includes("--detalhe");
const arquivos = process.argv.slice(2).filter((a) => a !== "--detalhe");
if (arquivos.length === 0) {
  console.error("Uso: npx tsx scripts/fase0_medir_fatiador.mts [--detalhe] <arquivo1.pdf> [arquivo2.pdf ...]");
  process.exit(1);
}

type Relatorio = {
  arquivo: string;
  totalPaginas: number;
  totalEventos: number;
  semSetor: number;
  semAssinante: number;
  semData: number;
  herdadosPorContinuidade: number;
  paginasRevisao: number;
  motivosRevisao: Record<string, number>;
};

function medir(arquivo: string, r: ResultadoFatiamento): Relatorio {
  const motivosRevisao: Record<string, number> = {};
  for (const p of r.paginasRevisao) motivosRevisao[p.motivo] = (motivosRevisao[p.motivo] ?? 0) + 1;
  return {
    arquivo,
    totalPaginas: r.totalPaginas,
    totalEventos: r.eventos.length,
    semSetor: r.eventos.filter((e) => !e.setor).length,
    semAssinante: r.eventos.filter((e) => !e.assinante).length,
    semData: r.eventos.filter((e) => !e.data).length,
    herdadosPorContinuidade: r.eventos.filter((e) => e.titulo === "(herdado por continuidade)").length,
    paginasRevisao: r.paginasRevisao.length,
    motivosRevisao,
  };
}

function imprimir(rel: Relatorio) {
  const pct = (n: number, base: number) => (base === 0 ? "—" : `${((n / base) * 100).toFixed(0)}%`);
  console.log(`\n=== ${rel.arquivo} ===`);
  console.log(`Páginas: ${rel.totalPaginas} | Documentos (eventos) identificados: ${rel.totalEventos}`);
  console.log(`  sem setor:      ${rel.semSetor}/${rel.totalEventos} (${pct(rel.semSetor, rel.totalEventos)})`);
  console.log(`  sem assinante:  ${rel.semAssinante}/${rel.totalEventos} (${pct(rel.semAssinante, rel.totalEventos)})`);
  console.log(`  sem data:       ${rel.semData}/${rel.totalEventos} (${pct(rel.semData, rel.totalEventos)})`);
  console.log(`  título só por continuidade (sem carimbo próprio): ${rel.herdadosPorContinuidade}/${rel.totalEventos} (${pct(rel.herdadosPorContinuidade, rel.totalEventos)})`);
  console.log(`Páginas em revisão (não entraram em documento nenhum): ${rel.paginasRevisao}/${rel.totalPaginas} (${pct(rel.paginasRevisao, rel.totalPaginas)})`);
  const motivos = Object.entries(rel.motivosRevisao).sort((a, b) => b[1] - a[1]);
  for (const [motivo, n] of motivos) console.log(`    ${motivo}: ${n}`);
}

const relatorios: Relatorio[] = [];
for (const arquivo of arquivos) {
  console.log(`\nLendo ${arquivo}...`);
  const buffer = new Uint8Array(await readFile(arquivo));
  const t0 = Date.now();
  try {
    const { resultado } = await fatiarPdfSei(buffer);
    console.log(`  ok em ${((Date.now() - t0) / 1000).toFixed(1)}s — processo ${resultado.numeroProcesso}`);
    if (detalhe) {
      for (const e of resultado.eventos) {
        console.log(`  ${e.idSei.padStart(9)}  pg ${String(e.paginaIni).padStart(3)}-${String(e.paginaFim).padStart(3)}  ${e.titulo}${e.setor ? " | setor: " + e.setor : ""}${e.papelPorConteudo ? " | conteudo:" + e.papelPorConteudo : ""}`);
      }
    }
    const rel = medir(arquivo, resultado);
    relatorios.push(rel);
    imprimir(rel);
  } catch (e: any) {
    console.error(`  ❌ FALHOU: ${e?.message ?? e}`);
  }
}

if (relatorios.length > 1) {
  console.log("\n\n=== RESUMO — ordenado por frequência de erro (§6 do plano) ===");
  const totalEventos = relatorios.reduce((s, r) => s + r.totalEventos, 0);
  const totalPaginas = relatorios.reduce((s, r) => s + r.totalPaginas, 0);
  const somaSemSetor = relatorios.reduce((s, r) => s + r.semSetor, 0);
  const somaSemAssinante = relatorios.reduce((s, r) => s + r.semAssinante, 0);
  const somaSemData = relatorios.reduce((s, r) => s + r.semData, 0);
  const somaRevisao = relatorios.reduce((s, r) => s + r.paginasRevisao, 0);
  const motivosTotais: Record<string, number> = {};
  for (const r of relatorios) for (const [m, n] of Object.entries(r.motivosRevisao)) motivosTotais[m] = (motivosTotais[m] ?? 0) + n;
  const linhas = [
    { rotulo: "sem setor", n: somaSemSetor, base: totalEventos },
    { rotulo: "sem assinante", n: somaSemAssinante, base: totalEventos },
    { rotulo: "sem data", n: somaSemData, base: totalEventos },
    { rotulo: "página em revisão (não virou documento)", n: somaRevisao, base: totalPaginas },
    ...Object.entries(motivosTotais).map(([m, n]) => ({ rotulo: `  ↳ motivo: ${m}`, n, base: somaRevisao })),
  ].sort((a, b) => b.n - a.n);
  for (const l of linhas) {
    const pct = l.base === 0 ? "—" : `${((l.n / l.base) * 100).toFixed(0)}%`;
    console.log(`${String(l.n).padStart(4)}  ${pct.padStart(5)}  ${l.rotulo}`);
  }
  console.log(`\nTotal: ${relatorios.length} processo(s), ${totalPaginas} páginas, ${totalEventos} documentos identificados.`);
}
