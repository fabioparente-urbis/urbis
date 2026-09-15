/**
 * lib/documentosSei/configuracaoFatiador.ts — pedido do Fábio (15/09/2026): "quero criar um
 * importar e exportar. O exportar fará um arquivo de configuração do fatiador... será exportado o
 * PDF completo mais um excel que ao importar os dois... o fatiador volta a configuração de nomes,
 * páginas, fatias, cortes de PDF daquele momento".
 *
 * EXPORTAR gera um .zip com três arquivos:
 *   - o PDF original, intocado (nunca sobe pro servidor — mesma regra do resto do fatiador);
 *   - `configuracao-fatiador.xlsx`, com o que o analista pediu explicitamente: nomes, páginas,
 *     fatias, cortes — uma linha por item, legível e editável fora do sistema;
 *   - `eventos-brutos.json`, sidecar técnico ESCONDIDO (não é o que foi pedido, é o que faz o
 *     resto da tela continuar funcionando depois de importar): "Comparar com o LIP" e "Baixar
 *     pacote (.zip)" trabalham sobre os EVENTOS brutos que o servidor extraiu na hora do
 *     fatiamento original, não sobre os itens já cortados/editados — sem isso, importar traria de
 *     volta os cortes mas desligaria essas duas funções. Best-effort: falta ou corrompe, o resto
 *     do import continua funcionando, só essas duas ficam indisponíveis até fatiar de novo.
 *
 * IMPORTAR lê o mesmo .zip de volta. Reconstrói os itens do Excel (fonte confiável — o analista
 * pode até editar as células fora do sistema e reimportar); os eventos brutos, do JSON, se existir.
 */
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { PDFDocument } from "pdf-lib";
import type { ItemFatiado, StatusEdicao } from "./estadoEdicao";

const STATUS_VALIDOS: StatusEdicao[] = ["proposto", "confirmado", "editado", "lixo"];

export type InfoConfiguracao = {
  processoCodigo: string;
  slot: string;
  numeroProcesso: string;
};

type LinhaExcel = {
  "Página Início": number;
  "Página Fim": number;
  "Nº SEI": string;
  "Título": string;
  "Papel": string;
  "Rótulo Manual": string;
  "Nome de Exportação": string;
  "Status": string;
  "Para Leitura": string;
  "Corte Manual": string;
  "Setor": string;
  "Assinante": string;
  "Data": string;
};

function simOuNao(v: boolean): string {
  return v ? "Sim" : "Não";
}

function celulaOuVazio(v: string | undefined): string {
  return v ?? "";
}

/** Monta o .xlsx (duas abas: Info e Itens) como bytes, pronto pra entrar no zip. */
function gerarExcel(info: InfoConfiguracao, itens: ItemFatiado[]): Uint8Array {
  const wb = XLSX.utils.book_new();

  const linhasInfo = [
    { Campo: "Processo (código)", Valor: info.processoCodigo },
    { Campo: "Slot", Valor: info.slot },
    { Campo: "Número do processo (SEI)", Valor: info.numeroProcesso },
    { Campo: "Exportado em", Valor: new Date().toLocaleString("pt-BR") },
  ];
  const wsInfo = XLSX.utils.json_to_sheet(linhasInfo);
  XLSX.utils.book_append_sheet(wb, wsInfo, "Info");

  const linhasItens: LinhaExcel[] = itens.map((i) => ({
    "Página Início": i.paginaIni,
    "Página Fim": i.paginaFim,
    "Nº SEI": i.idSei,
    "Título": i.titulo,
    "Papel": celulaOuVazio(i.papel),
    "Rótulo Manual": celulaOuVazio(i.rotuloManual),
    "Nome de Exportação": celulaOuVazio(i.nomeExportacao),
    "Status": i.status,
    "Para Leitura": simOuNao(i.paraLeitura),
    "Corte Manual": simOuNao(!!i.criadoManualmente),
    "Setor": celulaOuVazio(i.setor),
    "Assinante": celulaOuVazio(i.assinante),
    "Data": celulaOuVazio(i.data),
  }));
  const wsItens = XLSX.utils.json_to_sheet(linhasItens);
  XLSX.utils.book_append_sheet(wb, wsItens, "Itens");

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}

/**
 * Exporta o pacote completo. `eventosBrutos` pode ser `null` (ex.: um fatiamento restaurado de um
 * import anterior que não trouxe o sidecar) — o zip sai igual, só sem o JSON técnico.
 */
export async function exportarConfiguracao(
  arquivo: File, info: InfoConfiguracao, itens: ItemFatiado[], eventosBrutos: unknown[] | null,
): Promise<{ blob: Blob; nomeArquivo: string }> {
  const zip = new JSZip();
  zip.file(`${info.numeroProcesso || info.processoCodigo}.pdf`, await arquivo.arrayBuffer());
  zip.file("configuracao-fatiador.xlsx", gerarExcel(info, itens));
  if (eventosBrutos) zip.file("eventos-brutos.json", JSON.stringify(eventosBrutos));

  const blob = await zip.generateAsync({ type: "blob" });
  const data = new Date().toISOString().slice(0, 10);
  const nomeArquivo = `${info.numeroProcesso || info.processoCodigo} - fatiador - ${data}.zip`;
  return { blob, nomeArquivo };
}

