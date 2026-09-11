import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/fluxo/fase14-sinal — gatilho de prontidão da Fase 14 do plano de leitura de PDF
 * ("Aprendizado por correção": cada correção do analista na tela do Fatiador vira candidata a
 * regra). Diferente da Fase 13 (bloqueada por VOLUME estatístico, resolvido com um portão
 * numérico), a Fase 14 está bloqueada porque a matéria-prima dela — correção REAL de documento —
 * ainda não existe: `/fatiador-sei` (Fases 6/7) só foi testado com PDF sintético.
 *
 * Não é uma feature nova: é só um contador honesto sobre `mhd_eventos` (tipo='fatiador_correcao',
 * já gravado desde a Fase 6 via /api/documentos-sei/fatiador-eventos) — pra ninguém precisar
 * "lembrar" de checar se já é hora de desenhar a Fase 14. Assim que o Fábio corrigir um
 * documento de verdade no Fatiador, este número sai de zero sozinho.
 */
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador." }, { status: 403 });
  }

  const { data, error, count } = await supabaseAdmin
    .from("mhd_eventos")
    .select("processo_codigo, criado_em", { count: "exact" })
    .eq("tipo", "fatiador_correcao")
    .order("criado_em", { ascending: true });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const processosDistintos = new Set((data ?? []).map((r: any) => r.processo_codigo)).size;
  const primeiraCorrecaoEm = data && data.length ? (data[0] as any).criado_em : null;

  return NextResponse.json({
    ok: true,
    correcoesReais: count ?? 0,
    processosDistintos,
    primeiraCorrecaoEm,
    pronta: (count ?? 0) > 0,
  });
}
