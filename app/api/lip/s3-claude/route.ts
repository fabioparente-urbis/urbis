import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { pdfBase64, codigo, fileName } = await req.json();
    if (!pdfBase64)
      return NextResponse.json({ ok: false, erro: "pdfBase64 nao informado" }, { status: 400 });

    // Buscar prompt P2 do banco (mesmo prompt do S3)
    const { data: promptData, error: promptError } = await supabaseAdmin
      .from("lip_prompts")
      .select("conteudo, versao")
      .eq("ativo", true)
      .eq("chave", "P2_EXTRACAO")
      .order("versao", { ascending: false })
      .limit(1)
      .single();
    if (promptError || !promptData)
      return NextResponse.json({ ok: false, erro: "Prompt nao encontrado." }, { status: 500 });

    console.log(`[S3-Claude] Prompt versao ${promptData.versao} | arquivo: ${fileName}`);

    const anthropicKey = process.env.ANTHROPIC_API_KEY!;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 8000,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            },
            { type: "text", text: promptData.conteudo },
          ],
        }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      throw new Error("Claude: " + err);
    }

    const claudeData = await claudeRes.json();
    const texto = claudeData.content?.[0]?.text?.trim() ?? "";
    console.log("[S3-Claude] Resposta:", texto.substring(0, 300));

    const clean = texto.replace(/```json|```/g, "").trim();
    const dados = JSON.parse(clean);

    const CAMPOS_NP = [
      "cnae1","cnae2","cnae3","cnae4","cnae5","faixa",
      "volMin","volAt","caixas","qualOutro","dataEmb",
      "artCx","foto","despacho","seiCheadv","seiProcuracao",
      "seiEmbargo","areaAprovada","usoSolo","processoFisico","arqNome","arqCau",
      "faixaAmpliacacao","caixaRecarga","volMinimoCaixa","volAtendidoCaixa","numCaixas",
      "areaImpermeavelCalc","nOutroProcesso","dataEmbargo","seiOnerosa",
      "seiArtCaixaRecarga","seiFotoGoogle",
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
          campos[chave] = {
            valor: val,
            fonte: item.fonte ? String(item.fonte).trim() : fileName ?? "Documento SEI",
          };
        }
      }
      for (const c of CAMPOS_NP) {
        if (!campos[c]) campos[c] = { valor: "NP", fonte: "Nao identificado" };
      }
    }

    const preenchidos = Object.values(campos).filter((v) => v?.valor && v.valor !== "NP").length;
    console.log(`[S3-Claude] Concluido. ${preenchidos} campos preenchidos.`);

    // Registrar no histórico
    if (codigo) {
      try {
        const { data: proc } = await supabaseAdmin.from("processos").select("id").eq("codigo", codigo).maybeSingle();
        if (proc?.id) {
          await supabaseAdmin.from("auditoria_log").insert({
            tabela: "processos",
            registro_id: proc.id,
            operacao: "LIP_LEITURA_VCP",
            dados_antes: null,
            dados_depois: { arquivo: fileName ?? "arquivo.pdf", camposPreenchidos: preenchidos, status: "OK", motor: "claude-sonnet" },
          });
        }
      } catch (_) {}
    }

    return NextResponse.json({
      ok: true,
      campos,
      alertasMAC: dados.alertasMAC ?? [],
      validacoes: dados.validacoes ?? {},
      pendencias: dados.pendencias ?? [],
    });
  } catch (e: any) {
    console.error("[S3-Claude] Erro:", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}
