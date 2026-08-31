import { NextRequest, NextResponse } from "next/server";
import { registrarChamadaIA } from "@/lib/iaUso";

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const { texto } = await req.json();
    if (!texto?.trim()) return NextResponse.json({ ok: false, erro: "sem texto" }, { status: 400 });

    const res = await fetch("https://api.groq.com/openai/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "playai-tts",
        input: texto,
        voice: "Celeste-PlayAI",
        response_format: "mp3",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      await registrarChamadaIA({ modulo: "URBI", operacao: "tts", modelo: "playai-tts", duracaoMs: Date.now() - t0, status: "erro", motivoErro: err.slice(0, 500) });
      return NextResponse.json({ ok: false, erro: err }, { status: 500 });
    }

    const buffer = await res.arrayBuffer();
    await registrarChamadaIA({ modulo: "URBI", operacao: "tts", modelo: "playai-tts", tamanhoBytes: buffer.byteLength, duracaoMs: Date.now() - t0, status: "ok" });
    return new NextResponse(buffer, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (e: any) {
    await registrarChamadaIA({ modulo: "URBI", operacao: "tts", modelo: "playai-tts", duracaoMs: Date.now() - t0, status: "erro", motivoErro: (e?.message ?? "erro desconhecido").slice(0, 500) });
    return NextResponse.json({ ok: false, erro: e?.message }, { status: 500 });
  }
}
