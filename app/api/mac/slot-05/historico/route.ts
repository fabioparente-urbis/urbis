/**
 * app/api/mac/slot-05/historico/route.ts — trilha de alterações da análise do Slot 5.
 *
 * Isolada do Slot 1: `/api/mac/historico` existe, mas devolve os registros AGRUPADOS POR MOMENTO
 * e sem `checklist_item_id` — sem o id não dá para mostrar o histórico dentro do grupo aberto.
 * Esta rota devolve linha a linha, com o id, e é lida só pela tela do Slot 5.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolverProcessoSlot5, usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";
import { TIPO_PROCESSO_SLOT5 } from "@/lib/mac-motor/slot5/constantes";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const codigo = req.nextUrl.searchParams.get("codigo")?.trim();
    if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });

    const resolucao = await resolverProcessoSlot5(usuario, codigo);
    if (!resolucao.ok) {
      return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });
    }

    const analiseId = req.nextUrl.searchParams.get("analiseId");
    let q = supabaseAdmin.from("mac_historico")
      .select("id, criado_em, analise_id, checklist_item_id, aba, item_texto, referencia_legal, status_anterior, status_novo, analista_nome")
      .eq("processo_codigo", codigo).eq("tipo_processo", TIPO_PROCESSO_SLOT5);
    if (analiseId) q = q.eq("analise_id", analiseId);

    const { data, error } = await q.order("criado_em", { ascending: false }).limit(3000);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, historico: data ?? [], total: (data ?? []).length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
