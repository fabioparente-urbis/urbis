import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { usuarioDaRequisicao, podeAcessarProcesso } from "@/lib/autorizacao";

/**
 * POST { processo, condicao_id, motivo } — dispensa uma condição bloqueante do URBI
 * (18/11/2026). Quem pode: o analista do processo e as chefias (gerente da gerência,
 * Diretor/a, Administrador) — mesma regra de `podeAcessarProcesso`. Motivo obrigatório.
 * Vale só para a evidência atual: se ela mudar, a condição volta (ver lib/urbi/condicoesProcesso.ts).
 * Ação de computador — nunca exposta em /api/mobile/*.
 */
export async function POST(req: NextRequest) {
  const u = await usuarioDaRequisicao(req);
  if (!u) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const processo = String(body.processo ?? "").trim();
  const condicaoId = String(body.condicao_id ?? "").trim();
  const motivo = String(body.motivo ?? "").trim().slice(0, 500);
  if (!processo || !condicaoId) return NextResponse.json({ ok: false, erro: "processo e condicao_id obrigatórios" }, { status: 400 });
  if (motivo.length < 5) return NextResponse.json({ ok: false, erro: "Escreva o motivo da dispensa." }, { status: 400 });

  const aut = await podeAcessarProcesso(u, processo);
  if (!aut.ok) return NextResponse.json({ ok: false, erro: aut.erro }, { status: aut.status });

  const { data: cond, error: errCond } = await supabaseAdmin
    .from("urbi_condicoes_processo")
    .select("evidencia_hash, titulo, detalhe")
    .eq("processo_codigo", processo).eq("condicao_id", condicaoId).maybeSingle();
  if (errCond) return NextResponse.json({ ok: false, erro: errCond.message }, { status: 500 });
  if (!cond) return NextResponse.json({ ok: false, erro: "Condição não encontrada — abra o LIP para recalcular." }, { status: 404 });

  const { error } = await supabaseAdmin.from("urbi_condicoes_dispensa").insert({
    processo_codigo: processo, condicao_id: condicaoId, evidencia_hash: (cond as any).evidencia_hash,
    motivo, usuario_id: u.id,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  try {
    await supabaseAdmin.from("auditoria_eventos").insert({
      analista_id: u.id, modulo: "URBI", acao: "URBI_CONDICAO_BLOQUEANTE_DISPENSADA", origem: "web",
      processo_codigo: processo, detalhe: { condicao_id: condicaoId, titulo: (cond as any).titulo, evidencia: (cond as any).detalhe, motivo },
    });
  } catch {}
  return NextResponse.json({ ok: true });
}
