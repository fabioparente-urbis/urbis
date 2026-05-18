// app/api/admin/bdi/leis/route.ts
//
// GET /api/admin/bdi/leis
// Lista todas as leis cadastradas em `bdi_documentos_lei`, ordenadas por
// titulo, com a contagem de fragmentos vetorizados (bdi_lei_fragmentos) ja
// indexados para cada documento.
//
// Acesso: somente perfis irrestritos (Administrador / Diretora) — usa o
// helper `autenticar` de lib/auth.ts. Cookie httpOnly `urbis_id` e a fonte
// de autoridade.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // 1. Autenticacao + autorizacao
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json(
      { ok: false, erro: "Acesso restrito a Administrador / Diretora." },
      { status: 403 },
    );
  }

  // 2. Lista das leis — select * para tolerar variacoes do schema.
  const { data: leis, error: errLeis } = await supabaseAdmin
    .from("bdi_documentos_lei")
    .select("*")
    .order("titulo", { ascending: true });

  if (errLeis) {
    return NextResponse.json(
      { ok: false, erro: errLeis.message },
      { status: 500 },
    );
  }

  const lista = leis ?? [];
  if (lista.length === 0) {
    return NextResponse.json({ ok: true, data: [] });
  }

  // 3. Contagem de fragmentos por documento_id. O Supabase JS nao tem
  //    group-by direto, entao tras a lista de ids e conta em memoria.
  const ids = lista.map((l: any) => l.id).filter(Boolean);
  const { data: frags, error: errFrags } = await supabaseAdmin
    .from("bdi_lei_fragmentos")
    .select("documento_id")
    .in("documento_id", ids);

  if (errFrags) {
    return NextResponse.json(
      { ok: false, erro: errFrags.message },
      { status: 500 },
    );
  }

  const contagem = new Map<string, number>();
  for (const f of frags ?? []) {
    const id = (f as any).documento_id as string | null;
    if (!id) continue;
    contagem.set(id, (contagem.get(id) ?? 0) + 1);
  }

  const data = lista.map((l: any) => ({
    ...l,
    fragmentos_count: contagem.get(l.id) ?? 0,
  }));

  return NextResponse.json({ ok: true, data });
}
