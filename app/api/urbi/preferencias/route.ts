import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const { usuario_id, urbi_mudo, urbi_bip, urbi_voz } = await req.json();
    if (!usuario_id) return NextResponse.json({ ok: false }, { status: 400 });

    const update: any = {};
    if (urbi_mudo !== undefined) update.urbi_mudo = urbi_mudo;
    if (urbi_bip !== undefined) update.urbi_bip = urbi_bip;
    if (urbi_voz !== undefined) update.urbi_voz = urbi_voz;

    const { error } = await supabase.from("usuarios").update(update).eq("id", usuario_id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message }, { status: 500 });
  }
}
