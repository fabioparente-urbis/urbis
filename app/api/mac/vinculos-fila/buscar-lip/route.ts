/**
 * app/api/mac/vinculos-fila/buscar-lip/route.ts — passo 2 do procedimento manual: campos do LIP
 * disponíveis para o assunto do item, fonte real (lip_campos/lip_abas — mesma tabela que
 * app/api/admin/lip usa para desenhar o formulário do LIP de Regularização/Aceite SEI, ver achado
 * da Fase 4). Nunca inventa chave — só lista o que existe de verdade.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const assuntoId = req.nextUrl.searchParams.get("assuntoId");
  if (!assuntoId) return NextResponse.json({ ok: false, erro: "assuntoId obrigatório" }, { status: 400 });
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  let query = supabaseAdmin
    .from("lip_campos")
    .select("chave, label, tipo, aba_id, ativo, lip_abas!inner(assunto_id, nome)")
    .eq("lip_abas.assunto_id", assuntoId)
    .eq("ativo", true)
    .limit(60);
  if (q.length >= 2) query = query.or(`chave.ilike.%${q}%,label.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const resultados = (data ?? []).map((c: any) => ({
    chave: c.chave, label: c.label, tipo: c.tipo, aba: c.lip_abas?.nome ?? "",
  }));
  return NextResponse.json({ ok: true, resultados });
}
