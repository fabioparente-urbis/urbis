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
  // Segundos de dead-time (cron closure) ou pausa a já registrar no novo registro
  const tempo_pausado_inicial: number = Math.max(0, Number(body.tempo_pausado_inicial) || 0);

  if (sessao_id) {
    const { data: rows } = await supabaseAdmin
      .from("urbis_sessoes")
      .update({ ultimo_ping: new Date().toISOString(), pagina })
      .eq("id", sessao_id)
      .eq("usuario_id", ctx.userId)
      .eq("status", "ativa")
      .select("id");

    if (!rows || rows.length === 0) {
      // Sessão encerrada pelo pg_cron — busca encerrada_em para o front calcular dead time
      const { data: morta } = await supabaseAdmin
        .from("urbis_sessoes")
        .select("encerrada_em")
        .eq("id", sessao_id)
        .eq("usuario_id", ctx.userId)
        .single();

      return NextResponse.json({
        status: "encerrada",
        encerrada_em: morta?.encerrada_em ?? null,
        ativa: false, // backward-compat
      });
    }

    return NextResponse.json({ sessao_id, status: "ok", ativa: true });
  }

  // Sem sessao_id — encerra eventuais sessões ativas e abre nova
  await supabaseAdmin
    .from("urbis_sessoes")
    .update({ status: "encerrada", encerrada_em: new Date().toISOString() })
    .eq("usuario_id", ctx.userId)
    .eq("status", "ativa");

  const { data } = await supabaseAdmin
    .from("urbis_sessoes")
    .insert({
      usuario_id: ctx.userId,
      pagina,
      status: "ativa",
      tempo_pausado: tempo_pausado_inicial,
    })
    .select("id")
    .single();

  return NextResponse.json({ sessao_id: data?.id, status: "ok", ativa: true });
}
