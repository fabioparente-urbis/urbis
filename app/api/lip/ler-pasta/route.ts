import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { lerPastaSlot5, type ArquivoEntrada } from "@/lib/lerPastaSlot5";

/**
 * POST /api/lip/ler-pasta — leitura da pasta do processo de Aprovação de Projeto (slot 5).
 *
 * Recebe a pasta inteira em multipart. Para cada arquivo vem também o caminho relativo
 * (`webkitRelativePath`), de onde sai a RODADA: a pasta é a rodada de análise — raiz = 1ª,
 * cada subpasta a seguinte.
 *
 * NÃO CHAMA IA. Tudo sai da camada de texto dos PDFs, lida com pdfjs-dist. Por isso não há
 * consumo de cota, e a rota pode ser chamada quantas vezes o analista quiser.
 *
 * A resposta é sempre uma PROPOSTA: nada é gravado no LIP aqui. Quem grava é a tela, depois do
 * aceite do analista.
 */

export const runtime = "nodejs"; // pdfjs-dist (legacy) precisa de Node, não roda no edge
export const maxDuration = 120;

const MAX_ARQUIVOS = 60;
const MAX_BYTES_TOTAL = 150 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const arquivos = form.getAll("arquivos").filter((f): f is File => f instanceof File);
    const caminhos = form.getAll("caminhos").map(String);

    if (!arquivos.length) {
      return NextResponse.json({ ok: false, erro: "Nenhum arquivo enviado" }, { status: 400 });
    }
    if (arquivos.length > MAX_ARQUIVOS) {
      return NextResponse.json(
        { ok: false, erro: `Pasta com ${arquivos.length} arquivos — o limite é ${MAX_ARQUIVOS}` },
        { status: 400 },
      );
    }
    const bytesTotal = arquivos.reduce((s, f) => s + f.size, 0);
    if (bytesTotal > MAX_BYTES_TOTAL) {
      return NextResponse.json(
        { ok: false, erro: `Pasta com ${(bytesTotal / 1024 / 1024).toFixed(0)}MB — o limite é 150MB` },
        { status: 400 },
      );
    }

    // a profundidade do caminho relativo É a rodada:
    // "SLOT 5/PROJETO.pdf" → 1 · "SLOT 5/REV01/ARQ....pdf" → 2
    const rodadaDe = (rel: string, nome: string) => {
      const partes = (rel || nome).split("/").filter(Boolean);
      return Math.max(1, partes.length - 1);
    };

    const entradas: ArquivoEntrada[] = [];
    for (let i = 0; i < arquivos.length; i++) {
      const f = arquivos[i];
      if (f.name.startsWith(".")) continue; // .DS_Store e afins
      const buffer = new Uint8Array(await f.arrayBuffer());
      entradas.push({
        nome: f.name,
        rodada: rodadaDe(caminhos[i] ?? "", f.name),
        hash: crypto.createHash("sha256").update(buffer).digest("hex"),
        buffer,
      });
    }

    if (!entradas.length) {
      return NextResponse.json({ ok: false, erro: "Nenhum arquivo legível na pasta" }, { status: 400 });
    }

    const t0 = Date.now();
    const resultado = await lerPastaSlot5(entradas);

    // o buffer não volta para o cliente
    const catalogo = resultado.catalogo.map(({ dados, ...resto }) => ({
      ...resto,
      // só o que a tela precisa mostrar; o resto fica no servidor
      dados: dados ? { revisao: dados.revisao ?? null } : undefined,
    }));

    return NextResponse.json({
      ok: true,
      ...resultado,
      catalogo,
      rodadas: [...new Set(entradas.map((e) => e.rodada))].sort(),
      msLeitura: Date.now() - t0,
    });
  } catch (e: any) {
    console.error("[ler-pasta]", e);
    return NextResponse.json({ ok: false, erro: e?.message ?? "Falha ao ler a pasta" }, { status: 500 });
  }
}
