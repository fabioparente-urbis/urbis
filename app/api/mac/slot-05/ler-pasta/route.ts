/**
 * app/api/mac/slot-05/ler-pasta/route.ts — LER PASTA do MAC do Slot 5.
 *
 * Recebe a pasta inteira do processo (com subpastas e compactados), descobre sozinha qual é o
 * ÚLTIMO de cada documento — último projeto, última ART, último uso do solo, última certidão —
 * e manda só esses para o Gemini avaliar os itens do checklist ainda pendentes.
 *
 * Isolada do Slot 1: reusa `lib/lerPastaSlot5.ts` (que é do Slot 5, usado pelo LIP) e o prompt
 * de `lib/mac-motor/slot5/promptP3.ts`; não toca em app/api/mac/p3 nem lê `lip_prompts`.
 *
 * Por que ler a pasta em vez do texto que o MHD já guardou: o Gemini precisa do PDF — as cotas,
 * as vagas e o quadro de áreas estão no DESENHO, não no texto extraível. E a eleição do vencedor
 * por papel evita mandar versão velha, que é o erro que o usuário apontou.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { lerPastaSlot5, type ArquivoEntrada } from "@/lib/lerPastaSlot5";
import { resolverProcessoSlot5, usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";
import { modeloDoSlot5 } from "@/lib/mac-motor/slot5/modeloChecklist";
import { PROMPT_P3_MAC_SLOT5, VERSAO_PROMPT_P3_SLOT5 } from "@/lib/mac-motor/slot5/promptP3";
import { TIPO_PROCESSO_SLOT5 } from "@/lib/mac-motor/slot5/constantes";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODELO = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const STATUS_OK = new Set(["conforme", "nao_conforme", "nao_aplica"]);

/** Papéis que o Gemini precisa VER. Documentos pessoais e requerimento não decidem item do MAC. */
const PAPEIS_UTEIS = ["projeto", "uso_solo", "certidao_matricula", "art_projeto", "art_caixa", "art_execucao"];

/** A rodada vem do caminho: raiz = 1ª análise, cada subpasta a seguinte (mesma regra do LIP). */
function rodadaDoCaminho(caminho: string): number {
  const partes = caminho.split("/").filter(Boolean);
  return Math.max(1, partes.length - 1);
}

