import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nome, email, perfil, perfis, cargo, matricula, gerencia, urbi_ativo, urbi_voz, urbi_mudo, urbi_bip, urbi_modo_audio, tema")
    .eq("id", ctx.userId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ ok: false, erro: "Usuário não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data });
}