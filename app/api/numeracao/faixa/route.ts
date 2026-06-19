import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUsuarioId(req: NextRequest): Promise<string | null> {
  const cookie = req.headers.get("cookie") ?? "";
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/auth/me`, {
    headers: { cookie },
  });
  const json = await res.json();
  return json?.data?.id ?? null;
}

export async function GET(req: NextRequest) {
  const usuarioId = await getUsuarioId(req);
  if (!usuarioId) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });

  const { data, error } = await supabase
    .from("urbis_numeracao_faixas")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("criado_em", { ascending: false });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  const usuarioId = await getUsuarioId(req);
  if (!usuarioId) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });

  const { tipo, numero_inicial, numero_final } = await req.json();
  if (!["despacho", "parecer"].includes(tipo))
    return NextResponse.json({ ok: false, erro: "tipo inválido" }, { status: 400 });
  if (!Number.isInteger(numero_inicial) || !Number.isInteger(numero_final) || numero_inicial > numero_final)
    return NextResponse.json({ ok: false, erro: "Faixa inválida" }, { status: 400 });

  await supabase
    .from("urbis_numeracao_faixas")
    .delete()
    .eq("usuario_id", usuarioId)
    .eq("tipo", tipo);

  const { data, error } = await supabase
    .from("urbis_numeracao_faixas")
    .insert({ usuario_id: usuarioId, tipo, numero_inicial, numero_final, proximo: numero_inicial })
    .select()
    .single();

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
