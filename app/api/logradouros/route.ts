import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  const tipo = req.nextUrl.searchParams.get("tipo");
  const bairro = req.nextUrl.searchParams.get("bairro");
  const logradouro = req.nextUrl.searchParams.get("logradouro");

  if (tipo === "bairros") {
    const { data, error } = await supabase.from("logradouros").select("bairro").ilike("bairro", `%${q}%`).limit(100);
    if (error) return NextResponse.json({ ok: false, erro: error.message });
    const unicos = [...new Set((data || []).map((r: any) => r.bairro))].sort();
    return NextResponse.json({ ok: true, data: unicos });
  }
  if (bairro && !logradouro) {
    const { data, error } = await supabase.from("logradouros").select("nome_logradouro").eq("bairro", bairro).ilike("nome_logradouro", `%${q}%`).limit(50);
    if (error) return NextResponse.json({ ok: false, erro: error.message });
    const unicos = [...new Set((data || []).map((r: any) => r.nome_logradouro))].sort();
    return NextResponse.json({ ok: true, data: unicos });
  }
  if (bairro && logradouro) {
    const { data, error } = await supabase.from("logradouros").select("*").eq("bairro", bairro).eq("nome_logradouro", logradouro).maybeSingle();
    if (error) return NextResponse.json({ ok: false, erro: error.message });
    return NextResponse.json({ ok: true, data });
  }
  return NextResponse.json({ ok: false, erro: "Parâmetros inválidos" });
}
