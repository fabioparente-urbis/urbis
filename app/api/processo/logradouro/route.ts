import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
export async function GET(req: NextRequest) {
  const codigo = req.nextUrl.searchParams.get("codigo");
  if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatorio" });
  const { data: proc } = await supabase.from("processos").select("dados").eq("codigo", codigo).maybeSingle();
  return NextResponse.json({ ok: true, data: (proc as any)?.dados?.vias ?? [] });
}
export async function POST(req: NextRequest) {
  const { codigo, vias } = await req.json();
  if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatorio" });
  const { data: proc } = await supabase.from("processos").select("dados").eq("codigo", codigo).maybeSingle();
  const dados = { ...((proc as any)?.dados ?? {}), vias };
  const { error } = await supabase.from("processos").update({ dados }).eq("codigo", codigo);
  if (error) return NextResponse.json({ ok: false, erro: error.message });
  return NextResponse.json({ ok: true });
}
