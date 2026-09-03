// app/api/mac/checklists/itens/route.ts
//
// Achado de segurança (Fase D, 03/09/2026): esta rota nunca chamou autenticar() nem checou
// nada — qualquer requisição, autenticada ou não, podia criar/editar/desativar item do
// checklist MAC. Corrigido: toda ação exige sessão válida; escrita (POST/PUT/DELETE) exige
// autorização sobre o modelo alvo (mesma regra que app/admin/checklists/page.tsx já aplicava
// só do lado do cliente — ver lib/mac/checklistsAutorizacao.ts). `alterado_por` é gravado em
// toda escrita — é o que faz o trigger da Fase D (mac_checklist_itens_historico) saber quem
// mudou, e não só que mudou.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth";
import { podeEditarModeloChecklist } from "@/lib/mac/checklistsAutorizacao";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const modelo_id = searchParams.get("modelo_id");

  const { data, error } = await supabase
    .from("mac_checklist_itens")
    .select("*")
    .eq("modelo_id", modelo_id)
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const { modelo_id, grupo, texto, ref, ordem, chave_lip } = await req.json();
  const autorizacao = await podeEditarModeloChecklist(ctx, modelo_id);
  if (!autorizacao.ok) return NextResponse.json({ ok: false, erro: autorizacao.erro }, { status: autorizacao.status });

  const { data, error } = await supabase
    .from("mac_checklist_itens")
    .insert({
      modelo_id,
      grupo,
      texto,
      ref: ref || null,
      ordem: ordem || 0,
      chave_lip: chave_lip || null,
      alterado_por: ctx.userId,
    })
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function PUT(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id, ...campos } = await req.json();
  if (!id) return NextResponse.json({ ok: false, erro: "id obrigatório." }, { status: 400 });

  const { data: itemAtual, error: erroItem } = await supabase
    .from("mac_checklist_itens").select("modelo_id").eq("id", id).maybeSingle();
  if (erroItem) return NextResponse.json({ ok: false, erro: erroItem.message }, { status: 500 });
  if (!itemAtual) return NextResponse.json({ ok: false, erro: "Item não encontrado." }, { status: 404 });

  const autorizacao = await podeEditarModeloChecklist(ctx, itemAtual.modelo_id);
  if (!autorizacao.ok) return NextResponse.json({ ok: false, erro: autorizacao.erro }, { status: autorizacao.status });

  const { data, error } = await supabase
    .from("mac_checklist_itens")
    .update({ ...campos, alterado_por: ctx.userId })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ ok: false, erro: "id obrigatório." }, { status: 400 });

  const { data: itemAtual, error: erroItem } = await supabase
    .from("mac_checklist_itens").select("modelo_id").eq("id", id).maybeSingle();
  if (erroItem) return NextResponse.json({ ok: false, erro: erroItem.message }, { status: 500 });
  if (!itemAtual) return NextResponse.json({ ok: false, erro: "Item não encontrado." }, { status: 404 });

  const autorizacao = await podeEditarModeloChecklist(ctx, itemAtual.modelo_id);
  if (!autorizacao.ok) return NextResponse.json({ ok: false, erro: autorizacao.erro }, { status: autorizacao.status });

  const { error } = await supabase
    .from("mac_checklist_itens")
    .update({ ativo: false, alterado_por: ctx.userId })
    .eq("id", id);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}