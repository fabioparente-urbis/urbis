import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/sessao/pausar
 * Body: { sessao_id: string; segundos_pausados: number }
 *
 * Acumula segundos pausados na coluna tempo_pausado da sessão ativa.
 * Usado pelo hook useSessionHeartbeat para subtrair inatividade >5 min
 * e dead-time pós-encerramento por pg_cron.
 */
export async function PATCH(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const sessao_id: string | undefined = body.sessao_id;
  const segundos_pausados: number = Math.max(0, Number(body.segundos_pausados) || 0);

  if (!sessao_id || segundos_pausados === 0) {
    return NextResponse.json({ ok: false, erro: "sessao_id e segundos_pausados são obrigatórios." }, { status: 400 });
  }

  // Incrementa atomicamente via RPC para evitar race condition
  const { error } = await supabaseAdmin.rpc("incrementar_tempo_pausado", {
    p_sessao_id: sessao_id,
    p_usuario_id: ctx.userId,
    p_segundos: segundos_pausados,
  });

  if (error) {
    // Fallback: UPDATE direto (menos seguro contra concorrência, mas funcional)
    const { data: sessao } = await supabaseAdmin
      .from("urbis_sessoes")
      .select("tempo_pausado")
      .eq("id", sessao_id)
      .eq("usuario_id", ctx.userId)
      .eq("status", "ativa")
      .single();

    if (!sessao) {
      return NextResponse.json({ ok: false, erro: "Sessão não encontrada ou já encerrada." }, { status: 404 });
    }

    await supabaseAdmin
      .from("urbis_sessoes")
      .update({ tempo_pausado: sessao.tempo_pausado + segundos_pausados })
      .eq("id", sessao_id)
      .eq("usuario_id", ctx.userId)
      .eq("status", "ativa");
  }

  return NextResponse.json({ ok: true });
}
