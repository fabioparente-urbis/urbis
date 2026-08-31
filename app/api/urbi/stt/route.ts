import { NextRequest, NextResponse } from "next/server";
import { registrarChamadaIA } from "@/lib/iaUso";

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const form = await req.formData();
    const audio = form.get("audio") as Blob | null;
    if (!audio) return NextResponse.json({ ok: false, erro: "sem audio" }, { status: 400 });

    const groqForm = new FormData();
    groqForm.append("file", audio, "audio.mp3");
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
