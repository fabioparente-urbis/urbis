import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRequisicao } from "@/lib/autorizacao";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { pendentesSei } from "@/lib/mdpEnviadoSei";

// GET ?processo=<codigo> — documentos emitidos e ainda não confirmados no SEI.
export async function GET(req: NextRequest) {
  const u = await usuarioDaRequisicao(req);
  if (!u) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  const processo = new URL(req.url).searchParams.get("processo");
  if (!processo) return NextResponse.json({ ok: false, erro: "processo obrigatório" }, { status: 400 });
  return NextResponse.json({ ok: true, pendentes: await pendentesSei([processo]) });
}

// POST { id } — confirma o envio. Data/hora são do servidor. Só quem emitiu ou irrestrito.
export async function POST(req: NextRequest) {
  const u = await usuarioDaRequisicao(req);
  if (!u) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ ok: false, erro: "id obrigatório" }, { status: 400 });

  const { data: reg } = await supabaseAdmin
    .from("mdp_registros").select("id, processo_codigo, tipo, numero, usuario_id, enviado_sei_em").eq("id", id).maybeSingle();
  if (!reg) return NextResponse.json({ ok: false, erro: "Registro não encontrado" }, { status: 404 });
  if (reg.usuario_id !== u.id && !u.irrestrito)
    return NextResponse.json({ ok: false, erro: "Só quem emitiu o documento (ou o Administrador) confirma o envio." }, { status: 403 });
  if (reg.enviado_sei_em) return NextResponse.json({ ok: true, enviado_sei_em: reg.enviado_sei_em, jaConfirmado: true });

  const agora = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("mdp_registros").update({ enviado_sei_em: agora, enviado_sei_por: u.id }).eq("id", id).is("enviado_sei_em", null);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // MAP (auditoria): best-effort
  try {
    await supabaseAdmin.from("auditoria_eventos").insert({
      analista_id: u.id, modulo: "MDP", acao: "ENVIADO_SEI_CONFIRMADO", origem: "web",
      processo_codigo: reg.processo_codigo, detalhe: { tipo: reg.tipo, numero: reg.numero, registro_id: id },
    });
  } catch {}
  return NextResponse.json({ ok: true, enviado_sei_em: agora });
}
