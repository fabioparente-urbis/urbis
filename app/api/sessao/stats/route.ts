import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) return NextResponse.json({ ok: false, erro: "Acesso negado." }, { status: 403 });
  const [sessoes, tempo] = await Promise.all([
    supabaseAdmin.from("vw_bdi_sessoes").select("*"),
    supabaseAdmin.from("vw_bdi_tempo_analista").select("*"),
  ]);
  if (sessoes.error) return NextResponse.json({ ok: false, erro: sessoes.error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    data: sessoes.data,          // compatibilidade com tela Sessões existente
    tempo_analista: tempo.data ?? [], // bruto/líquido por processo×dia×semana×mês×ano
  });
}
