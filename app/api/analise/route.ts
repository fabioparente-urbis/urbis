import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const codigo = searchParams.get("codigo");
  if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatorio" }, { status: 400 });
  const { data, error } = await supabase
    .from("analises_mac")
    .select("*")
    .eq("processo_codigo", codigo)
    .order("numero_analise", { ascending: false });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { processo_codigo, itens, observacoes, status } = body;
    if (!processo_codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatorio" }, { status: 400 });

    const cookieHeader = req.headers.get("cookie") || "";
    const analistaId = cookieHeader.match(/urbis_id=([^;]+)/)?.[1] ?? null;

    const { data: existentes } = await supabase
      .from("analises_mac")
      .select("numero_analise")
      .eq("processo_codigo", processo_codigo)
      .order("numero_analise", { ascending: false })
      .limit(1);

    const proximoNumero = existentes && existentes.length > 0 ? existentes[0].numero_analise + 1 : 1;

    if (proximoNumero > 5) {
      return NextResponse.json({ ok: false, erro: "Limite de 5 analises atingido. Processo deve ser indeferido." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("analises_mac")
      .insert({
        processo_codigo,
        analista_id: analistaId,
        numero_analise: proximoNumero,
        status: status || "em_andamento",
        itens: itens || {},
        observacoes: observacoes || "",
        modelo_id: body.modelo_id || null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, itens, observacoes, status, modelo_id } = body;
    if (!id) return NextResponse.json({ ok: false, erro: "id obrigatorio" }, { status: 400 });

    const { error } = await supabase
      .from("analises_mac")
      .update({
        itens,
        observacoes,
        status,
        ...(modelo_id ? { modelo_id } : {}),
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}