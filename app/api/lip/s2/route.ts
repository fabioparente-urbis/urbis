import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const maxDuration = 120;

const PROMPT_S2 = `Você é um assistente especializado em análise de processos administrativos de licenciamento de obras urbanas da Prefeitura de Goiânia.
Analise este PDF de processo administrativo e faça um inventário completo de todos os documentos presentes.
INSTRUÇÕES:
1. Liste todos os documentos encontrados no processo
2. Para cada documento, identifique o número SEI que aparece entre parênteses — normalmente no rodapé inferior da página, e em alguns casos na extremidade lateral (projetos AutoCAD)
3. Quando houver múltiplas versões do mesmo tipo de documento, identifique qual é a mais recente (maior número SEI ou última no processo)
4. Classifique cada documento em um dos tipos: matricula, uso_solo, laudo_tecnico, art_rrt, vistoria, procuracao, cheadv, planta, embargo, indice, outros
Responda APENAS com um JSON válido, sem texto adicional, sem markdown, sem explicações:
{
  "documentos": [
    {
      "tipo": "string",
      "descricao": "string",
      "paginas": [1, 2],
      "sei": "número SEI entre parênteses",
      "ultimaVersao": true
    }
  ]
}`;

export async function POST(req: NextRequest) {
  try {
    const { fileUri } = await req.json();
    if (!fileUri)
      return NextResponse.json({ ok: false, erro: "fileUri não informado" }, { status: 400 });

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    console.log("[S2] Enviando para Gemini...");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [
          { fileData: { mimeType: "application/pdf", fileUri } },
          { text: PROMPT_S2 },
        ],
      }] },
    });

    const texto = response.text?.trim() ?? "";
    console.log("[S2] Resposta recebida:", texto.substring(0, 200));
    const clean = texto.replace(/```json|```/g, "").trim();
    const dados = JSON.parse(clean);
    return NextResponse.json({ ok: true, ...dados });
  } catch (e: any) {
    console.error("[S2] Erro:", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}
