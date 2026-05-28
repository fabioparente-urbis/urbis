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

  // Ping em sessão existente
  if (sessao_id) {
    const { count } = await supabaseAdmin
      .from("urbis_sessoes")
      .update({ ultimo_ping: new Date().toISOString(), pagina })
      .eq("id", sessao_id)
      .eq("usuario_id", ctx.userId)
      .eq("status", "ativa")
      .select("id", { count: "exact", head: true });

    if ((count ?? 0) === 0) {
      return NextResponse.json({ ativa: false });
    }

    return NextResponse.json({ sessao_id, ativa: true });
  }

  // Encerrar sessões antigas do mesmo usuário (limpeza lazy)
  await supabaseAdmin
    .from("urbis_sessoes")
    .update({ status: "encerrada", encerrada_em: new Date().toISOString() })
    .eq("usuario_id", ctx.userId)
    .eq("status", "ativa");

  // Criar nova sessão
  const { data } = await supabaseAdmin
    .from("urbis_sessoes")
    .insert({ usuario_id: ctx.userId, pagina, status: "ativa" })
    .select("id")
    .single();

  return NextResponse.json({ sessao_id: data?.id, ativa: true });
}
