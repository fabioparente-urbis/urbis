import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/admin/prompts/historico?chave=P1_TRIAGEM
// Aceita qualquer chave com prefixo P1_, P2_ ou P3_ (suporte multi-assunto Sessão 5C).
// Nota: lip_prompts_historico não tem assunto_id — snapshots são globais por chave.
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const chave = searchParams.get("chave");

  if (!chave)
    return NextResponse.json({ ok: false, erro: "Parâmetro 'chave' obrigatório." }, { status: 400 });

  if (!chave.startsWith("P1_") && !chave.startsWith("P2_") && !chave.startsWith("P3_"))
    return NextResponse.json({ ok: true, data: [] });

  const { data, error } = await supabaseAdmin
    .from("lip_prompts_historico")
    .select("id, prompt_chave, conteudo, salvo_em, salvo_por")
    .eq("prompt_chave", chave)
    .order("salvo_em", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
