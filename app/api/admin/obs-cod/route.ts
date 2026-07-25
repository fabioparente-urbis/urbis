// app/api/admin/obs-cod/route.ts
//
// OBS COD — caderno de observações sobre o código.
//
//   GET    /api/admin/obs-cod            -> lista (abertas primeiro)
//   POST   /api/admin/obs-cod            -> cria
//   PUT    /api/admin/obs-cod            -> edita ou muda a situação
//   DELETE /api/admin/obs-cod  { id }    -> apaga
//
// Restrito a perfil irrestrito: é registro interno de engenharia, não
// conteúdo de processo.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIAS = ["arquitetura", "bug", "decisao", "pendencia", "risco"];

async function guarda(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return { erro: ctx };
  if (!ctx.irrestrito) {
    return { erro: NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador / Diretora." }, { status: 403 }) };
  }
  return { ctx };
}

export async function GET(req: NextRequest) {
  const g = await guarda(req);
  if (g.erro) return g.erro;

  const { data, error } = await supabaseAdmin
    .from("obs_cod")
    .select("*")
    .order("situacao", { ascending: true })   // 'aberto' antes de 'resolvido'
    .order("criado_em", { ascending: false });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const ids = [...new Set((data ?? []).flatMap((o: any) => [o.criado_por, o.resolvido_por]).filter(Boolean))];
  const { data: pessoas } = ids.length
    ? await supabaseAdmin.from("usuarios").select("id, nome").in("id", ids)
    : { data: [] as any[] };
  const nome = Object.fromEntries((pessoas ?? []).map((u: any) => [u.id, u.nome]));

  return NextResponse.json({
    ok: true,
    data: (data ?? []).map((o: any) => ({
      ...o,
      criado_por_nome: nome[o.criado_por] ?? null,
      resolvido_por_nome: nome[o.resolvido_por] ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const g = await guarda(req);
  if (g.erro) return g.erro;
  const b = await req.json().catch(() => ({}));

  const titulo = String(b?.titulo ?? "").trim();
  if (!titulo) return NextResponse.json({ ok: false, erro: "Título obrigatório." }, { status: 400 });

  const { data, error } = await supabaseAdmin.from("obs_cod").insert({
    titulo,
    texto: String(b?.texto ?? "").trim(),
    categoria: CATEGORIAS.includes(b?.categoria) ? b.categoria : "pendencia",
    onde: b?.onde ? String(b.onde).trim() : null,
    criado_por: g.ctx!.userId,
  }).select().single();
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function PUT(req: NextRequest) {
  const g = await guarda(req);
  if (g.erro) return g.erro;
  const b = await req.json().catch(() => ({}));
  if (!b?.id) return NextResponse.json({ ok: false, erro: "id obrigatório." }, { status: 400 });

  const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
  if (typeof b.titulo === "string" && b.titulo.trim()) patch.titulo = b.titulo.trim();
  if (typeof b.texto === "string") patch.texto = b.texto.trim();
  if (CATEGORIAS.includes(b.categoria)) patch.categoria = b.categoria;
  if (typeof b.onde === "string") patch.onde = b.onde.trim() || null;

  // Resolver e reabrir: quem resolveu e quando ficam registrados; reabrir
  // limpa os dois, senão o histórico mente na próxima vez.
  if (b.situacao === "resolvido") {
    patch.situacao = "resolvido";
    patch.resolvido_em = new Date().toISOString();
    patch.resolvido_por = g.ctx!.userId;
  } else if (b.situacao === "aberto") {
    patch.situacao = "aberto";
    patch.resolvido_em = null;
    patch.resolvido_por = null;
  }

  const { data, error } = await supabaseAdmin
    .from("obs_cod").update(patch).eq("id", b.id).select().single();
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req: NextRequest) {
  const g = await guarda(req);
  if (g.erro) return g.erro;
  const b = await req.json().catch(() => ({}));
  if (!b?.id) return NextResponse.json({ ok: false, erro: "id obrigatório." }, { status: 400 });

  const { error } = await supabaseAdmin.from("obs_cod").delete().eq("id", b.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
