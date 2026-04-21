import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    const { data: usuario } = await supabase.from("usuarios").select("email").eq("id", id).single();
    if (!usuario?.email) return NextResponse.json({ ok: false, erro: "Usuário não encontrado" }, { status: 404 });

    const { error } = await supabase.auth.resetPasswordForEmail(usuario.email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/login`,
    });

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}
