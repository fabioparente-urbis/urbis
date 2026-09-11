/**
 * lib/documentosSei/exportarPecas.ts — Fase 6 do fatiador
 * (docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md §6). Exporta UM item já corrigido pelo analista
 * (`ItemFatiado`) como PDF avulso, com o nome de arquivo no padrão que o Fábio já usa manualmente
 * (decisão da Fase 5, §7.3): `{PAPEL OU TIPO} {Nº SEI}.pdf`.
 *
 * Reaproveita `nomeArquivoAnalista`/`rotuloDoPapelPeca` (`rotuloAnalista.ts`, 08/09/2026) — já
 * existiam prontos para a lista em tela, só nunca tinham sido usados para nomear um arquivo
 * exportado (achado ao planejar esta fase: o exportador de hoje, `pacoteVigenteClient.ts`, usa
 * `"{título} ({idSei}).pdf"`, formato diferente, e opera só por evento, não por peça).
 *
 * Mesma técnica de recorte de `pacoteVigenteClient.ts`/`baixarRecorte` (pdf-lib, cliente, PDF nunca
 * volta ao servidor).
 */
import { PDFDocument } from "pdf-lib";
import { nomeArquivoAnalista, rotuloDoPapelPeca } from "./rotuloAnalista";
import type { ItemFatiado } from "./estadoEdicao";

export async function exportarItem(arquivo: File, item: ItemFatiado): Promise<{ blob: Blob; nomeArquivo: string }> {
  const bytesOriginal = await arquivo.arrayBuffer();
  const origem = await PDFDocument.load(bytesOriginal);
  const novo = await PDFDocument.create();
  const indices: number[] = [];
  for (let p = item.paginaIni; p <= item.paginaFim; p++) indices.push(p - 1);
  const copiadas = await novo.copyPages(origem, indices);
  copiadas.forEach((p) => novo.addPage(p));
  const bytes = await novo.save();
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });

  // `nomeExportacao` (renomeação manual, 11/09/2026) tem prioridade sobre a derivação automática
  // por papel/título — é o analista escolhendo o nome, não o sistema adivinhando. Vai DIRETO pro
  // arquivo, sem passar por `nomeArquivoAnalista`/`rotuloDoTitulo`: aquela função tenta casar o
  // texto contra os padrões conhecidos (ex.: "laudo", "vistoria") e reescreveria um nome escolhido
  // à mão que por acaso contivesse uma dessas palavras — o analista pediu ESTE texto, verbatim.
  let nomeArquivo: string;
  if (item.nomeExportacao?.trim()) {
    const base = item.nomeExportacao.trim().replace(/[\\/:*?"<>|]/g, "-");
    nomeArquivo = `${base} ${item.idSei}.pdf`;
  } else {
    const rotulo = item.papel ? rotuloDoPapelPeca(item.papel) : null;
    nomeArquivo = nomeArquivoAnalista(rotulo ?? item.titulo, item.idSei);
  }
  return { blob, nomeArquivo };
}

/** Vários itens de uma vez (ex.: "exportar tudo que não é lixo") — cada um baixa como PDF avulso. */
export async function exportarItens(arquivo: File, itens: ItemFatiado[]) {
  const resultados: { blob: Blob; nomeArquivo: string }[] = [];
  for (const item of itens) resultados.push(await exportarItem(arquivo, item));
  return resultados;
}
