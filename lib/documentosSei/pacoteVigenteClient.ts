/**
 * lib/documentosSei/pacoteVigenteClient.ts — Fase 5 do plano Documentos Vivos
 * (docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md §6). Monta o "pacote vigente": um .zip com o manifesto
 * (`lib/documentosSei/manifesto.ts`) + um PDF recortado por documento, separado em Vigentes/ e
 * Histórico/, seguindo o estado que `lib/documentosSei/motorVersoes.ts` resolveu.
 *
 * SÓ CLIENTE — importado apenas pelos dois componentes Organizador. Opera sobre o `File` que já
 * está na memória do navegador NESTA sessão (mesma limitação de "abrir"/"baixar" desde a Fase 2:
 * o PDF nunca fica no servidor). Como o motor de versões (Fase 4, escopo reduzido em §18 do plano)
 * só resolve estado DENTRO deste fatiamento, não existe o cenário de "documento vigente de um
 * upload antigo, PDF diferente não carregado agora" que o desenho original da Fase 5 previa — o
 * pacote é sempre gerado a partir do PDF que está na tela.
 */
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { gerarManifestoPdf, type ItemManifesto } from "./manifesto";
import type { ResolucaoVersao } from "./motorVersoes";

export type ItemPacote = {
  idSei: string;
  titulo: string;
  paginaIni: number;
  paginaFim: number;
};

function nomeArquivo(titulo: string, idSei: string): string {
  const limpo = titulo.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80).trim();
  return `${limpo} (${idSei}).pdf`;
}

/**
 * `estados` vem de `resolverEstados` (Fase 4) — chave por `idSei`. Item sem resolução (não
 * deveria acontecer, mas nunca quebra) entra no manifesto como pendência, nunca é descartado.
 */
export async function gerarPacoteVigente(args: {
  arquivo: File;
  numeroProcesso: string;
  eventos: ItemPacote[];
  estados: ResolucaoVersao[];
}): Promise<Blob> {
  const { arquivo, numeroProcesso, eventos, estados } = args;
  const estadoPorIdSei = new Map(estados.map((e) => [e.idSei, e]));

  const bytesOriginal = await arquivo.arrayBuffer();
  const origem = await PDFDocument.load(bytesOriginal);

  const zip = new JSZip();
  const itensManifesto: ItemManifesto[] = [];

  for (const ev of eventos) {
    const est = estadoPorIdSei.get(ev.idSei);
    const pasta = !est ? "Pendencias" : est.estado === "vigente" || est.estado === "complementar" ? "Vigentes" : "Historico";

    const novo = await PDFDocument.create();
    const indices: number[] = [];
    for (let p = ev.paginaIni; p <= ev.paginaFim; p++) indices.push(p - 1);
    const copiadas = await novo.copyPages(origem, indices);
    copiadas.forEach((p) => novo.addPage(p));
    const bytes = await novo.save();
    zip.file(`${pasta}/${nomeArquivo(ev.titulo, ev.idSei)}`, bytes);

    itensManifesto.push({
      titulo: ev.titulo,
      idSei: ev.idSei,
      paginaIni: ev.paginaIni,
      paginaFim: ev.paginaFim,
      estado: est?.estado ?? "pendente",
      motivo: est?.motivo ?? "sem resolução de estado (nunca deveria faltar — reportado, não descartado)",
      confianca: est?.confianca ?? "baixa",
    });
  }

  const manifestoBytes = await gerarManifestoPdf(numeroProcesso, itensManifesto);
  zip.file("00_Manifesto_Documental.pdf", manifestoBytes);

  return zip.generateAsync({ type: "blob" });
}

export function baixarBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
