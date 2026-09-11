/**
 * scripts/carga_acervo.mts — Fase 10 do plano de leitura de PDF
 * (`docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md` §3.3, Rotina C): "carga do acervo" — fatia em
 * lote processos JÁ ARQUIVADOS pra reconstruir a jornada de cada um (setor, data, ordem) e grava
 * em `fluxo_processo_eventos` (migration `2026_09_11_fluxo_processo_eventos.sql`).
 *
 * ZERO IA, ZERO REDE no fatiamento — mesmo motor determinístico da Fase 0
 * (`lib/documentosSei/fatiar.ts`). Só a gravação em `--aplicar` toca o banco, e só na tabela nova
 * e isolada — nunca em `processos`/`mac_*`/`mhd_*`.
 *
 *   npx tsx --env-file=.env.local scripts/carga_acervo.mts --lista arquivos.txt              (simulação)
 *   npx tsx --env-file=.env.local scripts/carga_acervo.mts --lista arquivos.txt --aplicar     (grava)
 *
 * `arquivos.txt`: um caminho de PDF por linha (evita ter que escapar espaço/acento na linha de
 * comando — os nomes reais de pasta do acervo têm os dois).
 */
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { fatiarPdfSei } from "../lib/documentosSei/fatiar";

const APLICAR = process.argv.includes("--aplicar");
const idxLista = process.argv.indexOf("--lista");
if (idxLista === -1 || !process.argv[idxLista + 1]) {
  console.error("Uso: npx tsx --env-file=.env.local scripts/carga_acervo.mts --lista arquivos.txt [--aplicar]");
  process.exit(1);
}
const arquivos = (await readFile(process.argv[idxLista + 1], "utf8"))
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);

const sb = APLICAR
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  : null;

type ResumoProcesso = {
  arquivo: string;
  processo: string;
  totalPaginas: number;
  totalEventos: number;
  semSetor: number;
  semAssinante: number;
  semData: number;
  paginasRevisao: number;
  gravados: number;
  erroGravacao?: string;
};

const resumos: ResumoProcesso[] = [];

for (const arquivo of arquivos) {
  process.stdout.write(`Lendo ${arquivo}... `);
  let buffer: Uint8Array;
  try {
    buffer = new Uint8Array(await readFile(arquivo));
  } catch (e) {
    console.log(`ERRO ao abrir: ${(e as Error).message}`);
    continue;
  }

  const { resultado } = await fatiarPdfSei(buffer);
  console.log(`ok — processo ${resultado.numeroProcesso}, ${resultado.eventos.length} documentos`);

  const resumo: ResumoProcesso = {
    arquivo,
    processo: resultado.numeroProcesso,
    totalPaginas: resultado.totalPaginas,
    totalEventos: resultado.eventos.length,
    semSetor: resultado.eventos.filter((e) => !e.setor).length,
    semAssinante: resultado.eventos.filter((e) => !e.assinante).length,
    semData: resultado.eventos.filter((e) => !e.data).length,
    paginasRevisao: resultado.paginasRevisao.length,
    gravados: 0,
  };

  if (APLICAR && resultado.numeroProcesso) {
    const linhas = resultado.eventos.map((e) => ({
      processo_codigo: resultado.numeroProcesso,
      id_sei: e.idSei,
      titulo: e.titulo,
      pagina_ini: e.paginaIni,
      pagina_fim: e.paginaFim,
      setor: e.setor ?? null,
      assinante: e.assinante ?? null,
      data_documento: e.data ?? null,
      papel_conteudo: e.papelPorConteudo ?? null,
      origem: "carga_acervo",
      arquivo_origem: arquivo,
    }));
    const { error, count } = await sb!
      .from("fluxo_processo_eventos")
      .upsert(linhas, { onConflict: "processo_codigo,id_sei,pagina_ini", count: "exact" });
    if (error) resumo.erroGravacao = error.message;
    else resumo.gravados = count ?? linhas.length;
  }

  resumos.push(resumo);
}

console.log(`\n=== RESUMO (${APLICAR ? "GRAVADO" : "SIMULAÇÃO — nada foi gravado"}) ===`);
let totalPaginas = 0, totalEventos = 0, totalGravados = 0, comErro = 0;
for (const r of resumos) {
  totalPaginas += r.totalPaginas;
  totalEventos += r.totalEventos;
  totalGravados += r.gravados;
  if (r.erroGravacao) comErro++;
  console.log(
    `${r.processo || "(processo não identificado)"}  ${r.totalEventos} docs, ${r.totalPaginas} pág.` +
      (r.paginasRevisao ? `, ${r.paginasRevisao} em revisão` : "") +
      (APLICAR ? (r.erroGravacao ? `  ERRO: ${r.erroGravacao}` : `  gravados: ${r.gravados}`) : ""),
  );
}
console.log(
  `\nTotal: ${resumos.length} processo(s), ${totalPaginas} páginas, ${totalEventos} documentos identificados.`,
);
if (APLICAR) console.log(`Gravados: ${totalGravados}. Erros: ${comErro}.`);
else console.log("Rode com --aplicar para gravar em fluxo_processo_eventos.");
