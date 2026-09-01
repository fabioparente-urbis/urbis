import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const ctx = await autenticar(req);
    if (ctx instanceof NextResponse) return ctx;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, erro: "Corpo inválido." }, { status: 400 });
    }
    const { urbi_mudo, urbi_bip, urbi_voz } = body as Record<string, unknown>;

    const update: Record<string, boolean> = {};
    if (typeof urbi_mudo === "boolean") update.urbi_mudo = urbi_mudo;
    if (typeof urbi_bip === "boolean") update.urbi_bip = urbi_bip;
    if (typeof urbi_voz === "boolean") update.urbi_voz = urbi_voz;

    // Identidade sempre da sessão — usuario_id enviado pelo cliente é
    // deliberadamente ignorado, para impedir alterar preferência de terceiro.
    const { error } = await supabase.from("usuarios").update(update).eq("id", ctx.userId);
    if (error) {
      console.error("[urbi/preferencias POST] falha ao atualizar:", error.message);
      return NextResponse.json({ ok: false, erro: "Falha ao atualizar preferências." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[urbi/preferencias POST]", e);
    return NextResponse.json({ ok: false, erro: "Falha ao atualizar preferências." }, { status: 500 });
  }
}
