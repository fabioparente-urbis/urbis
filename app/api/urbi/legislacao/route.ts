import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export async function GET() {
  const { data, error } = await supabase
    .from("urbi_legislacao")
    .select("*")
    .order("criado_em", { ascending: false });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { error, data } = await supabase
    .from("urbi_legislacao")
    .insert(body)
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function PUT(req: NextRequest) {
  const { id, ...campos } = await req.json();
  const { error } = await supabase
    .from("urbi_legislacao")
    .update(campos)
    .eq("id", id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const { error } = await supabase
    .from("urbi_legislacao")
    .delete()
    .eq("id", id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
