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
    // urbi_voz e urbi_modo_audio ficaram de fora de propósito: são permissão
    // de voz, decidida só pelo administrador (app/api/admin/usuarios). Essa
    // rota é autosserviço — aceitar qualquer uma das duas aqui deixaria um
    // usuário autenticado se autoconceder áudio direto pela API, sem passar
    // pelo admin. urbi_mudo/urbi_bip continuam livres: são preferência de
    // sessão, não permissão.
    const { urbi_mudo, urbi_bip } = body as Record<string, unknown>;

    const update: Record<string, boolean> = {};
    if (typeof urbi_mudo === "boolean") update.urbi_mudo = urbi_mudo;
    if (typeof urbi_bip === "boolean") update.urbi_bip = urbi_bip;

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
