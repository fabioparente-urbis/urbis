import { NextRequest, NextResponse } from "next/server";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey)
      return NextResponse.json({ ok: false, erro: "GEMINI_API_KEY não configurada" }, { status: 500 });

    const contentLength = req.headers.get("x-file-size") || "0";
    const fileName = req.headers.get("x-file-name") || "processo.pdf";

    console.log(`[S1] Streaming: ${fileName} (${(parseInt(contentLength) / 1024 / 1024).toFixed(2)} MB)`);

    const uploadRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          "X-Goog-Upload-Command": "upload, finalize",
          "X-Goog-Upload-Header-Content-Length": contentLength,
          "X-Goog-Upload-Header-Content-Type": "application/pdf",
        },
        body: req.body,
        // @ts-ignore
        duplex: "half",
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      return NextResponse.json({ ok: false, erro: `Upload falhou: ${err}` }, { status: 500 });
    }

    const uploadData = await uploadRes.json();
    const fileUri = uploadData.file?.uri;
    const filName = uploadData.file?.name;
    const state = uploadData.file?.state;

    console.log(`[S1] Concluído: ${filName} | state: ${state} | URI: ${fileUri}`);

    return NextResponse.json({
      ok: true,
      fileUri,
      fileName: filName,
      state,
      tamanhoMB: (parseInt(contentLength) / 1024 / 1024).toFixed(2),
    });
  } catch (e: any) {
    console.error("[S1] Erro:", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}
