/**
 * lib/documentosSei/agruparParaLeitura.ts — Fase 7 do plano
 * docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md ("ligar fatiador à leitura").
 *
 * `lib/modeloGemini.ts:48-51` já comentava o problema: acima do teto de plataforma "não é caso de
 * trocar de modelo: é caso de fatiar o PDF antes" — isso nunca tinha sido ligado de fato. Esta
 * função fecha o gap: pega os itens que o analista marcou pra leitura no Fatiador e monta um ou
 * mais PDFs menores, cada um até `LIMITE_BYTES_MODELO_PADRAO`, em vez do PDF inteiro.
 *
 * Mesma técnica de recorte de `exportarPecas.ts`/`pacoteVigenteClient.ts` (pdf-lib, cliente, o PDF
 * nunca volta ao servidor nesta etapa) — a diferença é que aqui vários itens entram no MESMO
 * PDFDocument, não um por item.
 *
 * Empacotamento guloso, EM ORDEM DE PÁGINA (nunca reordena — o contexto de leitura importa: um
 * despacho antes do documento que ele cita ajuda o modelo, embaralhado atrapalha). Item sozinho
 * maior que o teto vira lote próprio (a Fase 2 já escala pro modelo de arquivo grande sozinho,
 * `lib/modeloGemini.ts`) — esta função não tenta cortar um item ao meio.
 */
import { PDFDocument } from "pdf-lib";
import type { ItemFatiado } from "./estadoEdicao";

/** Itens elegíveis pra leitura, na ordem em que aparecem no PDF de origem. */
export function itensParaLeitura(itens: ItemFatiado[]): ItemFatiado[] {
  return itens
    .filter((i) => i.paraLeitura && i.status !== "lixo")
    .sort((a, b) => a.paginaIni - b.paginaIni);
}

export async function agruparEmLotes(
  arquivo: File,
  itens: ItemFatiado[],
  limiteBytes: number,
): Promise<File[]> {
  const elegiveis = itensParaLeitura(itens);
  if (!elegiveis.length) return [];

  const bytesOriginal = await arquivo.arrayBuffer();
  const origem = await PDFDocument.load(bytesOriginal);
  const lotes: File[] = [];

  let atual = await PDFDocument.create();
  let paginasNoAtual = 0;
  let indiceLote = 1;

  async function fecharLoteAtual() {
    if (paginasNoAtual === 0) return;
    const bytes = await atual.save();
    lotes.push(new File([bytes as BlobPart], `lote-${indiceLote}.pdf`, { type: "application/pdf" }));
    indiceLote++;
    atual = await PDFDocument.create();
    paginasNoAtual = 0;
  }

  // estimativa de bytes por página do arquivo de ORIGEM — proporção simples, boa o bastante pra
  // decidir quando fechar um lote (o tamanho final real é medido depois de salvar, nunca chutado
  // pra frente: se estourar mesmo assim, o próprio lib/modeloGemini.ts escala o modelo sozinho)
  const bytesPorPagina = bytesOriginal.byteLength / Math.max(1, origem.getPageCount());

  for (const item of elegiveis) {
    const nPaginas = item.paginaFim - item.paginaIni + 1;
    const estimativaItem = nPaginas * bytesPorPagina;
    const estimativaAtual = paginasNoAtual * bytesPorPagina;

    // item sozinho já estoura o teto: fecha o que tiver e ele vira lote próprio, sem tentar dividir
    if (estimativaItem > limiteBytes && paginasNoAtual > 0) await fecharLoteAtual();
    else if (paginasNoAtual > 0 && estimativaAtual + estimativaItem > limiteBytes) await fecharLoteAtual();

    const indices: number[] = [];
    for (let p = item.paginaIni; p <= item.paginaFim; p++) indices.push(p - 1);
    const copiadas = await atual.copyPages(origem, indices);
    copiadas.forEach((p) => atual.addPage(p));
    paginasNoAtual += nPaginas;
  }
  await fecharLoteAtual();

  return lotes;
}
