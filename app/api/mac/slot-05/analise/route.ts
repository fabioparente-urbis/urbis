/**
 * app/api/mac/slot-05/analise/route.ts — carga e gravação da análise do MAC no Slot 5.
 *
 * Isolada do Slot 1: não importa nada de app/api/analise-regularizacao nem de
 * app/api/analise-aceite-sei; sempre filtra por `tipo_processo = "slot_05"`, então uma chamada
 * daqui nunca alcança uma análise da Regularização/Aceite.
 *
 * Armazenamento é o mesmo `analises_mac` (mapa item_id → status em `itens`) — é a tabela do
 * módulo, não do Slot 1.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolverProcessoSlot5, usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";
import { ASSUNTO_ID_SLOT5, TIPO_PROCESSO_SLOT5 } from "@/lib/mac-motor/slot5/constantes";

export const runtime = "nodejs";

const TIPO = TIPO_PROCESSO_SLOT5;

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

    const [{ data: analises }, { data: itensChecklist }] = await Promise.all([
      supabaseAdmin.from("analises_mac")
        .select("*").eq("processo_codigo", codigo).eq("tipo_processo", TIPO)
        .is("excluido_em", null).order("numero_analise", { ascending: false }),
      supabaseAdmin.from("mac_checklist_itens")
        .select("id, texto, grupo, ordem, ref").eq("ativo", true).order("ordem").limit(1000),
    ]);

    return NextResponse.json({
      ok: true,
      processo: { codigo, proprietario: (resolucao.processo.dados as any)?.proprietario?.valor ?? null },
      analises: analises ?? [],
      itens: itensChecklist ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}

/** Cria a análise N do processo (numeração própria do Slot 5, máximo 5). */
export async function POST(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const { codigo, itens, fontes, observacoes } = await req.json().catch(() => ({}));
    if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });

    const resolucao = await resolverProcessoSlot5(usuario, codigo);
    if (!resolucao.ok) {
      return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });
    }

    const { data: existentes } = await supabaseAdmin
      .from("analises_mac").select("numero_analise")
      .eq("processo_codigo", codigo).eq("tipo_processo", TIPO)
      .order("numero_analise", { ascending: false }).limit(1);

    const proximo = existentes?.length ? (existentes[0] as any).numero_analise + 1 : 1;
    if (proximo > 5) {
      return NextResponse.json({ ok: false, erro: "Limite de 5 análises atingido." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.from("analises_mac").insert({
      processo_codigo: codigo,
      tipo_processo: TIPO,
      assunto_id: ASSUNTO_ID_SLOT5,
      analista_id: usuario.id,
      numero_analise: proximo,
      status: "em_andamento",
      itens: itens ?? {},
      fontes: fontes ?? {},
      aceites: {},
      observacoes: observacoes ?? "",
      observacoes_por_aba: {},
    }).select().maybeSingle();

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, analise: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}

/** Atualiza itens/fontes/observações de uma análise já existente do Slot 5. */
export async function PUT(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const { id, itens, fontes, observacoes, status } = await req.json().catch(() => ({}));
    if (!id) return NextResponse.json({ ok: false, erro: "id obrigatório" }, { status: 400 });

    // trava de escopo: só atualiza se a análise for mesmo do Slot 5
    const { data: alvo } = await supabaseAdmin.from("analises_mac")
      .select("id, processo_codigo, tipo_processo").eq("id", id).maybeSingle();
    if (!alvo || (alvo as any).tipo_processo !== TIPO) {
      return NextResponse.json({ ok: false, erro: "análise não é do Slot 5" }, { status: 403 });
    }

    const resolucao = await resolverProcessoSlot5(usuario, (alvo as any).processo_codigo);
    if (!resolucao.ok) {
      return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });
    }

    const { error } = await supabaseAdmin.from("analises_mac").update({
      ...(itens !== undefined ? { itens } : {}),
      ...(fontes !== undefined ? { fontes } : {}),
      ...(observacoes !== undefined ? { observacoes } : {}),
      ...(status !== undefined ? { status } : {}),
    }).eq("id", id);

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
