import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/mhd/recentes — lista os processos com atividade recente no MHD, pra
 * /admin/mhd mostrar uma pilha de processos assim que a tela abre, sem precisar buscar um por
 * um. Pedido do Fábio (06/09/2026): "tem que aparecer sem buscar uma pilha de processos".
 *
 * Só irrestrito (mesmo gate da página) — ao contrário de `/api/mhd`, que autoriza por processo
 * individual, esta rota lê o histórico de TODOS os processos, então não faz sentido pedir
 * autorização por processo: quem pode ver a lista inteira já é admin.
 */
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador." }, { status: 403 });
  }

  /**
   * DUAS fontes, não só `mhd_eventos` — achado do Fábio (06/09/2026): os processos do Slot 5
   * (LER PASTA) gravam documento/versão (`registrarLeitura`) sem necessariamente criar um evento
   * com o mesmo tipo que a pilha olhava, e sumiam da lista mesmo tendo histórico de verdade.
   */
  const [eventos, documentos] = await Promise.all([
    supabaseAdmin
      .from("mhd_eventos")
      .select("processo_codigo, tipo, titulo, criado_em")
      .order("criado_em", { ascending: false })
      .limit(300),
    supabaseAdmin
      .from("mhd_documentos")
      .select("processo_codigo, papel, rotulo, atualizado_em")
      .order("atualizado_em", { ascending: false })
      .limit(300),
  ]);
  if (eventos.error) return NextResponse.json({ ok: false, erro: eventos.error.message }, { status: 500 });
  if (documentos.error) return NextResponse.json({ ok: false, erro: documentos.error.message }, { status: 500 });

  // 1 linha por processo — a atividade mais recente entre as duas fontes.
  const porProcesso = new Map<string, { processo_codigo: string; tipo: string; titulo: string; criado_em: string }>();
  for (const ev of eventos.data ?? []) {
    const atual = porProcesso.get(ev.processo_codigo);
    if (!atual || ev.criado_em > atual.criado_em) porProcesso.set(ev.processo_codigo, ev);
  }
  for (const d of documentos.data ?? []) {
    const registro = {
      processo_codigo: d.processo_codigo,
      tipo: "documento_lido",
      titulo: `Documento lido: ${d.rotulo ?? d.papel}`,
      criado_em: d.atualizado_em,
    };
    const atual = porProcesso.get(d.processo_codigo);
    if (!atual || registro.criado_em > atual.criado_em) porProcesso.set(d.processo_codigo, registro);
  }

  const processos = [...porProcesso.values()].sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1));
  return NextResponse.json({ ok: true, processos });
}
