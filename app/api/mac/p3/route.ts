import { NextRequest, NextResponse } from "next/server";
import { GEMINI_MODEL } from "@/lib/constants";
import { supabase } from "@/lib/supabaseClient";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 300;

type ChecklistItemIn = { id: string; texto: string; grupo: string };
type StatusItem = "conforme" | "nao_conforme" | "nao_aplica" | null;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey)
      return NextResponse.json(
        { ok: false, erro: "GEMINI_API_KEY nao configurada" },
        { status: 500 }
      );

    // Recebe via multipart: file (PDF), codigo, checklistItens (JSON string), analiseId
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const codigo = (form.get("codigo") as string | null) ?? "";
    const analiseId = (form.get("analiseId") as string | null) ?? null;
    const checklistItensRaw = (form.get("checklistItens") as string | null) ?? "[]";
    const assunto_id = (form.get("assunto_id") as string | null) ?? null;

    if (!file) {
      return NextResponse.json(
        { ok: false, erro: "Arquivo PDF nao informado" },
        { status: 400 }
      );
    }
    if (!codigo) {
      return NextResponse.json(
        { ok: false, erro: "codigo obrigatorio" },
        { status: 400 }
      );
    }

    let checklistItens: ChecklistItemIn[] = [];
    try {
      checklistItens = JSON.parse(checklistItensRaw);
    } catch {
      return NextResponse.json(
        { ok: false, erro: "checklistItens invalido (JSON malformado)" },
        { status: 400 }
      );
    }
    if (!Array.isArray(checklistItens) || checklistItens.length === 0) {
      return NextResponse.json(
        { ok: false, erro: "checklistItens vazio" },
        { status: 400 }
      );
    }

    // Confirma que o processo existe (mesma checagem que o S3 faz no final)
    const { data: proc } = await supabaseAdmin
      .from("processos")
      .select("id")
      .eq("codigo", codigo)
      .maybeSingle();
    if (!proc?.id) {
      return NextResponse.json(
        { ok: false, erro: "Processo nao encontrado" },
        { status: 404 }
      );
    }

    // Carrega prompt P3_MAC por slot: tenta o do assunto; se o slot não tiver o
    // seu próprio, cai no global (maior versão) — comportamento antigo, nada quebra.
    const assuntoValido = typeof assunto_id === "string" && /^[0-9a-f-]{36}$/i.test(assunto_id);
    let promptData: { conteudo: string; versao: number } | null = null;
    if (assuntoValido) {
      const { data } = await supabase
        .from("lip_prompts")
        .select("conteudo, versao")
        .eq("ativo", true).eq("chave", "P3_MAC").eq("assunto_id", assunto_id)
        .order("versao", { ascending: false }).limit(1).maybeSingle();
      promptData = data;
    }
    if (!promptData) {
      const { data } = await supabase
        .from("lip_prompts")
        .select("conteudo, versao")
        .eq("ativo", true).eq("chave", "P3_MAC")
        .order("versao", { ascending: false }).limit(1).maybeSingle();
      promptData = data;
    }
    if (!promptData) {
      return NextResponse.json(
        { ok: false, erro: "Prompt P3_MAC nao cadastrado" },
        { status: 500 }
      );
    }
    console.log(`[P3_MAC] Prompt versao ${promptData.versao} carregado.`);

    // 1) Upload do PDF ao Gemini Files API
    const sizeMb = (file.size / 1024 / 1024).toFixed(2);
    console.log(`[P3_MAC] Upload PDF: ${file.name} (${sizeMb} MB)`);
    const uploadRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          "X-Goog-Upload-Command": "upload, finalize",
          "X-Goog-Upload-Header-Content-Length": String(file.size),
          "X-Goog-Upload-Header-Content-Type": "application/pdf",
        },
        body: Buffer.from(await file.arrayBuffer()),
      }
    );
    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      return NextResponse.json(
        { ok: false, erro: `Upload Gemini falhou: ${err}` },
        { status: 500 }
      );
    }
    const uploadData = await uploadRes.json();
    const fileUri = uploadData.file?.uri;
    if (!fileUri) {
      return NextResponse.json(
        { ok: false, erro: "Upload Gemini nao retornou fileUri" },
        { status: 500 }
      );
    }

    // 2) Monta prompt final com o checklist
    const checklistEnxuto = checklistItens.map((i) => ({
      id: i.id,
      texto: i.texto,
      grupo: i.grupo,
    }));
    const ctxChecklist = `\n\n---\nCHECKLIST MAC (analisar cada item contra o PDF e classificar):\n${JSON.stringify(
      checklistEnxuto,
      null,
      2
    )}\n---`;
    const promptFinal = promptData.conteudo + ctxChecklist;
    console.log(`[P3_MAC] Prompt tamanho: ${promptFinal.length} chars`);

    // 3) Chama Gemini 2.5 Flash com PDF + prompt
    console.log(`[P3_MAC] Enviando para Gemini...`);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { fileData: { mimeType: "application/pdf", fileUri } },
                { text: promptFinal },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: 65536, temperature: 0.1 },
        }),
      }
    );
    if (!res.ok) {
      const errText = await res.text();
      console.error("[P3_MAC] Gemini erro completo:", errText);
      console.error("[P3_MAC] fileUri:", fileUri);
      console.error("[P3_MAC] modelo:", GEMINI_MODEL);
      if (res.status === 429) {
        return NextResponse.json(
          { ok: false, erro: "LIMITE_DIARIO_GEMINI" },
          { status: 429 }
        );
      }
      return NextResponse.json({ ok: false, erro: errText }, { status: res.status });
    }
    const data = await res.json();
    const texto: string =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    console.log("[P3_MAC] Resposta recebida:", texto.substring(0, 300));

    // 4) Faz parse e normaliza valores
    const clean = texto.replace(/```json|```/g, "").trim();
    let dados: Record<string, any> = {};
    try {
      dados = JSON.parse(clean);
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, erro: `Resposta do Gemini nao e JSON valido: ${e?.message}` },
        { status: 500 }
      );
    }

    // Compatibilidade: aceita tanto o formato novo { itens, documentos,
    // incompatibilidades } quanto o antigo (mapa flat { id: status }).
    const mapaItens: Record<string, any> =
      dados && typeof dados.itens === "object" && dados.itens !== null
        ? dados.itens
        : dados;
    const documentosLidos: any[] = Array.isArray(dados?.documentos) ? dados.documentos : [];
    const incompatibilidades: string[] = Array.isArray(dados?.incompatibilidades)
      ? dados.incompatibilidades.filter(Boolean).map(String)
      : [];

    const STATUS_VALIDOS = new Set<StatusItem>([
      "conforme",
      "nao_conforme",
      "nao_aplica",
      null,
    ]);
    const idsValidos = new Set(checklistEnxuto.map((i) => i.id));
    const itensOut: Record<string, StatusItem> = {};
    const fontesOut: Record<string, "p2"> = {};

    for (const [id, raw] of Object.entries(mapaItens)) {
      if (!idsValidos.has(id)) continue;
      let status: StatusItem = null;
      if (raw === null) status = null;
      else {
        const v = String(raw).toLowerCase().trim();
        if (v === "conforme") status = "conforme";
        else if (v === "nao_conforme" || v === "não_conforme") status = "nao_conforme";
        else if (v === "nao_aplica" || v === "não_aplica") status = "nao_aplica";
        else status = null;
      }
      if (!STATUS_VALIDOS.has(status)) status = null;
      itensOut[id] = status;
      fontesOut[id] = "p2";
    }

    const preenchidos = Object.values(itensOut).filter((v) => v !== null).length;
    console.log(`[P3_MAC] Concluido. ${preenchidos} item(ns) preenchido(s).`);

    // Audita leitura
    try {
      await supabaseAdmin.from("auditoria_log").insert({
        tabela: "analises_mac",
        registro_id: analiseId,
        operacao: "MAC_P3",
        dados_antes: null,
        dados_depois: {
          arquivo: file.name,
          itensPreenchidos: preenchidos,
          status: "OK",
        },
      });
    } catch (_) {}

    return NextResponse.json({
      ok: true,
      itens: itensOut,
      fontes: fontesOut,
      documentos: documentosLidos,
      incompatibilidades,
    });
  } catch (e: any) {
    console.error("[P3_MAC] Erro:", e?.message);
    return NextResponse.json(
      { ok: false, erro: e?.message || "Erro interno" },
      { status: 500 }
    );
  }
}
