import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { usuarioDaRequisicao } from "@/lib/autorizacao";

/**
 * POST { processo } — "Refazer análise das condições bloqueantes" (18/11/2026), SÓ Administrador.
 * Revoga todas as dispensas ativas deste processo (ficam no banco, com quem revogou) e apaga o
 * retrato atual; quem chamou em seguida roda o Vigia com `?registrar=lip`, que recalcula do zero.
 */
export async function POST(req: NextRequest) {
  const u = await usuarioDaRequisicao(req);
  if (!u) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  if (!u.perfis.includes("Administrador")) return NextResponse.json({ ok: false, erro: "Só o Administrador refaz a análise." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const processo = String(body.processo ?? "").trim();
  if (!processo) return NextResponse.json({ ok: false, erro: "processo obrigatório" }, { status: 400 });

  const agora = new Date().toISOString();
  const { data: revogadas, error } = await supabaseAdmin.from("urbi_condicoes_dispensa")
    .update({ revogada_em: agora, revogada_por: u.id })
    .eq("processo_codigo", processo).is("revogada_em", null).select("id");
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  try {
    await supabaseAdmin.from("auditoria_eventos").insert({
      analista_id: u.id, modulo: "URBI", acao: "URBI_CONDICOES_REFEITAS", origem: "web",
      processo_codigo: processo, detalhe: { dispensas_revogadas: (revogadas ?? []).length },
    });
  } catch {}
  return NextResponse.json({ ok: true, dispensas_revogadas: (revogadas ?? []).length });
}
