import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const sessao_id: string | undefined = body.sessao_id;
  const pagina: string = body.pagina ?? "/";

  if (sessao_id) {
    const { data: rows } = await supabaseAdmin
      .from("urbis_sessoes")
      .update({ ultimo_ping: new Date().toISOString(), pagina })
      .eq("id", sessao_id)
      .eq("usuario_id", ctx.userId)
      .eq("status", "ativa")
      .select("id");

    if (!rows || rows.length === 0) {
      return NextResponse.json({ ativa: false });
    }

    return NextResponse.json({ sessao_id, ativa: true });
  }

  await supabaseAdmin
    .from("urbis_sessoes")
    .update({ status: "encerrada", encerrada_em: new Date().toISOString() })
    .eq("usuario_id", ctx.userId)
    .eq("status", "ativa");

  const { data } = await supabaseAdmin
    .from("urbis_sessoes")
    .insert({ usuario_id: ctx.userId, pagina, status: "ativa" })
    .select("id")
    .single();

  return NextResponse.json({ sessao_id: data?.id, ativa: true });
}
