/**
 * app/api/mac/slot-05/importar/route.ts — restaura a análise do MAC do Slot 5 a partir do Excel
 * gerado por /api/mac/slot-05/exportar.
 *
 * Isolada do Slot 1: não importa nada de app/api/mac/importar-mac e só grava em análise cujo
 * tipo_processo é slot_05.
 *
 * Restaura pelo ID do item (coluna "ID do Item") e pelo status cru ("status_valor") — nunca pelo
 * texto do item nem pelo rótulo com emoji, que mudam com edição do checklist e com o idioma.
 * Item que não pertence ao modelo do Slot 5 é ignorado e relatado, nunca gravado.
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolverProcessoSlot5, usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";
import { modeloDoSlot5 } from "@/lib/mac-motor/slot5/modeloChecklist";
import { ASSUNTO_ID_SLOT5, TIPO_PROCESSO_SLOT5 } from "@/lib/mac-motor/slot5/constantes";
import { VERSAO_FORMATO } from "../exportar/route";

export const runtime = "nodejs";

const STATUS_VALIDOS = new Set(["conforme", "nao_conforme", "nao_aplica"]);

/** Aceita o status cru; se vier só o rótulo (planilha editada à mão), reconhece pelo texto. */
function normalizarStatus(cru: unknown, rotulo: unknown): string | null {
  const c = String(cru ?? "").trim().toLowerCase();
  if (STATUS_VALIDOS.has(c)) return c;
  const r = String(rotulo ?? "").toLowerCase();
  if (r.includes("não conforme") || r.includes("nao conforme")) return "nao_conforme";
  if (r.includes("não se aplica") || r.includes("nao se aplica") || r.includes("n/a")) return "nao_aplica";
  if (r.includes("conforme")) return "conforme";
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const form = await req.formData();
    const codigo = String(form.get("codigo") ?? "").trim();
    const arquivo = form.get("arquivo") as File | null;
    if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });
    if (!arquivo) return NextResponse.json({ ok: false, erro: "arquivo obrigatório" }, { status: 400 });

    const resolucao = await resolverProcessoSlot5(usuario, codigo);
    if (!resolucao.ok) {
      return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });
    }

    const wb = XLSX.read(new Uint8Array(await arquivo.arrayBuffer()), { type: "array" });

    // META é conferida antes de tocar em qualquer dado: formato e processo precisam bater.
    const meta: Record<string, string> = {};
    if (wb.SheetNames.includes("META")) {
      for (const l of XLSX.utils.sheet_to_json<any>(wb.Sheets["META"])) {
        if (l?.Campo) meta[String(l.Campo)] = String(l.Valor ?? "");
      }
    }
    if (meta.formato && meta.formato !== VERSAO_FORMATO) {
      return NextResponse.json({
        ok: false, erro: `planilha de formato "${meta.formato}"; esta versão lê "${VERSAO_FORMATO}"`,
      }, { status: 400 });
    }
    if (meta.processo_codigo && meta.processo_codigo !== codigo) {
      return NextResponse.json({
        ok: false,
        erro: `esta planilha é do processo ${meta.processo_codigo}, não do ${codigo}`,
      }, { status: 400 });
    }

    if (!wb.SheetNames.includes("MAC")) {
      return NextResponse.json({ ok: false, erro: "planilha sem a aba MAC" }, { status: 400 });
    }

    const modeloId = await modeloDoSlot5();
    if (!modeloId) {
      return NextResponse.json({ ok: false, erro: "nenhum modelo de checklist do Slot 5" }, { status: 404 });
    }
    const { data: itensModelo } = await supabaseAdmin
      .from("mac_checklist_itens").select("id").eq("modelo_id", modeloId).eq("ativo", true).limit(2000);
    const validos = new Set((itensModelo ?? []).map((i: any) => i.id as string));

    const itens: Record<string, string> = {};
    const fontes: Record<string, string> = {};
    let semStatus = 0, foraDoModelo = 0;

    for (const linha of XLSX.utils.sheet_to_json<any>(wb.Sheets["MAC"])) {
      const id = String(linha["ID do Item"] ?? "").trim();
      if (!id) continue;
      if (!validos.has(id)) { foraDoModelo++; continue; }
      const status = normalizarStatus(linha["status_valor"], linha["Status"]);
      if (!status) { semStatus++; continue; }
      itens[id] = status;
      const fonte = String(linha["fonte_completa"] ?? "").trim();
      if (fonte) fontes[id] = fonte;
    }

    if (!Object.keys(itens).length) {
      return NextResponse.json({
        ok: false,
        erro: `nenhum item válido na planilha (${foraDoModelo} fora do checklist do Slot 5, ${semStatus} sem status)`,
      }, { status: 400 });
    }

    const observacoes = wb.SheetNames.includes("OBS")
      ? XLSX.utils.sheet_to_json<any>(wb.Sheets["OBS"]).map((l) => String(l["Observações"] ?? "")).join("\n").trim()
      : "";

    // Grava na análise em aberto; se não houver, cria uma nova com o conteúdo restaurado.
    const { data: existentes } = await supabaseAdmin.from("analises_mac")
      .select("id, numero_analise").eq("processo_codigo", codigo)
      .eq("tipo_processo", TIPO_PROCESSO_SLOT5).is("excluido_em", null)
      .order("numero_analise", { ascending: false }).limit(1);
    const alvo = (existentes ?? [])[0] as any;

    if (alvo) {
      const { error } = await supabaseAdmin.from("analises_mac")
        .update({ itens, fontes, ...(observacoes ? { observacoes } : {}) }).eq("id", alvo.id);
      if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
      return NextResponse.json({
        ok: true, restaurados: Object.keys(itens).length, foraDoModelo, semStatus,
        analise: alvo.numero_analise, criouAnalise: false,
      });
    }

    const { data: nova, error } = await supabaseAdmin.from("analises_mac").insert({
      processo_codigo: codigo,
      tipo_processo: TIPO_PROCESSO_SLOT5,
      assunto_id: ASSUNTO_ID_SLOT5,
      analista_id: usuario.id,
      numero_analise: 1,
      status: "em_andamento",
      itens, fontes, aceites: {},
      observacoes, observacoes_por_aba: {},
    }).select().maybeSingle();
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true, restaurados: Object.keys(itens).length, foraDoModelo, semStatus,
      analise: (nova as any)?.numero_analise ?? 1, criouAnalise: true,
    });
  } catch (e: any) {
    console.error("[MAC/slot-05/importar]", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
