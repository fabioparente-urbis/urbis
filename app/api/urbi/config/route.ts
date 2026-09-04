import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.perfis.includes("Administrador")) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito ao Administrador." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("urbi_config")
    .select("chave, valor, descricao, atualizado_em, atualizado_por");
  if (error) {
    console.error("[urbi/config GET] falha ao consultar:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao consultar configuração." }, { status: 500 });
  }

  const idsAtualizador = [...new Set((data ?? []).map((l) => l.atualizado_por).filter(Boolean))];
  let nomesPorId = new Map<string, string>();
  if (idsAtualizador.length) {
    const { data: usuarios } = await supabase.from("usuarios").select("id, nome").in("id", idsAtualizador);
    nomesPorId = new Map((usuarios ?? []).map((u: any) => [u.id, u.nome]));
  }
  const comNome = (data ?? []).map((l) => ({ ...l, atualizado_por_nome: l.atualizado_por ? (nomesPorId.get(l.atualizado_por) ?? null) : null }));

  return NextResponse.json({ ok: true, data: comNome });
}

export async function PUT(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.perfis.includes("Administrador")) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito ao Administrador." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.chave !== "string" || !body.chave.trim()) {
    return NextResponse.json({ ok: false, erro: "chave é obrigatória." }, { status: 400 });
  }
  const { error } = await supabase
    .from("urbi_config")
    .update({ valor: body.valor, atualizado_em: new Date().toISOString(), atualizado_por: ctx.userId })
    .eq("chave", body.chave);
  if (error) {
    console.error("[urbi/config PUT] falha ao atualizar:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao atualizar configuração." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
