import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
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
      return NextResponse.json({ ok: false, erro: err }, { status: 500 });
    }

    const texto = (await res.text()).trim();
    return NextResponse.json({ ok: true, texto });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message }, { status: 500 });
  }
}
