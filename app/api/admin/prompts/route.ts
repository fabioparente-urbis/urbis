import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("lip_prompts")
    .select("chave, conteudo, versao_anterior, versao, atualizado_em, conteudo_backup")
    .eq("ativo", true)
    .in("chave", ["P1_TRIAGEM", "P2_EXTRACAO"]);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function PUT(req: NextRequest) {
  const { chave, novo_conteudo } = await req.json();

  const { data: atual, error: erroBusca } = await supabaseAdmin
    .from("lip_prompts")
    .select("conteudo, versao")
    .eq("chave", chave)
    .eq("ativo", true)
    .single();

  if (erroBusca || !atual)
    return NextResponse.json({ ok: false, erro: "Prompt não encontrado." }, { status: 404 });

  const { error } = await supabaseAdmin
    .from("lip_prompts")
    .update({
      conteudo: novo_conteudo,
      versao: atual.versao + 1,
      atualizado_em: new Date().toISOString(),
    })
    .eq("chave", chave);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const { chave } = await req.json();
  const { data: atual, error: erroBusca } = await supabaseAdmin
    .from("lip_prompts").select("conteudo").eq("chave", chave).eq("ativo", true).single();
  if (erroBusca || !atual)
    return NextResponse.json({ ok: false, erro: "Prompt não encontrado." }, { status: 404 });
  const { error } = await supabaseAdmin
    .from("lip_prompts").update({ conteudo_backup: atual.conteudo }).eq("chave", chave);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
