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
    .select("chave, valor, descricao");
  if (error) {
    console.error("[urbi/config GET] falha ao consultar:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao consultar configuração." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data });
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
    .update({ valor: body.valor, atualizado_em: new Date().toISOString() })
    .eq("chave", body.chave);
  if (error) {
    console.error("[urbi/config PUT] falha ao atualizar:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao atualizar configuração." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
