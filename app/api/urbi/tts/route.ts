import { NextRequest, NextResponse } from "next/server";
import { registrarChamadaIA } from "@/lib/iaUso";

/**
 * Voz do URBI. Provedor: ElevenLabs.
 *
 * Saiu do Groq em 01/09/2026 porque o `playai-tts` foi aposentado
 * (`model_decommissioned`) e a conta não tem substituto utilizável — o
 * `canopylabs/orpheus-v1-english` exige aceite de termos que não surtiu efeito.
 * O STT continua no Groq, com whisper-large-v3.
 *
 * A voz e a chave vêm do ambiente: trocar de voz é trocar ELEVENLABS_VOICE_ID,
 * sem tocar em código. Atenção ao plano — vozes da biblioteca do ElevenLabs
 * respondem 402 (`paid_plan_required`) no plano gratuito; só as nativas funcionam.
 */
const MODELO = "eleven_multilingual_v2";

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const { texto } = await req.json();
    if (!texto?.trim()) return NextResponse.json({ ok: false, erro: "sem texto" }, { status: 400 });

    const chave = process.env.ELEVENLABS_API_KEY;
    const voz = process.env.ELEVENLABS_VOICE_ID;
    if (!chave || !voz) {
      const falta = !chave ? "ELEVENLABS_API_KEY" : "ELEVENLABS_VOICE_ID";
      await registrarChamadaIA({ modulo: "URBI", operacao: "tts", modelo: MODELO, duracaoMs: Date.now() - t0, status: "erro", motivoErro: `${falta} ausente no ambiente` });
      return NextResponse.json({ ok: false, erro: `${falta} não configurada` }, { status: 500 });
    }

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voz}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": chave,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: texto, model_id: MODELO }),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      await registrarChamadaIA({ modulo: "URBI", operacao: "tts", modelo: MODELO, tokensEntrada: texto.length, duracaoMs: Date.now() - t0, status: "erro", motivoErro: err.slice(0, 500) });
      return NextResponse.json({ ok: false, erro: err }, { status: 500 });
    }

    const buffer = await res.arrayBuffer();
    // tokensEntrada guarda CARACTERES aqui — é a unidade que o ElevenLabs cobra.
    await registrarChamadaIA({ modulo: "URBI", operacao: "tts", modelo: MODELO, tokensEntrada: texto.length, tamanhoBytes: buffer.byteLength, duracaoMs: Date.now() - t0, status: "ok" });
    return new NextResponse(buffer, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (e: any) {
    await registrarChamadaIA({ modulo: "URBI", operacao: "tts", modelo: MODELO, duracaoMs: Date.now() - t0, status: "erro", motivoErro: (e?.message ?? "erro desconhecido").slice(0, 500) });
    return NextResponse.json({ ok: false, erro: e?.message }, { status: 500 });
  }
}
