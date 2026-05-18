import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CHAVES_VALIDAS = new Set(["P1_TRIAGEM", "P2_EXTRACAO"]);

// GET /api/admin/prompts/historico?chave=P1_TRIAGEM
// Retorna snapshots mais recentes primeiro. P2_MAC é ignorada explicitamente.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const chave = searchParams.get("chave");

  if (!chave)
    return NextResponse.json({ ok: false, erro: "Parâmetro 'chave' obrigatório." }, { status: 400 });

  if (!CHAVES_VALIDAS.has(chave))
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
