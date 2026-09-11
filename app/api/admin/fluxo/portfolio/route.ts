import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { agregarPortfolio } from "@/lib/documentosSei/analiseFluxo";

/**
 * GET /api/admin/fluxo/portfolio — Fase 12 do plano de leitura de PDF (§4.5, painel de gestão).
 * Lê `fluxo_processo_eventos` (Fase 10) e devolve o retrato agregado (`agregarPortfolio`,
 * Fase 11): processos por faixa de tempo, tempo típico por setor, retrabalho típico.
 *
 * Só irrestrito, mesmo gate de /admin/mhd — é visão de gestão sobre TODOS os processos do
 * acervo, não faz sentido restringir por processo individual.
 */
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador." }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("fluxo_processo_eventos")
    .select("processo_codigo, titulo, setor, data_documento")
    .order("processo_codigo");
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const porProcesso = new Map<string, { titulo: string; setor: string | null; dataDocumento: string | null }[]>();
  for (const row of data ?? []) {
    const lista = porProcesso.get(row.processo_codigo) ?? [];
    lista.push({ titulo: row.titulo, setor: row.setor, dataDocumento: row.data_documento });
    porProcesso.set(row.processo_codigo, lista);
  }

  const portfolio = agregarPortfolio([...porProcesso.values()]);
  return NextResponse.json({ ok: true, portfolio, processos: [...porProcesso.keys()] });
}
