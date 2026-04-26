import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") || "";
  const token = cookieHeader.match(/urbis_token=([^;]+)/)?.[1];
  const userId = cookieHeader.match(/urbis_id=([^;]+)/)?.[1];

  if (!token || !userId) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nome, email, perfil, cargo, matricula")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ ok: false, erro: "Usuário não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data });
}