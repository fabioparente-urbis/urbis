// ============================================================
// SLOT 2 — ACEITE SEI · rota PRÓPRIA do slot. CÓPIA POR LEITURA de app/api/lip/s2/route.ts,
// 16/10/2026 (Etapa 2 do plano docs/URBIS_PLANO_SLOTS_3_4_PED.md — "5 programas
// independentes"). Diferenças: prompt P1 SÓ do Slot 2 e marcadores pela cópia em lib/aceiteSei/lip/.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { aplicarMarcadores } from "@/lib/aceiteSei/lip/promptCampos";
import { SLUG_ACEITE_SEI } from "@/lib/aceiteSei/identidade";
import { registrarChamadaIA } from "@/lib/iaUso";
import { escolherModeloPorTamanho } from "@/lib/modeloGemini";

export const maxDuration = 280;

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  let processoCodigo: string | null = null;
  let slot: string | null = null;
  /* Fora do try porque o catch também registra o uso, e ali precisa dizer qual modelo falhou.
     Sem tamanho informado é o padrão de sempre — nenhum chamador antigo muda de comportamento. */
  let modelo = escolherModeloPorTamanho(null);
  try {
    const { fileUri, assunto_id, mimeType, codigo, tipoProcesso, tamanhoBytes } = await req.json();
    // O tamanho vem do S1, que é quem viu o arquivo. Acima do teto do modelo padrão, a leitura
    // sobe para o modelo que suporta — Fase 2, ver lib/modeloGemini.ts.
    modelo = escolherModeloPorTamanho(typeof tamanhoBytes === "number" ? tamanhoBytes : null);
    processoCodigo = typeof codigo === "string" ? codigo : null;
    void tipoProcesso;
    slot = SLUG_ACEITE_SEI;
    // Sem isto, print de tela ia para o Gemini rotulado como PDF.
    const tipo = typeof mimeType === "string" && mimeType.startsWith("image/") ? mimeType : "application/pdf";
    if (!fileUri)
      return NextResponse.json({ ok: false, erro: "fileUri não informado" }, { status: 400 });

    // Prompt por slot: tenta o prompt do assunto; se o slot não tiver o seu
    // próprio, cai no global (maior versão) — comportamento antigo, nada quebra.
    // Assunto SEMPRE o do Slot 2, resolvido pelo slug — nunca o que vier no corpo.
    void assunto_id;
    const { data: assuntoSlot } = await supabaseAdmin.from("assuntos").select("id").eq("slug", SLUG_ACEITE_SEI).maybeSingle();
    const assuntoDoSlot: string | null = (assuntoSlot as any)?.id ?? null;
    const assuntoValido = !!assuntoDoSlot;
    let promptData: { conteudo: string; versao: number } | null = null;
    if (assuntoDoSlot) {
      const { data } = await supabaseAdmin
        .from("lip_prompts")
        .select("conteudo, versao")
        .eq("ativo", true).eq("chave", "P1_TRIAGEM").eq("assunto_id", assuntoDoSlot)
        .order("versao", { ascending: false }).limit(1).maybeSingle();
      promptData = data;
    }
    // Sem cair no prompt de outro assunto: sem prompt do Slot 2, para e avisa.
    if (!promptData)
      return NextResponse.json({ ok: false, erro: "Prompt P1_TRIAGEM do Slot 2 (Aceite SEI) não encontrado ou inativo." }, { status: 500 });

    console.log(`[S2] Prompt versao ${promptData.versao} carregado.`);

    const apiKey = process.env.GEMINI_API_KEY;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { fileData: { mimeType: tipo, fileUri } },
              { text: await aplicarMarcadores(promptData.conteudo, { assunto_id: assuntoValido ? assuntoDoSlot : null, codigo: null }) },
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
        modelo, duracaoMs: Date.now() - t0, status: "erro", motivoErro: err.slice(0, 500),
      });
      return NextResponse.json({ ok: false, erro: err }, { status: 500 });
    }

    const data = await res.json();
    const texto = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    const clean = texto.replace(/```json|```/g, "").trim();
    const dados = JSON.parse(clean);

    await registrarChamadaIA({
      modulo: "LIP", slot, operacao: "S2_MAPA_DOCUMENTOS", processoCodigo,
      modelo, duracaoMs: Date.now() - t0, status: "ok",
      tokensEntrada: data.usageMetadata?.promptTokenCount ?? null,
      tokensSaida: data.usageMetadata?.candidatesTokenCount ?? null,
    });

    return NextResponse.json({ ok: true, ...dados });
  } catch (e: any) {
    await registrarChamadaIA({
      modulo: "LIP", slot, operacao: "S2_MAPA_DOCUMENTOS", processoCodigo,
      modelo, duracaoMs: Date.now() - t0, status: "erro", motivoErro: e?.message,
    });
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}
