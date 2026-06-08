import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const { sessao_id, acao } = body;
  if (!sessao_id) return NextResponse.json({ ok: false, erro: "sessao_id obrigatório" }, { status: 400 });

  const agora = new Date().toISOString();

  if (acao === "INICIAR") {
    const { data: usuario } = await supabaseAdmin
      .from("usuarios").select("nome, email").eq("id", ctx.userId).maybeSingle();
    await supabaseAdmin.from("auditoria_sessoes").insert({
      id: sessao_id,
      analista_id: ctx.userId,
      analista_nome: (usuario as any)?.nome || (usuario as any)?.email || "",
      iniciada_em: agora,
      ultimo_evento: agora,
    });
    return NextResponse.json({ ok: true });
  }

  if (acao === "HEARTBEAT") {
    // Atualiza ultimo_evento e recalcula tempo_bruto_s
    const { data: sessao } = await supabaseAdmin
      .from("auditoria_sessoes").select("iniciada_em, tempo_liquido_s")
      .eq("id", sessao_id).eq("analista_id", ctx.userId).maybeSingle();

    if (sessao) {
      const bruto = Math.round((Date.now() - new Date((sessao as any).iniciada_em).getTime()) / 1000);
      await supabaseAdmin.from("auditoria_sessoes").update({
        ultimo_evento: agora,
        tempo_bruto_s: bruto,
      }).eq("id", sessao_id);
    }
    return NextResponse.json({ ok: true });
  }

  if (acao === "ENCERRAR") {
    const { data: sessao } = await supabaseAdmin
      .from("auditoria_sessoes").select("iniciada_em, tempo_liquido_s")
      .eq("id", sessao_id).eq("analista_id", ctx.userId).maybeSingle();

    if (sessao) {
      const bruto = Math.round((Date.now() - new Date((sessao as any).iniciada_em).getTime()) / 1000);
      await supabaseAdmin.from("auditoria_sessoes").update({
        encerrada_em: agora,
        tempo_bruto_s: bruto,
      }).eq("id", sessao_id);
    }
    return NextResponse.json({ ok: true });
  }

  // REGISTRAR_IDLE — desconta do líquido
  if (acao === "REGISTRAR_IDLE") {
    const { duracao_idle_s } = body;
    const { data: sessao } = await supabaseAdmin
      .from("auditoria_sessoes").select("tempo_bruto_s, tempo_liquido_s, iniciada_em")
      .eq("id", sessao_id).eq("analista_id", ctx.userId).maybeSingle();

    if (sessao) {
      const bruto = Math.round((Date.now() - new Date((sessao as any).iniciada_em).getTime()) / 1000);
      const liquido = Math.max(0, bruto - (duracao_idle_s || 0));
      await supabaseAdmin.from("auditoria_sessoes").update({
        tempo_bruto_s: bruto,
        tempo_liquido_s: liquido,
      }).eq("id", sessao_id);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, erro: "acao inválida" }, { status: 400 });
}
