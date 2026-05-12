import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verificarAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = await verificarAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, erro: auth.erro }, { status: 401 });
  if (!["admin", "gerente"].includes(auth.perfil))
    return NextResponse.json({ ok: false, erro: "Sem permissão" }, { status: 403 });

  const { processo_id, analista_id } = await req.json();
  if (!processo_id) return NextResponse.json({ ok: false, erro: "processo_id obrigatório" }, { status: 400 });

  const supabase = createClient();
  const { error } = await supabase
    .from("processos")
    .update({ analista_id: analista_id || null })
    .eq("id", processo_id);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
