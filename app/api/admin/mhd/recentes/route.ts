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

  const { data, error } = await supabaseAdmin
    .from("mhd_eventos")
    .select("processo_codigo, tipo, titulo, criado_em")
    .order("criado_em", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // 1 linha por processo — a mais recente. 300 eventos brutos cobre bem mais que os processos
  // ativos de verdade, então o corte acima não perde processo relevante da lista.
  const porProcesso = new Map<string, { processo_codigo: string; tipo: string; titulo: string; criado_em: string }>();
  for (const ev of data ?? []) {
    if (!porProcesso.has(ev.processo_codigo)) porProcesso.set(ev.processo_codigo, ev);
  }

  return NextResponse.json({ ok: true, processos: [...porProcesso.values()] });
}
