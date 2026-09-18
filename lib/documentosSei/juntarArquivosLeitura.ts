/**
 * lib/documentosSei/juntarArquivosLeitura.ts — Bloco B do plano
 * docs/PLANO_LEITURA_INDIVIDUAL_E_ACEITE_SLOT2.md ("Ler Arquivos Individuais = mesma leitura do
 * Ler Processo").
 *
 * Client-side, mesma técnica de recorte de `pacoteVigenteClient.ts`/`exportarPecas.ts` (pdf-lib,
 * o PDF nunca volta ao servidor até a leitura em si).
 *
 * PROBLEMA QUE ISTO RESOLVE (achado em auditoria, 18/09/2026): o botão "LER ARQUIVOS INDIVIDUAIS"
 * do LIP (`processarVCP`, app/processo/ProcessoClient.tsx) manda cada arquivo escolhido numa
 * chamada S1→S2→S3 SEPARADA — o Gemini nunca vê os documentos juntos. Os prompts do LIP (Slot 1 e
 * 2) foram escritos pensando no processo INTEIRO ("procuracao: Sim se houver procuração no
 * processo, Não caso contrário", "use a versão mais recente/maior SEI"): lendo só a certidão, por
 * exemplo, o modelo responde "Não" pra procuração por não ter visto o documento, não porque ele
 * não existe. A mesclagem client-side usa "primeiro valor não vazio vence", então esse "Não"
 * errado do 1º arquivo TRAVA o campo, e o "Sim" certo que vem depois é descartado. Perde também o
 * marco temporal, os alertasMAC, as pendências e o inventário — o VCP nunca usou esses dados.
 *
 * SOLUÇÃO: juntar os arquivos escolhidos num PDF só, no navegador, e mandar pelo MESMO caminho
 * S1→S2→S3 que "LER PROCESSO" já usa (`lerLip`). O Gemini passa a ver tudo junto, como se fosse
 * o processo inteiro — corrige o problema de raiz, sem duplicar nenhuma regra de prompt.
 */
import { PDFDocument, PageSizes } from "pdf-lib";

export type ArquivoParaJuntar = File;

/** Extensões de imagem aceitas pelo botão (mesmo `accept` do input de LER ARQUIVOS INDIVIDUAIS). */
const EXT_IMAGEM = /\.(png|jpe?g)$/i;

/**
 * Junta vários arquivos (PDF e/ou imagem) num único PDF, na ordem em que o analista escolheu.
 * Cada PDF de origem entra com TODAS as suas páginas; cada imagem vira uma página do tamanho
 * dela (ou A4 se a imagem for maior que A4, escalada para caber).
 *
 * Lança erro com o NOME do arquivo que falhou — nunca pula um arquivo em silêncio (ver a mesma
 * regra em `exportarPecas.ts`: "nunca deixar item sumir sem avisar").
 */
export async function juntarArquivosParaLeitura(arquivos: File[]): Promise<{ blob: Blob; totalPaginas: number }> {
  if (arquivos.length === 0) throw new Error("Nenhum arquivo para juntar.");
  const novo = await PDFDocument.create();

  for (const arquivo of arquivos) {
    try {
      const bytes = await arquivo.arrayBuffer();
      const ehImagem = EXT_IMAGEM.test(arquivo.name) || arquivo.type.startsWith("image/");

      if (ehImagem) {
        const ehPng = /\.png$/i.test(arquivo.name) || arquivo.type === "image/png";
        const img = ehPng ? await novo.embedPng(bytes) : await novo.embedJpg(bytes);
        const [maxW, maxH] = PageSizes.A4;
        // Imagem cabe na página do tamanho dela; se for maior que A4, escala mantendo proporção
        // (mesmo raciocínio de impressão: nunca corta a imagem, só reduz).
        const escala = Math.min(1, maxW / img.width, maxH / img.height);
        const w = img.width * escala;
        const h = img.height * escala;
        const pagina = novo.addPage([w, h]);
        pagina.drawImage(img, { x: 0, y: 0, width: w, height: h });
      } else {
        // PDF de origem — `ignoreEncryption` porque documentos digitalizados do SEI às vezes vêm
        // com proteção de edição (mas sem senha de leitura), que travaria o `load` sem isso.
        const origem = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const paginas = await novo.copyPages(origem, origem.getPageIndices());
        paginas.forEach((p) => novo.addPage(p));
      }
    } catch (e: any) {
      throw new Error(`Falha ao juntar "${arquivo.name}": ${e?.message || e}`);
    }
  }

  const bytesFinais = await novo.save();
  return {
    blob: new Blob([bytesFinais as BlobPart], { type: "application/pdf" }),
    totalPaginas: novo.getPageCount(),
  };
}

/**
 * Mesma função acima, mas já devolve um `File` pronto para entrar no mesmo caminho que
 * `lerLip([arquivo])` usa hoje para "LER PROCESSO" — é o que faz o Gemini enxergar os arquivos
 * individuais como se fossem um único PDF do processo.
 */
export async function juntarArquivosComoFile(arquivos: File[], nomeArquivo: string): Promise<File> {
  const { blob } = await juntarArquivosParaLeitura(arquivos);
  return new File([blob], nomeArquivo, { type: "application/pdf" });
}
