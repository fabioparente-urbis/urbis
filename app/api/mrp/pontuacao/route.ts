import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  const { data, error } = await supabaseAdmin
    .from("mrp_pontuacao").select("*").order("ordem");
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function PUT(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.perfis.includes("Administrador"))
    return NextResponse.json({ ok: false, erro: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const { id, pontos, descricao } = body;
  if (!id || pontos === undefined)
    return NextResponse.json({ ok: false, erro: "id e pontos obrigatórios" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("mrp_pontuacao").update({ pontos: Number(pontos), descricao }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
