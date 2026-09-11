import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { agregarPortfolio } from "@/lib/documentosSei/analiseFluxo";
import { lerEventosFluxo, agruparPorProcesso, type EventoBruto } from "@/lib/documentosSei/lerEventosFluxo";

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

  // Paginado: um .select() simples pararia em 1000 linhas e o painel agregaria um terço do acervo
  // como se fosse o todo (ver lib/documentosSei/lerEventosFluxo.ts).
  let linhas: EventoBruto[];
  try {
    linhas = await lerEventosFluxo<EventoBruto>(supabaseAdmin, "processo_codigo, titulo, setor, data_documento, pagina_ini");
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message ?? "Falha ao ler o acervo." }, { status: 500 });
  }

  const porProcesso = agruparPorProcesso(linhas);
  const portfolio = agregarPortfolio([...porProcesso.values()]);
  return NextResponse.json({ ok: true, portfolio, processos: [...porProcesso.keys()] });
}
