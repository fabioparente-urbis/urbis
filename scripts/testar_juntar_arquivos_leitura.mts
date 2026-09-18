/**
 * scripts/testar_juntar_arquivos_leitura.mts — teste de fumaça do Bloco B
 * (docs/PLANO_LEITURA_INDIVIDUAL_E_ACEITE_SLOT2.md), sem custo de Gemini nem servidor.
 *
 * Gera 2 PDFs (2 e 3 páginas) e 1 PNG de 10x10px, junta com `juntarArquivosParaLeitura` e confere
 * que o PDF final tem o total de páginas esperado (2 + 3 + 1 da imagem = 6).
 *
 *   npx tsx scripts/testar_juntar_arquivos_leitura.mts
 */
import { PDFDocument, rgb } from "pdf-lib";
import { juntarArquivosParaLeitura } from "../lib/documentosSei/juntarArquivosLeitura";

// PNG 10x10px vermelho sólido, gerado uma vez com pdf-lib/canvas equivalente — bytes fixos só
// para este teste (não depende de nenhuma lib de imagem no projeto).
const PNG_10X10_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9QAf8HQE0MDwYAAAAASUVORK5CYII=";

async function gerarPdf(paginas: number, texto: string): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) {
    const pagina = doc.addPage([300, 300]);
    pagina.drawText(`${texto} - pagina ${i + 1}`, { x: 20, y: 150, size: 14, color: rgb(0, 0, 0) });
  }
  const bytes = await doc.save();
  return new File([bytes as BlobPart], `${texto.replace(/\s+/g, "_")}.pdf`, { type: "application/pdf" });
}

function gerarPng(): File {
  const bytes = Buffer.from(PNG_10X10_BASE64, "base64");
  return new File([bytes], "foto.png", { type: "image/png" });
}

async function main() {
  const pdfA = await gerarPdf(2, "Certidao de Matricula");
  const pdfB = await gerarPdf(3, "Termo de Vistoria Fiscal");
  const png = gerarPng();

  console.log("Arquivos de entrada:", [pdfA.name, pdfB.name, png.name].join(", "));

  const { blob, totalPaginas } = await juntarArquivosParaLeitura([pdfA, pdfB, png]);
  console.log(`Total de páginas no PDF juntado: ${totalPaginas} (esperado: 6)`);
  console.log(`Tamanho do blob final: ${(blob.size / 1024).toFixed(1)} KB`);

  if (totalPaginas !== 6) {
    console.error("❌ FALHOU: número de páginas diferente do esperado.");
    process.exit(1);
  }

  // Confere que o resultado é um PDF válido e legível de volta
  const bytesFinais = Buffer.from(await blob.arrayBuffer());
  const reaberto = await PDFDocument.load(bytesFinais);
  if (reaberto.getPageCount() !== 6) {
    console.error("❌ FALHOU: PDF final não reabre com 6 páginas.");
    process.exit(1);
  }

  // Erro esperado: arquivo que não é PDF nem imagem válida deve lançar com o NOME do arquivo,
  // nunca ser pulado em silêncio (regra do CLAUDE.md: "nunca deixar item sumir em silêncio").
  const lixo = new File([Buffer.from("isto nao e um pdf nem imagem")], "arquivo-corrompido.pdf", { type: "application/pdf" });
  try {
    await juntarArquivosParaLeitura([pdfA, lixo]);
    console.error("❌ FALHOU: deveria ter lançado erro para arquivo corrompido.");
    process.exit(1);
  } catch (e: any) {
    if (!String(e?.message ?? "").includes("arquivo-corrompido.pdf")) {
      console.error("❌ FALHOU: erro não menciona o nome do arquivo que falhou:", e?.message);
      process.exit(1);
    }
    console.log(`✅ Erro de arquivo corrompido nomeia o arquivo corretamente: "${e.message}"`);
  }

  console.log("\n✅ TODOS OS TESTES PASSARAM.");
}

main().catch((e) => {
  console.error("❌ Erro inesperado:", e);
  process.exit(1);
});
