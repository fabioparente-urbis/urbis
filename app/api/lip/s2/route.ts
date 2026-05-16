import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { fileUri } = await req.json();
    if (!fileUri)
      return NextResponse.json({ ok: false, erro: "fileUri não informado" }, { status: 400 });

    const { data: promptData, error: promptError } = await supabase
      .from("lip_prompts")
      .select("conteudo, versao")
      .eq("ativo", true)
      .eq("chave", "P1_TRIAGEM")
      .order("versao", { ascending: false })
      .limit(1)
      .single();

    if (promptError || !promptData)
      return NextResponse.json({ ok: false, erro: "Prompt P1 não encontrado." }, { status: 500 });

    console.log(`[S2] Prompt versao ${promptData.versao} carregado.`);

    const apiKey = process.env.GEMINI_API_KEY;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { fileData: { mimeType: "application/pdf", fileUri } },
              { text: promptData.conteudo },
            ],
          }],
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ ok: false, erro: err }, { status: 500 });
    }

    const data = await res.json();
    const texto = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    const clean = texto.replace(/```json|```/g, "").trim();
    const dados = JSON.parse(clean);

    return NextResponse.json({ ok: true, ...dados });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}
