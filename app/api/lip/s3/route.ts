import { NextRequest, NextResponse } from "next/server";
import { GEMINI_MODEL, type GeminiModel } from "@/lib/constants";

const _modeloValidado: GeminiModel = GEMINI_MODEL;
import { supabase } from "@/lib/supabaseClient";
import { createClient } from "@supabase/supabase-js";
import { blocoPromptMarcoTemporal } from "@/lib/marcoTemporal";
import { aplicarMarcadores } from "@/lib/promptCampos";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { fileUri, documentos, codigo, fileName, pdfBase64, assunto_id, mimeType } = await req.json();
    const tipoArquivo = typeof mimeType === "string" && mimeType.startsWith("image/") ? mimeType : "application/pdf";
    if (!fileUri)
      return NextResponse.json({ ok: false, erro: "fileUri nao informado" }, { status: 400 });

    // Trava de budget
    const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: chamadasRecentes } = await supabaseAdmin
      .from("urbis_api_calls")
      .select("*", { count: "exact", head: true })
      .gte("criado_em", umaHoraAtras)
      .eq("status", "ok");
    if ((chamadasRecentes ?? 0) >= 50) {
      return NextResponse.json({ ok: false, erro: "BUDGET_EXCEDIDO", detalhe: "Limite de 50 chamadas/hora atingido." }, { status: 429 });
    }

    // Carrega prompt
    const assuntoValido = typeof assunto_id === "string" && /^[0-9a-f-]{36}$/i.test(assunto_id);
    let promptData: { conteudo: string; versao: number } | null = null;
    if (assuntoValido) {
      const { data } = await supabase
        .from("lip_prompts")
        .select("conteudo, versao")
        .eq("ativo", true).eq("chave", "P2_EXTRACAO").eq("assunto_id", assunto_id)
        .order("versao", { ascending: false }).limit(1).maybeSingle();
      promptData = data;
    }
    if (!promptData) {
      const { data } = await supabase
        .from("lip_prompts")
        .select("conteudo, versao")
        .eq("ativo", true).eq("chave", "P2_EXTRACAO")
        .order("versao", { ascending: false }).limit(1).maybeSingle();
      promptData = data;
    }
    if (!promptData)
      return NextResponse.json({ ok: false, erro: "Prompt S3 nao encontrado." }, { status: 500 });

    console.log(`[S3] Prompt versao ${promptData.versao} carregado.`);
    const ctxDocs = documentos?.length
      ? `\n\n---\nMAPA DE DOCUMENTOS:\n${JSON.stringify(documentos, null, 2)}\n---`
      : "";

    // Marco temporal (LC 314/2018): só Regularização SEI e Aceite SEI têm data
    // limite. O bloco vai DEPOIS do prompt do slot — acrescenta a verificação
    // da última vistoria sem alterar nada do que o slot já extrai.
    let tipoProcesso: string | null = null;
    if (codigo) {
      const { data: procTipo } = await supabaseAdmin
        .from("processos")
        .select("tipo_processo")
        .eq("codigo", codigo)
        .maybeSingle();
      tipoProcesso = (procTipo as any)?.tipo_processo ?? null;
    }
    const blocoMarco = blocoPromptMarcoTemporal(tipoProcesso);

    // Marcadores resolvidos pelo banco ({{CAMPOS_DO_ASSUNTO}},
    // {{ESQUELETO_JSON}}, {{CAMPOS_VAZIOS}}). Prompt sem marcador passa
    // intacto — nada muda até alguém decidir usar.
    const conteudoResolvido = await aplicarMarcadores(promptData.conteudo, {
      assunto_id: assuntoValido ? assunto_id : null,
      codigo: typeof codigo === "string" ? codigo : null,
    });
    const promptFinal = conteudoResolvido + ctxDocs + blocoMarco;

    // Cria job no banco
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("lip_jobs")
      .insert({ processo_codigo: codigo ?? null, status: "processando" })
      .select("id")
      .single();

    if (jobErr || !job)
      return NextResponse.json({ ok: false, erro: "Erro ao criar job: " + jobErr?.message }, { status: 500 });

    const jobId = (job as any).id as string;
    const apiKey = process.env.GEMINI_API_KEY!;

    // Dispara processamento em background (Railway é Node.js persistente — sem serverless)
    processarJobBackground(jobId, { fileUri, promptFinal, apiKey, codigo, fileName, tipoProcesso, tipoArquivo }).catch(
      (e) => console.error("[S3-bg] erro não capturado:", e?.message)
    );

    return NextResponse.json({ ok: true, jobId });
  } catch (e: any) {
    console.error("[S3] Erro:", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}

const CAMPOS_NP = [
  "cnae1","cnae2","cnae3","cnae4","cnae5","faixa",
  "volMin","volAt","caixas","qualOutro","dataEmb",
  "artCx","foto","despacho","seiCheadv","seiProcuracao",
  "seiEmbargo","areaAprovada","usoSolo","processoFisico","arqNome","arqCau",
  "faixaAmpliacacao","caixaRecarga","volMinimoCaixa","volAtendidoCaixa","numCaixas",
  "areaImpermeavelCalc","nOutroProcesso","dataEmbargo","seiOnerosa",
  "seiArtCaixaRecarga","seiFotoGoogle",
];

async function processarJobBackground(jobId: string, params: {
  fileUri: string;
  promptFinal: string;
  apiKey: string;
  codigo?: string;
  fileName?: string;
  tipoProcesso?: string | null;
  /** application/pdf ou image/* — o print de tela precisa ir como imagem. */
  tipoArquivo?: string;
}) {
  const { fileUri, promptFinal, apiKey, codigo, fileName, tipoProcesso } = params;
  const tipoArquivo = params.tipoArquivo ?? "application/pdf";
  try {
    let texto = "";
    let geminiOk = false;
    let ultimoStatus = 0;
    let ultimoCorpo = "";
    const MAX_TENTATIVAS = 4;

    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      console.log(`[S3-bg] job=${jobId} tentativa ${tentativa}/${MAX_TENTATIVAS}`);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ fileData: { mimeType: tipoArquivo, fileUri } }, { text: promptFinal }] }],
            generationConfig: { maxOutputTokens: 65536, temperature: 0.1 },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        texto = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
        if (texto) { geminiOk = true; console.log(`[S3-bg] job=${jobId} OK`); break; }
        ultimoStatus = 200;
        ultimoCorpo = "Resposta vazia. finishReason: " + (data.candidates?.[0]?.finishReason ?? "?");
      } else {
        ultimoStatus = res.status;
        ultimoCorpo = (await res.text()).slice(0, 500);
      }
      console.log(`[S3-bg] job=${jobId} falhou (${ultimoStatus}): ${ultimoCorpo.slice(0, 200)}`);
      const sobrecarga = ultimoStatus === 503 || ultimoCorpo.toLowerCase().includes("overloaded") || ultimoCorpo.toLowerCase().includes("high demand");
      if ((sobrecarga || ultimoStatus === 200) && tentativa < MAX_TENTATIVAS) {
        await new Promise((r) => setTimeout(r, tentativa * 4000));
        continue;
      }
      break;
    }

    if (!geminiOk) {
      let motivo = "ERRO_GEMINI";
      const cl = ultimoCorpo.toLowerCase();
      if (ultimoStatus === 429 || cl.includes("resource_exhausted") || cl.includes("quota")) motivo = "LIMITE_DIARIO_GEMINI";
      else if (ultimoStatus === 400 && (cl.includes("invalid_argument") || cl.includes("not found"))) motivo = "MODELO_INVALIDO";
      else if (ultimoStatus === 413 || cl.includes("file_too_large") || cl.includes("too large")) motivo = "ARQUIVO_GRANDE";
      else if (ultimoStatus === 503 || cl.includes("overloaded")) motivo = "GEMINI_SOBRECARREGADO";
      else if (ultimoStatus === 200) motivo = "RESPOSTA_VAZIA";
      await supabaseAdmin.from("lip_jobs").update({
        status: "erro",
        erro: motivo + ": " + ultimoCorpo.slice(0, 300),
        atualizado_em: new Date().toISOString(),
      }).eq("id", jobId);
      return;
    }

    const clean = texto.replace(/```json|```/g, "").trim();
    let dados: any;
    try {
      dados = JSON.parse(clean);
    } catch (parseErr: any) {
      await supabaseAdmin.from("lip_jobs").update({
        status: "erro",
        erro: `JSON inválido do Gemini: ${parseErr.message} | Início da resposta: ${clean.slice(0, 400)}`,
        atualizado_em: new Date().toISOString(),
      }).eq("id", jobId);
      return;
    }

    if (!dados.campos || Object.keys(dados.campos).length === 0) {
      await supabaseAdmin.from("lip_jobs").update({
        status: "erro",
        erro: `Gemini respondeu sem a chave "campos". Chaves recebidas: ${Object.keys(dados).join(", ") || "(nenhuma)"} | Resposta: ${clean.slice(0, 400)}`,
        atualizado_em: new Date().toISOString(),
      }).eq("id", jobId);
      return;
    }

    const campos: Record<string, { valor: string; fonte: string } | null> = {};
    if (dados.campos) {
      for (const [chave, item] of Object.entries(dados.campos as Record<string, any>)) {
        const val = item?.valor?.toString().trim();
        if (!val || ["null","n/a","nao identificado",""].includes(val.toLowerCase())) {
          campos[chave] = CAMPOS_NP.includes(chave) ? { valor: "NP", fonte: "Nao identificado" } : null;
        } else {
          campos[chave] = { valor: val, fonte: item.fonte ? String(item.fonte).trim() : "Processo SEI" };
        }
      }
      for (const c of CAMPOS_NP) {
        if (!campos[c]) campos[c] = { valor: "NP", fonte: "Nao identificado" };
      }

      // "Sem uso definido": o CNAE 000000008 (ou "8") NÃO é atividade econômica —
      // é a ausência de uso definido. Trata como se não houvesse CNAE (tudo NP) e
      // marca usoDefinido="Não". Trava determinística: o modelo às vezes devolve o
      // código cru "000000008" em vez de reconhecer o "sem uso definido".
      const c1 = (campos.cnae1?.valor || "").trim();
      if (/^0*8$/.test(c1) || /sem uso definido/i.test(c1)) {
        for (const c of ["cnae1", "cnae2", "cnae3", "cnae4", "cnae5"]) {
          campos[c] = { valor: "NP", fonte: "Sem uso definido" };
        }
        campos.usoDefinido = { valor: "Não", fonte: campos.usoDefinido?.fonte || "Despacho CHEADV" };
      }
    }

    const preenchidos = Object.values(campos).filter((v) => v?.valor && v.valor !== "NP").length;
    console.log(`[S3-bg] job=${jobId} concluido. ${preenchidos} campos preenchidos. resultado salvo.`);
    console.log(`[S3-bg] job=${jobId} amostra campos:`, JSON.stringify(Object.entries(campos).slice(0, 5)));

    await supabaseAdmin.from("lip_jobs").update({
      status: "concluido",
      resultado: {
        campos,
        alertasMAC: dados.alertasMAC ?? [],
        validacoes: dados.validacoes ?? {},
        pendencias: dados.pendencias ?? [],
        // Marco temporal (LC 314/2018) — só vem preenchido nos slots que têm
        // data limite; o veredito é do fiscal, o URBIS só repassa.
        marcoTemporal: dados.marcoTemporal ?? null,
        tipoProcesso: tipoProcesso ?? null,
      },
      atualizado_em: new Date().toISOString(),
    }).eq("id", jobId);

    // Auditoria
    if (codigo) {
      try {
        const { data: proc } = await supabaseAdmin.from("processos").select("id").eq("codigo", codigo).maybeSingle();
        if ((proc as any)?.id) {
          await supabaseAdmin.from("auditoria_log").insert({
            tabela: "processos",
            registro_id: (proc as any).id,
            operacao: "LIP_LEITURA",
            dados_antes: null,
            dados_depois: { arquivo: fileName ?? "arquivo.pdf", camposPreenchidos: preenchidos, status: "OK" },
          });
        }
      } catch (_) {}
    }
  } catch (e: any) {
    console.error(`[S3-bg] job=${jobId} falha:`, e?.message);
    await supabaseAdmin.from("lip_jobs").update({
      status: "erro",
      erro: e?.message || "Erro desconhecido",
      atualizado_em: new Date().toISOString(),
    }).eq("id", jobId);
  }
}
