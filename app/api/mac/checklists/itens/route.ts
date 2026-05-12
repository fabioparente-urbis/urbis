// app/api/mac/checklists/itens/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const modelo_id = searchParams.get("modelo_id");

  const { data, error } = await supabase
    .from("mac_checklist_itens")
    .select("*")
    .eq("modelo_id", modelo_id)
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  const { modelo_id, grupo, texto, ref, ordem, chave_lip } = await req.json();
  const { data, error } = await supabase
    .from("mac_checklist_itens")
    .insert({
      modelo_id,
      grupo,
      texto,
      ref: ref || null,
      ordem: ordem || 0,
      chave_lip: chave_lip || null,
    })
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function PUT(req: NextRequest) {
  const { id, ...campos } = await req.json();
  const { data, error } = await supabase
    .from("mac_checklist_itens")
    .update(campos)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const { error } = await supabase
    .from("mac_checklist_itens")
    .update({ ativo: false })
    .eq("id", id);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}