import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// Retorna apenas bairro e logradouro do LIP para prefill — sem ownership check
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const codigo = req.nextUrl.searchParams.get("codigo");
  if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatorio" });

  const { data } = await supabaseAdmin
    .from("processos")
    .select("dados")
    .eq("codigo", codigo)
    .maybeSingle();

  const dados = data?.dados as any;
  return NextResponse.json({
    ok: true,
    bairro: dados?.bairro?.valor ?? null,
    logradouro: dados?.logradouro?.valor ?? null,
  });
}
