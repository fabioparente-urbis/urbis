import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth";

// Guarda de escrita: exige usuário logado E perfil irrestrito (Administrador / Diretora).
// Retorna NextResponse (401/403) quando deve bloquear; null quando autoriza.
async function exigirAdmin(req: NextRequest): Promise<NextResponse | null> {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito)
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador / Diretora." }, { status: 403 });
  return null;
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Chaves canônicas — iguais para todos os assuntos, diferenciadas por assunto_id.
// Validação: a chave deve começar com P1_, P2_ ou P3_.
function isChaveValida(c: unknown): boolean {
  return typeof c === "string" && (c.startsWith("P1_") || c.startsWith("P2_") || c.startsWith("P3_"));
}

// Resolve o UUID do assunto 'regularizacao' (usado como fallback de compatibilidade).
async function getAssuntoRegularizacao(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("assuntos")
    .select("id")
    .eq("slug", "regularizacao")
    .single();
  return data?.id ?? null;
}

// GET /api/admin/prompts?assunto_id=<uuid>
// Sem assunto_id → retorna prompts de regularizacao (compatibilidade com código legado).
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  let assunto_id = searchParams.get("assunto_id");

  if (!assunto_id) {
    assunto_id = await getAssuntoRegularizacao();
  }

  if (!assunto_id) {
    return NextResponse.json({ ok: false, erro: "Assunto não encontrado." }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("lip_prompts")
    .select("chave, conteudo, versao_anterior, versao, atualizado_em, conteudo_backup, assunto_id")
    .eq("ativo", true)
    .eq("assunto_id", assunto_id);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: data ?? [] });
}

// PUT /api/admin/prompts
// Body: { chave, novo_conteudo, salvo_por?, assunto_id? }
// Sem assunto_id → usa regularizacao (compatibilidade).
export async function PUT(req: NextRequest) {
  const bloqueio = await exigirAdmin(req);
  if (bloqueio) return bloqueio;

  const { chave, novo_conteudo, salvo_por, assunto_id } = await req.json();

  if (!isChaveValida(chave))
    return NextResponse.json(
      { ok: false, erro: "Chave inválida. Deve começar com P1_, P2_ ou P3_." },
      { status: 400 }
    );

  const resolvedId = assunto_id ?? (await getAssuntoRegularizacao());
  if (!resolvedId)
    return NextResponse.json({ ok: false, erro: "Assunto não encontrado." }, { status: 404 });

  const { data: atual, error: erroBusca } = await supabaseAdmin
    .from("lip_prompts")
    .select("conteudo, versao")
    .eq("chave", chave)
    .eq("assunto_id", resolvedId)
    .eq("ativo", true)
    .single();

  if (erroBusca || !atual)
    return NextResponse.json({ ok: false, erro: "Prompt não encontrado." }, { status: 404 });

  // 1) Snapshot do conteúdo atual ANTES de sobrescrever.
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
    .eq("chave", chave)
    .eq("assunto_id", resolvedId);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// POST /api/admin/prompts
// Inicializa os prompts de um assunto copiando de regularizacao.
// Body: { assunto_id }
export async function POST(req: NextRequest) {
  const bloqueio = await exigirAdmin(req);
  if (bloqueio) return bloqueio;

  const { assunto_id } = await req.json();

  if (!assunto_id)
    return NextResponse.json({ ok: false, erro: "assunto_id obrigatório." }, { status: 400 });

  const regId = await getAssuntoRegularizacao();
  if (!regId)
    return NextResponse.json({ ok: false, erro: "Assunto regularizacao não encontrado." }, { status: 404 });

  // Copia todos os prompts de regularizacao
  const { data: fontes, error: erroFonte } = await supabaseAdmin
    .from("lip_prompts")
    .select("chave, conteudo, conteudo_backup")
    .eq("assunto_id", regId)
    .eq("ativo", true);

  if (erroFonte || !fontes?.length)
    return NextResponse.json(
      { ok: false, erro: "Prompts de regularização não encontrados." },
      { status: 404 }
    );

  const novos = fontes.map((f) => ({
    chave: f.chave,
    conteudo: f.conteudo,
    conteudo_backup: f.conteudo_backup ?? null,
    versao: 1,
    ativo: true,
    assunto_id,
    atualizado_em: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin.from("lip_prompts").insert(novos);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PATCH /api/admin/prompts
// Copia conteudo → conteudo_backup para o prompt especificado.
// Body: { chave, assunto_id? }
export async function PATCH(req: NextRequest) {
  const bloqueio = await exigirAdmin(req);
  if (bloqueio) return bloqueio;

  const { chave, assunto_id } = await req.json();

  if (!isChaveValida(chave))
    return NextResponse.json({ ok: false, erro: "Chave inválida." }, { status: 400 });

  const resolvedId = assunto_id ?? (await getAssuntoRegularizacao());
  if (!resolvedId)
    return NextResponse.json({ ok: false, erro: "Assunto não encontrado." }, { status: 404 });

  const { data: atual, error: erroBusca } = await supabaseAdmin
    .from("lip_prompts")
    .select("conteudo")
    .eq("chave", chave)
    .eq("assunto_id", resolvedId)
    .eq("ativo", true)
    .single();

  if (erroBusca || !atual)
    return NextResponse.json({ ok: false, erro: "Prompt não encontrado." }, { status: 404 });

  const { error } = await supabaseAdmin
    .from("lip_prompts")
    .update({ conteudo_backup: atual.conteudo })
    .eq("chave", chave)
    .eq("assunto_id", resolvedId);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
