import { NextRequest, NextResponse } from "next/server";
import { registrarChamadaIA } from "@/lib/iaUso";
import { autenticar } from "@/lib/auth";

// Limite de tamanho do áudio aceito. ~1 min de webm/opus mono cabe folgado em
// 1 MB; acima disso é ou engano ou abuso — e cada chamada custa crédito Groq.
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    // Sem guarda, esta rota era um transcritor Whisper aberto na internet,
    // pago com a chave do URBIS por quem quisesse. Fechada em 02/09/2026.
    const ctx = await autenticar(req);
    if (ctx instanceof NextResponse) return ctx;

    const form = await req.formData();
    const audio = form.get("audio") as Blob | null;
    if (!audio) return NextResponse.json({ ok: false, erro: "sem audio" }, { status: 400 });
    if (audio.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, erro: "Áudio grande demais." }, { status: 413 });
    }

    // O nome do arquivo importa: o Groq decide o decoder pela extensão. O
    // MediaRecorder do navegador entrega webm/opus (ou mp4 no Safari), não
    // mp3 — mandar tudo como "audio.mp3" fazia o decoder errar o formato.
    const tipo = (audio.type || "").toLowerCase();
    const ext = tipo.includes("webm") ? "webm"
      : tipo.includes("ogg") ? "ogg"
      : tipo.includes("mp4") || tipo.includes("m4a") ? "m4a"
      : tipo.includes("wav") ? "wav"
      : "mp3";

    const groqForm = new FormData();
    groqForm.append("file", audio, `audio.${ext}`);
    groqForm.append("model", "whisper-large-v3");
    groqForm.append("language", "pt");
    groqForm.append("response_format", "text");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: groqForm,
    });

    if (!res.ok) {
      const err = await res.text();
      await registrarChamadaIA({ modulo: "URBI", operacao: "stt", modelo: "whisper-large-v3", tamanhoBytes: audio.size, duracaoMs: Date.now() - t0, status: "erro", motivoErro: err.slice(0, 500) });
      return NextResponse.json({ ok: false, erro: err }, { status: 500 });
    }

    const texto = (await res.text()).trim();
    await registrarChamadaIA({ modulo: "URBI", operacao: "stt", modelo: "whisper-large-v3", tamanhoBytes: audio.size, duracaoMs: Date.now() - t0, status: "ok" });
    return NextResponse.json({ ok: true, texto });
  } catch (e: any) {
    await registrarChamadaIA({ modulo: "URBI", operacao: "stt", modelo: "whisper-large-v3", duracaoMs: Date.now() - t0, status: "erro", motivoErro: (e?.message ?? "erro desconhecido").slice(0, 500) });
    return NextResponse.json({ ok: false, erro: e?.message }, { status: 500 });
  }
}
