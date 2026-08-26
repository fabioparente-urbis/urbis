/**
 * app/api/mac/slot-05/p3/route.ts — leitura da prancha por IA, EXCLUSIVA do Slot 5.
 *
 * ⚠ SUPERADA E SEM CHAMADOR (auditoria de 25/08/2026). Quem lê documento para o MAC do Slot 5
 * hoje é `app/api/mac/slot-05/ler-pasta/route.ts`, que recebe a PASTA inteira, elege o último de
 * cada papel e responde em NDJSON com progresso. Esta rota recebe arquivos avulsos e continua de
 * pé só como referência do formato de resposta; nenhuma tela a chama. Se for mexer no motor de
 * leitura, mexa em ler-pasta — mudar aqui não muda nada na tela.
 *
 * Isolada do Slot 1: não importa nada de app/api/mac/p3, e o prompt vem de
 * lib/mac-motor/slot5/promptP3.ts (código), nunca de `lip_prompts` — as rotas que leem essa
 * tabela caem, por fallback, no prompt global, que hoje é o da Regularização. Os três registros
 * de P3_MAC no banco são idênticos entre si (o do Slot 5 é cópia do da Regularização) e mandam
 * procurar Termo de Vistoria e aplicar LC 181/314 — coisas que não existem em aprovação.
 *
 * Faz duas coisas numa chamada só:
 *   1. classifica os itens do checklist AINDA PENDENTES (economiza token: não reenvia o que já
 *      foi respondido nem o que os filtros retiraram);
 *   2. responde se cada TEMA de filtro existe no projeto — serve para CONFIRMAR os filtros que
 *      já foram acionados por texto. Nada é gravado: a rota devolve a proposta.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolverProcessoSlot5, usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";
import { modeloDoSlot5 } from "@/lib/mac-motor/slot5/modeloChecklist";
import { validarPdf } from "@/lib/mac-motor/slot5/validacaoDocumento";
import { PROMPT_P3_MAC_SLOT5, VERSAO_PROMPT_P3_SLOT5 } from "@/lib/mac-motor/slot5/promptP3";
import { TIPO_PROCESSO_SLOT5 } from "@/lib/mac-motor/slot5/constantes";
import { contextoNbrAcessibilidade } from "@/lib/mac-motor/slot5/contextoAcessibilidade";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODELO = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const STATUS_OK = new Set(["conforme", "nao_conforme", "nao_aplica"]);

/** Sobe o PDF para a File API do Gemini e devolve o URI. */
async function subirPdf(bytes: Uint8Array, apiKey: string, nome: string): Promise<string> {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "raw",
        "X-Goog-Upload-Header-Content-Type": "application/pdf",
        "Content-Type": "application/pdf",
        "X-Goog-File-Name": nome,
      },
      body: bytes as any,
    },
  );
  if (!r.ok) throw new Error(`falha ao enviar PDF ao Gemini: ${r.status} ${await r.text()}`);
  const j = await r.json();
  const uri = j?.file?.uri;
  if (!uri) throw new Error("Gemini não devolveu o URI do arquivo");
  return uri;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, erro: "GEMINI_API_KEY não configurada" }, { status: 500 });

    // autentica ANTES de parsear o multipart — chamada anônima não faz o servidor carregar PDF
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const form = await req.formData();
    const codigo = String(form.get("codigo") ?? "").trim();
    const arquivo = form.get("arquivo") as File | null;
    if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });
    if (!arquivo) return NextResponse.json({ ok: false, erro: "envie o PDF da prancha" }, { status: 400 });

    const resolucao = await resolverProcessoSlot5(usuario, codigo);
    if (!resolucao.ok) {
      return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });
    }

    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const val = validarPdf({ bytes, mimeDeclarado: arquivo.type || null, nomeArquivo: arquivo.name, tamanhoBytes: arquivo.size });
    if (!val.ok) return NextResponse.json({ ok: false, erro: `PDF inválido: ${val.motivo}` }, { status: 400 });

    const modeloId = await modeloDoSlot5();
    if (!modeloId) return NextResponse.json({ ok: false, erro: "sem modelo de checklist do Slot 5" }, { status: 404 });

    const { data: itensTodos } = await supabaseAdmin
      .from("mac_checklist_itens").select("id, texto, grupo")
      .eq("modelo_id", modeloId).eq("ativo", true).order("ordem").limit(2000);

    // Só o que ainda está pendente na análise em aberto.
    const { data: analises } = await supabaseAdmin.from("analises_mac")
      .select("id, itens").eq("processo_codigo", codigo).eq("tipo_processo", TIPO_PROCESSO_SLOT5)
      .is("excluido_em", null).order("numero_analise", { ascending: false }).limit(1);
    const respondidos = ((analises?.[0] as any)?.itens ?? {}) as Record<string, string>;

    const pendentes = (itensTodos ?? []).filter((i: any) => !respondidos[i.id]);
    if (!pendentes.length) {
      return NextResponse.json({ ok: false, erro: "nenhum item pendente — o MAC já está todo respondido" }, { status: 400 });
    }

    const temas: string[] = (() => {
      const t = form.get("temas");
      try { return t ? JSON.parse(String(t)) : []; } catch { return []; }
    })();

    const fileUri = await subirPdf(bytes, apiKey, arquivo.name);

    // ÍTEM 48 (ACESSIBILIDADE - NBR9050): a norma inteira, não a memória do modelo dela.
    const nbrAcessibilidade = await contextoNbrAcessibilidade(pendentes as any);

    const contexto =
      (nbrAcessibilidade ? `\n\n${nbrAcessibilidade}` : "") +
      `\n\n===== CHECKLIST MAC (${pendentes.length} itens pendentes) =====\n` +
      JSON.stringify(pendentes.map((i: any) => ({ id: i.id, texto: i.texto, grupo: i.grupo }))) +
      (temas.length ? `\n\n===== TEMAS =====\n${JSON.stringify(temas)}` : "");

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { fileData: { mimeType: "application/pdf", fileUri } },
              { text: PROMPT_P3_MAC_SLOT5 + contexto },
            ],
          }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
        }),
      },
    );
    if (!resp.ok) {
      return NextResponse.json({ ok: false, erro: `Gemini: ${resp.status} ${await resp.text()}` }, { status: 502 });
    }

    const bruto = (await resp.json())?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    let json: any;
    try {
      json = JSON.parse(bruto);
    } catch {
      const m = bruto.match(/\{[\s\S]*\}/);
      if (!m) return NextResponse.json({ ok: false, erro: "resposta do Gemini não é JSON" }, { status: 502 });
      json = JSON.parse(m[0]);
    }

    // Só aceita item que existe no checklist e status válido — nunca confia no id devolvido.
    const validos = new Set(pendentes.map((i: any) => i.id as string));
    const itens: Record<string, string> = {};
    const fontes: Record<string, string> = {};
    for (const [id, st] of Object.entries(json?.itens ?? {})) {
      const s = String(st ?? "").toLowerCase();
      if (!validos.has(id) || !STATUS_OK.has(s)) continue;
      itens[id] = s;
      const f = json?.fontes?.[id];
      fontes[id] = `IA · ${f ? String(f).slice(0, 300) : "sem detalhe"}`;
    }

    // Mesma leitura da rota da pasta: se o PDF enviado for (ou contiver) o Uso do Solo, a sigla da
    // unidade territorial volta para preencher o campo da tela.
    const utBruta = String(json?.unidadeTerritorial ?? "").toUpperCase().replace(/[^A-Z]/g, "");

    return NextResponse.json({
      ok: true,
      unidadeTerritorial: /^[A-Z]{2,6}$/.test(utBruta) ? utBruta : null,
      nbrAcessibilidadeUsada: !!nbrAcessibilidade,
      versaoPrompt: VERSAO_PROMPT_P3_SLOT5,
      modelo: MODELO,
      avaliados: pendentes.length,
      itens, fontes,
      temas: json?.temas ?? {},
      documentos: Array.isArray(json?.documentos) ? json.documentos : [],
      incompatibilidades: Array.isArray(json?.incompatibilidades) ? json.incompatibilidades : [],
    });
  } catch (e: any) {
    console.error("[MAC/slot-05/p3]", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
