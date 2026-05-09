import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "@/lib/supabaseClient";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { fileUri, documentos } = await req.json();
    if (!fileUri)
      return NextResponse.json({ ok: false, erro: "fileUri não informado" }, { status: 400 });

    const { data: promptData, error: promptError } = await supabase
      .from("lip_prompts")
      .select("conteudo, versao")
      .eq("ativo", true)
      .order("versao", { ascending: false })
      .limit(1)
      .single();

    if (promptError || !promptData)
      return NextResponse.json(
        { ok: false, erro: "Prompt S3 não encontrado. Cadastre-o no painel admin." },
        { status: 500 }
      );

    console.log(`[S3] Prompt versão ${promptData.versao} carregado.`);

    const ctxDocs = documentos
      ? `\n\n---\nMAPA DE DOCUMENTOS IDENTIFICADOS PELO S2:\n${JSON.stringify(documentos, null, 2)}\n---`
      : "";
    const promptFinal = 'Analise o PDF e retorne apenas JSON valido.';
    console.log(`[S3] Prompt tamanho: ${promptFinal.length} chars`);

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let resultado: any = null;
    for (let tentativa = 1; tentativa <= 4; tentativa++) {
      try {
        console.log(`[S3] Enviando para Gemini... (tentativa ${tentativa}/4)`);
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [
                { fileData: { mimeType: "application/pdf", fileUri } },
                { text: promptFinal },
              ]}],
              generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
            }),
          }
        );
        if (!geminiRes.ok) throw new Error(`${geminiRes.status} ${await geminiRes.text()}`);
        resultado = await geminiRes.json();
        break;
      } catch (err: any) {
        const is503 = err?.message?.includes("503") || err?.message?.includes("503 Service Unavailable");
        const is429 = err?.message?.includes("429");
        if ((is503 || is429) && tentativa < 4) {
          const espera = tentativa * 8000;
          console.log(`[S3] Tentativa ${tentativa} falhou (${is503 ? "503" : "429"}). Aguardando ${espera / 1000}s...`);
          await delay(espera);
        } else {
          throw err;
        }
      }
    }

    const texto = resultado.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    console.log("[S3] Resposta recebida:", texto.substring(0, 300));

    const clean = texto.replace(/```json|```/g, "").trim();
    const dados = JSON.parse(clean);

    const CAMPOS_NP = [
      "cnae1","cnae2","cnae3","cnae4","cnae5","faixa",
      "volMin","volAt","caixas","qualOutro","dataEmb",
      "artCx","foto","despacho","seiCheadv","seiProcuracao",
      "seiEmbargo","areaAprovada","usoSolo","processoFisico",
    ];

    const campos: Record<string, { valor: string; fonte: string } | null> = {};
    if (dados.campos) {
      for (const [chave, item] of Object.entries(dados.campos as Record<string, any>)) {
        const val = item?.valor?.toString().trim();
        if (!val || ["null","n/a","não identificado",""].includes(val.toLowerCase())) {
          campos[chave] = CAMPOS_NP.includes(chave)
            ? { valor: "NP", fonte: "Não identificado" }
            : null;
        } else {
          campos[chave] = {
            valor: val,
            fonte: item.fonte ? String(item.fonte).trim() : "Processo SEI",
          };
        }
      }
      for (const c of CAMPOS_NP) {
        if (!campos[c]) campos[c] = { valor: "NP", fonte: "Não identificado" };
      }
    }

    const preenchidos = Object.values(campos).filter(
      (v) => v?.valor && v.valor !== "NP"
    ).length;
    console.log(`[S3] Concluído. ${preenchidos} campos preenchidos.`);

    return NextResponse.json({
      ok: true,
      campos,
      alertasMAC: dados.alertasMAC ?? [],
      validacoes: dados.validacoes ?? {},
      pendencias: dados.pendencias ?? [],
    });
  } catch (e: any) {
    console.error("[S3] Erro:", e?.message);
    return NextResponse.json(
      { ok: false, erro: e?.message || "Erro interno" },
      { status: 500 }
    );
  }
}