export type ConfiguracaoImportada = {
  arquivo: File;
  info: InfoConfiguracao;
  itens: ItemFatiado[];
  /** `null` quando o zip não trazia o sidecar — "Comparar com o LIP" e "Baixar pacote" ficam
   * indisponíveis até o analista fatiar de novo, mas o resto do import funciona normal. */
  eventosBrutos: unknown[] | null;
};

/** Gera um `id` estável, mesma convenção do fatiamento original (`idSei` + índice da linha). */
function idDaLinha(idSei: string, indice: number): string {
  return `${idSei || "item"}::importado::${indice}`;
}

export async function importarConfiguracao(zipFile: File): Promise<ConfiguracaoImportada> {
  // `zipFile.arrayBuffer()`, não o `File` direto: JSZip lida bem com os dois num navegador de
  // verdade, mas o ArrayBuffer é a forma que funciona em todo ambiente sem depender de como cada
  // runtime implementa `File`/`Blob` por baixo.
  const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());

  const nomePdf = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith(".pdf"));
  if (!nomePdf) throw new Error("O arquivo .zip não tem um PDF dentro.");
  const bytesPdf = await zip.files[nomePdf].async("arraybuffer");
  // Confere que o PDF ainda abre — corrompido aqui derrubaria a tela inteira em silêncio depois.
  await PDFDocument.load(bytesPdf).catch(() => {
    throw new Error("O PDF dentro do .zip está corrompido ou não é um PDF válido.");
  });
  const arquivo = new File([bytesPdf], nomePdf, { type: "application/pdf" });

  const arquivoExcel = zip.file("configuracao-fatiador.xlsx");
  if (!arquivoExcel) throw new Error('O arquivo .zip não tem "configuracao-fatiador.xlsx" dentro.');
  const bytesExcel = await arquivoExcel.async("arraybuffer");
  const wb = XLSX.read(bytesExcel, { type: "array" });

  const wsInfo = wb.Sheets["Info"];
  if (!wsInfo) throw new Error('A aba "Info" não foi encontrada no Excel.');
  const linhasInfo = XLSX.utils.sheet_to_json<{ Campo: string; Valor: string }>(wsInfo, { defval: "" });
  const valorDoCampo = (campo: string) => linhasInfo.find((l) => l.Campo === campo)?.Valor ?? "";
  const info: InfoConfiguracao = {
    processoCodigo: valorDoCampo("Processo (código)"),
    slot: valorDoCampo("Slot"),
    numeroProcesso: valorDoCampo("Número do processo (SEI)"),
  };
  if (!info.processoCodigo || !info.slot) {
    throw new Error('A aba "Info" do Excel está incompleta (faltou Processo ou Slot).');
  }

  const wsItens = wb.Sheets["Itens"];
  if (!wsItens) throw new Error('A aba "Itens" não foi encontrada no Excel.');
  const linhasItens = XLSX.utils.sheet_to_json<LinhaExcel>(wsItens, { defval: "" });
  if (!linhasItens.length) throw new Error('A aba "Itens" do Excel está vazia.');

  const itens: ItemFatiado[] = linhasItens.map((l, indice) => {
    const status = STATUS_VALIDOS.includes(l["Status"] as StatusEdicao) ? (l["Status"] as StatusEdicao) : "proposto";
    const idSei = String(l["Nº SEI"] ?? "");
    return {
      id: idDaLinha(idSei, indice),
      idSei,
      titulo: String(l["Título"] ?? ""),
      papel: l["Papel"] ? String(l["Papel"]) : undefined,
      paginaIni: Number(l["Página Início"]) || 1,
      paginaFim: Number(l["Página Fim"]) || Number(l["Página Início"]) || 1,
      setor: l["Setor"] ? String(l["Setor"]) : undefined,
      assinante: l["Assinante"] ? String(l["Assinante"]) : undefined,
      data: l["Data"] ? String(l["Data"]) : undefined,
      status,
      criadoManualmente: String(l["Corte Manual"]).trim().toLowerCase() === "sim",
      nomeExportacao: l["Nome de Exportação"] ? String(l["Nome de Exportação"]) : undefined,
      rotuloManual: l["Rótulo Manual"] ? String(l["Rótulo Manual"]) : undefined,
      paraLeitura: status !== "lixo" && String(l["Para Leitura"]).trim().toLowerCase() !== "não",
    };
  });

  let eventosBrutos: unknown[] | null = null;
  const arquivoJson = zip.file("eventos-brutos.json");
  if (arquivoJson) {
    try {
      eventosBrutos = JSON.parse(await arquivoJson.async("text"));
    } catch {
      eventosBrutos = null; // sidecar corrompido — best-effort, não derruba o resto do import
    }
  }

  return { arquivo, info, itens, eventosBrutos };
}
