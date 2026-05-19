// app/api/admin/bdi/leis/[id]/reindexar/route.ts
//
// POST /api/admin/bdi/leis/:id/reindexar
//
// Re-processa o PDF ja existente no R2 (a partir de bdi_documentos_lei.url_pdf):
//   1) baixa o PDF do R2 via URL assinada
//   2) repassa o buffer para o pipeline `/api/bdi/indexar-lei` como multipart
//      (que faz fragmentacao + embeddings + insert idempotente)
//
// Util quando a regex/chunker mudou e queremos rodar tudo de novo sem
// pedir o PDF ao usuario.
//
// Acesso: somente Administrador / Diretora.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import { keyFromUrl, signGetUrl } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json(
      { ok: false, erro: "Acesso restrito a Administrador / Diretora." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, erro: "Parametro id ausente." },
      { status: 400 },
    );
  }

  // 1. Carrega a lei e o url_pdf
  const { data: lei, error: errLei } = await supabaseAdmin
    .from("bdi_documentos_lei")
    .select("id, titulo, url_pdf")
    .eq("id", id)
    .maybeSingle();
  if (errLei) {
    return NextResponse.json(
      { ok: false, erro: errLei.message },
      { status: 500 },
    );
  }
  if (!lei) {
    return NextResponse.json(
      { ok: false, erro: "Lei nao encontrada." },
      { status: 404 },
    );
  }

  const url = (lei as any).url_pdf as string | null;
  if (!url) {
    return NextResponse.json(
      {
        ok: false,
        erro:
          "Esta lei ainda nao tem PDF no R2 (url_pdf vazia). Faca o upload primeiro.",
      },
      { status: 400 },
    );
  }

  const key = keyFromUrl(url);
  if (!key) {
    return NextResponse.json(
      {
        ok: false,
        erro:
          "url_pdf nao aponta para o bucket R2 configurado. Reupload do PDF e necessario.",
      },
      { status: 400 },
    );
  }

  // 2. Baixa o PDF do R2 via URL assinada (server-to-server, sem CORS)
  let buffer: Buffer;
  let fileName = "lei.pdf";
  try {
    const signed = await signGetUrl(key, 600);
    const r = await fetch(signed);
    if (!r.ok) {
      throw new Error(`R2 GET retornou ${r.status}`);
    }
    buffer = Buffer.from(await r.arrayBuffer());
    const last = key.split("/").pop();
    if (last) {
      // remove o prefixo "<timestamp>-" usado em keyParaLei
      fileName = last.replace(/^\d+-/, "") || last;
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, erro: `Falha ao baixar PDF do R2: ${e?.message}` },
      { status: 502 },
    );
  }

  // 3. Repassa para o pipeline /api/bdi/indexar-lei
  try {
    const fd = new FormData();
    fd.append("documento_id", id);
    fd.append(
      "pdf",
      new File([new Uint8Array(buffer)], fileName, { type: "application/pdf" }),
    );
    const origin = new URL(req.url).origin;
    const cookie = req.headers.get("cookie") || "";
    const resp = await fetch(`${origin}/api/bdi/indexar-lei`, {
      method: "POST",
      body: fd,
      headers: { cookie },
    });
    const indexacao = await resp
      .json()
      .catch(() => ({ ok: false, erro: "resposta nao-JSON" }));
    return NextResponse.json({ ok: indexacao.ok !== false, indexacao });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, erro: e?.message ?? "Falha ao disparar reindexacao." },
      { status: 500 },
    );
  }
}
