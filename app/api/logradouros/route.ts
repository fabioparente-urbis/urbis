import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  const tipo = req.nextUrl.searchParams.get("tipo");
  const bairro = req.nextUrl.searchParams.get("bairro");
  const logradouro = req.nextUrl.searchParams.get("logradouro");
  const filtro = req.nextUrl.searchParams.get("filtro") || "";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "0");
  if (tipo === "bairros") {
    const { data, error } = await supabase.from("logradouros").select("bairro").ilike("bairro", `%${q}%`).limit(100);
    if (error) return NextResponse.json({ ok: false, erro: error.message });
    return NextResponse.json({ ok: true, data: [...new Set((data||[]).map((r:any)=>r.bairro))].sort() });
  }
  if (bairro && !logradouro) {
    const { data, error } = await supabase.from("logradouros").select("nome_logradouro").eq("bairro", bairro).ilike("nome_logradouro", `%${q}%`).limit(500);
    if (error) return NextResponse.json({ ok: false, erro: error.message });
    return NextResponse.json({ ok: true, data: [...new Set((data||[]).map((r:any)=>r.nome_logradouro))].sort() });
  }
  if (bairro && logradouro) {
    const { data, error } = await supabase.from("logradouros").select("*").eq("bairro", bairro).eq("nome_logradouro", logradouro).maybeSingle();
    if (error) return NextResponse.json({ ok: false, erro: error.message });
    return NextResponse.json({ ok: true, data });
  }
  let query = supabase.from("logradouros").select("*", { count: "exact" }).order("bairro").order("nome_logradouro").range(page*30, page*30+29) as any;
  if (filtro) query = query.or(`bairro.ilike.%${filtro}%,nome_logradouro.ilike.%${filtro}%`);
  const { data, count, error } = await query;
  if (error) return NextResponse.json({ ok: false, erro: error.message });
  return NextResponse.json({ ok: true, data, total: count });
}
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = await supabase.from("logradouros").insert(body).select().single();
  if (error) return NextResponse.json({ ok: false, erro: error.message });
  return NextResponse.json({ ok: true, data });
}
export async function PUT(req: NextRequest) {
  const { id, ...rest } = await req.json();
  if (!id) return NextResponse.json({ ok: false, erro: "id obrigatorio" });
  const { data, error } = await supabase.from("logradouros").update(rest).eq("id", id).select().single();
  if (error) return NextResponse.json({ ok: false, erro: error.message });
  return NextResponse.json({ ok: true, data });
}
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, erro: "id obrigatorio" });
  const { error } = await supabase.from("logradouros").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, erro: error.message });
  return NextResponse.json({ ok: true });
}
