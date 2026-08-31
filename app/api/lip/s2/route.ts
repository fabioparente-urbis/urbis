import { NextRequest, NextResponse } from "next/server";
import { GEMINI_MODEL } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { aplicarMarcadores } from "@/lib/promptCampos";
import { registrarChamadaIA } from "@/lib/iaUso";

export const maxDuration = 280;

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  let processoCodigo: string | null = null;
  let slot: string | null = null;
  try {
    const { fileUri, assunto_id, mimeType, codigo, tipoProcesso } = await req.json();
    processoCodigo = typeof codigo === "string" ? codigo : null;
    slot = typeof tipoProcesso === "string" ? tipoProcesso : null;
    // Sem isto, print de tela ia para o Gemini rotulado como PDF.
    const tipo = typeof mimeType === "string" && mimeType.startsWith("image/") ? mimeType : "application/pdf";
    if (!fileUri)
      return NextResponse.json({ ok: false, erro: "fileUri não informado" }, { status: 400 });

    // Prompt por slot: tenta o prompt do assunto; se o slot não tiver o seu
    // próprio, cai no global (maior versão) — comportamento antigo, nada quebra.
    const assuntoValido = typeof assunto_id === "string" && /^[0-9a-f-]{36}$/i.test(assunto_id);
    let promptData: { conteudo: string; versao: number } | null = null;
    if (assuntoValido) {
      const { data } = await supabaseAdmin
        .from("lip_prompts")
        .select("conteudo, versao")
        .eq("ativo", true).eq("chave", "P1_TRIAGEM").eq("assunto_id", assunto_id)
        .order("versao", { ascending: false }).limit(1).maybeSingle();
      promptData = data;
    }
    if (!promptData) {
      const { data } = await supabaseAdmin
        .from("lip_prompts")
        .select("conteudo, versao")
        .eq("ativo", true).eq("chave", "P1_TRIAGEM")
        .order("versao", { ascending: false }).limit(1).maybeSingle();
      promptData = data;
    }

    if (!promptData)
      return NextResponse.json({ ok: false, erro: "Prompt P1 não encontrado." }, { status: 500 });

    console.log(`[S2] Prompt versao ${promptData.versao} carregado.`);

    const apiKey = process.env.GEMINI_API_KEY;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { fileData: { mimeType: tipo, fileUri } },
              { text: await aplicarMarcadores(promptData.conteudo, { assunto_id: assuntoValido ? assunto_id : null, codigo: null }) },
            ],
          }],
          generationConfig: { maxOutputTokens: 8192, temperature: 0.1 },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      await registrarChamadaIA({
        modulo: "LIP", slot, operacao: "S2_MAPA_DOCUMENTOS", processoCodigo,
        modelo: GEMINI_MODEL, duracaoMs: Date.now() - t0, status: "erro", motivoErro: err.slice(0, 500),
      });
      return NextResponse.json({ ok: false, erro: err }, { status: 500 });
    }

    const data = await res.json();
    const texto = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    const clean = texto.replace(/```json|```/g, "").trim();
    const dados = JSON.parse(clean);

    await registrarChamadaIA({
      modulo: "LIP", slot, operacao: "S2_MAPA_DOCUMENTOS", processoCodigo,
      modelo: GEMINI_MODEL, duracaoMs: Date.now() - t0, status: "ok",
      tokensEntrada: data.usageMetadata?.promptTokenCount ?? null,
      tokensSaida: data.usageMetadata?.candidatesTokenCount ?? null,
    });

    return NextResponse.json({ ok: true, ...dados });
  } catch (e: any) {
    await registrarChamadaIA({
      modulo: "LIP", slot, operacao: "S2_MAPA_DOCUMENTOS", processoCodigo,
      modelo: GEMINI_MODEL, duracaoMs: Date.now() - t0, status: "erro", motivoErro: e?.message,
    });
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}
