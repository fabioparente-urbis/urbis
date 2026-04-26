import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const { data: abas, error } = await supabase
    .from("lip_abas")
    .select("*, lip_campos(*)")
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // Ordena campos dentro de cada aba
  const abasOrdenadas = abas.map((aba: any) => ({
    ...aba,
    lip_campos: (aba.lip_campos || []).sort((a: any, b: any) => a.ordem - b.ordem),
  }));

  return NextResponse.json({ ok: true, data: abasOrdenadas });
}

// Criar aba
export async function POST(req: NextRequest) {
  const { tipo, ...body } = await req.json();

  if (tipo === "aba") {
    const { data: ultima } = await supabase
      .from("lip_abas")
      .select("ordem")
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("lip_abas")
      .insert({ nome: body.nome, dica: body.dica || "", ordem: (ultima?.ordem ?? -1) + 1 })
      .select()
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  }

  if (tipo === "campo") {
    const { data: ultimo } = await supabase
      .from("lip_campos")
      .select("ordem")
      .eq("aba_id", body.aba_id)
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("lip_campos")
      .insert({
        aba_id: body.aba_id,
        chave: body.chave,
        label: body.label,
        tipo: body.tipo || "texto",
        opcoes: body.opcoes || null,
        placeholder: body.placeholder || "",
        valor_padrao: body.valor_padrao || "",
        ordem: (ultimo?.ordem ?? -1) + 1,
      })
      .select()
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  }

  return NextResponse.json({ ok: false, erro: "Tipo inválido" }, { status: 400 });
}

// Editar aba ou campo
export async function PUT(req: NextRequest) {
  const { tipo, id, ...body } = await req.json();

  if (tipo === "aba") {
    const { error } = await supabase
      .from("lip_abas")
      .update({ nome: body.nome, dica: body.dica })
      .eq("id", id);

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (tipo === "campo") {
    const { error } = await supabase
      .from("lip_campos")
      .update({
        label: body.label,
        tipo: body.tipo,
        opcoes: body.opcoes || null,
        placeholder: body.placeholder || "",
        valor_padrao: body.valor_padrao || "",
      })
      .eq("id", id);

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (tipo === "ordem_campo") {
    const { error } = await supabase
      .from("lip_campos")
      .update({ ordem: body.ordem })
      .eq("id", id);

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (tipo === "ordem_aba") {
    const { error } = await supabase
      .from("lip_abas")
      .update({ ordem: body.ordem })
      .eq("id", id);

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, erro: "Tipo inválido" }, { status: 400 });
}

// Excluir aba ou campo
export async function DELETE(req: NextRequest) {
  const { tipo, id } = await req.json();

  if (tipo === "aba") {
    const { error } = await supabase.from("lip_abas").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (tipo === "campo") {
    const { error } = await supabase.from("lip_campos").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, erro: "Tipo inválido" }, { status: 400 });
}