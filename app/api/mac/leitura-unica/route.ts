import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * app/api/mac/leitura-unica — Fase 9B do plano docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md.
 *
 * GET: a tela do MAC pergunta, ao abrir, se existe uma sugestão pendente (a leitura combinada do
 * LIP — app/api/lip/s3/route.ts — grava aqui quando o interruptor está ligado). POST: marca a
 * sugestão como aplicada (o front já mesclou os itens no estado local antes de chamar isto —
 * mesmo princípio das Fases 7/8, a IA nunca grava sozinha, só propõe).
 *
 * FAIL-SAFE: se a tabela não existir ainda (migration
 * 2026_09_11_mac_sugestoes_leitura_unica.sql pendente) ou qualquer erro de banco acontecer, GET
 * devolve "sem sugestão" e POST devolve ok:false sem lançar — nunca atrapalha a tela do MAC.
 */

export async function GET(req: NextRequest) {
  const codigo = req.nextUrl.searchParams.get("codigo") ?? "";
  if (!codigo) return NextResponse.json({ ok: true, encontrado: false });
  try {
    const { data, error } = await supabaseAdmin
      .from("mac_sugestoes_leitura_unica")
      .select("sugestao, criado_em")
      .eq("processo_codigo", codigo)
      .eq("aplicado", false)
      .maybeSingle();
    if (error || !data) return NextResponse.json({ ok: true, encontrado: false });
    return NextResponse.json({ ok: true, encontrado: true, sugestao: data.sugestao, criadoEm: data.criado_em });
  } catch {
    return NextResponse.json({ ok: true, encontrado: false });
  }
}

export async function POST(req: NextRequest) {
  const corpo = await req.json().catch(() => ({}));
  const codigo = String(corpo.codigo ?? "");
  if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });
  try {
    const { error } = await supabaseAdmin
      .from("mac_sugestoes_leitura_unica")
      .update({ aplicado: true })
      .eq("processo_codigo", codigo);
    if (error) return NextResponse.json({ ok: false, erro: error.message });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message ?? String(e) });
  }
}
