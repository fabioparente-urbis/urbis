/**
 * app/api/mac/slot-05/contra-conferencia/route.ts — ciclo de contra-conferência, EXCLUSIVO do Slot 5.
 *
 *   GET  ?codigo=...  → devolve o prompt pronto para colar numa IA de fora, junto com os PDFs.
 *   POST { codigo, relatorio } → lê a resposta da IA e devolve os achados já validados contra o
 *         checklist. NÃO grava nada: quem marca é o analista, item a item, pela tela.
 *
 * Não cria tabela nova de propósito. Quando o analista aceita um achado, a evidência da IA vai
 * para a `fonte` daquele item e a troca de status entra em `mac_historico` pelo caminho normal de
 * gravação — a trilha de auditoria que já existe cobre o caso.
 *
 * Isolada do Slot 1: só toca `mac_checklist_itens` (recortado pelo modelo do Slot 5) e
 * `analises_mac` com tipo_processo = slot_05.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolverProcessoSlot5, usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";
import { modeloDoSlot5 } from "@/lib/mac-motor/slot5/modeloChecklist";
import { TIPO_PROCESSO_SLOT5 } from "@/lib/mac-motor/slot5/constantes";
import { montarPrompt, interpretarRelatorio } from "@/lib/mac-motor/slot5/contraConferencia";

export const runtime = "nodejs";

/** Carrega checklist + análise em aberto — as duas metades precisam exatamente do mesmo recorte. */
async function carregarBase(codigo: string) {
  const modeloId = await modeloDoSlot5();
  if (!modeloId) return { erro: "sem modelo de checklist do Slot 5", status: 404 as const };

  const [{ data: itens }, { data: analises }] = await Promise.all([
    supabaseAdmin.from("mac_checklist_itens")
      .select("id, grupo, ordem, texto").eq("modelo_id", modeloId).eq("ativo", true)
      .order("ordem").limit(2000),
    supabaseAdmin.from("analises_mac")
      .select("id, itens, fontes, observacoes_por_item, numero_analise")
      .eq("processo_codigo", codigo).eq("tipo_processo", TIPO_PROCESSO_SLOT5)
      .is("excluido_em", null).order("numero_analise", { ascending: false }).limit(1),
  ]);

  if (!itens?.length) return { erro: "checklist do Slot 5 está vazio", status: 404 as const };

  const analise = (analises ?? [])[0] as any;
  return {
    itens: itens as any[],
    analise,
    marcas: (analise?.itens ?? {}) as Record<string, string>,
    fontes: (analise?.fontes ?? {}) as Record<string, string>,
    obsPorItem: (analise?.observacoes_por_item ?? {}) as Record<string, string>,
  };
}

export async function GET(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const codigo = req.nextUrl.searchParams.get("codigo")?.trim();
    if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });

    const resolucao = await resolverProcessoSlot5(usuario, codigo);
    if (!resolucao.ok) return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });

    const base = await carregarBase(codigo);
    if ("erro" in base) return NextResponse.json({ ok: false, erro: base.erro }, { status: base.status });

    const prompt = montarPrompt({
      codigo,
      numeroAnalise: base.analise?.numero_analise ?? 1,
      dados: (resolucao.processo.dados ?? {}) as Record<string, any>,
      itens: base.itens as any,
      marcas: base.marcas,
      fontes: base.fontes,
      observacoesPorItem: base.obsPorItem,
    });

    return NextResponse.json({
      ok: true,
      prompt,
      caracteres: prompt.length,
      itens: base.itens.length,
      temAnalise: !!base.analise,
    });
  } catch (e: any) {
    console.error("[MAC/slot-05/contra-conferencia GET]", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const { codigo, relatorio } = await req.json().catch(() => ({}));
    if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });
    if (!relatorio || String(relatorio).trim().length < 20) {
      return NextResponse.json({ ok: false, erro: "cole a resposta da IA" }, { status: 400 });
    }

    const resolucao = await resolverProcessoSlot5(usuario, codigo);
    if (!resolucao.ok) return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });

    const base = await carregarBase(codigo);
    if ("erro" in base) return NextResponse.json({ ok: false, erro: base.erro }, { status: base.status });

    const lido = interpretarRelatorio(String(relatorio), base.itens as any, base.marcas);
    if (!lido.ok) return NextResponse.json({ ok: false, erro: lido.erro }, { status: 400 });

    return NextResponse.json({ ok: true, relatorio: lido.relatorio });
  } catch (e: any) {
    console.error("[MAC/slot-05/contra-conferencia POST]", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
