import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export async function GET() {
  const { data, error } = await supabase
    .from("urbi_config")
    .select("chave, valor, descricao");
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function PUT(req: NextRequest) {
  const { chave, valor } = await req.json();
  const { error } = await supabase
    .from("urbi_config")
    .update({ valor, atualizado_em: new Date().toISOString() })
    .eq("chave", chave);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
