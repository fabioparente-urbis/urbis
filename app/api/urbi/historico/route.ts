import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const analista = searchParams.get("analista");
  const linha = searchParams.get("linha");
  const limit = parseInt(searchParams.get("limit") ?? "50");

  let query = supabase
    .from("urbi_historico")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(limit);

  if (analista) query = query.eq("usuario_nome", analista);
  if (linha) query = query.eq("linha", linha);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { error } = await supabase.from("urbi_historico").insert(body);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
