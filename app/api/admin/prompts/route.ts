import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Chaves de prompt aceitas pela aplicação. P2_MAC é explicitamente ignorada.
const CHAVES_VALIDAS = ["P1_TRIAGEM", "P2_EXTRACAO"] as const;
type ChaveValida = (typeof CHAVES_VALIDAS)[number];

function isChaveValida(c: unknown): c is ChaveValida {
  return typeof c === "string" && (CHAVES_VALIDAS as readonly string[]).includes(c);
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("lip_prompts")
    .select("chave, conteudo, versao_anterior, versao, atualizado_em, conteudo_backup")
    .eq("ativo", true)
    .in("chave", CHAVES_VALIDAS as unknown as string[]);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function PUT(req: NextRequest) {
  const { chave, novo_conteudo, salvo_por } = await req.json();

  if (!isChaveValida(chave))
    return NextResponse.json({ ok: false, erro: "Chave de prompt inválida." }, { status: 400 });

  const { data: atual, error: erroBusca } = await supabaseAdmin
    .from("lip_prompts")
    .select("conteudo, versao")
    .eq("chave", chave)
    .eq("ativo", true)
    .single();

  if (erroBusca || !atual)
    return NextResponse.json({ ok: false, erro: "Prompt não encontrado." }, { status: 404 });

  // 1) Snapshot do conteúdo atual em lip_prompts_historico ANTES de sobrescrever.
  //    Falha aqui aborta o salvamento — não queremos perder a versão anterior.
  const { error: erroHist } = await supabaseAdmin
    .from("lip_prompts_historico")
    .insert({
      prompt_chave: chave,
      conteudo: atual.conteudo,
      salvo_por: typeof salvo_por === "string" && salvo_por.trim() ? salvo_por : null,
    });

  if (erroHist)
    return NextResponse.json(
      { ok: false, erro: "Falha ao gravar histórico: " + erroHist.message },
      { status: 500 }
    );

  // 2) Atualiza a versão em produção.
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
