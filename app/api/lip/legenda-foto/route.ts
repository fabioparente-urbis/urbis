import { NextRequest, NextResponse } from "next/server";
import { GEMINI_MODEL } from "@/lib/constants";
import { registrarChamadaIA } from "@/lib/iaUso";

export const maxDuration = 30;

/**
 * Gera uma legenda curta para uma foto anexada a um parecer (ex.: print de imagem
 * histórica do Google Earth, tela de embargo). O analista sempre pode editar antes
 * de gerar o documento — isto é só um rascunho.
 */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  let processoCodigo: string | null = null;
  try {
    const { imagemBase64, mimeType, processo, contexto } = await req.json();
    processoCodigo = typeof processo === "string" ? processo : null;
    if (!imagemBase64 || typeof imagemBase64 !== "string")
      return NextResponse.json({ ok: false, erro: "imagemBase64 não informado" }, { status: 400 });

    const tipo = typeof mimeType === "string" && mimeType.startsWith("image/") ? mimeType : "image/png";
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey)
      return NextResponse.json({ ok: false, erro: "GEMINI_API_KEY não configurada" }, { status: 500 });

    const prompt = "Descreva em UMA frase curta e objetiva, em português, o que esta imagem mostra, "
      + "para servir de legenda de foto anexa a um parecer técnico de análise de processo de obras/regularização. "
      + "Se houver data, coordenadas ou texto visível na imagem (ex.: print de mapa, sistema de embargo, vistoria), inclua isso na legenda. "
      + "Não use aspas, não comece com \"Imagem de\" ou \"Foto de\" — vá direto ao fato."
      + (contexto ? ` Contexto adicional dado pelo analista: ${String(contexto).slice(0, 300)}` : "");

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ inlineData: { mimeType: tipo, data: imagemBase64 } }, { text: prompt }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0.2 },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      await registrarChamadaIA({
        modulo: "LIP", operacao: "LEGENDA_FOTO", processoCodigo, modelo: GEMINI_MODEL,
        duracaoMs: Date.now() - t0, status: "erro", motivoErro: err.slice(0, 500),
      });
      return NextResponse.json({ ok: false, erro: err }, { status: 500 });
    }

    const data = await res.json();
    const legenda = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim().replace(/^["“]|["”]$/g, "");

    await registrarChamadaIA({
      modulo: "LIP", operacao: "LEGENDA_FOTO", processoCodigo, modelo: GEMINI_MODEL,
      duracaoMs: Date.now() - t0, status: "ok",
      tokensEntrada: data.usageMetadata?.promptTokenCount ?? null,
      tokensSaida: data.usageMetadata?.candidatesTokenCount ?? null,
    });

    return NextResponse.json({ ok: true, legenda: legenda || "Documento anexo ao parecer." });
  } catch (e: any) {
    await registrarChamadaIA({
      modulo: "LIP", operacao: "LEGENDA_FOTO", processoCodigo,
      duracaoMs: Date.now() - t0, status: "erro", motivoErro: e?.message,
    });
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}
