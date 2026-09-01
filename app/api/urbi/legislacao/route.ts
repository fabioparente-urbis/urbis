import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

async function exigirAdministrador(req: NextRequest): Promise<NextResponse | null> {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.perfis.includes("Administrador")) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito ao Administrador." }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const bloqueio = await exigirAdministrador(req);
  if (bloqueio) return bloqueio;

  const { data, error } = await supabase
    .from("urbi_legislacao")
    .select("*")
    .order("criado_em", { ascending: false });
  if (error) {
    console.error("[urbi/legislacao GET] falha ao consultar:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao consultar legislação." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  const bloqueio = await exigirAdministrador(req);
  if (bloqueio) return bloqueio;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.titulo !== "string" || !body.titulo.trim()) {
    return NextResponse.json({ ok: false, erro: "titulo é obrigatório." }, { status: 400 });
  }
  const { error, data } = await supabase
    .from("urbi_legislacao")
    .insert(body)
    .select()
    .single();
  if (error) {
    console.error("[urbi/legislacao POST] falha ao gravar:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao cadastrar lei." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data });
}

export async function PUT(req: NextRequest) {
  const bloqueio = await exigirAdministrador(req);
  if (bloqueio) return bloqueio;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ ok: false, erro: "id é obrigatório." }, { status: 400 });
  }
  const { id, ...campos } = body;
  const { error } = await supabase
    .from("urbi_legislacao")
    .update(campos)
    .eq("id", id);
  if (error) {
    console.error("[urbi/legislacao PUT] falha ao atualizar:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao atualizar lei." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const bloqueio = await exigirAdministrador(req);
  if (bloqueio) return bloqueio;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ ok: false, erro: "id é obrigatório." }, { status: 400 });
  }
  const { error } = await supabase
    .from("urbi_legislacao")
    .delete()
    .eq("id", body.id);
  if (error) {
    console.error("[urbi/legislacao DELETE] falha ao remover:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao remover lei." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
