import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const sessao_id: string | undefined = body.sessao_id;
  const pagina: string = body.pagina ?? "/";
  const tempo_pausado_inicial: number = Math.max(0, Number(body.tempo_pausado_inicial) || 0);

  // ─── Ping de sessão existente ────────────────────────────────
  if (sessao_id) {
    const { data: rows, error: upErr } = await supabaseAdmin
      .from("urbis_sessoes")
      .update({ ultimo_ping: new Date().toISOString(), pagina })
      .eq("id", sessao_id)
      .eq("usuario_id", ctx.userId)
      .eq("status", "ativa")
      .select("id");

    if (upErr) {
      console.error("[heartbeat] UPDATE FAIL:", JSON.stringify({ msg: upErr.message, code: upErr.code }));
    }

    if (!rows || rows.length === 0) {
      const { data: morta } = await supabaseAdmin
        .from("urbis_sessoes")
        .select("encerrada_em")
        .eq("id", sessao_id)
        .eq("usuario_id", ctx.userId)
        .maybeSingle();
      return NextResponse.json({
        status: "encerrada",
        encerrada_em: morta?.encerrada_em ?? null,
        ativa: false,
      });
    }
    return NextResponse.json({ sessao_id, status: "ok", ativa: true });
  }

  // ─── Sem sessao_id: encerra ativas e abre nova ───────────────
  await supabaseAdmin
    .from("urbis_sessoes")
    .update({ status: "encerrada", encerrada_em: new Date().toISOString() })
    .eq("usuario_id", ctx.userId)
    .eq("status", "ativa");

  const { data, error } = await supabaseAdmin
    .from("urbis_sessoes")
    .insert({
      usuario_id: ctx.userId,
      pagina,
      status: "ativa",
      tempo_pausado: tempo_pausado_inicial,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[heartbeat] INSERT FAIL:", JSON.stringify({
      msg: error.message, details: error.details, hint: error.hint, code: error.code, userId: ctx.userId,
    }));
    return NextResponse.json({ status: "erro", erro: error.message, ativa: false }, { status: 500 });
  }

  return NextResponse.json({ sessao_id: data?.id, status: "ok", ativa: true });
}
