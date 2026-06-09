import { NextRequest, NextResponse } from "next/server";
import { GEMINI_MODEL } from "@/lib/constants";
import { supabase } from "@/lib/supabaseClient";
import { createClient } from "@supabase/supabase-js";
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
export const maxDuration = 300;
export async function POST(req: NextRequest) {
  try {
    const { fileUri, documentos, codigo, fileName, pdfBase64 } = await req.json();
    if (!fileUri)
      return NextResponse.json({ ok: false, erro: "fileUri nao informado" }, { status: 400 });
    const { data: promptData, error: promptError } = await supabase
      .from("lip_prompts")
      .select("conteudo, versao")
      .eq("ativo", true)
      .eq("chave", "P2_EXTRACAO")
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
    const apiKey = process.env.GEMINI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    let texto = "";

    // Cascata: gemini-2.0-flash → gemini-1.5-flash-002 → claude-haiku
    const modelos = ["gemini-2.0-flash", "gemini-2.5-flash"];
    let geminiOk = false;
    for (const modelo of modelos) {
      console.log(`[S3] Tentando ${modelo}...`);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ fileData: { mimeType: "application/pdf", fileUri } }, { text: promptFinal }] }],
            generationConfig: { maxOutputTokens: 8192, temperature: 0.1 },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        texto = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
        if (texto) { geminiOk = true; console.log(`[S3] OK com ${modelo}`); break; }
      }
      console.log(`[S3] ${modelo} falhou (status ${res.status}), tentando próximo...`);
    }

    // Sem fallback — processo inteiro só via Gemini
    if (!geminiOk) {
      return NextResponse.json({ ok: false, erro: "LIMITE_DIARIO_GEMINI" }, { status: 429 });
    }
    console.log("[S3] Resposta recebida:", texto.substring(0, 300));
    const clean = texto.replace(/\`\`\`json|\`\`\`/g, "").trim();
    const dados = JSON.parse(clean);
    const CAMPOS_NP = [
      "cnae1","cnae2","cnae3","cnae4","cnae5","faixa",
      "volMin","volAt","caixas","qualOutro","dataEmb",
      "artCx","foto","despacho","seiCheadv","seiProcuracao",
      "seiEmbargo","areaAprovada","usoSolo","processoFisico","arqNome","arqCau","faixaAmpliacacao","caixaRecarga","volMinimoCaixa","volAtendidoCaixa","numCaixas","areaImpermeavelCalc","nOutroProcesso","seiEmbargo","dataEmbargo","seiProcuracao","seiOnerosa","seiArtCaixaRecarga","seiFotoGoogle","areaAprovada",
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
    // Registra leitura no historico
    if (codigo) {
      try {
        const { data: proc } = await supabaseAdmin.from("processos").select("id").eq("codigo", codigo).maybeSingle();
        if (proc?.id) {
          await supabaseAdmin.from("auditoria_log").insert({
            tabela: "processos",
            registro_id: proc.id,
            operacao: "LIP_LEITURA",
            dados_antes: null,
            dados_depois: { arquivo: fileName ?? "arquivo.pdf", camposPreenchidos: preenchidos, status: "OK" },
          });
        }
      } catch (_) {}
    }
    return NextResponse.json({ ok: true, campos, alertasMAC: dados.alertasMAC ?? [], validacoes: dados.validacoes ?? {}, pendencias: dados.pendencias ?? [] });
  } catch (e: any) {
    console.error("[S3] Erro:", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}
