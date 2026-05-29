import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const codigo = searchParams.get("codigo");

  if (!codigo) {
    return NextResponse.json({ preenchido: false });
  }

  // LIP é salvo em processos.dados (JSONB)
  const { data } = await supabaseAdmin
    .from("processos")
    .select("dados")
    .eq("codigo", codigo)
    .single();

  const dados = data?.dados;
  // Considera preenchido se dados existe, não é null e tem pelo menos 1 chave com valor
  const preenchido = dados &&
    typeof dados === "object" &&
    Object.values(dados).some((v) => v !== null && v !== "" && v !== undefined);

  return NextResponse.json({ preenchido: !!preenchido });
}
