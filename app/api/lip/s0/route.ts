import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const execAsync = promisify(exec);
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

export const maxDuration = 60;

type TipoDoc = "indice" | "matricula" | "uso_solo" | "laudo_tecnico" |
               "art_rrt" | "planta" | "vistoria" | "procuracao" |
               "cheadv" | "embargo" | "outros";

function classificarPagina(texto: string): TipoDoc {
  const t = texto.toLowerCase();
  if (texto.trim().length < 100) return "planta";
  if (t.includes("matrícula") || t.includes("registro geral") || t.includes("ofício de registro")) return "matricula";
  if (t.includes("uso do solo") || t.includes("comtec") || t.includes("cnae") || t.includes("tipo de uso")) return "uso_solo";
  if (t.includes("laudo técnico") || t.includes("laudo de vistoria") || t.includes("laudo de regularização")) return "laudo_tecnico";
  if (t.includes("art ") || t.includes("rrt ") || t.includes("anotação de responsabilidade")) return "art_rrt";
  if (t.includes("vistoria") || t.includes("auto de vistoria")) return "vistoria";
  if (t.includes("procuração") || t.includes("outorgante")) return "procuracao";
  if (t.includes("cheadv") || t.includes("análise documental") || t.includes("despacho")) return "cheadv";
  if (t.includes("índice") || t.includes("autuação") || t.includes("lista de documentos")) return "indice";
  if (t.includes("embargo") || t.includes("auto de embargo")) return "embargo";
  return "outros";
}

export async function POST(req: NextRequest) {
  const id = Date.now().toString();
  const inputPath = join(tmpdir(), `s0_in_${id}.pdf`);
  const outputPath = join(tmpdir(), `s0_out_${id}.pdf`);

  try {
    const formData = await req.formData();
    const file = formData.get("pdf") as File;
    if (!file) return NextResponse.json({ ok: false, erro: "PDF não enviado" }, { status: 400 });

    // 1. Salva PDF original
    const bufferOriginal = Buffer.from(await file.arrayBuffer());
    await writeFile(inputPath, bufferOriginal);
    const tamanhoOriginal = bufferOriginal.length;

    // 2. Comprime com Ghostscript
    await execAsync(
      `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook ` +
      `-dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`
    );

    const bufferComprimido = await readFile(outputPath);
    const tamanhoComprimido = bufferComprimido.length;
    const taxaCompressao = (tamanhoOriginal / tamanhoComprimido).toFixed(1);

    // 3. Extrai texto por página
    const textosPorPagina: string[] = [];
    await pdfParse(bufferComprimido, {
      pagerender: (pageData: any) =>
        pageData.getTextContent().then((tc: any) => {
          const txt = tc.items.map((i: any) => i.str).join(" ");
          textosPorPagina.push(txt);
          return txt;
        }),
    });

    // 4. Classifica cada página
    const classificacao = textosPorPagina.map((txt, i) => ({
      pagina: i + 1,
      tipo: classificarPagina(txt),
      chars: txt.trim().length,
      rasterizar: txt.trim().length < 100,
    }));

    // 5. Mapa de documentos
    const mapaDocumentos: Record<string, number[]> = {};
    for (const p of classificacao) {
      if (!mapaDocumentos[p.tipo]) mapaDocumentos[p.tipo] = [];
      mapaDocumentos[p.tipo].push(p.pagina);
    }

    const paginasRasterizar = classificacao.filter(p => p.rasterizar).map(p => p.pagina);

    console.log(`[S0] ${(tamanhoOriginal/1024/1024).toFixed(1)}MB → ${(tamanhoComprimido/1024/1024).toFixed(1)}MB (${taxaCompressao}x)`);
    console.log(`[S0] ${classificacao.length} páginas | ${paginasRasterizar.length} para rasterizar`);
    console.log(`[S0] Tipos encontrados:`, Object.keys(mapaDocumentos).join(", "));

    return NextResponse.json({
      ok: true,
      stats: {
        originalMB: (tamanhoOriginal / 1024 / 1024).toFixed(2),
        comprimidoMB: (tamanhoComprimido / 1024 / 1024).toFixed(2),
        taxaCompressao: `${taxaCompressao}x`,
        totalPaginas: classificacao.length,
        paginasRasterizar: paginasRasterizar.length,
      },
      mapaDocumentos,
      classificacao,
      pdfBase64: bufferComprimido.toString("base64"),
    });

  } catch (e: any) {
    console.error("[S0] Erro:", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  } finally {
    try { await unlink(inputPath); } catch {}
    try { await unlink(outputPath); } catch {}
  }
}
