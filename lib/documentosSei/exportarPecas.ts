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
import JSZip from "jszip";
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

  // Prioridade do nome do arquivo — achado real (15/09/2026): o exportador olhava só
  // `nomeExportacao` (a caixa do painel lateral) e ignorava `rotuloManual` (o que o analista
  // digita/escolhe DIRETO na coluna de classificação da lista, via R/E) — o Fábio renomeou ali e o
  // arquivo baixado saiu com outro nome. Os dois textos manuais (`nomeExportacao` e
  // `rotuloManual`) vão DIRETO pro arquivo, sem passar por `nomeArquivoAnalista`/`rotuloDoTitulo`:
  // aquela função casa o texto contra padrões conhecidos ("laudo", "vistoria") e reescreveria um
  // nome escolhido à mão que por acaso contivesse uma dessas palavras — o analista pediu ESTE
  // texto, verbatim, seguido do Nº SEI (a coluna anterior na lista).
  //   1. nomeExportacao — o analista pediu explicitamente ESTE nome pro ARQUIVO.
  //   2. rotuloManual — o analista digitou/escolheu ESTA classificação; é o que a lista mostra.
  //   3. rótulo derivado do papel, senão o título do evento — igual sempre foi.
  let nomeArquivo: string;
  const manual = item.nomeExportacao?.trim() || item.rotuloManual?.trim();
  if (manual) {
    const base = manual.replace(/[\\/:*?"<>|]/g, "-");
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

/**
 * Vários itens de uma vez, num .zip só — pedido do Fábio (14/09/2026): "tem como exportar só ela?"
 * (uma fatia confirmada) levou à pergunta seguinte, "e se tiver várias da mesma forma?". Baixar
 * PDF avulso por avulso um a um esbarra no bloqueio de múltiplos downloads simultâneos do próprio
 * navegador — por isso zip, não `exportarItens` (que já existia, mas nunca tinha UI e devolveria N
 * downloads ao mesmo tempo). Reaproveita `exportarItem` peça por peça — mesmo recorte, mesmo nome.
 * Nome repetido dentro do zip (dois itens que exportariam pro mesmo arquivo) ganha sufixo
 * numérico — nunca sobrescreve um pelo outro em silêncio.
 */
export async function exportarItensEmZip(
  arquivo: File, itens: ItemFatiado[], nomeDoZip: string,
): Promise<{ blob: Blob; nomeArquivo: string }> {
  const zip = new JSZip();
  const usados = new Map<string, number>();
  for (const item of itens) {
    const { blob, nomeArquivo } = await exportarItem(arquivo, item);
    let nomeFinal = nomeArquivo;
    const vezes = usados.get(nomeArquivo) ?? 0;
    if (vezes > 0) {
      const semExtensao = nomeArquivo.replace(/\.pdf$/i, "");
      nomeFinal = `${semExtensao} (${vezes + 1}).pdf`;
    }
    usados.set(nomeArquivo, vezes + 1);
    zip.file(nomeFinal, await blob.arrayBuffer());
  }
  const blobZip = await zip.generateAsync({ type: "blob" });
  return { blob: blobZip, nomeArquivo: nomeDoZip };
}
