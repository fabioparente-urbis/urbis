import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * POST /api/processo/atribuir
 * Body: { processo_id: string, analista_id: string | null }
 * Atualiza apenas o campo analista_id do processo.
 * Requer perfil irrestrito (Administrador, Gerente ou Diretor).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;
    if (!auth.irrestrito) {
      return NextResponse.json(
        { ok: false, erro: "Sem permissão para atribuir analista." },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { processo_id, analista_id } = body as {
      processo_id?: string;
      analista_id?: string | null;
    };
    if (!processo_id) {
      return NextResponse.json(
        { ok: false, erro: "processo_id obrigatório" },
        { status: 400 },
      );
    }

    const novoAnalistaId =
      analista_id === undefined || analista_id === "" ? null : analista_id;

    const { error } = await supabase
      .from("processos")
      .update({
        analista_id: novoAnalistaId,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", processo_id);

    if (error) {
      return NextResponse.json(
        { ok: false, erro: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, erro: e?.message || "Erro interno" },
      { status: 500 },
    );
  }
}
