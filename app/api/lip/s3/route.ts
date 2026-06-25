import { NextRequest, NextResponse } from "next/server";
import { GEMINI_MODEL, type GeminiModel } from "@/lib/constants";

// Força erro de build se GEMINI_MODEL não for um modelo válido
const _modeloValidado: GeminiModel = GEMINI_MODEL;
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

    // ── Trava de budget: bloqueia se > 50 chamadas na última hora ──
    const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: chamadasRecentes } = await supabaseAdmin
      .from("urbis_api_calls")
      .select("*", { count: "exact", head: true })
      .gte("criado_em", umaHoraAtras)
      .eq("status", "ok");
    if ((chamadasRecentes ?? 0) >= 50) {
      console.error("[S3] BUDGET BLOQUEADO: mais de 50 chamadas na última hora");
      return NextResponse.json({ ok: false, erro: "BUDGET_EXCEDIDO", detalhe: "Limite de 50 chamadas/hora atingido." }, { status: 429 });
    }
    let texto = "";

    // Cascata: gemini-2.0-flash → gemini-1.5-flash-002 → claude-haiku
    const modelos = [GEMINI_MODEL];
    let geminiOk = false;
    let ultimoStatus = 0;
    let ultimoCorpo = "";
    for (const modelo of modelos) {
      console.log(`[S3] Tentando ${modelo}...`);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ fileData: { mimeType: "application/pdf", fileUri } }, { text: promptFinal }] }],
            generationConfig: { maxOutputTokens: 8192, temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        texto = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
        if (texto) { geminiOk = true; console.log(`[S3] OK com ${modelo}`); break; }
        ultimoStatus = 200;
        ultimoCorpo = "Resposta vazia. finishReason: " + (data.candidates?.[0]?.finishReason ?? "?");
      } else {
        ultimoStatus = res.status;
        ultimoCorpo = (await res.text()).slice(0, 500);
      }
      console.log(`[S3] ${modelo} falhou (status ${res.status}): ${ultimoCorpo.slice(0, 200)}`);
    }

    // Sem fallback — processo inteiro só via Gemini
    if (!geminiOk) {
      let motivo = "ERRO_GEMINI";
      const corpoLower = ultimoCorpo.toLowerCase();
      if (ultimoStatus === 429 || corpoLower.includes("resource_exhausted") || corpoLower.includes("quota")) motivo = "LIMITE_DIARIO_GEMINI";
      else if (ultimoStatus === 400 && (corpoLower.includes("invalid_argument") || corpoLower.includes("model") || corpoLower.includes("not found") || corpoLower.includes("does not exist"))) motivo = "MODELO_INVALIDO";
      else if (ultimoStatus === 400 && (corpoLower.includes("api_key_invalid") || corpoLower.includes("api key not valid"))) motivo = "CHAVE_INVALIDA";
      else if (ultimoStatus === 400) motivo = "REQUISICAO_INVALIDA";
      else if (ultimoStatus === 404 || corpoLower.includes("no longer available") || corpoLower.includes("not_found")) motivo = "MODELO_INDISPONIVEL";
      else if (ultimoStatus === 413 || corpoLower.includes("file_too_large") || corpoLower.includes("too large") || corpoLower.includes("exceeds the limit")) motivo = "ARQUIVO_GRANDE";
      else if (ultimoStatus === 503 || corpoLower.includes("overloaded") || corpoLower.includes("high demand")) motivo = "GEMINI_SOBRECARREGADO";
      else if (ultimoStatus === 200) motivo = "RESPOSTA_VAZIA";
      console.error(`[S3] FALHA DEFINITIVA: motivo=${motivo} status=${ultimoStatus} corpo=${ultimoCorpo}`);
      return NextResponse.json({ ok: false, erro: motivo, status_http: ultimoStatus, detalhe: ultimoCorpo.slice(0, 300) }, { status: ultimoStatus === 429 ? 429 : 502 });
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
