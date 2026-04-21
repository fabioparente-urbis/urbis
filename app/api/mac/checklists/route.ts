// app/api/mac/checklists/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const analista_id = searchParams.get("analista_id");

  const { data, error } = await supabase
    .from("mac_checklist_modelos")
    .select("*, mac_checklist_itens(*)")
    .or(`dono_id.is.null${analista_id ? `,dono_id.eq.${analista_id}` : ""}`)
    .order("criado_em", { ascending: true });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  const { nome, tipo_processo, dono_id, copiar_de } = await req.json();

  const { data: modelo, error: em } = await supabase
    .from("mac_checklist_modelos")
    .insert({ nome, tipo_processo: tipo_processo || null, dono_id: dono_id || null, criado_por: dono_id || null })
    .select()
    .single();

  if (em) return NextResponse.json({ ok: false, erro: em.message }, { status: 500 });

  if (copiar_de) {
    const { data: itens } = await supabase
      .from("mac_checklist_itens")
      .select("grupo, texto, ref, ordem, ativo")
      .eq("modelo_id", copiar_de);

    if (itens && itens.length > 0) {
      await supabase.from("mac_checklist_itens").insert(
        itens.map((i) => ({ ...i, modelo_id: modelo.id }))
      );
    }
  }

  return NextResponse.json({ ok: true, data: modelo });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const { error } = await supabase.from("mac_checklist_modelos").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}