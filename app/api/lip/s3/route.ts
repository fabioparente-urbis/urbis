import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { supabase } from "@/lib/supabaseClient";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { fileUri, documentos } = await req.json();
    if (!fileUri)
      return NextResponse.json({ ok: false, erro: "fileUri nao informado" }, { status: 400 });

    const { data: promptData, error: promptError } = await supabase
      .from("lip_prompts")
      .select("conteudo, versao")
      .eq("ativo", true)
      .order("versao", { ascending: false })
      .limit(1)
      .single();

    if (promptError || !promptData)
      return NextResponse.json({ ok: false, erro: "Prompt S3 nao encontrado." }, { status: 500 });

    console.log(`[S3] Prompt versao ${promptData.versao} carregado.`);

    const ctxDocs = documentos?.length
      ? `\n\n---\nMAPA DE DOCUMENTOS:\n${JSON.stringify(documentos, null, 2)}\n---`
      : "";
    const promptFinal = promptData.conteudo + ctxDocs;
    console.log(`[S3] Prompt tamanho: ${promptFinal.length} chars`);

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let texto = "";

    for (let tentativa = 1; tentativa <= 4; tentativa++) {
      try {
        console.log(`[S3] Enviando para Gemini... (tentativa ${tentativa}/4)`);
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [
            { fileData: { mimeType: "application/pdf", fileUri } },
            { text: promptFinal },
          ]}],
          
        });
        texto = response.text?.trim() ?? "";
        break;
      } catch (err: any) {
        const is503 = err?.message?.includes("503");
        const is429 = err?.message?.includes("429");
        if ((is503 || is429) && tentativa < 4) {
          const espera = tentativa * 8000;
          console.log(`[S3] Tentativa ${tentativa} falhou. Aguardando ${espera / 1000}s...`);
          await delay(espera);
        } else {
          throw err;
        }
      }
    }

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
        if (!val || ["null","n/a","nao identificado",""].includes(val.toLowerCase())) {
          campos[chave] = CAMPOS_NP.includes(chave)
            ? { valor: "NP", fonte: "Nao identificado" }
            : null;
        } else {
          campos[chave] = { valor: val, fonte: item.fonte ? String(item.fonte).trim() : "Processo SEI" };
        }
      }
      for (const c of CAMPOS_NP) {
        if (!campos[c]) campos[c] = { valor: "NP", fonte: "Nao identificado" };
      }
    }

    const preenchidos = Object.values(campos).filter((v) => v?.valor && v.valor !== "NP").length;
    console.log(`[S3] Concluido. ${preenchidos} campos preenchidos.`);

    return NextResponse.json({ ok: true, campos, alertasMAC: dados.alertasMAC ?? [], validacoes: dados.validacoes ?? {}, pendencias: dados.pendencias ?? [] });
  } catch (e: any) {
    console.error("[S3] Erro:", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}
