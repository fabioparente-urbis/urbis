// app/api/mac/limite-analises/route.ts
//
// Limite de análises do MAC por slot (ver lib/macLimiteAnalises.ts).
//
//   GET  /api/mac/limite-analises            -> { ok, data: { regularizacao: 5, ... } } (qualquer usuário logado)
//   PUT  /api/mac/limite-analises { limites } -> grava (só Administrador / Diretora)

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import { lerLimitesAnalises, normalizarLimite, SLOTS_LIMITE_ANALISES } from "@/lib/macLimiteAnalises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  return NextResponse.json({ ok: true, data: await lerLimitesAnalises() });
}

export async function PUT(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador / Diretora." }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const entrada = (body?.limites ?? {}) as Record<string, unknown>;
  const atual = await lerLimitesAnalises();
  for (const s of SLOTS_LIMITE_ANALISES) {
    if (entrada[s.slug] !== undefined) atual[s.slug] = normalizarLimite(entrada[s.slug]);
  }
  const { error } = await supabaseAdmin.from("urbis_config").update({ mac_limite_analises: atual }).eq("id", 1);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: atual });
}
