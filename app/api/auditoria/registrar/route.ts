import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const { modulo, acao, processo_codigo, assunto_id, detalhe, origem, sessao_id } = body;

  if (!modulo || !acao) {
    return NextResponse.json({ ok: false, erro: "modulo e acao obrigatórios" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("auditoria_eventos").insert({
    analista_id: ctx.userId,
    analista_nome: body.analista_nome || "",
    sessao_id: sessao_id || null,
    modulo,
    acao,
    processo_codigo: processo_codigo || null,
    assunto_id: assunto_id || null,
    detalhe: detalhe || null,
    origem: origem || "MANUAL",
  });

  if (error) {
    console.error("[auditoria/registrar]", error);
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }

  // Atualiza ultimo_evento na sessão para cálculo de idle
  if (sessao_id) {
    await supabaseAdmin
      .from("auditoria_sessoes")
      .update({ ultimo_evento: new Date().toISOString() })
      .eq("id", sessao_id)
      .eq("analista_id", ctx.userId);
  }

  return NextResponse.json({ ok: true });
}
