// app/api/admin/bdi/leis/[id]/referencias/route.ts
//
// GET /api/admin/bdi/leis/:id/referencias
//
// Retorna itens de `mac_checklist_itens` que potencialmente referenciam a
// lei (heuristica por numero/tipo/titulo no campo `ref`). Usado pelo modal
// de confirmacao de exclusao no admin.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import { buscarReferenciasChecklist } from "../../_referencias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json(
      { ok: false, erro: "Acesso restrito a Administrador / Diretora." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, erro: "Parametro id ausente." },
      { status: 400 },
    );
  }

  const { data: lei, error } = await supabaseAdmin
    .from("bdi_documentos_lei")
    .select("id, titulo, tipo, numero, ano")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { ok: false, erro: error.message },
      { status: 500 },
    );
  }
  if (!lei) {
    return NextResponse.json(
      { ok: false, erro: "Lei nao encontrada." },
      { status: 404 },
    );
  }

  const referencias = await buscarReferenciasChecklist(lei as any);
  return NextResponse.json({ ok: true, data: referencias });
}
