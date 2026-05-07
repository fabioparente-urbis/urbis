import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "@/lib/supabaseClient";

export const maxDuration = 60;

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
      ? `\n\n---\nMAPA DE DOCUMENTOS IDENTIFICADOS PELO S2 (use como guia de localização):\n${JSON.stringify(documentos, null, 2)}\n---`
      : "";

    const promptFinal = promptData.conteudo + ctxDocs;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    console.log("[S3] Enviando para Gemini...");
    const result = await model.generateContent([
      { fileData: { mimeType: "application/pdf", fileUri } },
      { text: promptFinal },
    ]);

    const texto = result.response.text().trim();
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