async function subirPdf(bytes: Uint8Array, apiKey: string, nome: string): Promise<string> {
  const r = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "raw",
      "X-Goog-Upload-Header-Content-Type": "application/pdf",
      "Content-Type": "application/pdf",
      "X-Goog-File-Name": nome,
    },
    body: bytes as any,
  });
  if (!r.ok) throw new Error(`upload ao Gemini falhou: ${r.status}`);
  const j = await r.json();
  if (!j?.file?.uri) throw new Error("Gemini não devolveu URI do arquivo");
  return j.file.uri as string;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, erro: "GEMINI_API_KEY não configurada" }, { status: 500 });

    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const form = await req.formData();
    const codigo = String(form.get("codigo") ?? "").trim();
    if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });

    const resolucao = await resolverProcessoSlot5(usuario, codigo);
    if (!resolucao.ok) {
      return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });
    }

    // ── 1. Monta a pasta: todos os arquivos, com a rodada tirada do caminho ──────────────
    const arquivos: ArquivoEntrada[] = [];
    for (const [chave, valor] of form.entries()) {
      if (!chave.startsWith("arquivo_") || !(valor instanceof File)) continue;
      const caminho = String(form.get(`caminho_${chave.slice(8)}`) ?? valor.name);
      const buffer = new Uint8Array(await valor.arrayBuffer());
      arquivos.push({
        nome: valor.name,
        rodada: rodadaDoCaminho(caminho),
        hash: createHash("sha256").update(buffer).digest("hex"),
        buffer,
      });
    }
    if (!arquivos.length) {
      return NextResponse.json({ ok: false, erro: "nenhum arquivo recebido" }, { status: 400 });
    }

    // ── 2. Catalogação: identifica papel, rodada e elege o VENCEDOR de cada papel ────────
    const leitura = await lerPastaSlot5(arquivos);
    const vencedorPorPapel = leitura.vigentesPorPapel ?? {};
    const porHash = new Map(arquivos.map((a) => [a.hash, a]));

    const escolhidos: { papel: string; nome: string; bytes: Uint8Array }[] = [];
    for (const papel of PAPEIS_UTEIS) {
      const hash = vencedorPorPapel[papel];
      if (!hash) continue;
      const arq = porHash.get(hash);
      // Só PDF vai para o Gemini: o que veio de .rar/.zip já foi expandido pela catalogação,
      // mas imagem solta e CAD não servem para esta leitura.
      if (!arq || !arq.nome.toLowerCase().endsWith(".pdf")) continue;
      if (escolhidos.some((e) => e.nome === arq.nome)) continue; // mesma folha em dois papéis
      escolhidos.push({ papel, nome: arq.nome, bytes: arq.buffer });
    }

    if (!escolhidos.length) {
      return NextResponse.json({
        ok: false,
        erro: "nenhum PDF útil encontrado na pasta (esperado ao menos o projeto)",
        papeisEncontrados: Object.keys(vencedorPorPapel),
      }, { status: 400 });
    }

    // ── 3. Itens ainda pendentes ────────────────────────────────────────────────────────
    const modeloId = await modeloDoSlot5();
    if (!modeloId) return NextResponse.json({ ok: false, erro: "sem modelo de checklist do Slot 5" }, { status: 404 });

    const [{ data: itensTodos }, { data: analises }] = await Promise.all([
      supabaseAdmin.from("mac_checklist_itens").select("id, texto, grupo")
        .eq("modelo_id", modeloId).eq("ativo", true).order("ordem").limit(2000),
      supabaseAdmin.from("analises_mac").select("id, itens")
        .eq("processo_codigo", codigo).eq("tipo_processo", TIPO_PROCESSO_SLOT5)
        .is("excluido_em", null).order("numero_analise", { ascending: false }).limit(1),
    ]);
    const respondidos = ((analises?.[0] as any)?.itens ?? {}) as Record<string, string>;
    const pendentes = (itensTodos ?? []).filter((i: any) => !respondidos[i.id]);
    if (!pendentes.length) {
      return NextResponse.json({ ok: false, erro: "nenhum item pendente no MAC" }, { status: 400 });
    }

    const temas: string[] = (() => {
      try { return JSON.parse(String(form.get("temas") ?? "[]")); } catch { return []; }
    })();

    // ── 4. Uma chamada ao Gemini com TODOS os documentos vencedores ─────────────────────
    const partes: any[] = [];
    for (const e of escolhidos) {
      const uri = await subirPdf(e.bytes, apiKey, e.nome);
      partes.push({ text: `\n[DOCUMENTO: ${e.papel} — ${e.nome}]` });
      partes.push({ fileData: { mimeType: "application/pdf", fileUri: uri } });
    }
    partes.push({
      text: PROMPT_P3_MAC_SLOT5 +
        `\n\n===== CHECKLIST MAC (${pendentes.length} itens pendentes) =====\n` +
        JSON.stringify(pendentes.map((i: any) => ({ id: i.id, texto: i.texto, grupo: i.grupo }))) +
        (temas.length ? `\n\n===== TEMAS =====\n${JSON.stringify(temas)}` : ""),
    });

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: partes }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
        }),
      },
    );
    if (!resp.ok) {
      return NextResponse.json({ ok: false, erro: `Gemini: ${resp.status} ${await resp.text()}` }, { status: 502 });
    }

    const bruto = (await resp.json())?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    let json: any;
    try { json = JSON.parse(bruto); } catch {
      const m = bruto.match(/\{[\s\S]*\}/);
      if (!m) return NextResponse.json({ ok: false, erro: "resposta do Gemini não é JSON" }, { status: 502 });
      json = JSON.parse(m[0]);
    }

    // ── 5. Só aceita id do checklist e status válido — nunca confia no que voltou ───────
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

    return NextResponse.json({
      ok: true,
      versaoPrompt: VERSAO_PROMPT_P3_SLOT5,
      modelo: MODELO,
      documentosLidos: escolhidos.map((e) => ({ papel: e.papel, arquivo: e.nome })),
      arquivosNaPasta: arquivos.length,
      papeisEncontrados: Object.keys(vencedorPorPapel),
      avaliados: pendentes.length,
      classificados: Object.keys(itens).length,
      itens, fontes,
      temas: json?.temas ?? {},
      incompatibilidades: Array.isArray(json?.incompatibilidades) ? json.incompatibilidades : [],
    });
  } catch (e: any) {
    console.error("[MAC/slot-05/ler-pasta]", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
