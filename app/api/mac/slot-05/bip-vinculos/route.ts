/**
 * app/api/mac/slot-05/bip-vinculos/route.ts — vínculo de cada subitem com lei/artigo do BIP,
 * EXCLUSIVA do Slot 5.
 *
 * `mac_bip_vinculos` já existia (o motor de acessibilidade a usa para achar a NBR 9050 certa por
 * item, ver contextoAcessibilidade.ts) — mas nunca teve uma tela pra gerenciar manualmente. Não é
 * por processo: o vínculo é do ITEM DO CHECKLIST (o modelo, vale pra todo processo que usar o
 * mesmo checklist), igual à lei que aquele item cita nunca muda de um processo pro outro. É por
 * isso que aqui não recebe `codigo` nem passa por `resolverProcessoSlot5`.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";
import { modeloDoSlot5 } from "@/lib/mac-motor/slot5/modeloChecklist";

export const runtime = "nodejs";

/** Todos os vínculos dos itens do Slot 5, de uma vez — a tela carrega isso junto com o checklist,
 * em vez de uma chamada por item. */
export async function GET(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const modeloId = await modeloDoSlot5();
    if (!modeloId) return NextResponse.json({ ok: false, erro: "sem modelo de checklist do Slot 5" }, { status: 404 });

    const { data: itens, error: erroItens } = await supabaseAdmin
      .from("mac_checklist_itens").select("id").eq("modelo_id", modeloId).eq("ativo", true).limit(2000);
    if (erroItens) return NextResponse.json({ ok: false, erro: erroItens.message }, { status: 500 });
    const idsDoModelo = new Set((itens ?? []).map((i) => i.id as string));

    const { data: vinculos, error } = await supabaseAdmin
      .from("mac_bip_vinculos")
      .select("id, mac_item_id, bip_fragmento_id, confianca")
      .limit(5000);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    const doModelo = (vinculos ?? []).filter((v) => idsDoModelo.has(v.mac_item_id as string));
    const fragmentoIds = [...new Set(doModelo.map((v) => v.bip_fragmento_id as string))];
    const { data: fragmentos } = fragmentoIds.length
      ? await supabaseAdmin.from("bdi_lei_fragmentos").select("id, referencia, documento_id").in("id", fragmentoIds)
      : { data: [] as { id: string; referencia: string; documento_id: string }[] };
    const referenciaPorFragmento = new Map((fragmentos ?? []).map((f) => [f.id as string, (f.referencia as string) ?? ""]));

    const documentoIds = [...new Set((fragmentos ?? []).map((f) => f.documento_id as string))];
    const { data: leis } = documentoIds.length
      ? await supabaseAdmin.from("bdi_documentos_lei").select("id, titulo, numero").in("id", documentoIds)
      : { data: [] as { id: string; titulo: string; numero: string }[] };
    const leiPorDocumento = new Map((leis ?? []).map((l) => [l.id as string, l]));
    const documentoPorFragmento = new Map((fragmentos ?? []).map((f) => [f.id as string, f.documento_id as string]));
    const leiPorFragmento = (fragmentoId: string) => {
      const lei = leiPorDocumento.get(documentoPorFragmento.get(fragmentoId) ?? "");
      return lei ? `${lei.titulo}${lei.numero ? ` (${lei.numero})` : ""}` : "";
    };

    return NextResponse.json({
      ok: true,
      vinculos: doModelo.map((v) => ({
        id: v.id as string,
        itemId: v.mac_item_id as string,
        fragmentoId: v.bip_fragmento_id as string,
        referencia: referenciaPorFragmento.get(v.bip_fragmento_id as string) ?? "",
        lei: leiPorFragmento(v.bip_fragmento_id as string),
        confianca: v.confianca as string,
      })),
    });
  } catch (e: any) {
    console.error("[MAC/slot-05/bip-vinculos GET] erro:", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const { itemId, fragmentoId } = await req.json();
    if (!itemId || !fragmentoId) return NextResponse.json({ ok: false, erro: "itemId e fragmentoId obrigatórios" }, { status: 400 });

    // Não duplica o mesmo vínculo.
    const { data: existente } = await supabaseAdmin
      .from("mac_bip_vinculos").select("id").eq("mac_item_id", itemId).eq("bip_fragmento_id", fragmentoId).maybeSingle();
    if (existente) return NextResponse.json({ ok: true, id: existente.id, jaExistia: true });

    const { data, error } = await supabaseAdmin
      .from("mac_bip_vinculos")
      .insert({ mac_item_id: itemId, bip_fragmento_id: fragmentoId, confianca: "MANUAL" })
      .select("id").single();
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: any) {
    console.error("[MAC/slot-05/bip-vinculos POST] erro:", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, erro: "id obrigatório" }, { status: 400 });

    const { error } = await supabaseAdmin.from("mac_bip_vinculos").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[MAC/slot-05/bip-vinculos DELETE] erro:", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
