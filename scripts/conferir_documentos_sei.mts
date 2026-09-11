/**
 * scripts/conferir_documentos_sei.mts — relatório de conferência do Organizador de PDF SEI
 * (plano Documentos Vivos, docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md).
 *
 * Existe para tornar BARATOS os portões humanos das Fases 1 e 3, que hoje são a maior parte do que
 * falta no projeto (§12) e exigem conferir processo por processo. Em vez de clicar pela tela, o
 * analista roda isto sobre os PDFs reais e confere UMA tabela por processo.
 *
 *   npx tsx scripts/conferir_documentos_sei.mts caminho/para/processo1.pdf [processo2.pdf ...]
 *
 * NÃO toca no banco, não grava nada, não chama IA, não precisa de sessão nem de .env — roda
 * inteiramente sobre o arquivo local. É seguro rodar em cima de qualquer PDF do SEI.
 *
 * O QUE CONFERIR EM CADA SAÍDA:
 * - Fase 1 (§6): a coluna Nº SEI + Título + páginas bate com a árvore do processo no SEI? As
 *   páginas listadas em REVISÃO são mesmo as difíceis (miolo de desenho, digitalização), ou algum
 *   documento inteiro saiu errado?
 * - Fase 3 (§6): a taxa de classificação sai MEDIDA no rodapé. As peças achadas dentro dos
 *   contêineres têm o papel certo?
 * - Fase 4 (§6): a coluna Estado marca "sem efeito" onde deve, e nenhum documento superado
 *   aparece como vigente?
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fatiarPdfSei, lerPaginasIntervalo } from "../lib/documentosSei/fatiar";
import { ehContainerGenerico, abrirContainer, ROTULO_PAPEL_PECA } from "../lib/documentosSei/pecas";
import { resolverEstados } from "../lib/documentosSei/motorVersoes";

const MOTIVO_LEGIVEL: Record<string, string> = {
  sem_rodape_sem_continuidade: "sem rodapé legível e sem continuidade",
  processo_divergente: "rodapé de OUTRO processo",
  pagina_rodape_diverge: "rodapé diz outra página",
};

function corta(s: string, n: number): string {
  return s.length <= n ? s.padEnd(n) : s.slice(0, n - 1) + "…";
}

async function conferir(caminho: string): Promise<void> {
  const nome = basename(caminho);
  console.log(`\n${"═".repeat(100)}\n▶  ${nome}\n${"═".repeat(100)}`);

  const buffer = new Uint8Array(readFileSync(caminho));
  const { resultado, leitor } = await fatiarPdfSei(buffer);
  const estados = new Map(resolverEstados(resultado.eventos).map((r) => [r.idSei, r]));

  console.log(`Processo: ${resultado.numeroProcesso || "(não identificado)"} · ${resultado.totalPaginas} páginas · ${resultado.eventos.length} eventos\n`);
  console.log("  PÁGINAS   Nº SEI      ESTADO        TÍTULO                                    DEPARTAMENTO");
  console.log("  " + "─".repeat(96));

  let paginasContainer = 0;
  let paginasClassificadas = 0;

  for (const ev of resultado.eventos) {
    const faixa = ev.paginaIni === ev.paginaFim ? `${ev.paginaIni}` : `${ev.paginaIni}-${ev.paginaFim}`;
    const est = estados.get(ev.idSei);
    const marca = est?.estado === "sem_efeito" ? "⛔" : est?.estado === "vigente" ? "✓ " : "  ";
    console.log(
      `  ${corta(faixa, 9)} ${corta(ev.idSei, 11)} ${marca}${corta(est?.estado ?? "-", 12)} ${corta(ev.titulo, 41)} ${corta(ev.setor ?? "—", 20)}`,
    );

    if (!ehContainerGenerico(ev.titulo)) continue;
    const paginas = await lerPaginasIntervalo(leitor, ev.paginaIni, ev.paginaFim);
    const pecas = await abrirContainer(paginas);
    paginasContainer += paginas.length;
    for (const p of pecas) {
      const n = p.paginaFim - p.paginaIni + 1;
      if (p.papel !== "classificacao_pendente") paginasClassificadas += n;
      const faixaP = p.paginaIni === p.paginaFim ? `${p.paginaIni}` : `${p.paginaIni}-${p.paginaFim}`;
      const sinal = p.papel === "classificacao_pendente" ? "?" : "└";
      console.log(`    ${sinal} ${corta(faixaP, 9)} ${corta(ROTULO_PAPEL_PECA[p.papel], 32)} (${n} pág., confiança ${p.confianca})`);
    }
  }

  console.log("\n  ── PÁGINAS EM REVISÃO " + "─".repeat(74));
  if (resultado.paginasRevisao.length === 0) {
    console.log("  nenhuma — todas as páginas entraram em algum evento.");
  } else {
    const porMotivo = new Map<string, number[]>();
    for (const p of resultado.paginasRevisao) {
      const lista = porMotivo.get(p.motivo) ?? [];
      lista.push(p.pagina);
      porMotivo.set(p.motivo, lista);
    }
    for (const [motivo, pgs] of porMotivo) {
      console.log(`  ${pgs.length} pág. — ${MOTIVO_LEGIVEL[motivo] ?? motivo}: ${pgs.join(", ")}`);
    }
  }

  const emEventos = resultado.eventos.reduce((s, e) => s + (e.paginaFim - e.paginaIni + 1), 0);
  console.log("\n  ── CONTAGEM " + "─".repeat(84));
  console.log(`  ${emEventos} em eventos + ${resultado.paginasRevisao.length} em revisão = ${emEventos + resultado.paginasRevisao.length} de ${resultado.totalPaginas} · soma fechada: ${emEventos + resultado.paginasRevisao.length === resultado.totalPaginas ? "SIM" : "NÃO"}`);
  if (paginasContainer > 0) {
    const taxa = ((paginasClassificadas / paginasContainer) * 100).toFixed(1);
    console.log(`  Fase 3 — dentro de contêineres: ${paginasClassificadas}/${paginasContainer} páginas classificadas (${taxa}%), ${paginasContainer - paginasClassificadas} pendentes`);
  } else {
    console.log("  Fase 3 — nenhum evento-contêiner neste processo.");
  }
}

async function principal(): Promise<void> {
  const caminhos = process.argv.slice(2);
  if (caminhos.length === 0) {
    console.error("uso: npx tsx scripts/conferir_documentos_sei.mts <arquivo.pdf> [outro.pdf ...]");
    process.exit(1);
  }
  for (const c of caminhos) {
    try {
      await conferir(c);
    } catch (e: any) {
      // um PDF problemático nunca interrompe a conferência dos outros
      console.error(`\n✗ ${basename(c)}: ${e?.message ?? e}`);
    }
  }
  console.log("\nNada foi gravado — este script só lê.\n");
}

void principal();
