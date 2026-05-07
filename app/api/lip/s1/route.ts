import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { pdfBase64 } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!pdfBase64) return NextResponse.json({ ok: false, erro: "PDF não enviado" }, { status: 400 });
    if (!apiKey) return NextResponse.json({ ok: false, erro: "GEMINI_API_KEY não configurada" }, { status: 500 });

    const pdfBuffer = Buffer.from(pdfBase64, "base64");

    // Upload para Gemini File API
    const uploadRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          "X-Goog-Upload-Command": "upload, finalize",
          "X-Goog-Upload-Header-Content-Length": pdfBuffer.length.toString(),
          "X-Goog-Upload-Header-Content-Type": "application/pdf",
        },
        body: pdfBuffer,
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      return NextResponse.json({ ok: false, erro: `Upload falhou: ${err}` }, { status: 500 });
    }

    const uploadData = await uploadRes.json();
    const fileUri = uploadData.file?.uri;
    const fileName = uploadData.file?.name;
    const state = uploadData.file?.state;

    console.log(`[S1] Upload concluído: ${fileName} | state: ${state}`);
    console.log(`[S1] URI: ${fileUri}`);

    return NextResponse.json({
      ok: true,
      fileUri,
      fileName,
      state,
      tamanhoMB: (pdfBuffer.length / 1024 / 1024).toFixed(2),
    });

  } catch (e: any) {
    console.error("[S1] Erro:", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}
