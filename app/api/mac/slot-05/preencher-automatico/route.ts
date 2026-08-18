/**
 * app/api/mac/slot-05/preencher-automatico/route.ts — pré-preenche o MAC do Slot 5 a partir do
 * LIP já lido da pasta, sem gastar IA.
 *
 * Isolado do Slot 1: não importa nada de app/api/mac/p3 nem de app/analise-regularizacao, não lê
 * nem grava lip_prompts, e resolve o processo pelo trio exato do Slot 5.
 *
 * NÃO grava nada. Devolve a proposta; quem decide gravar é a tela, depois do analista aceitar.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { gruposNaoAplicaveis } from "@/lib/mac-motor/slot5/aplicabilidade";
import { resolverProcessoSlot5, usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) {
      return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });
    }

    const { codigo } = await req.json().catch(() => ({ codigo: null }));
    if (!codigo) {
      return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });
    }

    const resolucao = await resolverProcessoSlot5(usuario, codigo);
    if (!resolucao.ok) {
      return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });
    }

    const lip = (resolucao.processo.dados ?? {}) as Record<string, { valor?: string | null }>;
    const camposPreenchidos = Object.values(lip).filter((v) => v?.valor).length;
    if (camposPreenchidos === 0) {
      return NextResponse.json({
        ok: false,
        erro: "O LIP deste processo está vazio — leia a pasta no LIP antes de pré-preencher o MAC.",
      }, { status: 400 });
    }

    const { naoAplicaveis, aplicaveis, indecisas } = gruposNaoAplicaveis(lip);

    const gruposNA = new Set(naoAplicaveis.flatMap((v) => v.grupos));
    if (gruposNA.size === 0) {
      return NextResponse.json({
        ok: true, codigo, camposPreenchidos,
        itens: {}, porGrupo: [], aplicaveis, indecisas,
        total: 0,
      });
    }

    const { data: itensDoChecklist, error } = await supabaseAdmin
      .from("mac_checklist_itens")
      .select("id, grupo")
      .in("grupo", [...gruposNA])
      .eq("ativo", true)
      .limit(1000);
    if (error) {
      return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    }

    // item_id → "nao_aplica", com a justificativa da regra que decidiu
    const justificativaPorGrupo = new Map<string, { regraId: string; justificativa: string }>();
    for (const v of naoAplicaveis) {
      for (const g of v.grupos) justificativaPorGrupo.set(g, { regraId: v.regraId, justificativa: v.justificativa });
    }

    const itens: Record<string, "nao_aplica"> = {};
    const fontes: Record<string, string> = {};
    const contagem = new Map<string, number>();
    for (const it of itensDoChecklist ?? []) {
      const g = (it as any).grupo as string;
      const just = justificativaPorGrupo.get(g);
      itens[(it as any).id] = "nao_aplica";
      fontes[(it as any).id] = `LIP · ${just?.regraId ?? "?"} — ${just?.justificativa ?? ""}`;
      contagem.set(g, (contagem.get(g) ?? 0) + 1);
    }

    const porGrupo = [...contagem.entries()].map(([grupo, qtd]) => ({
      grupo, qtd,
      regraId: justificativaPorGrupo.get(grupo)?.regraId ?? null,
      justificativa: justificativaPorGrupo.get(grupo)?.justificativa ?? null,
    })).sort((a, b) => b.qtd - a.qtd);

    return NextResponse.json({
      ok: true, codigo, camposPreenchidos,
      itens, fontes, porGrupo, aplicaveis, indecisas,
      total: Object.keys(itens).length,
    });
  } catch (e: any) {
    console.error("[MAC/slot-05/preencher-automatico] erro:", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
