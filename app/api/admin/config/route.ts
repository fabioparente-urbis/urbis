import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  const { data, error } = await supabaseAdmin
    .from("urbis_config").select("*").eq("id", 1).single();
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function PUT(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito)
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador." }, { status: 403 });
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, erro: "Body inválido." }, { status: 400 });
  }
  const patch: Record<string, number> = {};
  if (typeof body.meta_processos_mensal === "number") patch.meta_processos_mensal = body.meta_processos_mensal;
  if (typeof body.inatividade_horas === "number") patch.inatividade_horas = body.inatividade_horas;
  if (!Object.keys(patch).length)
    return NextResponse.json({ ok: false, erro: "Nenhum campo válido." }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from("urbis_config").update(patch).eq("id", 1).select().single();
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // Meta versionada: a nova meta passa a valer do mês vigente em diante.
  // Os meses já fechados continuam sendo avaliados pela meta que valia neles.
  // Alterar a meta duas vezes no mesmo mês substitui a vigência daquele mês
  // (upsert por vigente_desde), em vez de acumular registros.
  if (typeof body.meta_processos_mensal === "number") {
    const hoje = new Date();
    const vigenteDesde = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
    const { error: erroMeta } = await supabaseAdmin
      .from("mrp_meta_historico")
      .upsert(
        { meta: body.meta_processos_mensal, vigente_desde: vigenteDesde, criado_por: ctx.userId },
        { onConflict: "vigente_desde" },
      );
    if (erroMeta)
      return NextResponse.json(
        { ok: false, erro: `Meta salva, mas a vigência não foi registrada: ${erroMeta.message}` },
        { status: 500 },
      );
  }

  return NextResponse.json({ ok: true, data });
}
