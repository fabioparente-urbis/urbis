// app/api/admin/assuntos/route.ts
//
// CRUD dos 15 assuntos (Regularizacao fixo + 14 slots renomeaveis).
//
//   GET  /api/admin/assuntos        -> lista todos ordenados por `ordem`
//                                       (aberto a qualquer usuario autenticado;
//                                        a Home precisa para montar o dropdown).
//   PUT  /api/admin/assuntos        -> atualiza `nome` e/ou `ativo` de um
//                                       assunto por id. Acesso restrito a
//                                       perfis irrestritos (Administrador /
//                                       Diretora). O slot fixo
//                                       `regularizacao` nao pode ser
//                                       renomeado nem desativado.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_FIXO = "regularizacao";

export async function GET(req: NextRequest) {
  // Qualquer usuario autenticado pode listar — a Home usa essa rota para
  // montar o dropdown "ABRIR PROCESSO". Apenas exige sessao valida.
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const { data, error } = await supabaseAdmin
    .from("assuntos")
    .select("id, slug, nome, ativo, ordem, criado_em")
    .order("ordem", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function PUT(req: NextRequest) {
  // 1. Autenticacao + autorizacao (so admin/irrestrito)
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json(
      { ok: false, erro: "Acesso restrito a Administrador / Diretora." },
      { status: 403 },
    );
  }

  // 2. Parse + validacao do body
  let body: any;
  try {
    body = await req.json();
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, erro: `Body invalido: ${e?.message ?? "erro de parsing"}` },
      { status: 400 },
    );
  }

  const id: string | undefined = typeof body?.id === "string" ? body.id.trim() : undefined;
  if (!id) {
    return NextResponse.json({ ok: false, erro: "Campo `id` obrigatorio." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body?.nome === "string") {
    const nome = body.nome.trim();
    if (!nome) {
      return NextResponse.json({ ok: false, erro: "Campo `nome` nao pode ser vazio." }, { status: 400 });
    }
    patch.nome = nome;
  }
  if (typeof body?.ativo === "boolean") {
    patch.ativo = body.ativo;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, erro: "Nada para atualizar (use `nome` e/ou `ativo`)." }, { status: 400 });
  }

  // 3. Carrega o assunto-alvo para proteger o slot fixo.
  const { data: atual, error: errBusca } = await supabaseAdmin
    .from("assuntos")
    .select("id, slug, nome, ativo")
    .eq("id", id)
    .maybeSingle();

  if (errBusca) {
    return NextResponse.json({ ok: false, erro: errBusca.message }, { status: 500 });
  }
  if (!atual) {
    return NextResponse.json({ ok: false, erro: "Assunto nao encontrado." }, { status: 404 });
  }

  if (atual.slug === SLUG_FIXO) {
    // Regularizacao e o template-mestre. Nao pode ser renomeada nem desativada.
    const tentaRenomear = "nome" in patch && patch.nome !== atual.nome;
    const tentaDesativar = "ativo" in patch && patch.ativo === false;
    if (tentaRenomear || tentaDesativar) {
      return NextResponse.json(
        { ok: false, erro: "O assunto Regularização é fixo e não pode ser renomeado nem desativado." },
        { status: 400 },
      );
    }
  }

  // 4. Update
  const { data: atualizado, error: errUp } = await supabaseAdmin
    .from("assuntos")
    .update(patch)
    .eq("id", id)
    .select("id, slug, nome, ativo, ordem, criado_em")
    .single();

  if (errUp) {
    return NextResponse.json({ ok: false, erro: errUp.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data: atualizado });
}
